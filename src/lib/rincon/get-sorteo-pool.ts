import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { EstimableItem } from "@/lib/pace/types";
import type { SorteoCollection, SorteoItem } from "@/components/rincon/sorteo-logic";
import { fetchCatalogMeta, type CatalogMeta } from "@/lib/pace/fetch-catalog-meta";
import { computePaceEstimates } from "@/lib/pace/compute-estimates";
import { getBookPace } from "@/lib/pace/get-reading-pace";
import { getMoviePace } from "@/lib/pace/get-movie-cadence";
import { formatDuration } from "@/lib/pace/format-duration";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SorteoPool = {
  items: SorteoItem[];
  collections: SorteoCollection[];
};

// Español fijo, como formatDuration (ver su nota sobre next-intl).
function metaText(item: EstimableItem): string {
  if (item.itemType === "book") return item.totalPages ? `${item.totalPages} pág.` : "Libro";
  if (item.itemType === "movie")
    return item.durationMinutes ? `Película · ${formatDuration(item.durationMinutes)}` : "Película";
  return item.totalEpisodes ? `Serie · ${item.totalEpisodes} episodios` : "Serie";
}

// El pool del sorteo (spec 2026-07-17): TODOS los pendientes del usuario (pase
// activo planned), cada uno con su estimación de tiempo y el flag
// `fresh` = sin ningún pase anterior con la obra (primera vez).
//
// Además, a qué **colecciones sorteables** pertenece cada uno. El filtro por
// colección se resuelve en cliente como los otros tres (tipo/duración/estado):
// la hoja carga el pool una vez y filtrar no debe costar un viaje al servidor.
// Solo se miran las colecciones marcadas `is_sorteable` — con las 19 que puede
// tener un usuario, el desplegable era inservible (por eso el flag, y por eso
// se calcula la pertenencia solo de esas).
export async function getSorteoPool(
  supabase: SupabaseServerClient,
  userId: string
): Promise<SorteoPool> {
  const { data: entries, error } = await supabase
    .from("passes")
    .select("id, item_type, item_id, edition_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");
  if (error) throw error;
  if (!entries || entries.length === 0) return { items: [], collections: [] };

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  // Las páginas dependen de la EDICIÓN que el usuario dijo estar leyendo, no de
  // la obra — sin esto los libros salían "sin estimar" (ver fetchCatalogMeta).
  const editionIdByItem = new Map<string, string | null>();
  for (const entry of entries) {
    idsByType[entry.item_type].push(entry.item_id);
    editionIdByItem.set(`${entry.item_type}:${entry.item_id}`, entry.edition_id);
  }

  const [metaByKey, bookPace, moviePace, previous, sorteables] = await Promise.all([
    fetchCatalogMeta(supabase, idsByType, editionIdByItem),
    getBookPace(supabase, userId),
    getMoviePace(supabase, userId),
    // Pases archivados = la obra ya se leyó/vio alguna vez → no es "sin empezar".
    supabase
      .from("passes")
      .select("item_type, item_id")
      .eq("user_id", userId)
      .eq("is_active", false),
    supabase
      .from("collections")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_sorteable", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (previous.error) throw previous.error;
  if (sorteables.error) throw sorteables.error;
  const seen = new Set((previous.data ?? []).map((p) => `${p.item_type}:${p.item_id}`));

  const collections: SorteoCollection[] = (sorteables.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  // Pertenencia obra → colecciones sorteables. Sin sorteables no hay consulta.
  const collectionIdsByKey = new Map<string, string[]>();
  if (collections.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from("collection_items")
      .select("collection_id, item_type, item_id")
      .in(
        "collection_id",
        collections.map((c) => c.id)
      );
    if (membersError) throw membersError;
    for (const row of members ?? []) {
      const key = `${row.item_type}:${row.item_id}`;
      const list = collectionIdsByKey.get(key);
      if (list) list.push(row.collection_id);
      else collectionIdsByKey.set(key, [row.collection_id]);
    }
  }

  // Ítems sin obra en catálogo se descartan.
  const build = (meta: Map<string, CatalogMeta>) =>
    entries.flatMap((entry): EstimableItem[] => {
      const m = meta.get(`${entry.item_type}:${entry.item_id}`);
      if (!m) return [];
      return [
        {
          entryId: entry.id,
          itemId: entry.item_id,
          itemType: entry.item_type,
          ...m,
        } satisfies EstimableItem,
      ];
    });

  // Los tamaños (duración, nº de episodios) NO se rellenan aquí: son dato de
  // catálogo compartido y los hidrata `ensureItemEnriched` al abrir la ficha,
  // de la misma respuesta de TMDB que ya pedía para los créditos. Colgarlo del
  // sorteo solo alcanzaba las obras PENDIENTES de quien abriera SU Rincón —en
  // producción, 1 de 354 películas—. Ver #365 y decisiones.md 2026-08-03.
  const estimable = build(metaByKey);

  const estimates = computePaceEstimates(estimable, bookPace, moviePace);

  const items = estimable.map((item) => {
    const estimate = estimates.perItem[item.entryId];
    const minutes = estimate?.minutes ?? null;
    return {
      itemType: item.itemType,
      itemId: item.itemId,
      title: item.title,
      subtitle: item.subtitle,
      coverUrl: item.coverUrl,
      metaText: metaText(item),
      estimatedMinutes: minutes,
      estimateText: minutes !== null ? estimate.formulaText : null,
      fresh: !seen.has(`${item.itemType}:${item.itemId}`),
      collectionIds: collectionIdsByKey.get(`${item.itemType}:${item.itemId}`) ?? [],
    } satisfies SorteoItem;
  });

  return { items, collections };
}
