// Sprites de la narradora común (spec 2026-10-06 §5, «Arte nuevo»). Un strip
// horizontal por estado con su idle (4 frames, south-west como PET_FACING); la
// ardilla PROPIA del usuario no vive aquí (usa PetSprite y public/pet/sheets).
// Generado con scripts/pet-pixellab/fetch-narrator.mjs: `cell` (px, cuadrada,
// 88-104 según cuánto desborde la animación al personaje), `frames` y `hash`
// salen del .json que escribe junto a cada PNG. Si se re-roll-ea un estado,
// vuelve a copiar esos tres valores (el test no recalcula el hash).
import type { NarratorVariant } from "./types";

export const NARRATOR_STATES = ["reader", "cinephile", "binger", "explorer", "social", "quiet", "festive"] as const satisfies readonly NarratorVariant[];

const SHEETS: Record<NarratorVariant, { cell: number; frames: number; fps: number; hash: string }> = {
  reader: { cell: 88, frames: 4, fps: 4, hash: "538ca51e16" },
  cinephile: { cell: 92, frames: 4, fps: 4, hash: "c0cca21dc1" },
  binger: { cell: 96, frames: 4, fps: 4, hash: "4e2ce46f76" },
  explorer: { cell: 92, frames: 4, fps: 4, hash: "b0ec82d19c" },
  social: { cell: 100, frames: 4, fps: 4, hash: "6c900a314f" },
  quiet: { cell: 88, frames: 4, fps: 3, hash: "ff52a2558c" },
  festive: { cell: 104, frames: 4, fps: 6, hash: "4fbaad9a0d" },
};

/** Tira horizontal: `frames` celdas de `cell`×`cell` px, de izquierda a derecha. */
export function narratorSheet(v: NarratorVariant) {
  const { hash, ...rest } = SHEETS[v];
  return { src: `/pet/wrap-ups/narrator/${v}.png?v=${hash}`, ...rest };
}
