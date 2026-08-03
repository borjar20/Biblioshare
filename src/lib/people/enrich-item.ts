import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getMovieDetails, getSeriesDetails, type ScreenDetails } from "@/lib/catalog/tmdb";
import { persistCollectionMembership } from "@/lib/sagas/persist-collection";
import { findOrCreatePeopleByTmdb, findOrCreateBookAuthor } from "./find-or-create-person";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Lo que la ficha ya tiene cargado de la obra; sirve de guard para no repetir
// trabajo. `author` solo aplica a libros; los tamaños, a cine y series.
export type EnrichableItem = {
  id: string;
  tmdbId?: number | null;
  author?: string | null;
  durationMinutes?: number | null;
  totalEpisodes?: number | null;
  episodeRuntimeMinutes?: number | null;
};

// Guard de los tamaños, independiente del de créditos A PROPÓSITO: una obra
// puede tener ya su reparto cacheado y seguir sin duración (es justo el caso de
// las 136 películas con créditos y sin `duration_minutes` de #365), así que
// mirar solo `creditsExist` la dejaría sin rellenar para siempre.
export function needsSizeHydration(itemType: ItemType, item: EnrichableItem): boolean {
  if (itemType === "movie") return item.durationMinutes == null;
  if (itemType === "series")
    return item.totalEpisodes == null || item.episodeRuntimeMinutes == null;
  return false;
}

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

// Persiste los tamaños que ya vienen en la respuesta de detalles. Solo escribe
// lo que TMDB trae: el recuento de episodios y la duración de episodio son
// independientes (puede venir uno sin el otro) y la estimación necesita ambos,
// así que se guarda lo que haya en vez de descartar la respuesta entera.
//
// 42501 = visitante ANÓNIMO. Desde la navegación anónima (#359/#360) las fichas
// las abre también quien no tiene sesión, y `anon` no tiene —ni debe tener—
// grant de UPDATE sobre el catálogo. Es esperado e inocuo: la hidratación la
// hará el primer visitante con sesión. Mismo criterio que el 23505 de los
// créditos; cualquier otro error sí se registra.
async function writeSizes(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  id: string,
  details: ScreenDetails
): Promise<void> {
  // Las dos ramas van con el nombre de tabla literal: con `from(tabla)` en una
  // variable, supabase-js no puede casar el patch con la tabla y el tipo se cae.
  if (itemType === "movie") {
    if (!details.runtimeMinutes) return;
    const { error } = await supabase
      .from("movies")
      .update({ duration_minutes: details.runtimeMinutes })
      .eq("id", id);
    if (error && error.code !== "42501") console.error("writeSizes failed", { itemType, id, error });
    return;
  }

  const patch = {
    ...(details.numberOfEpisodes && {
      total_episodes: details.numberOfEpisodes,
      total_seasons: details.numberOfSeasons,
    }),
    ...(details.episodeRuntimeMinutes && {
      episode_runtime_minutes: details.episodeRuntimeMinutes,
    }),
  };
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("series").update(patch).eq("id", id);
  if (error && error.code !== "42501") console.error("writeSizes failed", { itemType, id, error });
}

// "Cache-as-you-go" (§7.32/§7.34): la primera vez que se abre la ficha de un
// ítem, se traen y persisten sus créditos (y, en películas, su saga) y sus
// TAMAÑOS —duración de la película, nº de episodios y duración de episodio—.
// Las siguientes visitas leen solo de la BD. NUNCA lanza: un fallo de API
// externa no debe romper la ficha.
//
// Los tamaños viajan en la MISMA respuesta de detalles que los créditos y hasta
// #365 se descartaban aquí: solo los rellenaba un backfill perezoso colgado del
// sorteo, que ni siquiera hacía una petición distinta —la misma— y que solo
// alcanzaba obras PENDIENTES del dueño que abriera su Rincón. Como es dato de
// catálogo COMPARTIDO, el marcador en producción era 1 de 354 películas con
// duración y 0 de 26 series con episodios. Ver decisiones.md 2026-08-03.
export async function ensureItemEnriched(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  item: EnrichableItem
): Promise<void> {
  try {
    const needsSize = needsSizeHydration(itemType, item);
    const needsCredits = !(await creditsExist(supabase, itemType, item.id));
    if (!needsCredits && !needsSize) return;

    if (itemType === "book") {
      if (!needsCredits) return;
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

    // Cine / series: reparto + equipo (+ saga en películas) + tamaños, todo de
    // la misma llamada de detalles.
    if (!item.tmdbId) return;
    const details =
      itemType === "movie"
        ? await getMovieDetails(item.tmdbId)
        : await getSeriesDetails(item.tmdbId);
    if (!details) return;

    if (needsSize) await writeSizes(supabase, itemType, item.id, details);
    if (!needsCredits) return;

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
