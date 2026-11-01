import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type PassKey = { item_type: ItemType; item_id: string; position: unknown };

// Claves de los ÚLTIMOS pases activos de un estado, o de los destacados, con
// tope en SQL. `getLibraryView` hidrata la biblioteca entera antes de recortar
// (una cuenta con 137 películas hidrataría 137 obras para pintar 21 portadas),
// así que aquí se recorta primero y se hidrata después solo lo que se pinta.
// RLS (`can_view_profile`) decide qué filas ve quien mira: con el cliente de la
// petición, un perfil que no puede ver devuelve cero filas, no un error.
export async function latestPassKeys(
  supabase: SupabaseServerClient,
  userId: string,
  opts: { pinned: true; limit: number } | { status: MediaStatus; limit: number },
): Promise<PassKey[]> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, position")
    .eq("user_id", userId)
    .eq("is_active", true);
  if ("pinned" in opts) {
    query = query.not("pinned_order", "is", null).order("pinned_order", { ascending: true });
  } else {
    query = query.eq("status", opts.status);
    if (opts.status === "completed") {
      query = query.order("finished_on", { ascending: false, nullsFirst: false });
    }
    query = query.order("updated_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit);
  if (error) throw error;
  return (data ?? []) as PassKey[];
}
