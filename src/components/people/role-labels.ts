import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import type { WorkOrder } from "@/lib/people/derive-person-works";
import type { WorkStatus } from "@/lib/people/profile-types";

// Las tres traducciones de enum → clave i18n que usan card, filtros, fila,
// destacadas y raíl. En un solo sitio: repetidas por componente acababan
// divergiendo (un rol nuevo se añade una vez, no cinco).

export const ROLE_KEY: Record<CreditRole, string> = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
};

export const STATUS_KEY: Record<WorkStatus, string> = {
  planned: "statusPlanned",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  dropped: "statusDropped",
};

export const TYPE_KEY: Record<ItemType, string> = {
  movie: "typeMovie",
  series: "typeSeries",
  book: "typeBook",
};

export const FILTER_TYPE_KEY: Record<ItemType, string> = {
  movie: "filterTypeMovie",
  series: "filterTypeSeries",
  book: "filterTypeBook",
};

// Slugs de la URL. Se escriben en español porque la URL es cara al usuario y es
// un enlace compartible: `?tipo=peliculas&credito=direccion`.
export const TYPE_SLUG: Record<ItemType, string> = {
  movie: "peliculas",
  series: "series",
  book: "libros",
};

export const ROLE_SLUG: Record<CreditRole, string> = {
  cast: "reparto",
  director: "direccion",
  writer: "guion",
  creator: "creacion",
  author: "autor",
};

// El orden de la lista también vive en la URL, por lo mismo que los filtros:
// «mándame su filmografía ordenada por categoría» tiene que ser un enlace.
export const ORDER_SLUG: Record<WorkOrder, string> = {
  chronology: "cronologia",
  role: "rol",
};

export const ORDER_KEY: Record<WorkOrder, string> = {
  chronology: "orderChronology",
  role: "orderRole",
};

/** Cronología por defecto: es una filmografía, y una filmografía se lee por años. */
export function parseOrderSlug(slug: string | undefined): WorkOrder {
  return slug === ORDER_SLUG.role ? "role" : "chronology";
}

export function parseTypeSlug(slug: string | undefined): ItemType | undefined {
  if (!slug) return undefined;
  return (Object.keys(TYPE_SLUG) as ItemType[]).find((t) => TYPE_SLUG[t] === slug);
}

export function parseRoleSlug(slug: string | undefined): CreditRole | undefined {
  if (!slug) return undefined;
  return (Object.keys(ROLE_SLUG) as CreditRole[]).find((r) => ROLE_SLUG[r] === slug);
}
