import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { rankSuggestions, type SuggestionCandidate } from "./rank-suggestions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};
const YEAR_COLUMN: Record<ItemType, "published_year" | "release_year"> = {
  book: "published_year",
  movie: "release_year",
  series: "release_year",
};

const TYPES: ItemType[] = ["book", "movie", "series"];
// Se piden más de los que se pintan porque rankSuggestions descarta lo que no
// tenga portada y año.
const FETCH_PER_TYPE = 40;

/**
 * Candidatos para la rejilla del paso 2. El recuento de lectores va filtrado
 * por RLS (pases propios y de perfiles públicos) — suficiente a esta escala; si
 * algún día hace falta el global, se sustituye por una RPC SECURITY DEFINER,
 * que es lo que ya hacen los tableros de actividad.
 */
export async function getSuggestions(
  supabase: SupabaseServerClient,
  interests: ItemType[],
): Promise<SuggestionCandidate[]> {
  const types = interests.length > 0 ? interests : TYPES;

  const perType = await Promise.all(
    types.map(async (type) => {
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}`)
        .not("cover_url", "is", null)
        .limit(FETCH_PER_TYPE);

      return (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>;
        return {
          itemType: type,
          itemId: r.id as string,
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
          year: (r[YEAR_COLUMN[type]] as number | null) ?? null,
          readers: 0,
        } satisfies SuggestionCandidate;
      });
    }),
  );
  const candidates = perType.flat();
  if (candidates.length === 0) return [];

  // Un solo viaje para los recuentos: se traen los pases de todos los ítems
  // candidatos y se cuentan usuarios distintos en memoria.
  const { data: passRows } = await supabase
    .from("passes")
    .select("user_id, item_type, item_id")
    .in(
      "item_id",
      candidates.map((c) => c.itemId),
    );

  const readersByItem = new Map<string, Set<string>>();
  for (const row of passRows ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    const set = readersByItem.get(key) ?? new Set<string>();
    set.add(row.user_id);
    readersByItem.set(key, set);
  }

  for (const c of candidates) {
    c.readers = readersByItem.get(`${c.itemType}:${c.itemId}`)?.size ?? 0;
  }

  return rankSuggestions(candidates, interests);
}
