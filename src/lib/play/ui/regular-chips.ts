import type { PlayerRecord } from "../core/db";

/**
 * Chips + «Recordar» de los setups (fase 6, Task 6). Lógica pura: sin IDB,
 * sin React -- solo criterio sobre la lista ya cargada por `usePlayers`.
 */

// case/acentos-insensible: NFD separa la letra de su diacrítico y el rango
// combinante se descarta, así "Marta" == "MARTA" == "María" (por prefijo).
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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
  const q = normalize(query);
  return players.filter((player) => {
    if (player.deletedAt !== null) return false;
    if (taken.has(player.playerId)) return false;
    if (q === "") return true;
    return normalize(player.name)
      .split(/\s+/)
      .filter(Boolean)
      .some((word) => word.startsWith(q));
  });
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
