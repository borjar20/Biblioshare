import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ProfileSearchResult = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

const LIMIT = 30;

// Busca perfiles por username o nombre visible. Solo perfiles públicos (RLS
// ya lo restringe para terceros; el filtro explícito evita que el propio
// perfil privado del buscador se cuele en los resultados). La `,` en el
// or() separa condiciones, así que se escapan comas/paréntesis del término.
export async function searchProfiles(
  supabase: SupabaseServerClient,
  query: string
): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const safe = trimmed.replace(/[,()%]/g, " ");
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("is_public", true)
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .order("username", { ascending: true })
    .limit(LIMIT);

  return (data ?? []).map((p) => ({
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
  }));
}
