import type { ItemType } from "./types";

const BASE_PATH: Record<ItemType, string> = {
  book: "/libro",
  movie: "/pelicula",
  series: "/serie",
};

export function itemHref(itemType: ItemType, id: string): string {
  return `${BASE_PATH[itemType]}/${id}`;
}

export function personHref(id: string): string {
  return `/persona/${id}`;
}

export function sagaHref(id: string): string {
  return `/saga/${id}`;
}

/** Página interina «Cómo leerla» (spec 2026-10-27): el timeline detallado, los
 *  itinerarios y la lente de rol, hasta que el atlas de la saga la sustituya. */
export function sagaReadingHref(id: string): string {
  return `${sagaHref(id)}/como-leerla`;
}
