import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type Profile = {
  userId: string;
  username: string;
  isPublic: boolean;
};

export async function getProfileByUsername(
  supabase: SupabaseServerClient,
  username: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, is_public")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { userId: data.user_id, username: data.username, isPublic: data.is_public };
}
