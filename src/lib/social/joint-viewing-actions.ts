"use server";

import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { applyTransition } from "@/lib/passes/apply-transition";
import { revalidateFeed, revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { buildSubject } from "./notification-context";
import { notify, notifyMany } from "./notifications";
import {
  getJointViewingsForPasses,
  getMutualFollows,
  type JointPerson,
  type PassJointViewing,
} from "./joint-viewings";

// Server actions de los visionados conjuntos (#1220). Toda la regla (seguidos
// mutuos, pase propio y completado, un pase = un visionado, publicar el post
// conjunto) vive en las funciones SQL; aquí se orquesta: elegir o crear el pase
// al aceptar, avisar y revalidar. Resultado discriminado, nunca un throw hacia
// el cliente (Next borra el mensaje en producción).

export type JointActionResult = { ok: true; viewingId: string } | { ok: false; error: JointActionError };

export type JointActionError =
  | "unauthenticated"
  | "not_mutual"
  | "no_invitees"
  | "too_many_invitees"
  | "pass_not_completed"
  | "pass_already_joint"
  | "not_found"
  | "generic";

const KNOWN_ERRORS: JointActionError[] = [
  "not_mutual",
  "no_invitees",
  "too_many_invitees",
  "pass_not_completed",
  "pass_already_joint",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Las funciones SQL lanzan con el código de error como mensaje
// (`raise exception 'not_mutual'`): se traduce a la unión cerrada.
function mapError(message: string | undefined): JointActionError {
  if (!message) return "generic";
  if (message.includes("not_found")) return "not_found";
  return KNOWN_ERRORS.find((e) => message.includes(e)) ?? "generic";
}

async function itemTitle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemType: ItemType,
  itemId: string,
): Promise<string | null> {
  const table = itemType === "book" ? "books" : itemType === "movie" ? "movies" : "series";
  const { data } = await supabase.from(table).select("title").eq("id", itemId).maybeSingle();
  return data?.title ?? null;
}

// «Lo vi con…»: crea el visionado desde un pase propio completado (o amplía el
// que ya creó quien llama) y avisa a los invitados nuevos.
export async function createJointViewing(
  passId: string,
  itemType: ItemType,
  itemId: string,
  inviteeIds: string[],
): Promise<JointActionResult> {
  try {
    if (!UUID.test(passId) || !Array.isArray(inviteeIds)) return { ok: false, error: "generic" };
    const invitees = [...new Set(inviteeIds.filter((id) => typeof id === "string" && UUID.test(id)))];
    if (invitees.length === 0) return { ok: false, error: "no_invitees" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { data, error } = await supabase.rpc("create_joint_viewing", {
      p_pass_id: passId,
      p_invitee_ids: invitees,
    });
    if (error) return { ok: false, error: mapError(error.message) };

    const result = data as { viewing_id: string; invited: string[] };
    if (result.invited.length > 0) {
      const title = await itemTitle(supabase, itemType, itemId);
      await notifyMany(supabase, {
        userIds: result.invited,
        actorId: user.id,
        type: "joint_viewing_invite",
        targetType: "joint_viewing",
        targetId: result.viewing_id,
        dedupeKey: `joint_viewing_invite:${result.viewing_id}`,
        context: title ? { subject: buildSubject(title) } : undefined,
      });
    }

    revalidateReadingLog(itemType, itemId);
    return { ok: true, viewingId: result.viewing_id };
  } catch (error) {
    console.error("createJointViewing failed", error);
    return { ok: false, error: "generic" };
  }
}

// Contestar a la invitación. `passChoice`: el id de un pase completado propio
// sin visionado, o "new" para registrar el visionado como pase nuevo (con la
// fecha del visionado conjunto).
export async function respondJointViewing(
  viewingId: string,
  accept: boolean,
  passChoice: string | "new" = "new",
): Promise<JointActionResult> {
  try {
    if (!UUID.test(viewingId)) return { ok: false, error: "generic" };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { data: viewing, error: viewingError } = await supabase
      .from("joint_viewings")
      .select("id, item_type, item_id, watched_on, created_by")
      .eq("id", viewingId)
      .maybeSingle();
    if (viewingError) throw viewingError;
    if (!viewing) return { ok: false, error: "not_found" };
    const itemType = viewing.item_type as ItemType;

    if (!accept) {
      const { error } = await supabase.rpc("respond_joint_viewing", {
        p_viewing_id: viewingId,
        p_accept: false,
      });
      if (error) return { ok: false, error: mapError(error.message) };
      return { ok: true, viewingId };
    }

    let passId: string;
    if (passChoice !== "new") {
      if (!UUID.test(passChoice)) return { ok: false, error: "generic" };
      passId = passChoice;
    } else {
      // Pase nuevo por la máquina de estados (nunca un insert a pelo): si hay uno
      // abierto se cierra; si el activo ya está cerrado, es un revisionado
      // (`restart`). Publica su hito como cualquier cierre; el feed de inicio lo
      // esconde mientras el post conjunto sea visible.
      const outcome = await applyTransition(supabase, user.id, itemType, viewing.item_id, "completed", "restart");
      if (outcome.kind !== "done" || !outcome.passId) return { ok: false, error: "generic" };
      passId = outcome.passId;
      const today = new Date().toISOString().slice(0, 10);
      if (viewing.watched_on && ISO_DATE.test(viewing.watched_on) && viewing.watched_on <= today) {
        // Un pase recién creado nace con inicio = hoy; si el visionado fue antes,
        // inicio y fin son ese día (una película se ve en un día). Uno que ya
        // estaba en curso conserva su inicio real.
        const { error: dateError } = await supabase
          .from("passes")
          .update(
            outcome.created
              ? { finished_on: viewing.watched_on, started_on: viewing.watched_on }
              : { finished_on: viewing.watched_on },
          )
          .eq("id", passId)
          .eq("user_id", user.id);
        // La fecha es un ajuste: si choca (p. ej. inicio posterior) se queda la de
        // hoy, que también es verdad («lo marqué hoy»).
        if (dateError) console.error("respondJointViewing: finished_on not adjusted", dateError);
      }
    }

    const { error } = await supabase.rpc("respond_joint_viewing", {
      p_viewing_id: viewingId,
      p_accept: true,
      p_pass_id: passId,
    });
    if (error) return { ok: false, error: mapError(error.message) };

    const title = await itemTitle(supabase, itemType, viewing.item_id);
    await notify(supabase, {
      userId: viewing.created_by,
      actorId: user.id,
      type: "joint_viewing_accepted",
      targetType: "joint_viewing",
      targetId: viewingId,
      dedupeKey: `joint_viewing_accepted:${viewingId}:${user.id}`,
      context: title ? { subject: buildSubject(title) } : undefined,
    });

    revalidateReadingLog(itemType, viewing.item_id);
    revalidateFeed();
    return { ok: true, viewingId };
  } catch (error) {
    console.error("respondJointViewing failed", error);
    return { ok: false, error: "generic" };
  }
}

// Salirse del visionado. El pase se queda como estaba.
export async function leaveJointViewing(
  viewingId: string,
  itemType: ItemType,
  itemId: string,
): Promise<JointActionResult> {
  try {
    if (!UUID.test(viewingId)) return { ok: false, error: "generic" };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { error } = await supabase.rpc("leave_joint_viewing", { p_viewing_id: viewingId });
    if (error) return { ok: false, error: mapError(error.message) };

    revalidateReadingLog(itemType, itemId);
    revalidateFeed();
    return { ok: true, viewingId };
  } catch (error) {
    console.error("leaveJointViewing failed", error);
    return { ok: false, error: "generic" };
  }
}

export type JointViewingOptions = {
  mutuals: JointPerson[];
  current: PassJointViewing | null;
};

// Lo que necesita la hoja «Lo disfruté con…» al abrirse: a quién se puede
// etiquetar y, si el pase ya está en un visionado, con quién. Se carga al abrir
// (no con la ficha) para no sumar dos consultas a cada visita de la ficha.
export async function loadJointViewingOptions(passId: string): Promise<JointViewingOptions | null> {
  try {
    if (!UUID.test(passId)) return null;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [mutuals, byPass] = await Promise.all([
      getMutualFollows(supabase, user.id),
      getJointViewingsForPasses(supabase, user.id, [passId]),
    ]);
    return { mutuals, current: byPass.get(passId) ?? null };
  } catch (error) {
    console.error("loadJointViewingOptions failed", error);
    return null;
  }
}

// Seguidos mutuos de quien llama: los que ofrece el selector de la hoja de
// cierre. Solo el selector; la regla la vuelve a comprobar la base.
export async function loadMutualFollows(): Promise<JointPerson[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    return await getMutualFollows(supabase, user.id);
  } catch (error) {
    console.error("loadMutualFollows failed", error);
    return [];
  }
}

// Con quién está compartido cada pase del diario, en UNA llamada por diario (no
// una por tarjeta). Solo pases propios: la RLS no deja ver los de otros.
export async function loadJointViewingsForPasses(
  passIds: string[],
): Promise<Record<string, PassJointViewing>> {
  try {
    const ids = Array.isArray(passIds) ? passIds.filter((id) => typeof id === "string" && UUID.test(id)) : [];
    if (ids.length === 0) return {};
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};
    return Object.fromEntries(await getJointViewingsForPasses(supabase, user.id, ids.slice(0, 100)));
  } catch (error) {
    console.error("loadJointViewingsForPasses failed", error);
    return {};
  }
}
