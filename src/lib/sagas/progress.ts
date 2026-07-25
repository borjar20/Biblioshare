import type { ItemType } from "@/lib/catalog/types";

// El DENOMINADOR del progreso de una saga (spec 2026-07-25).
//
// Regla, entera: «las obras del subárbol que no estén marcadas optional,
// deduplicadas». Nada de esto mira el ORDEN — ni position, ni saga_nodes, ni
// itinerarios — y ahí está el cambio: hasta hoy el denominador ERA el orden
// (createMainOrder producía la lista y computeProgress contaba sobre ella), y
// por eso el número se rompía cada vez que se tocaba la curación: #91 (regla
// duplicada), #170 (nodos huérfanos), #185 (dos ramas que se contradicen) y el
// 0/0 de Mundodisco.
//
// Un bloque `optionalInParent` sale del denominador de su PADRE pero no del
// suyo: abrir la ficha de «Novelas secretas» y ver 0/4 es lo que un lector
// espera; que sus 4 obras penalicen el Cosmere, no.

export type ProgressSaga = { id: string; parentSagaId: string | null; optionalInParent: boolean };
export type ProgressMembership = { sagaId: string; itemType: ItemType; itemId: string; optional: boolean };

export const itemKey = (t: ItemType, i: string) => `${t}:${i}`;

// Mismo cinturón anti-ciclos que createMainOrder (el trigger de BD ya los
// impide; esto protege de datos heredados).
const MAX_DEPTH = 4;

export function countedKeys(
  rootId: string,
  sagas: ProgressSaga[],
  memberships: ProgressMembership[],
): string[] {
  const childrenByParent = new Map<string, ProgressSaga[]>();
  for (const s of sagas) {
    if (s.parentSagaId === null) continue;
    const list = childrenByParent.get(s.parentSagaId) ?? [];
    list.push(s);
    childrenByParent.set(s.parentSagaId, list);
  }
  const membersBySaga = new Map<string, ProgressMembership[]>();
  for (const m of memberships) {
    const list = membersBySaga.get(m.sagaId) ?? [];
    list.push(m);
    membersBySaga.set(m.sagaId, list);
  }

  const out: string[] = [];
  const visited = new Set<string>();

  function walk(sagaId: string, depth: number) {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return;
    visited.add(sagaId);
    for (const m of membersBySaga.get(sagaId) ?? []) {
      if (!m.optional) out.push(itemKey(m.itemType, m.itemId));
    }
    for (const c of childrenByParent.get(sagaId) ?? []) {
      // La opcionalidad del bloque se evalúa AL DESCENDER desde el padre, así
      // que la raíz nunca se excluye a sí misma.
      if (!c.optionalInParent) walk(c.id, depth + 1);
    }
  }

  walk(rootId, 0);
  return [...new Set(out)];
}
