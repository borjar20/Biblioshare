import { createPublicClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Credit, CreditRole, ItemCredits } from "./types";

// Orden de aparición del equipo en la ficha.
const CREW_ORDER: Record<CreditRole, number> = {
  director: 0,
  creator: 1,
  writer: 2,
  author: 3,
  cast: 9,
};

type CreditRow = {
  role: string;
  character: string | null;
  billing_order: number | null;
  person: { id: string; name: string; photo_url: string | null } | null;
};

// Lectura pura de los créditos ya cacheados de un ítem (el enriquecimiento vive
// en ensureItemEnriched). Devuelve reparto y equipo ya separados y ordenados.
//
// Cliente SIN sesión (créditos y personas son `SELECT USING (true)`): resultado
// idéntico para todos → cacheable en Fase 4 (#436).
export async function getItemCredits(
  itemType: ItemType,
  itemId: string
): Promise<ItemCredits> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("credits")
    .select("role, character, billing_order, person:people(id, name, photo_url)")
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  const cast: Array<{ credit: Credit; order: number }> = [];
  const crew: Credit[] = [];

  for (const row of (data ?? []) as unknown as CreditRow[]) {
    const person = row.person;
    if (!person) continue;
    const credit: Credit = {
      id: person.id,
      name: person.name,
      photoUrl: person.photo_url,
      role: row.role as CreditRole,
      character: row.character,
    };
    if (credit.role === "cast") {
      cast.push({ credit, order: row.billing_order ?? 999 });
    } else {
      crew.push(credit);
    }
  }

  cast.sort((a, b) => a.order - b.order);
  crew.sort((a, b) => (CREW_ORDER[a.role] ?? 9) - (CREW_ORDER[b.role] ?? 9));

  return {
    cast: cast.map((c) => c.credit),
    crew,
  };
}
