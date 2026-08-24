// Constantes de reacciones SIN el catálogo. Existe separado de
// emoji-catalog.ts a propósito: ese arrastra ~95 KB de datos, y el
// ReactionBar se pinta en el feed entero. Si el ReactionBar importara el
// catálogo, esos datos viajarían en el bundle principal — justo lo que la carga
// diferida del selector intenta evitar.

/** Fila rápida, en orden. Los cuatro primeros son la paleta histórica migrada. */
export const QUICK_REACTIONS = ["❤️", "📖", "😱", "🔥", "😂", "👏"] as const;

/**
 * Nombres de la fila rápida, copiados del catálogo. Se repiten aquí para no
 * arrastrar el catálogo al bundle; `emoji-catalog.test.ts` verifica que no se
 * desincronizan.
 */
export const QUICK_REACTION_NAMES: Record<string, string> = {
  "❤️": "corazón rojo",
  "📖": "libro abierto",
  "😱": "cara gritando de miedo",
  "🔥": "fuego",
  "😂": "cara llorando de risa",
  "👏": "manos aplaudiendo",
};

/** Emojis distintos que una persona puede poner sobre el mismo target. */
export const MAX_REACTIONS_PER_TARGET = 6;
