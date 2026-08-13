import type { CheckpointViewModel } from "./checkpoints";

// Qué arrastra desmarcar un hito, para poder decirlo ANTES de hacerlo.
//
// Vive aparte de la tarjeta porque es la única parte con reglas de todo el
// cambio, y la única que se puede probar sin navegador.

/** Cuántos hitos posteriores se nombran antes de pasar a contarlos. Dos caben en
 *  el ancho de una fila; desmarcar el primero de una lectura con diez, no. */
const MAX_NOMBRADOS = 2;

export type UnconfirmImpact = {
  /** Etiquetas de los hitos posteriores que caen, como mucho MAX_NOMBRADOS. */
  alsoFalling: string[];
  /** Cuántos caen además de los nombrados. 0 si no hay recorte. */
  extraCount: number;
  /**
   * null = el aviso del chat no aplica.
   * { count: n } = tienes n mensajes ahí, y n es exacto.
   * { count: null } = aplica, pero afirmar un número sería mentir.
   */
  chat: { count: number | null } | null;
};

export function unconfirmImpact(
  target: CheckpointViewModel,
  all: CheckpointViewModel[],
): UnconfirmImpact {
  // Solo los CONFIRMADOS posteriores: uno que ya estaba pendiente no "cae",
  // seguirá exactamente igual.
  const posteriores = all
    .filter((c) => c.order > target.order && c.status === "confirmed")
    .sort((a, b) => a.order - b.order);

  return {
    alsoFalling: posteriores.slice(0, MAX_NOMBRADOS).map((c) => c.label),
    extraCount: Math.max(posteriores.length - MAX_NOMBRADOS, 0),
    // TODOS los que caen pierden su chat, no solo el pulsado: el guard de acceso
    // es «participante Y ha llegado», así que desmarcar el 3 de 5 te saca también
    // del chat de 4 y 5. `posteriores` (sin el slice de MAX_NOMBRADOS) es la lista
    // completa de lo que arrastra la cascada.
    chat: chatImpact([target, ...posteriores]),
  };
}

// El chat solo se avisa si escribiste en ALGUNO de los hitos que caen -- perder
// de vista una conversación en la que participaste es lo que duele; una que
// nunca tocaste, no.
//
// La trampa: `comments` llega con tope (COMMENT_PREFETCH_LIMIT = 20) y
// `commentCount` es el total real. En un chat recortado, contar los tuyos sobre
// lo cargado da MENOS de los que hay, y ni siquiera se puede descartar que
// tengas alguno entre los que no llegaron. Así que si CUALQUIERA de los hitos
// que caen tiene su chat recortado, se avisa sin número para el conjunto: un
// número que resulta falso gasta más confianza de la que ahorra al ser exacto.
function chatImpact(checkpoints: CheckpointViewModel[]): { count: number | null } | null {
  let huboChat = false;
  let recortado = false;
  let propios = 0;

  for (const c of checkpoints) {
    const chat = c.chat;
    if (!chat) continue;
    huboChat = true;
    if (chat.comments.length < chat.commentCount) {
      recortado = true;
    }
    propios += chat.comments.filter((m) => m.isOwn).length;
  }

  if (!huboChat) return null;
  if (recortado) return { count: null };
  return propios > 0 ? { count: propios } : null;
}
