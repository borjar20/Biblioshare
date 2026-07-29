import type { createClient } from "@/lib/supabase/server";
import { getSocialSuggestions, type PersonSuggestion } from "@/lib/onboarding/get-social-suggestions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Sugerencias para la sidebar del Inicio. Reusa getSocialSuggestions (perfiles
// públicos) pero descarta a quien ya sigues o tienes solicitado — en onboarding
// no hacía falta (no seguías a nadie), aquí sí.
export async function getWhoToFollow(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PersonSuggestion[]> {
  const [{ profiles }, following] = await Promise.all([
    getSocialSuggestions(supabase, userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
  ]);
  const excluded = new Set((following.data ?? []).map((f) => f.followee_id));
  return profiles.filter((p) => !excluded.has(p.userId));
}
