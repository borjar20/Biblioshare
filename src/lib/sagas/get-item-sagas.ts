import { createPublicClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaMembership } from "./types";

// TODAS las sagas de un ítem. Sustituye a getItemSaga, que usaba
// `maybeSingle()` y por tanto daba por hecho que un ítem pertenece como mucho
// a UNA: `saga_items` nunca lo ha impuesto (su único es por saga+ítem), así
// que un libro en dos sagas reventaba la consulta. La maqueta —que pinta
// "Sagas · 4"— destapó el bug.
//
// La PRINCIPAL es la membresía con `is_primary` (spec §1.2): el modelo ya
// distingue una saga principal por ítem (índice parcial saga_items_primary_idx).
// `created_at` queda como desempate para ítems sin ninguna primary (p. ej. los
// del bulk de `populateTmdbCollection`, que inserta con is_primary=false).
//
// `total` es el número de obras de esa saga, para el "nº 4 de 20" de la
// maqueta. Va como agregado anidado en la MISMA consulta: con Supabase remoto
// lo caro es la ida y vuelta, y una consulta por saga serían N viajes.
// Cliente SIN sesión (`saga_items`/`sagas` son `SELECT USING (true)`): resultado
// idéntico para todos → cacheable en Fase 4 (#436).
export async function getItemSagas(
  itemType: ItemType,
  itemId: string,
): Promise<SagaMembership[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("saga_items")
    .select("position, is_primary, saga:sagas(id, name, saga_items(count))")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (!data) return [];

  return data.flatMap((row) => {
    const saga = row.saga as
      | { id: string; name: string; saga_items: { count: number }[] }
      | null
      | undefined;
    if (!saga) return [];
    return [
      {
        sagaId: saga.id,
        name: saga.name,
        position: row.position ?? null,
        total: saga.saga_items?.[0]?.count ?? 0,
        isPrimary: Boolean((row as { is_primary?: boolean }).is_primary),
      },
    ];
  });
}
