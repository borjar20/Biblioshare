import type { CollectionCard } from "./collections";

// Búsqueda y orden de la rejilla de Colecciones. Vive aquí, en un módulo PURO,
// y no dentro del componente cliente que lo usa: así se puede probar sin montar
// React, que es donde de verdad se rompen los órdenes (el desempate de
// `custom`, sobre todo).
//
// El filtrado es en CLIENTE porque las colecciones llegan todas en la misma
// consulta —son unas pocas decenas como mucho— y ni el orden ni la búsqueda
// viajan a la URL. Es lo contrario que la pestaña `Todo`, donde el filtro SÍ es
// server-side por la URL: allí la rejilla es la biblioteca entera y el estado
// merece ser enlazable; aquí un viaje al servidor por tecla no compra nada.

export const COLLECTION_SORTS = ["custom", "recent", "name", "size"] as const;
export type CollectionBrowseSort = (typeof COLLECTION_SORTS)[number];

export function browseCollections(
  cards: CollectionCard[],
  query: string,
  sort: CollectionBrowseSort,
): CollectionCard[] {
  const needle = query.trim().toLowerCase();
  // Mismo criterio que la búsqueda de biblioteca (get-library-items.ts):
  // `includes` en minúsculas, sin normalizar acentos. Que las dos coincidan
  // importa más que afinar una sola.
  const filtered = needle
    ? cards.filter((card) => card.name.toLowerCase().includes(needle))
    : cards;

  // Copia SIEMPRE: `sort` muta, y `cards` es una prop de React.
  const sorted = [...filtered];
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "size":
      return sorted.sort((a, b) => b.count - a.count);
    case "recent":
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case "custom":
      // El orden manual del usuario (`position`), con la más tocada primero
      // como desempate — hoy `position` no la escribe nadie todavía, así que el
      // desempate es lo que de hecho se ve. Mismo criterio que `listCollections`.
      return sorted.sort(
        (a, b) => a.position - b.position || b.updatedAt.localeCompare(a.updatedAt),
      );
  }
}
