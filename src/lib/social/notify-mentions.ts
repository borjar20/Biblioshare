import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { filterUnblockedUserIds } from "./block-state";
import { extractMentions } from "./mentions";
import { notifyMany } from "./notifications";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function resolveDeliverableMentions(
  supabase: SupabaseServerClient,
  // `usernames`: cuando se pasa, sustituye la extracción de `text` -- lo usa
  // updatePass (issue #317) para pedir entregabilidad solo del diff de
  // menciones nuevas, sin reimplementar el filtro de arriba.
  params: { authorId: string; text: string; interactionTargetId: string; usernames?: string[] },
): Promise<string[]> {
  const usernames = params.usernames ?? extractMentions(params.text);
  if (usernames.length === 0) return [];

  const { data: target, error: targetError } = await supabase
    .from("interaction_targets")
    .select("audience_kind, audience_id")
    .eq("id", params.interactionTargetId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error("interaction_target_not_found");

  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("user_id, username")
    .in("username", usernames);
  if (identitiesError) throw identitiesError;

  const mentionedIds = [
    ...new Set(
      (identities ?? [])
        .map((row) => row.user_id as string)
        .filter((id): id is string => Boolean(id) && id !== params.authorId),
    ),
  ];
  if (mentionedIds.length === 0) return [];

  const unblockedIds = await filterUnblockedUserIds(supabase, mentionedIds);
  if (unblockedIds.length === 0) return [];

  if (target.audience_kind === "club_member") {
    const { data: members, error } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", target.audience_id)
      .eq("status", "active")
      .in("user_id", unblockedIds);
    if (error) throw error;
    return (members ?? []).map((member) => member.user_id as string);
  }

  if (target.audience_kind === "activity_participant") {
    const { data: participants, error } = await supabase
      .from("club_activity_participants")
      .select("user_id")
      .eq("activity_id", target.audience_id)
      .in("user_id", unblockedIds);
    if (error) throw error;
    return (participants ?? []).map((participant) => participant.user_id as string);
  }

  if (target.audience_kind === "checkpoint_reached") {
    const { data: readers, error } = await supabase
      .from("club_activity_checkpoint_reads")
      .select("user_id")
      .eq("checkpoint_id", target.audience_id)
      .in("user_id", unblockedIds);
    if (error) throw error;
    return (readers ?? []).map((reader) => reader.user_id as string);
  }

  const { data: owner, error: ownerError } = await supabase
    .from("profiles")
    .select("is_public")
    .eq("user_id", target.audience_id)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (owner?.is_public) return unblockedIds;

  // La RLS de follows solo deja ver relaciones donde el actor es una de las
  // partes. Esta lectura server-only se acota al owner y a los candidatos ya
  // identificados y desbloqueados para no perder seguidores privados ajenos.
  const followerReader = createServiceRoleClient();
  const { data: followers, error: followersError } = await followerReader
    .from("follows")
    .select("follower_id")
    .eq("followee_id", target.audience_id)
    .eq("status", "accepted")
    .in("follower_id", unblockedIds);
  if (followersError) throw followersError;
  return (followers ?? []).map((follower) => follower.follower_id as string);
}

// Best-effort: las menciones nunca revierten la escritura que las originó.
export async function notifyMentions(
  supabase: SupabaseServerClient,
  params: { authorId: string; text: string; interactionTargetId: string; usernames?: string[] },
): Promise<string[]> {
  try {
    const deliverables = await resolveDeliverableMentions(supabase, params);
    if (deliverables.length === 0) return [];
    return await notifyMany(supabase, {
      userIds: deliverables,
      actorId: params.authorId,
      type: "mentioned",
      interactionTargetId: params.interactionTargetId,
    });
  } catch (error) {
    console.error("notifyMentions failed", error);
    return [];
  }
}
