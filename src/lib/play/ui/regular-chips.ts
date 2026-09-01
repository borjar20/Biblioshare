import type { PlayerRecord } from "../core/db";

/**
 * Chips + «Recordar» de los setups (fase 6, Task 6). Lógica pura: sin IDB,
 * sin React -- solo criterio sobre la lista ya cargada por `usePlayers`.
 */

// case/acentos-insensible: NFD separa la letra de su diacrítico y el rango
// combinante se descarta, así "Marta" == "MARTA" == "María" (por prefijo).
// Exportado porque game-names.ts (Task 2) reutiliza el mismo criterio de
// normalización para las claves de unicidad de sus sugerencias.
export function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * ¿Alguna palabra de `value` EMPIEZA por `query` (prefijo, no substring),
 * case/acentos-insensible? Query vacía siempre coincide (descubribilidad).
 * Compartido con game-names.ts -- mismo criterio de filtro que los chips.
 */
export function matchesWordPrefix(value: string, query: string): boolean {
  const q = normalize(query);
  if (q === "") return true;
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => word.startsWith(q));
}

/**
 * Habituales que se pueden ofrecer como chip en un asiento: ni tombstone ni
 * ya sentados en la mesa, y si hay texto escrito, el nombre tiene que tener
 * alguna palabra que EMPIECE por ese texto (prefijo, no substring: "arta" no
 * trae a Marta). Query vacía enseña todos -- es lo que hace descubribles a
 * los habituales sin haber escrito nada (spec §6).
 */
export function chipSuggestions(
  players: PlayerRecord[],
  takenIds: string[],
  query: string,
): PlayerRecord[] {
  const taken = new Set(takenIds);
  return players.filter((player) => {
    if (player.deletedAt !== null) return false;
    if (taken.has(player.playerId)) return false;
    return matchesWordPrefix(player.name, query);
  });
}

/**
 * Fichas de habitual que pinta el selector, y cuántas quedan por enseñar.
 *
 * El tope existe para no plantar un muro de fichas nada más abrir, NO para
 * esconder a nadie: por eso lo que sobra se cuenta y se ofrece («+7»), y
 * buscando no se corta. Enseñar 6 de 20 en silencio fue justo la queja — la
 * fila del selector no coincidía con la lista de «Tus jugadores».
 *
 * El llamador entrega la lista YA sin los que están puestos en la mesa (por
 * nombre en los acompañantes, por `playerId` en puntuación).
 */
export function visibleRegulars(
  players: PlayerRecord[],
  query: string,
  expanded: boolean,
  cap: number,
): { shown: PlayerRecord[]; hidden: number } {
  const matching = players.filter(
    (player) => player.deletedAt === null && matchesWordPrefix(player.name, query),
  );
  if (expanded || normalize(query) !== "") return { shown: matching, hidden: 0 };
  return { shown: matching.slice(0, cap), hidden: Math.max(0, matching.length - cap) };
}

/**
 * «Recordar» solo tiene sentido con texto escrito que NO sea ya, letra a
 * letra (salvo mayúsculas/espacios), el nombre de un habitual existente --
 * si no, el botón ofrecería crear un duplicado del que ya está.
 */
export function canRemember(players: PlayerRecord[], query: string): boolean {
  const q = normalize(query);
  if (q === "") return false;
  return !players.some((player) => player.deletedAt === null && normalize(player.name) === q);
}
