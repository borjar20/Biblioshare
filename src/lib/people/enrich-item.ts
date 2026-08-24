import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ItemType } from "@/lib/catalog/types";
import { getMovieDetails, getSeriesDetails, type ScreenDetails } from "@/lib/catalog/tmdb";
import { persistCollectionMembership } from "@/lib/sagas/persist-collection";
import type { SagaMemberRef } from "@/lib/sagas/saga-member-refs";
import { findOrCreatePeopleByTmdb, findOrCreateBookAuthorByKey } from "./find-or-create-person";
import { fetchWorkAuthorKeys } from "@/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "@/lib/catalog/openlibrary/work-search";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Lo que el enriquecimiento ha ESCRITO, para que quien lo llame invalide las
// cachés correspondientes. No se invalida aquí porque esto corre durante el
// render de la ficha, donde las APIs de revalidación no son legales; la ficha
// lo agenda con `after()`. Ver `revalidateItemCredits` /
// `revalidateSagaMembership` en el módulo de reactividad (F1-023).
export type EnrichmentEffects = {
  /** Se escribieron filas nuevas en `credits`: la etiqueta `credits:*` de esta
   *  obra puede estar cacheada VACÍA de un intento anterior que falló. */
  wroteCredits: boolean;
  /** Miembros de la colección TMDB en la que la película acaba de entrar: a
   *  todos les cambia el «nº X de Y», no solo a la recién llegada. */
  sagaMembers: SagaMemberRef[];
};

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
// grant de escritura sobre el catálogo. Es esperado e inocuo: la hidratación la
// hará el primer visitante con sesión. Mismo criterio que el 23505 de los
// créditos; cualquier otro error sí se registra. Con la RPC el anónimo recibe
// además el `authentication required` que ella misma lanza (P0001), tratado
// igual: la RPC exige `auth.uid()`.
//
// #676: esto era un UPDATE DIRECTO sobre `movies`/`series`. El grant de UPDATE
// por columna que lo sostenía incluía `total_seasons`, y la política era
// `using(true)`, así que cualquier `authenticated` podía por REST poner
// `total_seasons = 100000` en una serie compartida; abrir esa ficha lanzaba una
// petición TMDB POR TEMPORADA (ver getSeriesEpisodes). El usuario controlaba el
// multiplicador del fan-out. Ahora va por las RPC `hydrate_*` (SECURITY
// DEFINER, fill-only, #674) y el grant directo de las columnas de tamaño se
// revoca en 20260865.
//
// Fill-only NO cambia el comportamiento: el único llamador ya venía filtrado
// por `needsSizeHydration`, que exige que la columna esté a NULL.
async function writeSizes(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  id: string,
  details: ScreenDetails
): Promise<void> {
  if (itemType === "movie") {
    if (!details.runtimeMinutes) return;
    const { error } = await supabase.rpc("hydrate_movie", {
      p_movie_id: id,
      p_duration_minutes: details.runtimeMinutes,
    });
    if (error && error.code !== "42501") console.error("writeSizes failed", { itemType, id, error });
    return;
  }

  const patch = {
    ...(details.numberOfEpisodes && {
      p_total_episodes: details.numberOfEpisodes,
      // Se OMITE si no viene: la RPC declara sus parámetros opcionales, no
      // nullable. Omitirlo y pasar null significan lo mismo para ella (no
      // rellenar esa columna), pero solo lo primero tipa.
      ...(details.numberOfSeasons != null && { p_total_seasons: details.numberOfSeasons }),
    }),
    ...(details.episodeRuntimeMinutes && {
      p_episode_runtime_minutes: details.episodeRuntimeMinutes,
    }),
  };
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.rpc("hydrate_series", { p_series_id: id, ...patch });
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
): Promise<EnrichmentEffects> {
  // Se acumula lo que HAY QUE INVALIDAR y se devuelve, en vez de invalidarlo
  // aquí: esta función corre DURANTE el render de la ficha, y ni `updateTag`
  // (solo server actions) ni `revalidateTag` son legales ahí. La ficha agenda
  // la invalidación con `after()` a partir de esto (F1-023).
  const effects: EnrichmentEffects = { wroteCredits: false, sagaMembers: [] };
  try {
    const needsSize = needsSizeHydration(itemType, item);
    const needsCredits = !(await hasBilledCast(supabase, itemType, item.id));
    if (!needsCredits && !needsSize) return effects;

    if (itemType === "book") {
      if (!needsCredits) return effects;

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
          // Las claves de autor se aprovechan siempre, aunque el título no
          // case exacto: son útiles hasta de un acierto imperfecto.
          authorKeys = resolved.authorKeys;

          // Pero la work key SOLO se persiste si el título coincide. El
          // principio fundador de este cambio es que un nombre no es
          // identidad; guardar aquí un acierto fuzzy sin verificar, en una
          // columna que OTRAS features (ensureBookHydrated: sinopsis,
          // ediciones) tratan como verdad, colaría ese mismo error de vuelta
          // por otra puerta — y de forma permanente, porque una vez escrita
          // ya no se vuelve a resolver.
          if (resolved.titleMatches) {
            // 42501 = visitante anónimo, que no tiene UPDATE sobre `books`.
            // Esperado e inocuo: la guardará el primer visitante con sesión.
            //
            // 23505 = esa work key ya la tiene OTRA fila del catálogo, desde que
            // #730 puso el índice único. También esperado: significa que la obra
            // ya está dada de alta con su key y esta fila es un alta manual que
            // apunta a lo mismo. No escribir es exactamente lo correcto —
            // guardarla duplicaría el catálogo, que es lo que el índice impide.
            const { error } = await supabase
              .from("books")
              .update({ openlibrary_work_key: resolved.workKey })
              .eq("id", item.id);
            if (error && error.code !== "42501" && error.code !== "23505") {
              console.error("book work key update failed", { id: item.id, error });
            }
          }
        }
      }

      // Sin obra o sin autores en ella no se escribe NADA. La ficha enseñará
      // `books.author` como texto plano, sin enlace a ficha de persona. Es
      // deliberado: mejor sin autor que con uno inventado (spec de 2026-08-13).
      if (authorKeys.length === 0) return effects;

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
      //
      // #725: con service_role (ver la cabecera de `find-or-create-person.ts`).
      // Ya no hay que tratar el 42501 del visitante anónimo: escribe él también,
      // y la ficha deja de depender de que pase alguien con sesión.
      if (rows.length > 0) {
        const { error } = await createServiceRoleClient().from("credits").upsert(rows, {
          onConflict: "item_type,item_id,person_id,role",
          ignoreDuplicates: true,
        });
        if (error) {
          console.error("book credits upsert failed", { id: item.id, count: rows.length, error });
        } else {
          effects.wroteCredits = true;
        }
      }
      return effects;
    }

    // Cine / series: reparto + equipo (+ saga en películas) + tamaños, todo de
    // la misma llamada de detalles.
    if (!item.tmdbId) return effects;
    const details =
      itemType === "movie"
        ? await getMovieDetails(item.tmdbId)
        : await getSeriesDetails(item.tmdbId);
    if (!details) return effects;

    if (needsSize) await writeSizes(supabase, itemType, item.id, details);
    if (!needsCredits) return effects;

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
      // #725: con service_role, igual que la rama de libro de arriba.
      const { error } = await createServiceRoleClient().from("credits").upsert(rows, {
        onConflict: "item_type,item_id,person_id,role",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("credits upsert failed", { itemType, id: item.id, count: rows.length, error });
      } else {
        effects.wroteCredits = true;
      }
    }

    if (itemType === "movie" && details.collection) {
      // Entrar en una colección TMDB cambia el «nº X de Y» de TODAS las pelis
      // de esa colección, no solo de esta.
      effects.sagaMembers = await persistCollectionMembership(
        supabase,
        "movie",
        item.id,
        details.collection
      );
    }
  } catch (error) {
    console.error("ensureItemEnriched failed", { itemType, id: item.id, error });
  }
  return effects;
}
