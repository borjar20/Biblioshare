export type RouteDiffEntry = { key: string; note: string | null };
export type RouteDiff = { added: number; removed: number; moved: number; noted: number; total: number };

/** Diferencia entre el borrador y el estado inicial (recién hidratado), para
 *  la barra de guardado (mockup M5: "3 cambios sin guardar · 1 paso movido
 *  · 1 nota nueva · 1 quitado"). Pura, sin efectos — mismo patrón que
 *  `validate-route-draft.ts`.
 *
 *  `moved` NO cuenta índices absolutos: borrar un paso desplaza a todos los
 *  que le seguían sin que nadie los haya movido. Se cuenta con la distancia
 *  mínima de reordenación de los SUPERVIVIENTES (presentes en los dos lados):
 *  cuántos hay que sacar y volver a meter para pasar de un orden al otro,
 *  es decir supervivientes.length menos la subsecuencia creciente más larga
 *  de sus posiciones originales. */
export function computeRouteDiff(initial: RouteDiffEntry[], draft: RouteDiffEntry[]): RouteDiff {
  const initialNotes = new Map(initial.map((d) => [d.key, d.note]));
  const initialKeys = initial.map((d) => d.key);
  const draftKeys = draft.map((d) => d.key);
  const draftSet = new Set(draftKeys);

  const added = draft.filter((d) => !initialNotes.has(d.key)).length;
  const removed = initialKeys.filter((k) => !draftSet.has(k)).length;
  const noted = draft.filter((d) => initialNotes.has(d.key) && initialNotes.get(d.key) !== d.note).length;

  const survivorsInitialOrder = initialKeys.filter((k) => draftSet.has(k));
  const survivorsDraftOrder = draftKeys.filter((k) => initialNotes.has(k));
  const indexInInitial = new Map(survivorsInitialOrder.map((k, i) => [k, i]));
  const sequence = survivorsDraftOrder.map((k) => indexInInitial.get(k)!);
  const moved = sequence.length - longestIncreasingRun(sequence);

  return { added, removed, moved, noted, total: added + removed + moved + noted };
}

/** Longitud de la subsecuencia creciente más larga, O(n log n) — patrón
 *  estándar "patience sorting". `n` aquí es el nº de pasos de un itinerario
 *  (decenas como mucho), así que la complejidad no es la razón de esta
 *  implementación: es simplemente la forma correcta de escribirla. */
function longestIncreasingRun(seq: number[]): number {
  const tails: number[] = [];
  for (const n of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < n) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = n;
  }
  return tails.length;
}
