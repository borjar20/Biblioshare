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
  // freshRead=true: esta lectura viene DESPUÉS de un posible sync que acaba
  // de escribir. La página también llama a getEditions ANTES de esto, para
  // el editor y el registro (ver BookDetailPage); sin diferenciar ambas
  // peticiones, Next las trata como la misma llamada y sirve aquí la
  // respuesta vacía de antes del sync. Ver el comentario en getEditions.
  return getEditions(supabase, "book", book.id, true);
}
