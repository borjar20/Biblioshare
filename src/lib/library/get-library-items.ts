import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "./position";
import { pickEditionPages } from "@/lib/pace/fetch-catalog-meta";
import { keepLatestClosedPass } from "@/lib/community/latest-rating";
import type { LibraryItem, LibrarySort, MediaStatus } from "./types";
import { loadGenres } from "@/lib/challenges/load-catalog-facets";
import { labelForSlug, slugForLabel } from "@/lib/catalog/genre-vocab";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import { shouldHideDropped, splitDropped } from "./hide-dropped";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CatalogMeta = {
  title: string;
  coverUrl: string | null;
  subtitle: string | null;
  publisher: string | null;
  pageCount: number | null;
  totalEpisodes: number | null;
};

type ActivePassMeta = {
  id: string;
  status: MediaStatus;
  position: unknown;
  pinnedOrder: number | null;
  editionId: string | null;
};

// Hidratación compartida biblioteca/colección: a partir de un conjunto de
// (item_type,item_id) resuelve catálogo (título/portada/subtítulo/páginas) +
// el pase ACTIVO de cada obra (estado/posición/favorito) + nota y reseña del
// último pase CERRADO. `getLibraryItems` ya trae sus claves desde su propia
// consulta de `passes` (siempre tienen pase activo, por construcción); Colección
// (`getCollection`, src/lib/library/collections.ts) hidrata claves que vienen de
// `collection_items` y que pueden NO tener ningún pase activo (un ítem se puede
// colocar en una colección sin haberlo empezado a trackear) — por eso esta
// función vuelve a resolver el pase activo por clave en vez de asumir que quien
// llama ya lo trae, y descarta (como con el catálogo) las claves sin pase activo
// en vez de inventar un `entryId`/`status` que no existen.
export async function hydrateItems(
  supabase: SupabaseServerClient,
  userId: string,
  keys: { item_type: ItemType; item_id: string }[]
): Promise<LibraryItem[]> {
  if (keys.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = {
    book: [],
    movie: [],
    series: [],
  };
  for (const key of keys) {
    idsByType[key.item_type].push(key.item_id);
  }

  const catalogByKey = new Map<string, CatalogMeta>();

  const [books, movies, series, editions] = await Promise.all([
    idsByType.book.length
      ? supabase
          .from("books")
          .select("id, title, author, cover_url, publisher, total_pages")
          .in("id", idsByType.book)
      : Promise.resolve({ data: [] }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, cover_url")
          .in("id", idsByType.movie)
      : Promise.resolve({ data: [] }),
    idsByType.series.length
      ? supabase
          .from("series")
          .select("id, title, cover_url, total_episodes")
          .in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
    // Las páginas son un dato de la TIRADA, no de la obra: la búsqueda ya no
    // escribe `books.total_pages`, así que para casi todo lo que entra hoy el
    // total vive solo en `book_editions` (misma precedencia que load-context y
    // el sorteo, vía `pickEditionPages`). Sin esto, un libro con páginas
    // conocidas salía como "Sin progreso" en la portada y en Colección.
    idsByType.book.length
      ? supabase
          .from("book_editions")
          .select("id, book_id, total_pages")
          .in("book_id", idsByType.book)
      : Promise.resolve({ data: [] }),
  ]);

  const editionsByBook = new Map<string, { id: string; total_pages: number | null }[]>();
  for (const row of editions.data ?? []) {
    const list = editionsByBook.get(row.book_id);
    if (list) list.push(row);
    else editionsByBook.set(row.book_id, [row]);
  }

  for (const row of books.data ?? []) {
    catalogByKey.set(`book:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
      coverUrl: row.cover_url,
      subtitle: row.author,
      publisher: row.publisher,
      pageCount: row.total_pages,
      totalEpisodes: null,
    });
  }
  for (const row of movies.data ?? []) {
    catalogByKey.set(`movie:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
      coverUrl: row.cover_url,
      subtitle: null,
      publisher: null,
      pageCount: null,
      totalEpisodes: null,
    });
  }
  for (const row of series.data ?? []) {
    catalogByKey.set(`series:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
      coverUrl: row.cover_url,
      subtitle: null,
      publisher: null,
      pageCount: null,
      totalEpisodes: row.total_episodes,
    });
  }

  const allItemIds = keys.map((key) => key.item_id);

  // Pase ACTIVO de cada obra: entryId/activePassId/status/position/pinnedOrder
  // de LibraryItem salen todos de aquí (§Tarea 9, hub: el pase activo ES la
  // entrada de biblioteca). Se resuelve por clave en vez de reutilizar filas ya
  // traídas por quien llama porque este helper también sirve a Colección, cuyas
  // claves no vienen de `passes`.
  const { data: activePassRows } = await supabase
    .from("passes")
    .select("id, item_type, item_id, status, position, pinned_order, edition_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("item_id", allItemIds);

  const activePassByKey = new Map<string, ActivePassMeta>();
  for (const row of activePassRows ?? []) {
    activePassByKey.set(`${row.item_type}:${row.item_id}`, {
      id: row.id,
      status: row.status,
      position: row.position,
      pinnedOrder: row.pinned_order,
      editionId: row.edition_id,
    });
  }

  // Progreso de serie: cuántos episodios lleva vistos EN ESTE PASE. La posición
  // del pase NO sirve de numerador — `rollSeriesProgress` guarda
  // `{season, episode}` con numeración POR TEMPORADA, así que T3E2 se leía como
  // "2" contra el total de la serie y la tarjeta decía «2/60» (#715). El rail de
  // la ficha ya contaba bien porque cuenta `episode_watches`; esto es lo mismo,
  // batched para todas las series del lote.
  //
  // Se traen las filas y se cuentan en memoria en vez de pedirle a Postgres un
  // `group by`: PostgREST no agrega sin RPC, y el volumen está acotado por los
  // episodios vistos de las series que caben en una página de biblioteca.
  const seriesPassIds = [...activePassByKey.entries()]
    .filter(([itemKey]) => itemKey.startsWith("series:"))
    .map(([, pass]) => pass.id);

  const watchedByPassId = new Map<string, number>();
  if (seriesPassIds.length > 0) {
    const { data: watchRows } = await supabase
      .from("episode_watches")
      .select("pass_id")
      .eq("user_id", userId)
      .in("pass_id", seriesPassIds);
    for (const row of watchRows ?? []) {
      // `pass_id` es nullable: las filas legadas (anteriores al hub) no cuelgan
      // de ningún pase y no cuentan para el progreso de ESTE.
      if (!row.pass_id) continue;
      watchedByPassId.set(row.pass_id, (watchedByPassId.get(row.pass_id) ?? 0) + 1);
    }
  }

  // Todos los pases (de cualquier obra en este lote, abiertos y cerrados) de
  // este usuario, batched — cheaper than one query per entry. See
  // docs/REQUIREMENTS.md §7.13. item_type/item_id ya son columnas propias del
  // pase (§Tarea 9): se filtra por item_id directamente, sin el join a
  // library_entries que resolvía antes esa relación, y se agrupa abajo por
  // `${item_type}:${item_id}` en vez de por id de entrada (que ya no existe).
  // `rating` sale de diary_entries directamente: la RLS de la tabla ya decide
  // qué filas se ven (perfil propio o público visible) y esa columna es
  // legible siempre, cuente o no la reseña como pública — la nota nunca fue
  // lo que is_public escondía.
  const { data: closedPassRows } = await supabase
    .from("passes")
    .select("id, item_type, item_id, finished_on, created_at, rating")
    .eq("user_id", userId)
    .in("item_id", allItemIds)
    // Un pase abierto ("lo estoy leyendo ahora") todavía no es una lectura
    // terminada: no debe sumar a "Leído {count} veces" (colección, perfiles
    // públicos y export CSV comparten este contador) ni aportar nota/reseña.
    .in("status", ["completed", "dropped"]);

  const rereadCountByItem = new Map<string, number>();
  for (const row of closedPassRows ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    rereadCountByItem.set(key, (rereadCountByItem.get(key) ?? 0) + 1);
  }

  // Nota (estrellas) y "notas" (texto) visibles de cada obra: las del último
  // pase cerrado, mismo criterio de desempate que la media de comunidad
  // (latest-rating.ts), agrupado aquí por obra en vez de por usuario porque
  // toda esta colección es de un único usuario.
  const latestClosedPasses = keepLatestClosedPass(
    (closedPassRows ?? []).map((r) => ({
      id: r.id,
      itemKey: `${r.item_type}:${r.item_id}`,
      finishedOn: r.finished_on ?? "",
      createdAt: r.created_at,
      rating: r.rating,
    }))
  );
  const ratingByItem = new Map(
    latestClosedPasses.map((p) => [p.itemKey, p.rating])
  );

  // El texto de la reseña ("notas") vive en pass_reviews: es la única vía de
  // lectura del texto (diary_entries.review ya no es una columna legible
  // desde el cliente), y de paso trae la privacidad ya aplicada — si el pase
  // ganador es una reseña privada de OTRO usuario, esta consulta simplemente
  // no devuelve esa fila y el texto se muestra en blanco, no un error.
  const latestPassIds = latestClosedPasses.map((p) => p.id);
  const { data: reviewRows } = latestPassIds.length
    ? await supabase.from("pass_reviews").select("id, review").in("id", latestPassIds)
    : { data: [] as { id: string | null; review: string | null }[] };
  const reviewByPassId = new Map((reviewRows ?? []).map((r) => [r.id, r.review]));
  const notesByItem = new Map(
    latestClosedPasses.map((p) => [p.itemKey, reviewByPassId.get(p.id) ?? null])
  );

  return keys
    .map((key): LibraryItem | null => {
      const itemKey = `${key.item_type}:${key.item_id}`;
      const meta = catalogByKey.get(itemKey);
      if (!meta) return null;
      const activePass = activePassByKey.get(itemKey);
      if (!activePass) return null;
      // El total de páginas manda desde la edición del pase, y si no hay
      // ninguna identificada, desde books.total_pages (páginas orientativas
      // de la obra): bolsillo y tapa dura no tienen las mismas páginas, y
      // muchos libros solo las tienen en `book_editions`.
      const pageCount =
        key.item_type === "book"
          ? pickEditionPages(
              editionsByBook.get(key.item_id) ?? [],
              activePass.editionId,
              meta.pageCount,
            )
          : meta.pageCount;
      return {
        // entryId/activePassId son ahora el MISMO id: el pase activo es la
        // entrada de biblioteca (§Tarea 9, hub). Se conservan ambos campos en
        // LibraryItem porque la UI ya los consume por separado (favoritos vs.
        // "/sesion/"), pero ya no hace falta una segunda query para resolver
        // el activo — esta fila YA es el pase activo.
        entryId: activePass.id,
        itemId: key.item_id,
        itemType: key.item_type,
        status: activePass.status,
        rating: ratingByItem.get(itemKey) ?? null,
        position: parsePosition(key.item_type, activePass.position),
        notes: notesByItem.get(itemKey) ?? null,
        title: meta.title,
        coverUrl: meta.coverUrl,
        subtitle: meta.subtitle,
        publisher: meta.publisher,
        pageCount,
        totalEpisodes: meta.totalEpisodes,
        watchedEpisodes:
          key.item_type === "series" ? (watchedByPassId.get(activePass.id) ?? 0) : null,
        rereadCount: rereadCountByItem.get(itemKey) ?? 0,
        pinnedOrder: activePass.pinnedOrder,
        activePassId: activePass.id,
      } satisfies LibraryItem;
    })
    .filter((item): item is LibraryItem => item !== null);
}

// Conserva los items cuyo array de géneros (del catálogo) contiene la label. El
// género vive en catálogo, no en passes, así que —igual que search/sort— se
// aplica en memoria tras la hidratación, no en el SQL de passes.
export function filterByGenre<T extends { itemType: ItemType; itemId: string }>(
  items: T[],
  wantedLabel: string,
  genresByKey: Map<string, string[]>,
): T[] {
  return items.filter((i) =>
    (genresByKey.get(`${i.itemType}:${i.itemId}`) ?? []).includes(wantedLabel),
  );
}

/** Filtros de una consulta de biblioteca. Se extrae a tipo con nombre porque
 *  ahora lo comparten `getLibraryItems` y `getLibraryView`. Se llama
 *  `LibraryQuery` y no `LibraryFilters` para no chocar con el COMPONENTE
 *  `LibraryFilters` (src/components/library/library-filters.tsx). */
export type LibraryQuery = {
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort?: LibrarySort;
  favoritesOnly?: boolean;
  /** Slug del género (@/lib/catalog/genre-vocab); filtra por su label canónica. */
  genre?: string;
  /** Recorta a los N primeros tras aplicar orden Y tras ocultar (D4). */
  limit?: number;
  /** Oculta las obras cuyo pase activo está en `dropped` (preferencia
   *  `profiles.hide_dropped`). **Opt-in a propósito**: esta función la comparten
   *  el export CSV, el selector de obras de clubes y los buscadores de añadir a
   *  colección, y ninguno debe perder filas (spec D2). Sin efecto si `status`
   *  viene puesto (D5). */
  hideDropped?: boolean;
};

/** Lo que devuelve una consulta de biblioteca de las VISTAS PROPIAS: los ítems
 *  y cuántas obras abandonadas se ocultaron para llegar a ellos.
 *
 *  `total` = cuántas obras pasan los filtros ANTES de aplicar `limit`. Es lo
 *  que una vista paginada necesita para dos cosas que `items.length` no puede
 *  contestar cuando hay tope: si queda algo por traer, y el «N de M» del pie.
 *  Sin `limit` coincide con `items.length`. Se cuenta DESPUÉS de ocultar
 *  abandonados, igual que `items`: si no, el pie prometería obras que la
 *  rejilla no va a pintar nunca — esas ya las cuenta `hiddenDropped`, aparte. */
export type LibraryView = {
  items: LibraryItem[];
  hiddenDropped: number;
  total: number;
};

export async function getLibraryView(
  supabase: SupabaseServerClient,
  userId: string,
  filters: LibraryQuery
): Promise<LibraryView> {
  // "Entrada de biblioteca" = pase ACTIVO de la obra (§Tarea 9, hub):
  // item_type/item_id/status/position/pinned_order viven directamente en
  // diary_entries, library_entries ya no se lee. rating/notes tampoco se leen
  // de aquí: quedaron huérfanas cuando el pase se convirtió en el dueño de la
  // nota y la reseña (20260714_passes.sql). Se recalculan en `hydrateItems` a
  // partir del último pase cerrado de cada obra.
  let query = supabase
    .from("passes")
    .select("id, item_type, item_id, status, position, pinned_order")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (filters.favoritesOnly) {
    query = query.not("pinned_order", "is", null).order("pinned_order", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  if (filters.itemType) query = query.eq("item_type", filters.itemType);
  if (filters.status) query = query.eq("status", filters.status);

  const { data: entries, error } = await query;
  if (error) throw error;
  if (!entries || entries.length === 0) return { items: [], hiddenDropped: 0, total: 0 };

  // La hidratación (catálogo + pase activo + rating/notes) vive en
  // `hydrateItems`, compartida con Colección (src/lib/library/collections.ts).
  // El orden de `entries` (ya resuelto arriba: pinned_order o updated_at desc)
  // se conserva porque `hydrateItems` mapea sobre las claves en el mismo orden
  // en que se le pasan.
  let items = await hydrateItems(
    supabase,
    userId,
    entries.map((entry) => ({ item_type: entry.item_type, item_id: entry.item_id }))
  );

  // Title lives in books/movies/series, not library_entries, so search and
  // title-sort can't happen in the SQL query above — applied here instead,
  // after the two are merged. See docs/REQUIREMENTS.md §7.12.
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    items = items.filter((item) => item.title.toLowerCase().includes(needle));
  }

  // Género también vive en catálogo, no en passes: mismo motivo que search
  // arriba, se resuelve en memoria tras hidratar. Slug inválido -> sin
  // resultados (no la biblioteca entera): evita que una URL manipulada
  // silenciosamente ignore el filtro.
  if (filters.genre) {
    const wanted = labelForSlug(filters.genre);
    if (!wanted) return { items: [], hiddenDropped: 0, total: 0 };
    const genresByKey = await loadGenres(
      supabase,
      items.map((i) => ({ itemType: i.itemType, itemId: i.itemId }))
    );
    items = filterByGenre(items, wanted, genresByKey);
  }

  if (filters.sort === "rating") {
    items = items.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else if (filters.sort === "title") {
    items = items.sort((a, b) => a.title.localeCompare(b.title));
  }
  // "recent" (default) keeps the query's own `updated_at desc` order.

  // Ocultar abandonados va AQUÍ, al final y antes de `limit`, no en la query de
  // `passes` de arriba: `hiddenDropped` es el número que la UI enseña, y si se
  // contara antes de búsqueda/género incluiría obras que esos filtros habrían
  // descartado igualmente (spec D3). Y antes de `limit` para que una vista con
  // tope devuelva N elementos, no N menos los que se ocultaron (D4).
  const split = splitDropped(items, shouldHideDropped(filters));
  items = split.visible;

  // El total se toma AQUÍ, entre ocultar abandonados y recortar: es exactamente
  // el conjunto que la rejilla pintaría si no hubiera tope.
  const total = items.length;

  if (filters.limit !== undefined) items = items.slice(0, filters.limit);

  return { items, hiddenDropped: split.hiddenDropped, total };
}

/** La biblioteca sin el recuento de ocultos. Firma intacta desde antes de la
 *  preferencia `hide_dropped`: la usan el export CSV, el selector de obras de
 *  clubes, los buscadores de añadir a colección y los bloques de «hoy», que no
 *  pintan la línea de aviso. Las vistas propias usan `getLibraryView`. */
export async function getLibraryItems(
  supabase: SupabaseServerClient,
  userId: string,
  filters: LibraryQuery
): Promise<LibraryItem[]> {
  return (await getLibraryView(supabase, userId, filters)).items;
}

// Géneros presentes en la biblioteca del usuario (para poblar el selector: solo
// los que tiene, no los ~45 del vocabulario entero). Cuenta obras distintas por
// género — una obra con varios géneros suma 1 a cada uno, no se pesa por total.
//
// `itemType`/`status` opcionales: cuando la página acota la rejilla (lock de
// onboarding con un único interés o `?type=`; filtro de estado `?status=`) hay
// que pasar los MISMOS filtros aquí para que la faceta no ofrezca chips de un
// subconjunto que la rejilla no está mostrando (si no, un chip filtra a 0
// resultados — issue #306 para `status`, mismo defecto que ya se acotó por
// `itemType`). Sin ellos, se cuenta la biblioteca activa completa (sin cambios).
//
// `hideDropped` es el mismo eje que ya vio `getLibraryView`, y reabre #306 si
// no se propaga: con la preferencia activa, un género con obras solo
// abandonadas seguía ofreciendo su chip (con recuento) y la rejilla se iba a
// 0 (o mentía en el parcial). Se decide con `shouldHideDropped` — no un `if`
// propio — porque es la MISMA regla D5 (un filtro de estado explícito manda)
// que ya usa `getLibraryView`.
//
// Y aquí el filtro SÍ va en SQL (`.neq`), al revés que en `getLibraryView`
// (que oculta en memoria, al final, tras búsqueda/género y antes de `limit`,
// D3/D4). Esa postergación existe para que «N ocultos» no mienta — pero la
// faceta no alimenta ningún «N ocultos» (de hecho ya ignora `search` hoy), así
// que no hay ese motivo para retrasar el filtro. Filtrar en SQL evita traer y
// descartar filas de obras abandonadas que no van a contar para ningún chip.
export async function getUserGenres(
  supabase: SupabaseServerClient,
  userId: string,
  itemType?: ItemType,
  status?: MediaStatus,
  hideDropped = false
): Promise<{ slug: string; label: string; count: number }[]> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (itemType) query = query.eq("item_type", itemType);
  if (status) query = query.eq("status", status);
  if (shouldHideDropped({ hideDropped, status })) query = query.neq("status", "dropped");
  const { data: entries } = await query;

  const refs = (entries ?? []).map((e) => ({
    itemType: e.item_type as ItemType,
    itemId: e.item_id,
  }));
  if (refs.length === 0) return [];

  const genresByKey = await loadGenres(supabase, refs);
  const count = new Map<string, number>();
  for (const labels of genresByKey.values()) {
    for (const label of new Set(labels)) {
      const slug = slugForLabel(label);
      if (slug) count.set(slug, (count.get(slug) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .map(([slug, c]) => ({ slug, label: labelForSlug(slug)!, count: c }))
    .sort((a, b) => b.count - a.count);
}
