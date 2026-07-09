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
