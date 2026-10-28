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

/** Atlas de la saga (spec 2026-10-28): sustituye al grafo y a «Cómo leerla»,
 *  que queda como redirect a esta ruta. */
export function sagaAtlasHref(id: string): string {
  return `${sagaHref(id)}/mapa`;
}
