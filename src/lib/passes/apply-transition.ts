import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { planTransition } from "./transitions";
import { getActivePass } from "./get-passes";
import { maybeAutopostMilestone } from "@/lib/social/autopost";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TransitionOutcome =
  | { kind: "done"; passId: string; closed: boolean; created: boolean }
  | { kind: "askResume" };

export type TransitionOptions = {
  /**
   * `true` = esta transición NO publica hito. El defecto es publicar.
   *
   * El sentido del defecto es la mitad del arreglo (#824). Antes el hito lo
   * publicaba UN llamador (`updateStatus`, la ficha) y el resto de caminos que
   * cierran un pase —el auto-cierre por última página, el Select de estado de la
   * hoja de sesión, el último episodio de una serie— se olvidaban de hacerlo:
   * el post no existía y la reseña no llegaba al feed de nadie. Un llamador
   * olvidado tiene que publicar de MÁS (se ve y se corrige), nunca callar en
   * silencio (que es lo que pasó durante meses).
   */
  silent?: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ejecuta lo que planTransition decida. Reglas del ejecutor (§7.22 + spec):
// salir de planned limpia la cola; archivar hereda el fijado en el pase
// nuevo; el resultado dice si el pase quedó cerrado para que la UI encadene
// la hoja de cierre.
//
// Y publica el hito social de la transición (#824). Vive AQUÍ, y no en cada
// llamador, porque «todo cambio de estado pasa por la máquina» ya es invariante
// del proyecto: es el único punto por el que pasan todos los caminos, incluidos
// los que se añadan mañana. La importación NO entra por aquí —escribe `passes`
// directa (`src/lib/import/commit-row.ts`)— así que la regla vieja («nunca
// autopostear en applyTransition, que corre en import/quick-add/bulk») protegía
// de una inundación que no podía ocurrir; ver `decisiones.md`. Lo que sí entra
// por aquí sin ser un gesto publicable pide `silent`.
export async function applyTransition(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  to: MediaStatus,
  resume?: "continue" | "restart",
  options?: TransitionOptions
): Promise<TransitionOutcome> {
  // Publica el hito y devuelve el resultado sin tocarlo. La condición es la
  // MISMA que aplicaba `updateStatus` (`kind === "done"`): este cambio añade los
  // caminos que faltaban, no cambia cuándo publica el que ya funcionaba.
  // `maybeAutopostMilestone` es best-effort y nunca lanza, así que la máquina no
  // se puede caer por esto.
  async function publishing(outcome: TransitionOutcome): Promise<TransitionOutcome> {
    if (outcome.kind !== "done" || options?.silent) return outcome;
    await maybeAutopostMilestone(supabase, {
      userId,
      passId: outcome.passId,
      itemType,
      itemId,
      to,
      created: outcome.created,
      closed: outcome.closed,
    });
    return outcome;
  }

  const active = await getActivePass(supabase, itemType, itemId, userId);
  const plan = planTransition(
    active ? { id: active.id, status: active.status } : null,
    to,
    today(),
    resume
  );

  if (plan.kind === "askResume") return { kind: "askResume" };

  if (plan.kind === "none") {
    return publishing({ kind: "done", passId: active!.id, closed: false, created: false });
  }

  if (plan.kind === "updateActive") {
    const { error } = await supabase
      .from("passes")
      .update(plan.set)
      .eq("id", active!.id)
      .eq("user_id", userId);
    // 23505 = choque con passes_one_open / one_pass_per_day por doble click o
    // dos pestañas: el invariante hizo su trabajo, no es un 500.
    if (error && error.code !== "23505") throw error;
    return publishing({
      kind: "done",
      passId: active!.id,
      closed: to === "completed" || to === "dropped",
      created: false,
    });
  }

  // createActive y archiveAndCreate comparten el insert.
  if (plan.kind === "archiveAndCreate") {
    const { error: archiveError } = await supabase
      .from("passes")
      .update({ is_active: false })
      .eq("id", active!.id)
      .eq("user_id", userId);
    if (archiveError) throw archiveError;
  }

  const startedOn = plan.startedOn;
  const finishedOn = plan.kind === "createActive" ? plan.finishedOn : null;
  const { data: created, error } = await supabase
    .from("passes")
    .insert({
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      status: plan.status,
      is_active: true,
      position: {},
      started_on: startedOn,
      finished_on: finishedOn,
      planned_on: plan.plannedOn,
      is_public: true,
      // El fijado es de la relación con la obra: lo hereda el pase nuevo.
      pinned_order: plan.kind === "archiveAndCreate" ? (active!.pinnedOrder ?? null) : null,
    })
    .select("id")
    .single();
  if (error && error.code !== "23505") throw error;
  return publishing({
    kind: "done",
    passId: created?.id ?? active?.id ?? "",
    closed: plan.status === "completed" || plan.status === "dropped",
    created: true,
  });
}
