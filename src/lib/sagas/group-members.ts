import { latestRatingPerUser } from "@/lib/community/latest-rating";
import {
  SAGA_ACCENT_SEQUENCE,
  isSagaAccentToken,
  type SagaAccentToken,
} from "./accents";
import { isMemberCompleted } from "./completion";
import type { DetailMember, SagaChildRef, SagaPlacement } from "./types";

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
  const childGroups = children
    .filter((c) => buckets.has(c.id))
    .sort((a, b) => {
      if (a.positionInParent !== null && b.positionInParent !== null) {
        return a.positionInParent - b.positionInParent || a.name.localeCompare(b.name);
      }
      if (a.positionInParent !== null) return -1;
      if (b.positionInParent !== null) return 1;
      const ma = minPos(buckets.get(a.id)!);
      const mb = minPos(buckets.get(b.id)!);
      if (ma !== mb) return ma - mb;
      return a.name.localeCompare(b.name);
    });

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
