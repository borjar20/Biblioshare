import { EMOJI_CATALOG_DATA } from "./emoji-catalog.data";

// Catálogo de emojis generado por scripts/build-emoji-catalog.mjs. Arrastra
// 153 KB de datos en crudo (1.906 entradas): solo deben importarlo el
// servidor y el selector cargado en diferido. Para el ReactionBar está
// reaction-constants.ts.
//
// El fichero de datos importa `EmojiEntry` de aquí y aquí se importan sus
// datos: el ciclo es solo de TIPOS (`import type`), que se borra al compilar,
// así que no hay ciclo en runtime.

export type EmojiEntry = {
  /** El emoji. */
  e: string;
  /** Nombre en español, en minúsculas. */
  n: string;
  /** Sinónimos de búsqueda. */
  k: string[];
  /** Índice de grupo, ver EMOJI_GROUPS. */
  g: number;
};

export const EMOJI_GROUPS: readonly { id: number; label: string }[] = [
  { id: 0, label: "Caras" },
  { id: 1, label: "Personas" },
  { id: 2, label: "Animales" },
  { id: 3, label: "Comida" },
  { id: 4, label: "Viajes" },
  { id: 5, label: "Ocio" },
  { id: 6, label: "Objetos" },
  { id: 7, label: "Símbolos" },
  { id: 8, label: "Banderas" },
];

export const EMOJI_CATALOG = EMOJI_CATALOG_DATA;

const BY_CHAR = new Map(EMOJI_CATALOG.map((entry) => [entry.e, entry]));

/**
 * Lista blanca. Es la puerta de entrada de `toggleReaction`: si algo no está
 * aquí, no se guarda. Más estricto que un regex de emoji, y garantiza que todo
 * lo almacenado se puede pintar Y nombrar.
 */
export function isAllowedEmoji(value: unknown): value is string {
  return typeof value === "string" && BY_CHAR.has(value);
}

export function emojiName(emoji: string): string {
  return BY_CHAR.get(emoji)?.n ?? emoji;
}

export function emojisByGroup(groupId: number): EmojiEntry[] {
  return EMOJI_CATALOG.filter((entry) => entry.g === groupId);
}

/** Minúsculas y sin tildes, para que "corazon" encuentre "corazón". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Búsqueda por prefijo sobre nombre y sinónimos. Sin fuzzy: con nombres cortos
 * y un catálogo de 1.900 entradas, el prefijo acierta y no sorprende.
 * Puntuación: nombre exacto (0) < nombre por prefijo (1) < sinónimo (2).
 */
export function searchEmojis(query: string, limit = 100): EmojiEntry[] {
  const q = fold(query);
  if (!q) return [];
  const scored: Array<{ entry: EmojiEntry; score: number }> = [];
  for (const entry of EMOJI_CATALOG) {
    const name = fold(entry.n);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (entry.k.some((word) => fold(word).startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.entry);
}
