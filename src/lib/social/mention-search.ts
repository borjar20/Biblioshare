"use server";

import { createClient } from "@/lib/supabase/server";
import { searchProfiles, type ProfileSearchResult } from "@/lib/profile/search-profiles";
import { mergeCandidates, type MentionCandidate, type MentionScope } from "./mention-candidates";

// mergeCandidates y los tipos viven en ./mention-candidates (módulo puro): este
// fichero es "use server", así que solo puede exportar server actions async.
const LIMIT = 6;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// profile_identities es una VISTA sin FK reconocible por PostgREST (mismo
// motivo que resolveUsers en follows.ts y listMembers en clubs.ts): siempre
// dos pasos -- ids primero, identidades después -- nunca un embed
// `tabla!inner(profile_identities(...))`.
async function searchClubMemberCandidates(
  supabase: SupabaseServerClient,
  clubId: string,
  prefix: string,
): Promise<MentionCandidate[]> {
  const { data: members, error: membersError } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", clubId)
    .eq("status", "active");
  if (membersError) throw membersError;
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];

  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("username, display_name, avatar_url")
    .in("user_id", ids)
    .or(`username.ilike.${prefix}%,display_name.ilike.${prefix}%`)
    .order("username", { ascending: true })
    .limit(LIMIT);
  if (identitiesError) throw identitiesError;

  return (identities ?? [])
    .filter((p): p is typeof p & { username: string } => p.username != null)
    .map((p) => ({
      username: p.username,
      displayName: p.display_name ?? null,
      avatarUrl: p.avatar_url ?? null,
      isInGraph: true,
    }));
}

// Grafo del scope "profile": gente que el usuario actual sigue o le sigue
// (aceptado), filtrada por prefijo. Mismo two-step que resolveUsers en
// follows.ts, pero filtrando por username antes de resolver identidades.
async function searchProfileGraphCandidates(
  supabase: SupabaseServerClient,
  userId: string,
  prefix: string,
): Promise<ProfileSearchResult[]> {
  const { data: rel, error: relError } = await supabase
    .from("follows")
    .select("follower_id, followee_id")
    .eq("status", "accepted")
    .or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
  if (relError) throw relError;

  const ids = new Set<string>();
  for (const r of rel ?? []) {
    if (r.follower_id !== userId) ids.add(r.follower_id as string);
    if (r.followee_id !== userId) ids.add(r.followee_id as string);
  }
  if (ids.size === 0) return [];

  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("username, display_name, avatar_url")
    .in("user_id", [...ids])
    .or(`username.ilike.${prefix}%,display_name.ilike.${prefix}%`)
    .order("username", { ascending: true })
    .limit(LIMIT);
  if (identitiesError) throw identitiesError;

  return (identities ?? [])
    .filter((p): p is typeof p & { username: string } => p.username != null)
    .map((p) => ({
      username: p.username,
      displayName: p.display_name ?? null,
      avatarUrl: p.avatar_url ?? null,
    }));
}

// Candidatos para autocompletar @menciones. En un club: solo miembros
// activos (coincide con el gate de entrega de resolveDeliverableMentions en
// notify-mentions.ts). En un perfil: el grafo social propio primero
// (isInGraph: true), relleno con búsqueda global de perfiles públicos.
export async function searchMentionCandidates(
  query: string,
  ctx: MentionScope,
): Promise<MentionCandidate[]> {
  const prefix = query.trim();
  if (prefix.length === 0) return [];
  const safePrefix = prefix.replace(/[,()%]/g, " ");
  const supabase = await createClient();

  if (ctx.scope === "club") {
    return searchClubMemberCandidates(supabase, ctx.clubId, safePrefix);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [graph, global] = await Promise.all([
    user ? searchProfileGraphCandidates(supabase, user.id, safePrefix) : Promise.resolve([]),
    searchProfiles(supabase, safePrefix),
  ]);

  return mergeCandidates(graph, global, LIMIT);
}
