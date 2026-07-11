import type { createClient } from "@/lib/supabase/server";

// Capa de consultas del grafo social (EPIC-05, Bloque A). Las mutaciones viven
// en src/lib/social/actions.ts ("use server"). La visibilidad de las filas la
// resuelve la RLS de `follows` (ver 20260711_social_follows.sql): las dos partes
// ven su relación; las aceptadas de un perfil público, cualquiera.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FollowState = "self" | "none" | "pending" | "accepted";

export type FollowCounts = { followers: number; following: number };

export type FollowUser = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

// Estado de la relación viewer -> target, para pintar el botón Seguir /
// Siguiendo / Solicitado. "self" = es tu propio perfil; "none" = sin sesión o
// sin relación.
export async function getFollowState(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  targetUserId: string,
): Promise<FollowState> {
  if (!viewerId) return "none";
  if (viewerId === targetUserId) return "self";

  const { data, error } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", viewerId)
    .eq("followee_id", targetUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return "none";
  return data.status as FollowState;
}

// Contadores de seguidores/seguidos (solo relaciones aceptadas). Nota: para un
// perfil PRIVADO visto por un extraño, la RLS oculta sus filas de follows, así
// que el conteo puede quedar a 0 desde fuera — aceptado en v1 (el grafo de un
// perfil privado no se expone). Para el dueño y perfiles públicos es exacto.
export async function getFollowCounts(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FollowCounts> {
  const [followers, following] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", userId)
      .eq("status", "accepted"),
    supabase
      .from("follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", userId)
      .eq("status", "accepted"),
  ]);

  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

// follows.follower_id/followee_id apuntan a auth.users, no a profiles, así que
// no hay embedding de PostgREST — se resuelven los perfiles en un segundo paso,
// mismo patrón que get-community.ts.
async function resolveUsers(
  supabase: SupabaseServerClient,
  userIds: string[],
): Promise<FollowUser[]> {
  if (userIds.length === 0) return [];
  // profile_identities (no profiles) para resolver también identidades de
  // perfiles PRIVADOS: un seguidor/solicitante puede tener el perfil privado y
  // aun así debe aparecer con su nombre/avatar en listas y solicitudes.
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", userIds);

  if (error) throw error;
  // profile_identities es una vista → columnas nullable en los tipos, pero
  // user_id/username nunca lo son en una fila real; se filtra por seguridad.
  const byId = new Map(
    (data ?? [])
      .filter(
        (p): p is typeof p & { user_id: string; username: string } =>
          p.user_id != null && p.username != null,
      )
      .map((p) => [
        p.user_id,
        {
          userId: p.user_id,
          username: p.username,
          displayName: p.display_name,
          avatarUrl: p.avatar_url,
        } satisfies FollowUser,
      ]),
  );
  // Preserva el orden de entrada y descarta los que la RLS no deja resolver.
  return userIds.map((id) => byId.get(id)).filter((u): u is FollowUser => !!u);
}

// Solicitudes de seguimiento pendientes dirigidas a `userId` (perfiles
// privados). Solo el propio dueño las ve (RLS).
export async function getPendingRequests(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return resolveUsers(supabase, (data ?? []).map((r) => r.follower_id));
}

export async function getFollowers(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return resolveUsers(supabase, (data ?? []).map((r) => r.follower_id));
}

export async function getFollowing(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return resolveUsers(supabase, (data ?? []).map((r) => r.followee_id));
}
