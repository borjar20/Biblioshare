import { createClient } from "@/lib/supabase/server";

// Nombre visible del usuario para el chip «Yo» del setup (issue #985):
// display_name del perfil, o su username; null sin perfil (el form cae a la
// etiqueta «Yo»). Server-only: los setups lo reciben ya resuelto por props.
export async function getSelfName(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.display_name || data?.username || null;
}
