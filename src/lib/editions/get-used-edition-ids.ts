import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Qué ediciones de la lista tienen ya algún pase registrado contra ellas. Sirve
// para NO ofrecer el borrado rápido de algo que el trigger
// block_edition_delete_if_used va a rechazar de todas formas.
//
// Es un chequeo ORIENTATIVO, igual que el que hace deleteEdition: la RLS de
// `passes` solo deja ver los pases propios y los de perfiles públicos, así que
// una edición usada solo por perfiles privados no sale aquí. Por eso la
// interfaz sigue teniendo que saber enseñar el error `inUse` cuando el borrado
// falla pese a todo.
export async function getUsedEditionIds(
  supabase: SupabaseServerClient,
  editionIds: string[]
): Promise<string[]> {
  if (editionIds.length === 0) return [];

  const { data } = await supabase
    .from("passes")
    .select("edition_id")
    .in("edition_id", editionIds);

  const used = new Set<string>();
  for (const row of data ?? []) {
    if (row.edition_id) used.add(row.edition_id);
  }
  return [...used];
}
