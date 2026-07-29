import type { SagaIndexCard } from "./build-saga-index";

export type SagaIndexView = "todas" | "sigo" | "universos";
export type SagaIndexType = "libro" | "pelicula" | "serie";

export const TYPE_TO_FIELD: Record<SagaIndexType, "book" | "movie" | "series"> = {
  libro: "book",
  pelicula: "movie",
  serie: "series",
};

export type SagaIndexFilterParams = {
  vista: SagaIndexView;
  tipos: SagaIndexType[];
  itinerarios: boolean;
  coleccion: boolean;
  min5: boolean;
};

// Filtra las cards YA construidas por build-saga-index (que ya vienen
// ordenadas alfabéticamente y con la búsqueda por texto aplicada) — spec
// Fase 3. No ordena: con un único valor de `orden` disponible, el orden de
// entrada ya es el correcto.
export function filterSagaIndex(
  cards: SagaIndexCard[],
  params: SagaIndexFilterParams,
): SagaIndexCard[] {
  return cards.filter((card) => {
    if (params.vista === "sigo" && !card.isFollowed) return false;
    if (params.vista === "universos" && card.children.length === 0) return false;
    if (
      params.tipos.length > 0 &&
      !params.tipos.some((t) => card.typeBreakdown[TYPE_TO_FIELD[t]] > 0)
    ) {
      return false;
    }
    if (params.itinerarios && card.routeCount === 0) return false;
    if (params.coleccion && card.ownedCount === 0) return false;
    if (params.min5 && card.titleCount < 5) return false;
    return true;
  });
}
