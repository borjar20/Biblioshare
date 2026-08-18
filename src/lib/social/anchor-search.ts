import type { createClient } from "@/lib/supabase/server";
import type { AnchorRef } from "@/lib/catalog/anchor";
import type { ItemType } from "@/lib/catalog/types";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MAX_RESULTS = 8;

// Autocompletado del ancla de un pensamiento (Fase 4, Task 4.2). Dos fuentes
// con reglas de visibilidad distintas: items de catálogo (book/movie/series)
// se acotan a la BIBLIOTECA del viewer -- mismo criterio de "biblioteca" que
// getLibraryItems (pase activo, `passes.is_active = true`), porque un
// pensamiento sobre una obra que nunca has trackeado no tiene mucho sentido y
// además evita mandar el catálogo entero al cliente por cada tecla. Sagas y
// personas son catálogo público sin biblioteca propia -- global, ilike sobre
// el nombre, igual que `search-sagas.ts`.
export async function searchAnchors(
  supabase: SupabaseServerClient,
  viewerId: string,
  query: string,
): Promise<AnchorRef[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const needle = `%${trimmed}%`;

  // ponytail: tope defensivo, no una paginación real -- una biblioteca activa
  // de miles de obras no debería pasar de esto, pero sin límite aquí cada
  // tecla del autocompletar traería la biblioteca ENTERA solo para filtrarla
  // por título después. Si algún día hace falta más de 300, mover el filtro
  // de título a SQL (join con books/movies/series) en vez de subir el número.
  const { data: passRows, error: passError } = await supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("user_id", viewerId)
    .eq("is_active", true)
    .limit(300);
  if (passError) throw passError;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const row of passRows ?? []) {
    idsByType[row.item_type as ItemType].push(row.item_id as string);
  }

  const [books, movies, series, sagas, people] = await Promise.all([
    idsByType.book.length
      ? supabase
          .from("books")
          .select("id, title, author, cover_url")
          .in("id", idsByType.book)
          .ilike("title", needle)
          .limit(MAX_RESULTS)
      : Promise.resolve({ data: [], error: null }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, cover_url")
          .in("id", idsByType.movie)
          .ilike("title", needle)
          .limit(MAX_RESULTS)
      : Promise.resolve({ data: [], error: null }),
    idsByType.series.length
      ? supabase
          .from("series")
          .select("id, title, cover_url")
          .in("id", idsByType.series)
          .ilike("title", needle)
          .limit(MAX_RESULTS)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("sagas").select("id, name, cover_url").ilike("name", needle).order("name").limit(MAX_RESULTS),
    supabase.from("people").select("id, name, photo_url").ilike("name", needle).order("name").limit(MAX_RESULTS),
  ]);
  if (books.error) throw books.error;
  if (movies.error) throw movies.error;
  if (series.error) throw series.error;
  if (sagas.error) throw sagas.error;
  if (people.error) throw people.error;

  // Items de biblioteca primero (más relevantes: son cosas que el viewer ya
  // tiene), sagas/personas después. `slice` final acota el TOTAL a
  // MAX_RESULTS -- cada consulta ya limita su propia contribución, pero la
  // suma de las cinco puede superarlo.
  const items: AnchorRef[] = [
    ...(books.data ?? []).map(
      (r): AnchorRef => ({
        type: "book",
        id: r.id,
        title: r.title ?? UNTITLED_FALLBACK,
        imageUrl: r.cover_url,
        subtitle: r.author,
      }),
    ),
    ...(movies.data ?? []).map(
      (r): AnchorRef => ({
        type: "movie",
        id: r.id,
        title: r.title ?? UNTITLED_FALLBACK,
        imageUrl: r.cover_url,
        subtitle: null,
      }),
    ),
    ...(series.data ?? []).map(
      (r): AnchorRef => ({
        type: "series",
        id: r.id,
        title: r.title ?? UNTITLED_FALLBACK,
        imageUrl: r.cover_url,
        subtitle: null,
      }),
    ),
  ];
  const globalRefs: AnchorRef[] = [
    ...(sagas.data ?? []).map(
      (r): AnchorRef => ({ type: "saga", id: r.id, title: r.name, imageUrl: r.cover_url, subtitle: null }),
    ),
    ...(people.data ?? []).map(
      (r): AnchorRef => ({ type: "person", id: r.id, title: r.name, imageUrl: r.photo_url, subtitle: null }),
    ),
  ];

  return [...items, ...globalRefs].slice(0, MAX_RESULTS);
}
