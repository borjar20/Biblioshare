import { keyOfRouteEntry } from "../hydrate-route-draft";
import type { RawRouteEntry } from "../route-types";

export type ItineraryStep = { key: string; step: number; note: string | null };

/** Pasos de un itinerario curado, uno por OBRA (#1541). Un paso-bloque
 *  (`s:<uuid>`) se expande en las obras de esa subsaga en su orden principal
 *  (`mainOrderFor`), la misma expansión que `expandRouteKeys` usa en la balda, y
 *  cada obra hereda la nota del paso. Se queda la primera aparición de cada
 *  obra. Consecuencia asumida: `step` cuenta obras, no pasos del editor. */
export function itinerarySteps(entries: RawRouteEntry[], mainOrderOf: (sagaId: string) => string[]): ItineraryStep[] {
  const out: ItineraryStep[] = [];
  const seen = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.position - b.position)) {
    const key = keyOfRouteEntry(e);
    const keys = key.startsWith("s:") ? mainOrderOf(key.slice(2)).map((k) => `i:${k}`) : [key];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, step: out.length + 1, note: e.note });
    }
  }
  return out;
}
