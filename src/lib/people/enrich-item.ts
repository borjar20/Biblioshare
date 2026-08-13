import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getMovieDetails, getSeriesDetails, type ScreenDetails } from "@/lib/catalog/tmdb";
import { persistCollectionMembership } from "@/lib/sagas/persist-collection";
import { findOrCreatePeopleByTmdb, findOrCreateBookAuthorByKey } from "./find-or-create-person";
import { fetchWorkAuthorKeys } from "@/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "@/lib/catalog/openlibrary/work-search";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Lo que la ficha ya tiene cargado de la obra; sirve de guard para no repetir
// trabajo. `author` solo aplica a libros; los tamaños, a cine y series.
export type EnrichableItem = {
  id: string;
  tmdbId?: number | null;
  /** Solo libros: el texto de portada, ya NO fuente de identidad de personas. */
  author?: string | null;
  /** Solo libros: hace falta para resolver la obra cuando no hay work key. */
  title?: string | null;
  /** Solo libros: "/works/OL…W". La identidad de los autores sale de aquí. */
  openlibraryWorkKey?: string | null;
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

// ⚠️ NO es "¿hay algún crédito?", que es lo que preguntaba antes y estaba MAL.
//
// Desde que la ficha de persona hidrata su filmografía entera (2026-08-12,
// `hydratePersonCredits`), una película puede nacer en el catálogo con UN SOLO
// crédito: el de la persona por la que se creó. Con el guard viejo, abrir la
// ficha de esa película veía "ya tiene créditos" y NO pedía nada más — así que
// se quedaba para siempre sin su reparto ni su equipo, y encima sin su saga (el
// `return` de abajo va antes de `persistCollectionMembership`).
//
// El discriminante exacto ya está en la tabla: un enriquecido COMPLETO escribe
// `billing_order` en el reparto facturado (0, 1, 2…, ver `mapScreenCredits`),
// mientras que la siembra desde una ficha de persona lo deja a NULL. O sea que
// la pregunta correcta es «¿se llegó a traer el reparto facturado?».
//
// ⚠️ Si algún día `hydratePersonCredits` empieza a escribir `billing_order`,
// este guard vuelve a mentir EN SILENCIO. Está cubierto por test.
async function hasBilledCast(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("credits")
    .select("id", { count: "exact", head: true })
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .not("billing_order", "is", null);
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
    const needsCredits = !(await hasBilledCast(supabase, itemType, item.id));
    if (!needsCredits && !needsSize) return;

    if (itemType === "book") {
      if (!needsCredits) return;

      // La identidad de los autores sale de la OBRA, no del texto de portada.
      // Si el libro no guardó su work key (alta manual, CSV, ISBN que no
      // resolvió), se resuelve por título+autor y se guarda para no repetir la
      // búsqueda en cada visita — y de paso esa misma respuesta ya trae las
      // claves de autor, sin una segunda llamada.
      let authorKeys: string[] = [];
      if (item.openlibraryWorkKey) {
        authorKeys = await fetchWorkAuthorKeys(item.openlibraryWorkKey);
      } else if (item.title) {
        const resolved = await resolveWorkByTitleAuthor(item.title, item.author ?? null);
        if (resolved) {
          authorKeys = resolved.authorKeys;
          // 42501 = visitante anónimo, que no tiene UPDATE sobre `books`.
          // Esperado e inocuo: la guardará el primer visitante con sesión.
          const { error } = await supabase
            .from("books")
            .update({ openlibrary_work_key: resolved.workKey })
            .eq("id", item.id);
          if (error && error.code !== "42501") {
            console.error("book work key update failed", { id: item.id, error });
          }
        }
      }

      // Sin obra o sin autores en ella no se escribe NADA. La ficha enseñará
      // `books.author` como texto plano, sin enlace a ficha de persona. Es
      // deliberado: mejor sin autor que con uno inventado (spec de 2026-08-13).
      if (authorKeys.length === 0) return;

      const rows: Array<{
        item_type: ItemType;
        item_id: string;
        person_id: string;
        role: string;
        billing_order: number;
      }> = [];
      let order = 0;
      for (const key of authorKeys) {
        const personId = await findOrCreateBookAuthorByKey(supabase, key);
        // null = autor sin grafía latina (duplicado en otro alfabeto) o alta
        // fallida. Se omite ESE autor, no el libro entero.
        if (!personId) continue;
        rows.push({
          item_type: "book",
          item_id: item.id,
          person_id: personId,
          role: "author",
          billing_order: order++,
        });
      }

      // UPSERT y no INSERT: el autor puede estar ya puesto por la hidratación
      // de su ficha de persona.
      if (rows.length > 0) {
        await supabase.from("credits").upsert(rows, {
          onConflict: "item_type,item_id,person_id,role",
          ignoreDuplicates: true,
        });
      }
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
      // ⚠️ UPSERT, no INSERT. `credits` tiene índice único sobre
      // (item_type, item_id, person_id, role), así que un `insert` plano falla
      // ENTERO en cuanto UNA fila ya existe — y no inserta ninguna.
      //
      // Con la hidratación por persona eso dejó de ser el caso raro y pasó a ser
      // el NORMAL: si esta película entró al catálogo desde la ficha de alguien,
      // esa persona ya tiene su crédito aquí, y aparece otra vez en la respuesta
      // de TMDB. Con el insert plano, el reparto entero se perdía en silencio.
      const { error } = await supabase.from("credits").upsert(rows, {
        onConflict: "item_type,item_id,person_id,role",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("credits upsert failed", { itemType, id: item.id, count: rows.length, error });
      }
    }

    if (itemType === "movie" && details.collection) {
      await persistCollectionMembership(supabase, "movie", item.id, details.collection);
    }
  } catch (error) {
    console.error("ensureItemEnriched failed", { itemType, id: item.id, error });
  }
}
