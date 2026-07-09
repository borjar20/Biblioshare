import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getMovieDetails, getSeriesDetails } from "@/lib/catalog/tmdb";
import { persistCollectionMembership } from "@/lib/sagas/persist-collection";
import { findOrCreatePeopleByTmdb, findOrCreateBookAuthor } from "./find-or-create-person";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Un mismo autor puede venir como "A, B" (varios autores) desde la búsqueda.
function splitAuthors(author: string): string[] {
  return [...new Set(author.split(",").map((n) => n.trim()).filter(Boolean))].slice(0, 4);
}

async function creditsExist(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("credits")
    .select("id", { count: "exact", head: true })
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  return (count ?? 0) > 0;
}

// "Cache-as-you-go" (§7.32/§7.34): la primera vez que se abre la ficha de un
// ítem, se traen y persisten sus créditos (y, en películas, su saga). Las
// siguientes visitas leen solo de la BD. Se protege con un guard sobre la
// existencia de créditos y NUNCA lanza: un fallo de API externa no debe romper
// la ficha.
export async function ensureItemEnriched(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  item: { id: string; tmdbId?: number | null; author?: string | null }
): Promise<void> {
  try {
    if (await creditsExist(supabase, itemType, item.id)) return;

    if (itemType === "book") {
      if (!item.author) return;
      const names = splitAuthors(item.author);
      const rows: Array<{
        item_type: ItemType;
        item_id: string;
        person_id: string;
        role: string;
        billing_order: number;
      }> = [];
      let order = 0;
      for (const name of names) {
        const personId = await findOrCreateBookAuthor(supabase, name);
        rows.push({
          item_type: "book",
          item_id: item.id,
          person_id: personId,
          role: "author",
          billing_order: order++,
        });
      }
      if (rows.length > 0) await supabase.from("credits").insert(rows);
      return;
    }

    // Cine / series: reparto + equipo (+ saga en películas) desde TMDB.
    if (!item.tmdbId) return;
    const details =
      itemType === "movie"
        ? await getMovieDetails(item.tmdbId)
        : await getSeriesDetails(item.tmdbId);
    if (!details) return;

    const peopleMap = await findOrCreatePeopleByTmdb(
      supabase,
      details.credits.map((c) => ({
        tmdbId: c.tmdbId,
        name: c.name,
        photoUrl: c.photoUrl,
      }))
    );

    const rows = details.credits
      .map((c) => {
        const personId = peopleMap.get(c.tmdbId);
        if (!personId) return null;
        return {
          item_type: itemType,
          item_id: item.id,
          person_id: personId,
          role: c.role,
          character: c.character,
          billing_order: c.billingOrder,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      const { error } = await supabase.from("credits").insert(rows);
      // 23505 = enriquecimiento concurrente (otro render insertó ya estos
      // créditos); esperado e inocuo. Cualquier otro error sí se registra.
      if (error && error.code !== "23505") {
        console.error("credits insert failed", { itemType, id: item.id, count: rows.length, error });
      }
    }

    if (itemType === "movie" && details.collection) {
      await persistCollectionMembership(supabase, "movie", item.id, details.collection);
    }
  } catch (error) {
    console.error("ensureItemEnriched failed", { itemType, id: item.id, error });
  }
}
