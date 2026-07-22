import type { RawRouteEntry } from "./route-types";

/** Un ítem del borrador del editor: la key estable, la etiqueta a pintar y la
 * entrada cruda que se envía al guardar. */
export type RouteEditorItem = { key: string; label: string; entry: Omit<RawRouteEntry, "position"> };

export const keyOfRouteEntry = (e: Omit<RawRouteEntry, "position">) =>
  e.childSagaId ? `s:${e.childSagaId}` : `i:${e.itemType}:${e.itemId}`;

/**
 * Hidrata el borrador del editor a partir de las entradas guardadas y la
 * paleta disponible (obras + subsagas del subárbol).
 *
 * Para cada entrada guardada se busca su ítem de paleta por key (misma obra o
 * subsaga) para heredar `label` — pero la `note` SIEMPRE tiene que venir de la
 * entrada real (`e.note`), nunca de la paleta: `page.tsx` construye la
 * paleta con `note: null` a propósito (no es una nota "por defecto", es un
 * placeholder para pasos que aún no están en el borrador). Si aquí se
 * devolviera el objeto de la paleta tal cual, `save()` reenviaría `note: null`
 * en el full-replace y borraría la nota real de cada paso ya guardado
 * (hallazgo Important de la revisión final de rama).
 */
export function hydrateRouteDraft(entries: RawRouteEntry[], palette: RouteEditorItem[]): RouteEditorItem[] {
  return entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const k = keyOfRouteEntry(e);
      const p = palette.find((x) => x.key === k);
      return p ? { ...p, entry: { ...p.entry, note: e.note } } : { key: k, label: k, entry: e };
    });
}
