"use server";

import { createClient } from "@/lib/supabase/server";
import type { MarginPerson } from "./types";
// El filtrado vive aparte: una función exportada desde un fichero "use server"
// es una server action invocable desde fuera, y estas no deben serlo.
import { FOLLOWER_SEARCH_MIN, normalizeSearch, rankFollowers, type FollowerCandidate } from "./follower-query";

const CHUNK = 100;

// Sin filtro `.or(ilike…)`: el término nunca llega a PostgREST (sin escapado ni
// límite de URL). Se leen los seguidores aceptados, se traen sus perfiles por
// lotes de 100 y se filtra en TS.
export async function searchMyFollowers(q: string): Promise<MarginPerson[]> {
  if (normalizeSearch(q).length < FOLLOWER_SEARCH_MIN) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: follows } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", user.id)
    .eq("status", "accepted")
    .limit(1000);
  const ids = (follows ?? []).map((f) => f.follower_id);
  if (ids.length === 0) return [];
  const candidates: FollowerCandidate[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", ids.slice(i, i + CHUNK));
    candidates.push(...(data ?? []));
  }
  return rankFollowers(candidates, q).map((p) => ({
    id: p.user_id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
  }));
}
