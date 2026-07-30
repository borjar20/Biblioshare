import type { createClient } from "@/lib/supabase/server";
import { extractMentions } from "./mentions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Dado un lote de textos, resuelve en UNA query qué usernames mencionados
// existen — para pasar el array a <MentionText> y linkificar solo los
// reales. Devuelve string[] (no Set): un Set no serializa a través del
// límite RSC→cliente cuando este resultado viaja como prop de un componente
// cliente (ClubPostCard, ReviewInteractions, ReviewCard...).
export async function resolveKnownMentions(
  supabase: SupabaseServerClient,
  texts: string[],
): Promise<string[]> {
  const usernames = [...new Set(texts.flatMap((t) => extractMentions(t)))];
  if (usernames.length === 0) return [];
  const { data } = await supabase
    .from("profile_identities")
    .select("username")
    .in("username", usernames);
  return [...new Set((data ?? []).map((r) => (r.username as string).toLowerCase()))];
}
