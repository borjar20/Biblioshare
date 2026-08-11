import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PersonSuggestion = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};
export type ClubSuggestion = {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
};

const LIMIT = 6;

/** Recuentos para decidir si el paso 3 se pinta (D2). Baratos: solo `count`. */
export async function getSocialCounts(
  supabase: SupabaseServerClient,
  selfId: string,
): Promise<{ profiles: number; clubs: number }> {
  const [profiles, clubs] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_public", true)
      .neq("user_id", selfId),
    supabase
      .from("clubs")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public"),
  ]);

  return { profiles: profiles.count ?? 0, clubs: clubs.count ?? 0 };
}

export async function getSocialSuggestions(
  supabase: SupabaseServerClient,
  selfId: string,
  // Onboarding pide justo LIMIT (no sigues a nadie aún). "A quién seguir" filtra
  // seguidos DESPUÉS, así que sobre-pide para no vaciar la tarjeta al recortar
  // los ya-seguidos (issue #297).
  limit: number = LIMIT,
): Promise<{ profiles: PersonSuggestion[]; clubs: ClubSuggestion[] }> {
  const [profilesRes, clubsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .eq("is_public", true)
      .neq("user_id", selfId)
      .limit(limit),
    supabase
      .from("clubs")
      .select("id, slug, name, club_members(count)")
      .eq("visibility", "public")
      .limit(limit),
  ]);

  return {
    profiles: (profilesRes.data ?? []).map((p) => ({
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name ?? null,
      avatarUrl: p.avatar_url ?? null,
    })),
    clubs: (clubsRes.data ?? []).map((c) => {
      const members = c.club_members as unknown as { count: number }[] | null;
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        memberCount: members?.[0]?.count ?? 0,
      };
    }),
  };
}
