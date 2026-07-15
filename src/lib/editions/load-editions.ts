import type { createClient } from "@/lib/supabase/server";
import type { Edition } from "./types";
import { ensureBookEditions } from "./sync-editions";
import { getEditions } from "./get-editions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LoadableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  editions_synced_at: string | null;
};

// Sincroniza las ediciones reales desde OpenLibrary si aún no se hizo (guard
// editions_synced_at) y devuelve la lista para pintar. Se resuelve como una
// promesa que la ficha pasa a <Suspense>/use(): así el sync (lento) ocurre en
// la misma petición pero en streaming, sin bloquear el resto de la página y sin
// esperar a una segunda visita. `canSync` es false para anónimos (la RPC
// register_book_edition exige auth.uid()): solo leen lo que haya. Nunca lanza
// (ensureBookEditions se traga sus errores).
export async function loadBookEditions(
  supabase: SupabaseServerClient,
  book: LoadableBook,
  canSync: boolean,
): Promise<Edition[]> {
  if (canSync && book.editions_synced_at === null) {
    await ensureBookEditions(supabase, book);
  }
  return getEditions(supabase, "book", book.id);
}
