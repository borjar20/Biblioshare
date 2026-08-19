import { cacheLife, cacheTag } from "next/cache";
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

// `billing_order` nulo = "sin orden conocido" → al final de su rol. Los créditos
// sembrados desde la ficha de una persona lo dejan a NULL (ver hasBilledCast).
const SIN_ORDEN = Number.MAX_SAFE_INTEGER;

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
  "use cache";
  // Idéntico para todo el mundo (#437): créditos/personas son SELECT USING(true)
  // y el cliente es anónimo. El espectador nunca escribe créditos —los rellena
  // ensureItemEnriched, backfill idempotente—, así que no hay read-your-own-writes
  // que invalidar aquí; `days` acota la rareza de un re-enriquecido.
  cacheLife("days");
  cacheTag(`credits:${itemType}:${itemId}`);
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("credits")
    .select("role, character, billing_order, person:people(id, name, photo_url)")
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  const cast: Array<{ credit: Credit; order: number }> = [];
  const crew: Array<{ credit: Credit; order: number }> = [];

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
      // El reparto conserva su 999 de siempre: no se toca nada fuera del
      // desempate del equipo.
      cast.push({ credit, order: row.billing_order ?? 999 });
    } else {
      crew.push({ credit, order: row.billing_order ?? SIN_ORDEN });
    }
  }

  cast.sort((a, b) => a.order - b.order);
  // El equipo ordena PRIMERO por rol y, dentro del mismo rol, por
  // `billing_order` (nulos al final).
  //
  // El desempate no es cosmético. TODOS los créditos de libro tienen
  // role="author" —Open Library marca a autor e ilustrador con el mismo
  // `/type/author_role` y desde ahí es imposible distinguirlos—, así que sin él
  // todas las comparaciones daban 0 y el orden visible era el que devolviera
  // Postgres en un select sin `order by`: "El nombre del viento" podía pintar
  // "Marc Simonetti, Patrick Rothfuss", con el ilustrador delante. Acreditar a
  // ilustradores junto a autores se aceptó EXACTAMENTE sobre la base de que
  // `billing_order` deja al principal el primero; esto es esa base.
  crew.sort((a, b) => {
    const porRol = (CREW_ORDER[a.credit.role] ?? 9) - (CREW_ORDER[b.credit.role] ?? 9);
    if (porRol !== 0) return porRol;
    return a.order - b.order;
  });

  return {
    cast: cast.map((c) => c.credit),
    crew: crew.map((c) => c.credit),
  };
}
