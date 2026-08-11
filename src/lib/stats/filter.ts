// Filtro global de tipo de obra (Todo · Libros · Películas · Series). Vive en
// `?tipo=` y acota TODOS los paneles de la vista a la vez — nunca hay un filtro
// por panel: dos filtros distintos en la misma pantalla hacen imposible saber
// qué compara cada cifra con cuál.
//
// Ojo con los paneles que NO pueden obedecerlo: «Ritmo» son páginas y solo
// existen en libros; los géneros salen del catálogo de los tres. Cada panel
// declara en su rótulo el filtro que se le aplicó, así que un panel que lo
// ignora tiene que decirlo ahí, no callárselo.

import type { ItemType } from "@/lib/catalog/types";

export type ItemFilter = ItemType | "all";

const PARAM: Record<ItemFilter, string> = {
  all: "todo",
  book: "libros",
  movie: "peliculas",
  series: "series",
};

const LABEL: Record<ItemFilter, string> = {
  all: "Todo",
  book: "Libros",
  movie: "Películas",
  series: "Series",
};

export const ITEM_FILTERS: ItemFilter[] = ["all", "book", "movie", "series"];

/** `?tipo=` → filtro. Lo ilegible cae en «todo». */
export function resolveItemFilter(raw: string | undefined): ItemFilter {
  const found = ITEM_FILTERS.find((f) => PARAM[f] === raw);
  return found ?? "all";
}

export function itemFilterParam(filter: ItemFilter): string {
  return PARAM[filter];
}

export function itemFilterLabel(filter: ItemFilter): string {
  return LABEL[filter];
}

/**
 * El filtro tal y como se lee en el rótulo de un panel, o `undefined` cuando no
 * hay nada que decir. «Todo» no se anuncia: un rótulo que dice «Todo» en cada
 * tarjeta es ruido.
 */
export function itemFilterNote(filter: ItemFilter): string[] | undefined {
  return filter === "all" ? undefined : [`Solo ${LABEL[filter].toLowerCase()}`];
}

/**
 * La magnitud de «Actividad del periodo»: obras terminadas o tiempo registrado.
 * Alternarlas es una pregunta distinta, no un adorno — quien lee tochos ve poca
 * obra y muchas horas, y al revés.
 *
 * Vive en `?medida=` y no en estado de cliente: son dos enlaces, el servidor ya
 * tiene los dos números y así la elección sobrevive a recargar y se puede
 * compartir.
 */
export type ActivityMetric = "works" | "time";

export function resolveActivityMetric(raw: string | undefined): ActivityMetric {
  return raw === "tiempo" ? "time" : "works";
}

export function activityMetricParam(metric: ActivityMetric): string {
  return metric === "time" ? "tiempo" : "obras";
}

export function activityMetricLabel(metric: ActivityMetric): string {
  return metric === "time" ? "Tiempo" : "Obras";
}
