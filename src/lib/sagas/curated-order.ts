import type { ItemType } from "@/lib/catalog/types";
import { compareBlocksByPlacement } from "./group-members";
import { placeByWindow, type OrderUnit, type OrderWindow } from "./place-by-window";
import type { SagaPlacement } from "./types";

// Orden principal de una saga: la SECUENCIA con la que se pinta (columna del
// timeline, expansión de bloques en un itinerario, portadas y «siguiente» de
// las cards). NO es el denominador del progreso: eso vive en ./progress.ts
// (countedKeys) y sale de la pertenencia, no del orden.
//
// Fase 3 (Task 4, issue #185): hasta esta tarea, el orden salía de
// main-order.ts, que mezclaba dos criterios — si la saga tenía nodos de
// grafo (saga_nodes) mandaba el grafo, y si no mandaba `position`. Esa
// asimetría era el #185. Con saga_nodes retirado del todo (fase 3), solo
// queda un criterio: la CURACIÓN (saga_items + sagas.position_in_parent /
// placement_in_parent) es la única fuente del orden principal, para todos
// los consumidores. Por eso un miembro ya NO puede quedar fuera de la
// SECUENCIA por falta de "hueco en el grafo" (issue #170, ver main-order.ts
// en el historial): sin grafo, todo miembro tiene sitio — los que no tienen
// `position` simplemente van al final, por título.

export type OrderSaga = {
  id: string;
  name: string;
  parentSagaId: string | null;
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** Colocación del bloque en su padre (sagas.placement_in_parent). */
  placementInParent: SagaPlacement | null;
};
export type OrderMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
  /** Colocación de la obra en ESA saga (`saga_items.placement`). La necesita la
   *  guarda «solo lo `libre` tiene ventana» del post-pase, la MISMA que aplican
   *  `deriveSagaMap` y la ficha: ningún CHECK de BD puede imponerla porque cruza
   *  dos tablas, así que una fila rancia puede llegar hasta aquí. */
  placement: SagaPlacement | null;
};

export const itemKey = (t: ItemType, i: string) => `${t}:${i}`;

// Cap de profundidad como cinturón frente a ciclos (el trigger de BD ya los
// impide); mismo valor que fetchDescendants en get-saga-detail.
const MAX_DEPTH = 4;

/**
 * Indexa el árbol una sola vez y devuelve el calculador del orden principal.
 * `titleOf` resuelve el título de una clave `item_type:item_id` para el
 * desempate alfabético de los miembros sin position.
 */
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
  // Ventanas del subárbol, por clave de SUJETO en formato de entrada
  // (`i:<tipo>:<uuid>` / `s:<uuid>`). Obligatorio a propósito: un llamante que
  // se lo dejara perdería la colocación por ventana EN SILENCIO, que es
  // exactamente cómo nacen las issues de la familia #203.
  windows: Record<string, OrderWindow>,
): (rootId: string) => string[] {
  const sagaById = new Map(sagas.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, OrderSaga[]>();
  for (const s of sagas) {
    if (s.parentSagaId === null || !sagaById.has(s.parentSagaId)) continue;
    const list = childrenByParent.get(s.parentSagaId) ?? [];
    list.push(s);
    childrenByParent.set(s.parentSagaId, list);
  }
  const membersBySaga = new Map<string, OrderMembership[]>();
  for (const m of memberships) {
    const list = membersBySaga.get(m.sagaId) ?? [];
    list.push(m);
    membersBySaga.set(m.sagaId, list);
  }

  // Heurística vieja (issue #204): antes de la fase 2a no había forma de
  // expresar la colocación de un bloque, así que el orden de las hijas salía
  // del `position` MÍNIMO de sus miembros. Se conserva como DESEMPATE cuando
  // ninguna de las dos hijas comparadas tiene `positionInParent` — mismo
  // criterio que `childGroups` en group-members.ts, para que las 6 subsagas
  // sin colocar que hay en prod no se muevan de sitio por este cambio.
  const minPos = (sagaId: string) =>
    (membersBySaga.get(sagaId) ?? []).reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );

  // `visited` es compartido por toda la recursión de una llamada: impide que un
  // ciclo saga→saga cuelgue y que una saga alcanzable por dos caminos duplique
  // sus títulos en la SECUENCIA (el `new Set(...)` de `curatedOrder`, abajo, ya
  // dedupica el resultado final, pero sin `visited` la recursión ni siquiera
  // terminaría). Esto no es el denominador del progreso: ese vive en
  // countedKeys (./progress.ts).
  /** Una clave y la saga que la emitió: el post-pase de ventanas necesita saber
   *  dónde están los límites entre bloques, y eso solo lo sabe quien recorre. */
  type WalkUnit = { key: string; sagaId: string };

  function walk(sagaId: string, depth: number, visited: Set<string>): WalkUnit[] {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return [];
    visited.add(sagaId);
    const out: WalkUnit[] = [];
    const direct = [...(membersBySaga.get(sagaId) ?? [])].sort((a, b) => {
      const pa = a.position ?? Number.MAX_SAFE_INTEGER;
      const pb = b.position ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return titleOf(itemKey(a.itemType, a.itemId)).localeCompare(
        titleOf(itemKey(b.itemType, b.itemId)),
      );
    });

    // Colocación curada (issue #204): las hijas ya no se ordenan por el hueco
    // mínimo de sus miembros, sino por `position_in_parent` — el mismo
    // comparador que usa `childGroups` en group-members.ts (`compareBlocksByPlacement`,
    // issue #203: un solo comparador para las tres pantallas). Una hija
    // `libre` no tiene `positionInParent` (lo impone el CHECK de la
    // migración), así que cae detrás de las colocadas por la misma vía: la
    // rama del fallback.
    const children = [...(childrenByParent.get(sagaId) ?? [])].sort((a, b) =>
      compareBlocksByPlacement(a, b, (s) => minPos(s.id)),
    );
    for (const c of children) out.push(...walk(c.id, depth + 1, visited));

    // Los miembros directos van AL FINAL, detrás de las hijas (arreglo de la
    // revisión final de rama, punto 1): hasta este arreglo iban primero, y
    // `groupMembers` (group-members.ts) —de donde salen la ficha y el mapa
    // derivado— los pinta al final, en el grupo «Nexo». La divergencia era
    // observable en el Cosmere, que tiene un único miembro directo
    // (*Arcanum Ilimitado*): el mapa lo pintaba el último (como la ficha) y
    // este orden lo abría el primero, así que el botón «Generar desde la
    // curación» habría creado un itinerario que empieza justo por el libro
    // que la migración de esta fase excluye a propósito por no haber tenido
    // nunca hueco (`order_no`). Decisión del responsable del producto (issue
    // de la revisión final de la fase 3): manda la ficha. Cambio en vivo en
    // los tres consumidores de `createCuratedOrder` — el generador del
    // itinerario, la expansión de un bloque dentro de un itinerario
    // (route-view.tsx) y el «siguiente»/portadas de las cards de Mi
    // Biblioteca (build-library-saga-cards.ts) — así que los tres coinciden
    // ahora con la ficha y con el mapa.
    out.push(...direct.map((m) => ({ key: itemKey(m.itemType, m.itemId), sagaId })));
    return out;
  }

  // Placement por clave de obra: basta con que UNA membresía sea `libre` para
  // que la obra pueda tener ventana — mismo criterio que `buildWindowOwners`
  // (window-owners.ts).
  const obrasLibres = new Set<string>();
  for (const m of memberships) {
    if (m.placement === "libre") obrasLibres.add(`i:${itemKey(m.itemType, m.itemId)}`);
  }
  const esLibre = (subjectKey: string): boolean =>
    subjectKey.startsWith("s:")
      ? sagaById.get(subjectKey.slice(2))?.placementInParent === "libre"
      : obrasLibres.has(subjectKey);

  /** Claves `item_type:item_id` del orden principal de `rootId`, deduplicadas y
   *  con los sujetos `libre` ya recolocados por su ventana. */
  return function curatedOrder(rootId: string): string[] {
    // Dedup conservando la PRIMERA aparición (y con ella el bloque que la
    // emitió): una obra miembro de dos sagas del subárbol sale una sola vez.
    const vistas = new Set<string>();
    const units: OrderUnit[] = [];
    for (const wu of walk(rootId, 0, new Set())) {
      if (vistas.has(wu.key)) continue;
      vistas.add(wu.key);
      units.push({
        // `placeByWindow` habla en claves de ENTRADA; esta función habla en
        // `<tipo>:<uuid>` de cara a sus tres consumidores. Se traduce aquí y se
        // destraduce abajo; el prefijo mide exactamente dos caracteres.
        key: `i:${wu.key}`,
        // La raíz no es un bloque: sus miembros directos son el «Nexo», y para
        // el orden eso significa "sin bloque" — igual que `groupSagaId: null`
        // en el mapa. Sin esto, insertar delante de un miembro directo contaría
        // como partir un bloque que no existe.
        blockId: wu.sagaId === rootId ? null : wu.sagaId,
      });
    }
    return placeByWindow(units, windows, esLibre).map((u) => u.key.slice(2));
  };
}
