import { latestRatingPerUser } from "@/lib/community/latest-rating";
import {
  SAGA_ACCENT_SEQUENCE,
  isSagaAccentToken,
  type SagaAccentToken,
} from "./accents";
import { isMemberCompleted } from "./completion";
import type { DetailMember, ResolvedWindow, SagaChildRef, SagaPlacement } from "./types";

// Agrupación de la pestaña Info y progreso del hero (spec §2.1/§2.3, frames
// A/D). Todo puro: los datos llegan resueltos de get-saga-detail.

export type MemberGroup = {
  /** null = grupo de miembros directos («Nexo» si hay hijas; único grupo si no) */
  sagaId: string | null;
  name: string | null;
  accent: SagaAccentToken;
  members: DetailMember[];
  /** Colocación del bloque dentro de ESTA saga (`sagas.*_in_parent`). Las dos
   *  son null en el grupo de miembros directos, que no es un bloque, y en un
   *  bloque sin clasificar. El render las usa para repartir los grupos entre la
   *  lista ordenada y «Cuando quieras» (issue #198); el progreso NO las mira. */
  positionInParent: number | null;
  placementInParent: SagaPlacement | null;
};

const byPositionThenTitle = (a: DetailMember, b: DetailMember) => {
  const pa = a.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.position ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
};

/** Forma mínima que necesita `compareBlocksByPlacement`: los tres llamantes
 *  (MemberGroup aquí, OrderSaga en curated-order.ts, LibSaga en
 *  build-library-saga-cards.ts) ya traen estos tres campos con estos nombres,
 *  así que ninguno tiene que construir un objeto aparte para ordenar. */
export type BlockPlacement = {
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** Colocación del bloque en su padre (sagas.placement_in_parent). */
  placementInParent: SagaPlacement | null;
  name: string;
};

/**
 * Comparador ÚNICO del orden de los bloques (hijas) de una saga: colocación
 * curada (`position_in_parent`) primero, desempate alfabético; un bloque sin
 * colocar cae detrás de los colocados, y entre dos bloques SIN colocar
 * desempata `minPos` — el hueco MÍNIMO de sus miembros (heurística vieja,
 * issue #204), para no mover de sitio los bloques sin colocar que hoy hay en
 * producción.
 *
 * Existe como función exportada, y no repetida en cada llamante, porque hasta
 * el arreglo de la revisión de la Task 4 el MISMO comparador estaba escrito
 * tres veces: aquí (`childGroups`, la ficha), en curated-order.ts (el orden
 * principal) y en build-library-saga-cards.ts (el acento de los segmentos de
 * progreso). Los tres coincidían por casualidad — tocar uno sin los otros dos
 * reabre en silencio la issue #203 (dos pantallas discrepando sobre el mismo
 * dato).
 *
 * `minPos` llega como función, no como valor, porque cada llamante lo calcula
 * desde una colección de miembros distinta (`DetailMember[]`,
 * `OrderMembership[]`, `LibMembership[]`); solo se invoca cuando NINGUNO de
 * los dos bloques tiene colocación, igual que antes de la extracción.
 */
export function compareBlocksByPlacement<T extends BlockPlacement>(
  a: T,
  b: T,
  minPos: (block: T) => number,
): number {
  if (a.positionInParent !== null && b.positionInParent !== null) {
    return a.positionInParent - b.positionInParent || a.name.localeCompare(b.name);
  }
  if (a.positionInParent !== null) return -1;
  if (b.positionInParent !== null) return 1;
  const pa = minPos(a);
  const pb = minPos(b);
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name);
}

export function groupMembers(
  members: DetailMember[],
  children: SagaChildRef[],
): MemberGroup[] {
  const buckets = new Map<string | null, DetailMember[]>();
  for (const m of members) {
    const key = m.groupSagaId !== null && children.some((c) => c.id === m.groupSagaId)
      ? m.groupSagaId
      : null;
    const bucket = buckets.get(key) ?? [];
    bucket.push(m);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort(byPositionThenTitle);

  const minPos = (list: DetailMember[]) =>
    list.reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );

  // La colocación curada manda (issue #198): hasta la fase 2a no había forma de
  // expresarla, así que el orden salía del `position` MÍNIMO de los miembros
  // del bloque — una heurística que ahora contradice al curador (Elantris,
  // curado en el hueco 2, salía el quinto porque su única obra no tiene
  // número). Un bloque sin colocar conserva esa heurística y cae detrás: es lo
  // único que había antes, y en prod hay 6 bloques así que no deben moverse.
  // Comparador compartido: ver `compareBlocksByPlacement`, arriba (issue #203).
  const childGroups = children
    .filter((c) => buckets.has(c.id))
    .sort((a, b) => compareBlocksByPlacement(a, b, (c) => minPos(buckets.get(c.id)!)));

  // Colores: accent_color persistido manda; el resto rota SAGA_ACCENT_SEQUENCE
  // saltándose los ya usados, por orden de grupo (estable entre renders).
  const used = new Set<SagaAccentToken>();
  for (const c of childGroups) {
    if (isSagaAccentToken(c.accentColor)) used.add(c.accentColor);
  }
  const sequenceLength = SAGA_ACCENT_SEQUENCE.length;
  let rotation = 0;
  // Puntero de reserva para cuando ya no queda ningún token libre (persistido
  // o ya asignado aquí mismo): a partir de ahí no hay huecos que buscar, así
  // que se reutiliza cíclicamente sin volver a consultar `used`.
  let cycleIndex = 0;
  const accentFor = (c: SagaChildRef): SagaAccentToken => {
    if (isSagaAccentToken(c.accentColor)) return c.accentColor;
    if (used.size < sequenceLength) {
      // used.size < sequenceLength garantiza (principio del palomar) que hay
      // al menos un hueco libre en una vuelta completa: el bucle hace, como
      // mucho, sequenceLength iteraciones — nunca es infinito.
      while (used.has(SAGA_ACCENT_SEQUENCE[rotation % sequenceLength])) rotation++;
      const token = SAGA_ACCENT_SEQUENCE[rotation % sequenceLength];
      used.add(token);
      cycleIndex = rotation + 1;
      return token;
    }
    // Los sequenceLength tokens ya están ocupados: en vez de seguir buscando
    // un hueco que no existe, se reutiliza la secuencia cíclicamente.
    const token = SAGA_ACCENT_SEQUENCE[cycleIndex % sequenceLength];
    cycleIndex++;
    return token;
  };

  const groups: MemberGroup[] = childGroups.map((c) => ({
    sagaId: c.id,
    name: c.name,
    accent: accentFor(c),
    members: buckets.get(c.id)!,
    positionInParent: c.positionInParent,
    placementInParent: c.placementInParent,
  }));

  const direct = buckets.get(null);
  if (direct && direct.length > 0) {
    groups.push({
      sagaId: null,
      name: null,
      accent: children.length > 0 ? "beige" : "terracota",
      members: direct,
      positionInParent: null,
      placementInParent: null,
    });
  }
  return groups;
}

/** Reparto entre la lista ordenada y «Cuando quieras», el MISMO que pinta la
 *  ficha. Vive aquí, y no en el render, desde que el mapa (fase 3) necesita
 *  recorrer los grupos en ese orden: dos vistas que reparten por su cuenta
 *  acaban discrepando (issues #91 y #203).
 *  OJO: esto NO filtra `groupMembers`, que debe seguir devolviendo todos los
 *  grupos porque `computeProgress` los recorre para los segmentos del hero. */
export function partitionGroups(groups: MemberGroup[]): {
  ordered: MemberGroup[];
  free: MemberGroup[];
} {
  return {
    ordered: groups.filter((g) => g.placementInParent !== "libre"),
    free: groups.filter((g) => g.placementInParent === "libre"),
  };
}

/**
 * Orden de PINTADO de los bloques del mapa 2D, que ya no es
 * `[...ordered, ...free]`: un bloque `libre` con ventana sube y se coloca junto
 * a su ancla, intercalado entre los colocados.
 *
 * Existe para reducir cruces de aristas. Un bloque libre anclado a la fila 2
 * dibujado en la fila 9 obliga a su arista de ventana a cruzar todo el lienzo,
 * y esas aristas —no las de cadena— son las que hacen el nudo.
 *
 * NO reordena la zona ordenada: ese orden es curación del usuario. Y NO toca
 * `orderNo`: quien pinta y quien cuenta el orden de lectura son dos cosas
 * distintas desde que `deriveSagaMap` calcula los `orderNo` en una pre-pasada
 * aparte (ver el comentario de `orderNoDeCadaObra` en derive-map.ts).
 */
export function orderBlocksForLayout(
  ordered: MemberGroup[],
  free: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
): MemberGroup[] {
  // Qué bloque contiene cada clave de entrada. Las dos formas que puede tomar
  // un ancla: `s:<sagaId>` (el bloque entero) e `i:<tipo>:<uuid>` (una obra, que
  // resuelve al bloque que la tiene). Las mismas claves que usan el editor de
  // secuencia y `deriveSagaMap`.
  const bloqueDeClave = new Map<string, MemberGroup>();
  for (const g of [...ordered, ...free]) {
    if (g.sagaId !== null) bloqueDeClave.set(`s:${g.sagaId}`, g);
    for (const m of g.members) bloqueDeClave.set(`i:${m.itemType}:${m.itemId}`, g);
  }

  // Ventana de un bloque `free`: su propia entrada `s:<sagaId>` si existe, y
  // si no, la de cualquier obra suya (`bloqueDeClave` ya resuelve una clave
  // `i:` al bloque que la contiene — se reutiliza en vez de indexar dos
  // veces). En producción el sujeto de una ventana es mayoritariamente una
  // OBRA, no el bloque entero: de las 5 ventanas reales, 3 tienen sujeto obra,
  // y dos de esas obras están dentro de un bloque `libre`.
  //
  // Determinismo si más de una ventana resolviera al mismo bloque (hoy nunca
  // pasa en producción, pero el resultado no puede depender del orden de
  // iteración de `Object.entries(windows)`): la ventana del propio bloque
  // (`s:`) manda si existe; entre varias de obra, la de la clave `i:` menor
  // por orden lexicográfico.
  const ventanaDelBloque = (g: MemberGroup): ResolvedWindow | undefined => {
    if (g.sagaId !== null) {
      const propia = windows[`s:${g.sagaId}`];
      if (propia !== undefined) return propia;
    }
    let mejorClave: string | null = null;
    for (const clave of Object.keys(windows)) {
      if (!clave.startsWith("i:")) continue;
      if (bloqueDeClave.get(clave) !== g) continue;
      if (mejorClave === null || clave < mejorClave) mejorClave = clave;
    }
    return mejorClave === null ? undefined : windows[mejorClave];
  };

  const resultado = [...ordered];
  // Cuántos libres se han insertado ya DETRÁS de cada ancla. Sin esto, dos
  // libres con la misma ancla salen en orden inverso: los dos calculan el mismo
  // índice de inserción y el segundo se cuela delante del primero.
  const detrasDe = new Map<MemberGroup, number>();
  let pendientes = [...free];

  // Pasadas mientras haya progreso: un libre anclado a otro libre solo se puede
  // colocar cuando el otro ya está en `resultado`. La primera pasada sin
  // progreso corta el bucle, y es también lo que impide que un ciclo cuelgue.
  for (;;) {
    const atascados: MemberGroup[] = [];
    let huboCambios = false;

    for (const g of pendientes) {
      const w = ventanaDelBloque(g);
      // `after` manda sobre `before`: «a partir de X» sitúa el bloque, mientras
      // que «antes de Y» solo pone un techo.
      const lado = w?.afterKey != null ? "after" : w?.beforeKey != null ? "before" : null;
      const clave = lado === "after" ? w!.afterKey! : lado === "before" ? w!.beforeKey! : null;
      const ancla = clave === null ? undefined : bloqueDeClave.get(clave);
      // -1 cubre tres casos de una vez, y a propósito: sin ventana, ancla rota
      // (apunta a algo que no está en el mapa) y ancla que todavía no se ha
      // colocado —incluido el bloque anclado a sí mismo—.
      const donde = ancla === undefined ? -1 : resultado.indexOf(ancla);
      if (donde === -1) {
        atascados.push(g);
        continue;
      }

      if (lado === "after") {
        const ya = detrasDe.get(ancla!) ?? 0;
        resultado.splice(donde + 1 + ya, 0, g);
        detrasDe.set(ancla!, ya + 1);
      } else {
        // `before` no necesita contador: insertar en el índice del ancla empuja
        // el ancla hacia abajo, así que el siguiente cae detrás del anterior y
        // el orden relativo se conserva solo.
        resultado.splice(donde, 0, g);
      }
      huboCambios = true;
    }

    if (!huboCambios) return [...resultado, ...atascados];
    if (atascados.length === 0) return resultado;
    pendientes = atascados;
  }
}

// Avance del hero (spec §1.5). El parámetro se llama `counted`: desde el
// 2026-07-25 (Task 5) NO recibe el orden principal, sino lo que get-saga-detail
// le pasa como countedKeys (./progress.ts), que cuenta la PERTENENCIA del
// subárbol (miembros no `optional`, deduplicados), no la secuencia de
// createMainOrder. Hasta el issue #91 esta función sumaba `g.members.length` y
// el hero decía 2/7 donde la card de biblioteca decía 2/5 sobre la misma saga.
//
// Las claves de un miembro `optional`, o de un bloque `optionalInParent`, ya
// no llegan hasta aquí: countedKeys las descarta antes de que esta función las
// vea. El issue #170 (nodos de grafo sin membresía real) queda resuelto de
// otra forma: countedKeys nunca mira el grafo, así que no puede reaparecer.
export function computeProgress(
  groups: MemberGroup[],
  counted: string[],
): {
  completed: number;
  total: number;
  pct: number;
  segments: Array<{ accent: SagaAccentToken; fraction: number }>;
} {
  const total = counted.length;
  if (total === 0) return { completed: 0, total: 0, pct: 0, segments: [] };

  const groupOf = new Map<string, MemberGroup>();
  for (const g of groups) {
    for (const m of g.members) groupOf.set(`${m.itemType}:${m.itemId}`, g);
  }

  let completed = 0;
  const doneByAccent = new Map<SagaAccentToken, number>();
  for (const k of counted) {
    const g = groupOf.get(k);
    if (g === undefined) continue;
    const member = g.members.find((m) => `${m.itemType}:${m.itemId}` === k);
    if (!isMemberCompleted(member)) continue;
    completed++;
    doneByAccent.set(g.accent, (doneByAccent.get(g.accent) ?? 0) + 1);
  }

  // Emitidos en orden de grupo (el mismo que pinta la pestaña Info), no en
  // orden de compleción.
  const segments: Array<{ accent: SagaAccentToken; fraction: number }> = [];
  for (const g of groups) {
    const done = doneByAccent.get(g.accent);
    if (done === undefined) continue;
    doneByAccent.delete(g.accent);
    segments.push({ accent: g.accent, fraction: done / total });
  }

  return { completed, total, pct: Math.round((completed / total) * 100), segments };
}

// Media comunitaria de la saga: media (1 decimal, escala 1-10 como el resto de
// la app) de las medias por título; por título cuenta el ÚLTIMO pase puntuado
// de cada usuario (reusa latestRatingPerUser de la ficha de obra).
export function averageSagaRating(
  rows: Array<{ itemKey: string; userId: string; rating: number; finishedOn: string; passId: string }>,
): number | null {
  const byItem = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byItem.get(r.itemKey) ?? [];
    list.push(r);
    byItem.set(r.itemKey, list);
  }
  const itemAvgs: number[] = [];
  for (const list of byItem.values()) {
    // latestRatingPerUser (src/lib/community/latest-rating.ts) espera
    // RatedPass = { id, userId, finishedOn, rating } en camelCase (no
    // snake_case: lo comprobamos contra la firma real antes de mapear aquí).
    const ratings = latestRatingPerUser(
      list.map((r) => ({ id: r.passId, rating: r.rating, finishedOn: r.finishedOn, userId: r.userId })),
    ).map((r) => r.rating);
    if (ratings.length === 0) continue;
    itemAvgs.push(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  }
  if (itemAvgs.length === 0) return null;
  return Math.round((itemAvgs.reduce((a, b) => a + b, 0) / itemAvgs.length) * 10) / 10;
}
