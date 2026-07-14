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
  subtitle: string | null; // libros: autoría
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
};
