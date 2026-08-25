// Lado ESCRITURA del contexto de una notificación: el tipo que se guarda en
// `notifications.context` y cómo se prepara el extracto. Puro y sin
// dependencias, para que se pueda probar sin DOM ni base de datos.
//
// La lectura (elegir la copia) vive aparte, en notification-copy.ts.

/**
 * Foto de lo ocurrido, guardada al crear la notificación. Todos los campos son
 * opcionales: una notificación de seguidor no trae ninguno, una reacción solo
 * trae `emoji`, un comentario solo `excerpt` o `spoiler`.
 *
 * NO se actualiza si luego editan el comentario o corrigen el título: es un
 * aviso histórico, dice lo que pasó entonces.
 */
export type NotificationContext = {
  /** El emoji literal con el que se reaccionó. */
  emoji?: string;
  /** Título de la obra, cuando quien notifica lo tiene a mano. */
  subject?: string;
  /** Extracto de lo que se dijo. Nunca presente si `spoiler` es true. */
  excerpt?: string;
  /** El comentario estaba marcado como spoiler: se avisa, no se cita. */
  spoiler?: boolean;
};

export const EXCERPT_MAX_CHARS = 140;

/**
 * Recorta el cuerpo de un comentario para la notificación.
 *
 * Recorta por GRAFEMAS y no por unidades de código: un emoji ocupa varias, y
 * un `slice()` a pelo lo parte por la mitad y deja medio carácter en pantalla.
 * Y remata en el último espacio para no cortar una palabra.
 */
export function buildExcerpt(body: string): string {
  const limpio = body.replace(/\s+/gu, " ").trim();
  if (!limpio) return "";

  const grafemas = [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(limpio)];
  if (grafemas.length <= EXCERPT_MAX_CHARS) return limpio;

  const cortado = grafemas
    .slice(0, EXCERPT_MAX_CHARS)
    .map((g) => g.segment)
    .join("");
  const ultimoEspacio = cortado.lastIndexOf(" ");
  const base = ultimoEspacio > 0 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.trimEnd()}…`;
}

/**
 * Contexto de una notificación de comentario o mención.
 *
 * Si el comentario es spoiler, el texto NO se guarda: se marca y punto. Lo que
 * no se guarda no puede escaparse después por el push ni por un lector nuevo.
 */
export function commentContext(body: string, isSpoiler: boolean): NotificationContext {
  if (isSpoiler) return { spoiler: true };
  const excerpt = buildExcerpt(body);
  return excerpt ? { excerpt } : {};
}
