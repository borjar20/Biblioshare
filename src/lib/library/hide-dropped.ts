import type { MediaStatus } from "./types";

/**
 * Parámetro de URL que ANULA la preferencia en una vista concreta (spec D7):
 * `?abandonados=1`. No es un filtro —enseña MÁS, no menos— así que no cuenta
 * como filtro activo en el globo de «Filtros» y sobrevive a «Limpiar» (D8).
 */
export const SHOW_DROPPED_PARAM = "abandonados";

/**
 * Separa las obras abandonadas de las demás. Puro y genérico a propósito
 * (spec D11): lo llaman `getLibraryItems`/`getCollection` sobre `LibraryItem[]`
 * ya hidratados y `getUncollectedItems` sobre filas crudas de `passes`, que
 * solo traen `item_type`/`item_id`/`status`.
 *
 * `hiddenDropped` es el número que pinta la línea «N abandonados ocultos», y
 * por eso quien llama tiene que invocar esto DESPUÉS de aplicar sus filtros
 * (búsqueda, género) y ANTES de `limit` (D3, D4): si se cuenta antes, el número
 * incluye obras que el filtro habría descartado igualmente y miente.
 */
export function splitDropped<T extends { status: MediaStatus }>(
  rows: T[],
  hideDropped: boolean,
): { visible: T[]; hiddenDropped: number } {
  if (!hideDropped) return { visible: rows, hiddenDropped: 0 };
  const visible = rows.filter((row) => row.status !== "dropped");
  return { visible, hiddenDropped: rows.length - visible.length };
}

/**
 * ¿Toca ocultar en esta consulta? La preferencia del usuario, salvo que la
 * vista pida un estado concreto (D5): filtrar por «Abandonado» y ver cero
 * resultados es un bug con cara de feature.
 */
export function shouldHideDropped(query: {
  hideDropped?: boolean;
  status?: MediaStatus;
}): boolean {
  return query.hideDropped === true && query.status === undefined;
}
