import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { TransitionOutcome } from "@/lib/passes/apply-transition";
import { notifyMany, type ReviewTargetType } from "./notifications";
import { CATEGORY_NOTIFICATION_TYPE, type NotifyCategory } from "./notify-categories";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Enlace preferente al POST del hito, no a la ficha de la obra. Un evento de
// seguimiento nace de una acción que (según preferencias) pudo publicar un post
// propio (/post/[id]); si ese post existe, la notificación debe abrir ESE post,
// no la ficha del ítem. Devuelve el interaction_target_id del post, o null para
// caer al target original (la ficha) sin cambiar nada.
//
// Best-effort AISLADO: cualquier fallo aquí devuelve null (→ ficha), nunca deja
// caer el aviso. El peor caso es exactamente el comportamiento anterior.
async function resolvePostInteractionTargetId(
  supabase: SupabaseServerClient,
  category: NotifyCategory,
  target: { targetType: ReviewTargetType; targetId: string },
): Promise<string | null> {
  try {
    // Solo los hitos anclados a un pase se publican como post en Spec 1.
    // 'episode' usa un target episode_watch (los episodios aún no son posts).
    if (target.targetType !== "diary_entry") return null;

    let postId: string | null = null;
    if (category === "finished") {
      // 1:1 por el índice único de posts (source_kind, source_id, kind).
      const { data } = await supabase
        .from("posts")
        .select("id")
        .eq("source_kind", "pass")
        .eq("source_id", target.targetId)
        .eq("kind", "finished")
        .maybeSingle();
      postId = data?.id ?? null;
    } else if (category === "session") {
      // El post 'progressed' cuelga de la SESIÓN, no del pase, y solo existe si
      // el usuario marcó «Compartir» (opt-in). El aviso se colapsa a uno por
      // pase (dedupeKey), así que se enlaza al post compartido más reciente de
      // ese pase; si ninguna sesión se compartió, no hay post → ficha.
      const { data: sessions } = await supabase
        .from("progress_sessions")
        .select("id")
        .eq("pass_id", target.targetId);
      const sessionIds = (sessions ?? []).map((s) => s.id as string);
      if (sessionIds.length > 0) {
        const { data } = await supabase
          .from("posts")
          .select("id")
          .eq("kind", "progressed")
          .eq("source_kind", "progress_session")
          .in("source_id", sessionIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        postId = data?.id ?? null;
      }
    }
    // 'added' no produce post (añadir no es un hito publicable) → null → ficha.
    if (!postId) return null;

    const { data: it } = await supabase
      .from("interaction_targets")
      .select("id")
      .eq("kind", "post")
      .eq("source_id", postId)
      .maybeSingle();
    return (it?.id as string | undefined) ?? null;
  } catch (err) {
    console.error("resolvePostInteractionTargetId failed", err);
    return null;
  }
}

// Avisa a los seguidores ACEPTADOS de `actorId` que activaron esta categoría en
// su campana. Best-effort: mismo contrato que notify() — nunca lanza; un fallo
// aquí no debe romper la acción real (cerrar pase, registrar sesión…).
// Lee follows por service-role: es un camino de servidor de confianza y así
// notify_events (preferencia privada del follower) no se expone por RLS al actor.
export async function notifyFollowersOfEvent(
  supabase: SupabaseServerClient,
  actorId: string,
  category: NotifyCategory,
  target: { targetType: ReviewTargetType; targetId: string },
): Promise<void> {
  try {
    const writer = createServiceRoleClient();
    const { data, error } = await writer
      .from("follows")
      .select("follower_id")
      .eq("followee_id", actorId)
      .eq("status", "accepted")
      .contains("notify_events", [category]);
    if (error) throw error;
    const userIds = (data ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return;
    const type = CATEGORY_NOTIFICATION_TYPE[category];
    // Prefiere abrir el post del hito (/post/[id]) en vez de la ficha del ítem.
    // Si el hito no se publicó como post, postTargetId es null y se cae al
    // target original (ficha) — mismo comportamiento que antes.
    const postTargetId = await resolvePostInteractionTargetId(supabase, category, target);
    await notifyMany(supabase, {
      userIds,
      actorId,
      type,
      // Con post: se guarda su interaction_target_id (href /post/[id]); lo leen
      // igual la campana y el push. Sin post: target original → resolveTargetHrefs
      // → ficha.
      ...(postTargetId
        ? { interactionTargetId: postTargetId }
        : { targetType: target.targetType, targetId: target.targetId }),
      // Un mismo hecho (terminó/leyó/vio/añadió X) avisa UNA vez por seguidor,
      // no una por POST (#410). El type distingue added de finished aunque
      // compartan targetId (ambos 'diary_entry' + passId). Sigue clavado al pase
      // (target.targetId), NO al post: colapsa igual aunque el hito publique
      // varios posts. notifyMany añade `:${userId}`.
      dedupeKey: `person:${type}:${target.targetId}`,
    });
  } catch (err) {
    console.error("notifyFollowersOfEvent failed", err);
  }
}

// Azúcar para el enganche de "added": solo dispara si applyTransition INSERTÓ un
// pase nuevo (outcome.created). El evento "added" no publica post (añadir no es
// un hito publicable), así que su aviso enlaza a la ficha vía el pase
// (target_type 'diary_entry', que resolveTargetHrefs resuelve a la ficha).
export async function notifyAdded(
  supabase: SupabaseServerClient,
  actorId: string,
  outcome: TransitionOutcome,
): Promise<void> {
  if (outcome.kind !== "done" || !outcome.created) return;
  await notifyFollowersOfEvent(supabase, actorId, "added", {
    targetType: "diary_entry",
    targetId: outcome.passId,
  });
}
