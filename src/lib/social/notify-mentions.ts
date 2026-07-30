import type { createClient } from "@/lib/supabase/server";
import { extractMentions } from "./mentions";
import { notifyMany } from "./notifications";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MentionGate =
  | { kind: "profile"; ownerId: string }
  | { kind: "club"; clubId: string };

export type MentionNotifyTarget = {
  type: "diary_entry" | "comment" | "club_post";
  id: string;
};

// Resuelve qué user_id de los mencionados en `text` deben recibir la
// notificación, aplicando el gate de visibilidad en capa de app (sin función
// SQL nueva). Se exporta aparte de notifyMentions porque los call sites
// necesitan el conjunto para el supersede del ruido (ver interaction-actions).
// TODO(E5.J1): filtrar user_blocks (cuando exista), restando los bloqueos bidireccionales.
export async function resolveDeliverableMentions(
  supabase: SupabaseServerClient,
  params: { authorId: string; text: string; gate: MentionGate },
): Promise<string[]> {
  const usernames = extractMentions(params.text);
  if (usernames.length === 0) return [];

  const { data: identities } = await supabase
    .from("profile_identities")
    .select("user_id, username")
    .in("username", usernames);

  const mentionedIds = [
    ...new Set(
      (identities ?? [])
        .map((r) => r.user_id as string)
        .filter((id): id is string => !!id && id !== params.authorId),
    ),
  ];
  if (mentionedIds.length === 0) return [];

  if (params.gate.kind === "club") {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", params.gate.clubId)
      .eq("status", "active")
      .in("user_id", mentionedIds);
    return (members ?? []).map((m) => m.user_id as string);
  }

  // gate.kind === "profile"
  const { data: owner } = await supabase
    .from("profiles")
    .select("is_public")
    .eq("user_id", params.gate.ownerId)
    .maybeSingle();

  if (owner?.is_public) return mentionedIds;

  // Perfil privado (o dueño no resoluble): solo seguidores aceptados del dueño.
  const { data: followers } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", params.gate.ownerId)
    .eq("status", "accepted")
    .in("follower_id", mentionedIds);
  return (followers ?? []).map((f) => f.follower_id as string);
}

// Notifica a los mencionados entregables. Best-effort: nunca lanza (igual que
// notify()/notifyMany). Devuelve los user_id notificados para el supersede.
export async function notifyMentions(
  supabase: SupabaseServerClient,
  params: { authorId: string; text: string; target: MentionNotifyTarget; gate: MentionGate },
): Promise<string[]> {
  try {
    const deliverables = await resolveDeliverableMentions(supabase, {
      authorId: params.authorId,
      text: params.text,
      gate: params.gate,
    });
    if (deliverables.length === 0) return [];
    await notifyMany(supabase, {
      userIds: deliverables,
      actorId: params.authorId,
      type: "mentioned",
      targetType: params.target.type,
      targetId: params.target.id,
    });
    return deliverables;
  } catch (error) {
    console.error("notifyMentions failed", error);
    return [];
  }
}
