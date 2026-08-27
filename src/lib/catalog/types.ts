export type ItemType = "book" | "movie" | "series";

// Lo que una TARJETA de resultado muestra, y nada más. Editorial, ISBN y páginas
// son datos de una tirada concreta: viven en `book_editions` y se pintan al
// pulsar una edición en la ficha, no aquí. Ver el spec
// docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md
export type SearchResult = {
  itemType: ItemType;
  // Libros: work key de OpenLibrary ("/works/OL893415W").
  // Películas/series: id de TMDB.
  externalId: string;
  // Puesto cuando el resultado ya tiene fila en books/movies/series (vino del
  // catálogo local, o se fusionó con él por work key). LA BÚSQUEDA NO CREA
  // FILAS: si no está puesto, el ítem se creará al añadirlo o al abrir su ficha.
  // Ver docs/REQUIREMENTS.md §7.32.
  catalogId?: string;
  title: string;
  // Películas/series: título en idioma original de TMDB (`original_title`), el
  // del idioma de rodaje. El `title` viene traducido a es-ES. Ausente en libros
  // y catálogo local (undefined).
  originalTitle?: string | null;
  // Películas: título INTERNACIONAL EN INGLÉS (el `title` de TMDB con
  // language=en-US), que no es ninguno de los dos anteriores: "El viaje de
  // Chihiro" (es-ES) / 千と千尋の神隠し (original) / "Spirited Away" (inglés).
  // Es el que exporta Letterboxd, porque su catálogo es TMDB en-US, así que el
  // matcher del importador compara contra los TRES. Solo lo rellena
  // `searchMoviesForImport`; en el resto de rutas es undefined. OJO: en esos
  // candidatos el `title` viene TAMBIÉN en inglés (se piden con language=en-US),
  // así que no se cachean tal cual — ver `catalogIdForMovieCandidate`.
  englishTitle?: string | null;
  subtitle: string | null; // libros: autoría
  // Libros, SOLO en resultados de búsqueda: TODOS los títulos candidatos que
  // `q=` trajo para esta obra —el de la obra en Open Library, más los de
  // edición aceptados por idioma— e INCLUYE el `title` ya elegido, no solo
  // "los demás": con `title === "En llamas"`, `altTitles` es
  // `["Fatta Eld", "En llamas"]`. Lo usa `match-row.ts` para casar una fila de
  // CSV cuyo título coincide con uno de estos y no con el `title` mostrado.
  altTitles?: string[];
  // Libros: de dónde salió `title` — de una edición española, de una inglesa,
  // o del título de la OBRA de Open Library (`other`, porque ese puede estar en
  // cualquier idioma: «Fatta Eld» es sueco). Lo rellenan los dos
  // normalizadores de Open Library y lo consume la hidratación en LOTE, que lo
  // escribe como `repr_meta.title.lang`: sin él, un título inglés escrito por
  // el lote sería indistinguible de uno curado y quedaría congelado (#730).
  // Ausente en películas, series y catálogo local.
  titleLang?: "es" | "en" | "other";
  coverUrl: string | null;
  year: number | null;
  // Películas/series: TMDB los da ya en la búsqueda. Libros: SIEMPRE null — la
  // obra se hidrata al abrir su ficha (ensureBookHydrated).
  synopsis: string | null;
  genres: string[] | null;
  // Libros: nº real de ediciones de la obra según OpenLibrary (`edition_count`).
  // Ver docs/REQUIREMENTS.md §7.2.
  editionCount?: number;
  // Libros, SOLO en el lookup por ISBN (escáner, importador): la tirada exacta
  // que se escaneó, para registrarla como edición al añadir el libro.
  matchedIsbn?: string;
  // Libros, SOLO camino ISBN-GB (spec §4): id del volumen de Google Books
  // cuando el resultado nace GB-only (Open Library no conoce el ISBN pero
  // Google Books sí). `externalId` va vacío en ese caso —no hay work key de
  // OpenLibrary— y `findOrCreateCatalogItem` usa este campo para decidir la
  // RPC de alta (`register_catalog_item_by_volume` en vez de
  // `register_catalog_item`). Ausente en cualquier otro resultado.
  googleVolumeId?: string;
  // Libros: QID de Wikidata cuando la capa de identidad lo resolvió (columna
  // books.wikidata_id en local, o match Inventaire en búsqueda). Es la clave
  // del colapso inter-idioma: dos works de OL con el mismo QID son LA MISMA
  // obra. Ver spec 2026-08-26 §6.
  wikidataId?: string;
};
