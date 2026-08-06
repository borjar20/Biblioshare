import { chunkIntoCards, type GroupDescriptor } from "./group-feed-entries";

// Planificador de página del feed: decide DÓNDE cortar el flujo crudo ya
// ordenado para que la agrupación de presentación no parta ninguna tarjeta
// entre páginas (#295/#303) ni pierda/repita filas al paginar.
//
// El problema: las tarjetas (grupos) NO particionan el flujo ordenado — se
// SOLAPAN. Un timeline de avances de D9 a D5 es una tarjeta cuyo lapso contiene
// eventos sueltos de otros (un terminado en D7). Un cursor keyset crudo no puede
// servir el timeline y LUEGO el terminado: el terminado vive dentro del lapso y
// se perdería. (Prueba en feed-paging.test.ts.)
//
// La solución: cortar solo en un BORDE LIMPIO — una posición del flujo que
// NINGUNA tarjeta cruza. Entre dos bordes limpios, todas las tarjetas se emiten
// juntas (se solapan mutuamente, no hay otro orden correcto). El cursor sigue
// siendo el keyset crudo de la última fila servida (formato y filtro SQL
// intactos); solo cambia cuántas filas entran en la página.
type Orderable = { orderDate: string; sortDate: string; id: string; eventDate: string };

/**
 * Cuántas filas crudas de `fresh` (prefijo, ya ordenado desc) entran en esta
 * página. El prefijo devuelto contiene SIEMPRE tarjetas completas: al agruparlo
 * salen `⌈≥pageSize⌉` tarjetas sin ninguna partida, y el corte cae en un borde
 * que ningún grupo cruza, de modo que la siguiente página (filas `< cursor`)
 * continúa sin duplicar ni perder.
 *
 * `openTailIds`: id del miembro más VIEJO traído de cada fuente que tocó su
 * límite de fetch (no agotada). Una tarjeta que contiene uno de esos ids podría
 * tener más miembros sin traer más allá del fetch: está INCOMPLETA y no se emite
 * (se retiene a la siguiente tanda). Ojo — esto NO es "la última tarjeta del
 * flujo": una fuente puede agotar su límite con filas cuyo grupo queda ARRIBA
 * del flujo mientras otra fuente aporta filas más viejas por debajo. Vacío =
 * todas las fuentes agotadas → el final del flujo es un borde limpio natural.
 */
export function planFeedPageCut<E extends Orderable>(
  fresh: E[],
  descriptor: (e: E) => GroupDescriptor | null,
  pageSize: number,
  openTailIds: Set<string>,
): number {
  if (fresh.length === 0) return 0;

  const cards = chunkIntoCards(fresh, descriptor);
  const index = new Map(fresh.map((e, i) => [e.id, i]));
  const newestPos = (card: E[]) => Math.min(...card.map((m) => index.get(m.id)!));
  const deepestPos = (card: E[]) => Math.max(...card.map((m) => index.get(m.id)!));
  const incomplete = (card: E[]) => card.some((m) => openTailIds.has(m.id));

  // Recorremos las tarjetas en orden. `runningMaxDeepest` es la fila más
  // PROFUNDA tocada por alguna tarjeta ya emitida: por debajo de ella no puede
  // quedar ningún miembro de lo emitido. Hay borde limpio tras la tarjeta i si
  // esa profundidad queda por ENCIMA del miembro más nuevo de la tarjeta i+1
  // (las tarjetas van ordenadas por miembro más nuevo, así que i+1 es la cota).
  let runningMaxDeepest = -1;
  let lastCleanCut = -1; // último borde limpio visto con < pageSize tarjetas
  for (let i = 0; i < cards.length; i++) {
    if (incomplete(cards[i])) {
      // Esta tarjeta (y por tanto todo lo que va detrás) podría continuar más
      // allá del fetch: se retrocede al último borde limpio para no emitirla
      // partida. Si no hubo ninguno (la PRIMERA tarjeta ya es un grupo más
      // grande que el fetch, p. ej. un import masivo del mismo instante), se
      // fuerza emitir lo traído —residuo acotado #391, ver getFeed— nunca 0.
      if (lastCleanCut >= 0) return lastCleanCut;
      return fresh.length;
    }

    runningMaxDeepest = Math.max(runningMaxDeepest, deepestPos(cards[i]));

    if (i === cards.length - 1) {
      // Sin ninguna incompleta hasta el final ⇒ todas las fuentes agotadas ⇒
      // el final es un borde limpio natural: se emite todo.
      return fresh.length;
    }

    const emittedCards = i + 1;
    const cleanCut = runningMaxDeepest + 1 <= newestPos(cards[i + 1]);
    if (cleanCut) {
      if (emittedCards >= pageSize) return runningMaxDeepest + 1;
      lastCleanCut = runningMaxDeepest + 1; // aún no hay pageSize tarjetas: recordar
    }
  }

  // Inalcanzable: el bucle retorna en la última tarjeta.
  return fresh.length;
}
