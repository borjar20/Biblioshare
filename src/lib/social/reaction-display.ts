import { MAX_REACTIONS_PER_TARGET } from "./reaction-constants";
import { anyViewerReacted, totalReactions, type ReactionsByEmoji } from "./interactions";

// Decisiones de pintado del ReactionBar, extraídas como funciones puras: en
// esta rama no hay runner de componentes (vitest.config.ts incluye solo
// *.test.ts, entorno node), así que esto es lo que hace testeable el
// comportamiento sin montar un DOM. El clic y el foco los cubre el e2e.

export type ReactionEntry = { emoji: string; count: number; viewerReacted: boolean };

/**
 * Recuento descendente; en empate, orden de primera aparición. `Array.sort` es
 * estable, y las claves de un objeto con claves string se recorren en orden de
 * inserción — que es el de `created_at` porque las consultas van ordenadas.
 */
export function orderedReactions(reactions: ReactionsByEmoji): ReactionEntry[] {
  return Object.entries(reactions)
    .map(([emoji, tally]) => ({ emoji, count: tally.count, viewerReacted: tally.viewerReacted }))
    .sort((a, b) => b.count - a.count);
}

/** Lo que pinta el botón colapsado: unos pocos emojis y el total de todos. */
export function summarize(
  reactions: ReactionsByEmoji,
  max = 3,
): { top: ReactionEntry[]; total: number; viewerReacted: boolean } {
  return {
    top: orderedReactions(reactions).slice(0, max),
    total: totalReactions(reactions),
    viewerReacted: anyViewerReacted(reactions),
  };
}

export function viewerReactionCount(reactions: ReactionsByEmoji): number {
  return Object.values(reactions).filter((tally) => tally.viewerReacted).length;
}

/** Tope por PERSONA y target, no total del target. */
export function capReached(
  reactions: ReactionsByEmoji,
  max = MAX_REACTIONS_PER_TARGET,
): boolean {
  return viewerReactionCount(reactions) >= max;
}
