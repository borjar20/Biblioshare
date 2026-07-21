import type { ItemType } from "@/lib/catalog/types";
import { normalizeTags } from "./tags";

// El estado del cuaderno vive ENTERO en la URL: así un filtro es un enlace, la
// pantalla sigue siendo servidor puro y compartir/recargar conserva lo que veías.
// Este módulo es la única traducción entre esa URL y el resto del código.

export type NotesKindFilter = "all" | "note" | "quote";

// Solo dos órdenes, y «por posición» NO es uno de ellos: comparar «Pág. 12» de
// un libro con «T1·E3» de una serie es comparar dos escalas distintas.
// `compareNotes` pide un itemType justamente porque ese orden solo existe dentro
// de una obra — por eso el orden `obra` agrupa y ordena por posición DENTRO de
// cada grupo. Ver la decisión D10.
export type NotesSort = "recientes" | "obra";

export type NotesQuery = {
  /** Búsqueda sobre el cuerpo de la nota, ya recortada. */
  q: string;
  kind: NotesKindFilter;
  /** Normalizada con la misma regla que la escritura (ver tags.ts). */
  tag: string | null;
  item: { itemType: ItemType; itemId: string } | null;
  favorites: boolean;
  sort: NotesSort;
  /** 1-based. */
  page: number;
};

export const NOTES_PAGE_SIZE = 20;

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// El parámetro `tipo` va en castellano como el resto de la URL del repo, pero la
// columna `kind` guarda los valores del CHECK, en inglés. La traducción vive
// aquí y en ningún otro sitio.
const KIND_PARAM: Record<Exclude<NotesKindFilter, "all">, string> = {
  quote: "cita",
  note: "nota",
};

export function defaultNotesQuery(): NotesQuery {
  return {
    q: "",
    kind: "all",
    tag: null,
    item: null,
    favorites: false,
    sort: "recientes",
    page: 1,
  };
}

// Un `searchParams` de Next puede traer string, array (parámetro repetido) o
// undefined. Nos quedamos con el primero: un cuaderno no tiene dos órdenes.
type RawParams = Record<string, string | string[] | undefined>;

function one(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

// Ningún valor de la URL puede tumbar la pantalla: lo desconocido cae al
// defecto. La URL la escribe cualquiera.
export function parseNotesQuery(params: RawParams): NotesQuery {
  const query = defaultNotesQuery();

  query.q = one(params.q).trim();

  const tipo = one(params.tipo);
  if (tipo === KIND_PARAM.quote) query.kind = "quote";
  else if (tipo === KIND_PARAM.note) query.kind = "note";

  // Una sola verdad sobre la forma de una etiqueta: la misma función que
  // normaliza al guardar. Si no, «#Final» en el enlace no encontraría «final»
  // en la BD.
  query.tag = normalizeTags(one(params.etiqueta))[0] ?? null;

  const obra = one(params.obra);
  const sep = obra.indexOf(":");
  if (sep > 0) {
    const itemType = obra.slice(0, sep);
    const itemId = obra.slice(sep + 1);
    if (itemId && ITEM_TYPES.includes(itemType as ItemType)) {
      query.item = { itemType: itemType as ItemType, itemId };
    }
  }

  query.favorites = one(params.favoritas) === "1";

  if (one(params.orden) === "obra") query.sort = "obra";

  const pagina = Number(one(params.pagina));
  if (Number.isInteger(pagina) && pagina >= 1) query.page = pagina;

  return query;
}

// Construye el enlace de un cambio de filtro sobre el estado actual.
//
// Regla importante: cambiar un filtro DEVUELVE A LA PÁGINA 1. Si no, filtrar
// desde la página 7 te deja mirando el vacío de un resultado que solo tiene 2
// páginas y parece que el filtro no encuentra nada. El paginador es el único que
// pasa `page` explícita, y entonces manda.
//
// Sin overrides no hay cambio de filtro que compensar: es serializar el estado
// tal cual, página incluida.
export function notesHref(query: NotesQuery, overrides: Partial<NotesQuery> = {}): string {
  const changesFilter = Object.keys(overrides).some((key) => key !== "page");
  const next: NotesQuery = {
    ...query,
    ...overrides,
    page: overrides.page ?? (changesFilter ? 1 : query.page),
  };

  const params = new URLSearchParams();
  // Solo lo que no es el defecto: una URL limpia se puede leer de un vistazo.
  if (next.q) params.set("q", next.q);
  if (next.kind !== "all") params.set("tipo", KIND_PARAM[next.kind]);
  if (next.tag) params.set("etiqueta", next.tag);
  if (next.item) params.set("obra", `${next.item.itemType}:${next.item.itemId}`);
  if (next.favorites) params.set("favoritas", "1");
  if (next.sort !== "recientes") params.set("orden", next.sort);
  if (next.page > 1) params.set("pagina", String(next.page));

  const qs = params.toString();
  return qs ? `/notas?${qs}` : "/notas";
}

// ¿Hay algún filtro puesto? Distingue «no tienes notas» de «no hay notas con
// estos filtros», que son dos vacíos con dos salidas distintas.
export function hasActiveFilters(query: NotesQuery): boolean {
  return Boolean(query.q || query.kind !== "all" || query.tag || query.item || query.favorites);
}
