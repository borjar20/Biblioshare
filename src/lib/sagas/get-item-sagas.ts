import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaMembership } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// TODAS las sagas de un ítem. Sustituye a getItemSaga, que usaba
// `maybeSingle()` y por tanto daba por hecho que un ítem pertenece como mucho
// a UNA: `saga_items` nunca lo ha impuesto (su único es por saga+ítem), así
// que un libro en dos sagas reventaba la consulta. La maqueta —que pinta
// "Sagas · 4"— destapó el bug.
//
// La PRINCIPAL es la PRIMERA: la saga a la que se añadió antes (`created_at`
// de la membresía). Regla única para los tres tipos, decidida a propósito por
// ser la explicable y estable — el modelo no tiene forma de marcar una saga
// como principal, y no vamos a inventarnos una heurística que acierte a veces.
//
// `total` es el número de obras de esa saga, para el "nº 4 de 20" de la
// maqueta. Va como agregado anidado en la MISMA consulta: con Supabase remoto
// lo caro es la ida y vuelta, y una consulta por saga serían N viajes.
export async function getItemSagas(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
): Promise<SagaMembership[]> {
  const { data } = await supabase
    .from("saga_items")
    .select("position, saga:sagas(id, name, saga_items(count))")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
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
      },
    ];
  });
}
