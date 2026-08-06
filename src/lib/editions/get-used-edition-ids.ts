import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Qué ediciones de la lista tienen ya algún pase registrado contra ellas. Sirve
// para NO ofrecer el borrado rápido de algo que el trigger
// block_edition_delete_if_used va a rechazar de todas formas.
//
// Va por la RPC `editions_in_use` (SECURITY DEFINER), NO por un select directo:
// la RLS de `passes` solo deja ver los pases propios y los de perfiles públicos,
// así que una edición usada solo por perfiles privados salía como "libre" y se
// ofrecía un × que el trigger luego rechazaba (#278). La RPC ve TODOS los pases.
export async function getUsedEditionIds(
  supabase: SupabaseServerClient,
  editionIds: string[]
): Promise<string[]> {
  if (editionIds.length === 0) return [];

  const { data } = await supabase.rpc("editions_in_use", {
    p_edition_ids: editionIds,
  });

  return data ?? [];
}
