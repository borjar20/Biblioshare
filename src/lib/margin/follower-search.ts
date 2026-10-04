"use server";

import { createClient } from "@/lib/supabase/server";
import type { MarginPerson } from "./types";
// El saneado vive aparte: una función exportada desde un fichero "use server"
// es una server action invocable desde fuera, y esta no debe serlo.
import { sanitizeFollowerQuery } from "./follower-query";

export async function searchMyFollowers(q: string): Promise<MarginPerson[]> {
  const term = sanitizeFollowerQuery(q);
  if (term.length < 2) return [];
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
  const { data } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", ids)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(8);
  return (data ?? []).map((p) => ({
    id: p.user_id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
  }));
}
