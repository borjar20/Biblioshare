import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import type { SagaItemRole } from "./types";
import type { RawRouteEntry } from "./route-types";

/** Un ítem del borrador del editor: la key estable, la entrada cruda que se
 *  envía al guardar, y los metadatos a pintar. Un paso es ítem O bloque
 *  (nunca los dos, lo decide `entry.childSagaId`), pero se declara plano en
 *  vez de como unión discriminada: `RawRouteEntry` ya usa este mismo
 *  criterio (campos nulos según el caso) y el resto del editor desestructura
 *  `RouteEditorItem` dando por hecho un único tipo. */
export type RouteEditorItem = {
  key: string;
  label: string;
  /** Solo en un paso-ítem (`entry.childSagaId === null`). */
  coverUrl: string | null;
  itemType: ItemType | null;
  role: SagaItemRole | null;
  /** Solo en un paso-bloque (`entry.childSagaId !== null`). */
  accent: SagaAccentToken | null;
  memberCount: number | null;
  entry: Omit<RawRouteEntry, "position">;
};

export const keyOfRouteEntry = (e: Omit<RawRouteEntry, "position">) =>
  e.childSagaId ? `s:${e.childSagaId}` : `i:${e.itemType}:${e.itemId}`;

/**
 * Hidrata el borrador del editor a partir de las entradas guardadas y la
 * paleta disponible (obras + subsagas del subárbol).
 *
 * Para cada entrada guardada se busca su ítem de paleta por key (misma obra o
 * subsaga) para heredar sus metadatos — pero la `note` SIEMPRE tiene que venir
 * de la entrada real (`e.note`), nunca de la paleta: `page.tsx` construye la
 * paleta con `note: null` a propósito (no es una nota "por defecto", es un
 * placeholder para pasos que aún no están en el borrador). Si aquí se
 * devolviera el objeto de la paleta tal cual, `save()` reenviaría `note: null`
 * en el full-replace y borraría la nota real de cada paso ya guardado
 * (hallazgo Important de la revisión final de rama).
 *
 * Una entrada huérfana (su obra/subsaga ya no está en la paleta — se quitó de
 * la saga) conserva su `note` vía un fallback mínimo, sin portada ni acento:
 * mejor una fila fea que perder la nota del curador.
 */
export function hydrateRouteDraft(entries: RawRouteEntry[], palette: RouteEditorItem[]): RouteEditorItem[] {
  return entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const k = keyOfRouteEntry(e);
      const p = palette.find((x) => x.key === k);
      if (p) return { ...p, entry: { ...p.entry, note: e.note } };
      return {
        key: k,
        label: k,
        coverUrl: null,
        itemType: e.itemType,
        role: null,
        accent: null,
        memberCount: e.childSagaId ? 0 : null,
        entry: e,
      };
    });
}
