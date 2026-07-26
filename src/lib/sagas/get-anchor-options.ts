import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { DraftAnchor } from "./sequence-draft";
import { fetchDescendants } from "./get-saga-detail";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books", movie: "movies", series: "series",
};

// Cargador APARTE de getSagaSequence, y a propósito más ancho (fase 2b): las
// anclas de una ventana se eligen del SUBÁRBOL entero, no solo de las filas
// que el editor de secuencia carga hoy (que son solo las de esta saga, #187 —
// ver la cabecera de get-saga-sequence.ts). El caso real que obliga a mirar
// más abajo, en palabras del curador: un ancla puede apuntar a una obra de un
// NIETO (Viento y Verdad, dentro de El Archivo de las Tormentas, dentro de la
// saga-madre). Mezclar los dos cargadores reintroduciría la lista plana que
// #187 cerró.
export async function getAnchorOptions(
  supabase: SupabaseServerClient,
  sagaId: string,
): Promise<DraftAnchor[]> {
  const descendants = await fetchDescendants(supabase, sagaId);
  const sagaIds = [sagaId, ...descendants.keys()];

  const { data: itemRows } = await supabase
    .from("saga_items")
    .select("item_type, item_id")
    .in("saga_id", sagaIds);
  const rows = (itemRows ?? []) as Array<{ item_type: ItemType; item_id: string }>;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of rows) idsByType[r.item_type].push(r.item_id);

  const titles = new Map<string, string>();
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type]).select("id, title").in("id", idsByType[type]);
      for (const r of data ?? []) titles.set(`${type}:${r.id}`, r.title as string);
    }),
  );

  const blocks = [...descendants.values()].map((d) => ({ id: d.id, name: d.name }));

  return buildAnchorOptions(
    rows.map((r) => ({ itemType: r.item_type, itemId: r.item_id })),
    titles,
    blocks,
  );
}

/** Parte pura: junta las membresías crudas del subárbol (una obra puede
 *  repetirse en más de una fila — es miembro directo de dos sagas del árbol o
 *  aparece dos veces por la razón que sea) con los títulos ya resueltos de
 *  catálogo, y añade una ancla por bloque descendiente. Exportada aparte para
 *  probarla sin Supabase (mismo patrón que `hydrateSequenceDraft` en
 *  get-saga-sequence.ts) — es donde vive la única lógica de este fichero: el
 *  dedupe de ítems repetidos y el descarte silencioso de un ancla rota (título
 *  ausente = obra que ya no está en el árbol, ver el comentario de `window` en
 *  sequence-draft.ts). */
export function buildAnchorOptions(
  itemRefs: Array<{ itemType: ItemType; itemId: string }>,
  titles: Map<string, string>,
  blocks: Array<{ id: string; name: string }>,
): DraftAnchor[] {
  const anchors: DraftAnchor[] = [];
  const seen = new Set<string>();
  for (const ref of itemRefs) {
    const key = `${ref.itemType}:${ref.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = titles.get(key);
    if (title === undefined) continue; // huérfana de catálogo: no es ancla válida
    anchors.push({ kind: "item", itemType: ref.itemType, itemId: ref.itemId, childSagaId: null, title });
  }
  for (const b of blocks) {
    anchors.push({ kind: "block", itemType: null, itemId: null, childSagaId: b.id, title: b.name });
  }
  return anchors;
}
