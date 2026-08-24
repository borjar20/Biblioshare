import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SagaMemberRef = { itemType: ItemType; itemId: string };

// Las referencias (tipo + id) de los miembros de una saga, y nada más. Existe
// para la REVALIDACIÓN, no para pintar: cuando cambia la composición o el
// nombre de una saga hay que invalidar la etiqueta `saga-membership:*` de cada
// miembro, porque su ficha enseña «nº X de Y» y la Y es el total de la saga
// (F1-023). Los lectores de verdad —getSagaDetail, getSagaSequence— traen
// muchísimo más y no valen para esto: aquí lo que importa es que sea UNA
// consulta barata que se pueda pagar en cada mutación de curación.
//
// Solo miembros DIRECTOS: `getItemSagas` cuenta `saga_items` de esa saga, así
// que las obras de una subsaga no ven cambiar su total cuando cambia la madre.
export async function listSagaMemberRefs(
  supabase: SupabaseServerClient,
  sagaId: string
): Promise<SagaMemberRef[]> {
  const { data } = await supabase
    .from("saga_items")
    .select("item_type, item_id")
    .eq("saga_id", sagaId);

  return (data ?? []).map((row) => ({
    itemType: row.item_type as ItemType,
    itemId: row.item_id as string,
  }));
}
