// Constantes de reacciones SIN el catálogo. Existe separado de
// emoji-catalog.ts a propósito: ese arrastra 153 KB de datos (1.906 entradas),
// y el ReactionBar se pinta en el feed entero. Si el ReactionBar importara el
// catálogo, esos datos viajarían en el bundle principal — justo lo que la carga
// diferida del selector intenta evitar.

/** Fila rápida, en orden. Los cuatro primeros son la paleta histórica migrada. */
export const QUICK_REACTIONS = ["❤️", "📖", "😱", "🔥", "😂", "👏"] as const;

/**
 * Nombres de la fila rápida, copiados del catálogo. Se repiten aquí para no
 * arrastrar el catálogo al bundle; `emoji-catalog.test.ts` verifica que no se
 * desincronizan.
 *
 * Tipado por las claves de QUICK_REACTIONS, no `Record<string, string>`: con
 * un índice string genérico, un emoji ausente del mapa resolvía a `undefined`
 * tipado como `string` y `aria-label={undefined}` dejaba un botón sin nombre
 * accesible sin que el compilador avisara. Así, olvidar una entrada es error
 * de compilación, no un bug silencioso en producción.
 */
export const QUICK_REACTION_NAMES: Record<(typeof QUICK_REACTIONS)[number], string> = {
  "❤️": "corazón rojo",
  "📖": "libro abierto",
  "😱": "cara gritando de miedo",
  "🔥": "fuego",
  "😂": "cara llorando de risa",
  "👏": "manos aplaudiendo",
};

/** Emojis distintos que una persona puede poner sobre el mismo target. */
export const MAX_REACTIONS_PER_TARGET = 6;
