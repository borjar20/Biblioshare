import type { ItemType } from "@/lib/catalog/types";
import {
  SAGA_ACCENT_SEQUENCE,
  isSagaAccentToken,
  type SagaAccentToken,
} from "./accents";
import { createCuratedOrder } from "./curated-order";
import { compareBlocksByPlacement } from "./group-members";
import type { OrderWindow } from "./place-by-window";
import { countedKeys } from "./progress";
import type { SagaPlacement } from "./types";

// Cards de la pestaña «Sagas» de Mi Biblioteca (spec §4.3, frame COL). Todo
// puro: la capa de datos (get-followed-sagas) resuelve las filas. El
// DENOMINADOR del progreso vive en ./progress (countedKeys, spec 2026-07-25):
// pertenencia del subárbol, no orden. `createCuratedOrder` (./curated-order)
// se sigue usando aquí, pero solo para cosas de SECUENCIA: portadas del
// abanico y el bloque «siguiente».

export type LibSaga = {
  id: string;
  parentSagaId: string | null;
  name: string;
  accentColor: string | null;
  /** true = el bloque entero sale del denominador del PADRE, no del suyo. */
  optionalInParent: boolean;
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** Colocación del bloque en su padre (sagas.placement_in_parent). */
  placementInParent: SagaPlacement | null;
  /** El curador decide si ESTA saga enseña su mapa (fase 3, Task 4-bis,
   *  sagas.show_map) — igual que `hasGraph` en get-saga-detail.ts, el badge
   *  no puede salir solo de "el subárbol tiene miembros". */
  showMap: boolean;
};
export type LibMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
  /** true = NO cuenta en el denominador del progreso. */
  optional: boolean;
  /** Colocación de la obra en ESA saga. La consume la guarda «solo lo `libre`
   *  tiene ventana» de `createCuratedOrder`. */
  placement: SagaPlacement | null;
};
export type LibItemMeta = { itemType: ItemType; itemId: string; title: string; coverUrl: string | null; year: number | null };
// status = estado del pase ACTIVO (o "" sin pase activo); everCompleted = el
// usuario tiene ALGÚN pase completado del ítem. Dos campos porque una
// relectura es in_progress y completada a la vez: cuenta en el avance y sale
// como «leyendo ahora».
export type LibEntry = { itemType: ItemType; itemId: string; status: string; everCompleted: boolean; updatedAt: string };
export type LibRating = { itemType: ItemType; itemId: string; rating: number; finishedOn: string };
export type LibCreator = { itemType: ItemType; itemId: string; name: string };
// Ruta adoptada por el usuario en esa saga, ya resuelta a nombre (Task 7).
// routeName va en null cuando la elección es una ruta sintética (`lectura`,
// `publicacion`): no aporta nada anunciar «vas por Publicación».
export type LibRouteChoice = { sagaId: string; routeName: string | null };

export type NextBlock =
  | { kind: "reading"; itemType: ItemType; itemId: string; title: string; coverUrl: string | null }
  | { kind: "next"; itemType: ItemType; itemId: string; title: string; coverUrl: string | null }
  | { kind: "completed"; rating: number | null }
  // Hay obras (`order`/`tree` no vacíos) pero NINGUNA cuenta para el avance
  // (todas `optional`, o el único bloque es `optionalInParent`): ver Important
  // 1 del review de Task 5 (2ª ronda) junto a `total === 0` más abajo.
  | { kind: "allOptional" }
  | { kind: "empty" };

export type LibrarySagaCard = {
  sagaId: string;
  name: string;
  hasGraph: boolean;
  /** hasta 3 portadas del orden principal para el mini-abanico */
  covers: string[];
  dominantType: ItemType | null;
  creator: string | null;
  childrenCount: number;
  /** Ruta adoptada, ya resuelta a nombre; null sin elección o si es sintética. */
  routeName: string | null;
  progress: {
    completed: number;
    total: number;
    pct: number;
    /** solo universos (con hijas); las sagas simples pintan barra del tipo dominante */
    segments: Array<{ accent: SagaAccentToken; fraction: number }>;
  };
  next: NextBlock;
};

const key = (t: ItemType, i: string) => `${t}:${i}`;
const MAX_DEPTH = 4;

export function buildLibrarySagaCards(
  followedIds: string[],
  sagas: LibSaga[],
  memberships: LibMembership[],
  items: LibItemMeta[],
  entries: LibEntry[],
  ratings: LibRating[],
  creators: LibCreator[],
  // Opcional con default: parámetro añadido en la Task 7 sin romper las
  // llamadas existentes (tests) que aún no lo pasan.
  routeChoices: LibRouteChoice[] = [],
  // Ventanas del subárbol seguido, por clave de sujeto. Con `{}` el orden es
  // exactamente el de antes de esta fase.
  windows: Record<string, OrderWindow> = {},
): LibrarySagaCard[] {
  const sagaById = new Map(sagas.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, LibSaga[]>();
  for (const s of sagas) {
    if (s.parentSagaId === null || !sagaById.has(s.parentSagaId)) continue;
    const list = childrenByParent.get(s.parentSagaId) ?? [];
    list.push(s);
    childrenByParent.set(s.parentSagaId, list);
  }
  const membersBySaga = new Map<string, LibMembership[]>();
  for (const m of memberships) {
    const list = membersBySaga.get(m.sagaId) ?? [];
    list.push(m);
    membersBySaga.set(m.sagaId, list);
  }
  const metaByItem = new Map(items.map((i) => [key(i.itemType, i.itemId), i]));
  const entryByItem = new Map(entries.map((e) => [key(e.itemType, e.itemId), e]));
  // Último pase puntuado por ítem (finished_on máximo), como averageSagaRating.
  const ratingByItem = new Map<string, LibRating>();
  for (const r of ratings) {
    const k = key(r.itemType, r.itemId);
    const prev = ratingByItem.get(k);
    if (!prev || r.finishedOn > prev.finishedOn) ratingByItem.set(k, r);
  }
  const creatorByItem = new Map(creators.map((c) => [key(c.itemType, c.itemId), c.name]));
  const routeNameBySaga = new Map(routeChoices.map((c) => [c.sagaId, c.routeName]));

  const minPos = (sagaId: string) =>
    (membersBySaga.get(sagaId) ?? []).reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
  const titleOf = (k: string) => metaByItem.get(k)?.title ?? "";

  const mainOrder = createCuratedOrder(sagas, memberships, titleOf, windows);

  // Todos los ítems del subárbol (para «leyendo ahora» y recencia).
  function subtreeItems(sagaId: string, depth: number, visited: Set<string>): string[] {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return [];
    visited.add(sagaId);
    const out = (membersBySaga.get(sagaId) ?? []).map((m) => key(m.itemType, m.itemId));
    for (const c of childrenByParent.get(sagaId) ?? []) {
      out.push(...subtreeItems(c.id, depth + 1, visited));
    }
    return out;
  }

  const cards: Array<{ card: LibrarySagaCard; bucket: number; recency: string }> = [];

  for (const followedId of followedIds) {
    const root = sagaById.get(followedId);
    if (!root) continue;

    const order = mainOrder(followedId);              // orden: portadas y «siguiente»
    const counted = countedKeys(followedId, sagas, memberships); // denominador
    const tree = [...new Set(subtreeItems(followedId, 0, new Set()))];
    const total = counted.length;
    const isCompleted = (k: string) => entryByItem.get(k)?.everCompleted === true;
    const completed = counted.filter(isCompleted).length;

    // Segmentos por hija directa (universos): un ítem del orden pertenece a la
    // primera hija (por orden de grupo) en cuyo subárbol milite; el resto es
    // nexo (beige). Acentos: persistido manda; el fallback rota la secuencia
    // saltándose los usados, en orden de grupo (versión compacta de accentFor
    // de group-members).
    //
    // Issue #203 cerrada (fase 3, Task 4): `LibSaga` ya trae
    // `positionInParent`/`placementInParent` (get-followed-sagas.ts las
    // selecciona de `sagas`), así que este `sort` usa el MISMO comparador
    // exportado que `childGroups` en group-members.ts (`compareBlocksByPlacement`)
    // — colocación curada primero, `minPos` solo como desempate entre bloques
    // sin colocar. La card y la ficha ya no pueden discrepar en el ORDEN de
    // los bloques (ni pueden volver a discrepar en silencio: es una sola
    // función, no tres copias).
    const children = [...(childrenByParent.get(followedId) ?? [])].sort((a, b) =>
      compareBlocksByPlacement(a, b, (s) => minPos(s.id)),
    );
    const segments: Array<{ accent: SagaAccentToken; fraction: number }> = [];
    if (children.length > 0 && total > 0) {
      const used = new Set<SagaAccentToken>(
        children.flatMap((c) => (isSagaAccentToken(c.accentColor) ? [c.accentColor] : [])),
      );
      let rotation = 0;
      const accentFor = (c: LibSaga): SagaAccentToken => {
        if (isSagaAccentToken(c.accentColor)) return c.accentColor;
        while (
          used.size < SAGA_ACCENT_SEQUENCE.length &&
          used.has(SAGA_ACCENT_SEQUENCE[rotation % SAGA_ACCENT_SEQUENCE.length])
        ) {
          rotation++;
        }
        const token = SAGA_ACCENT_SEQUENCE[rotation % SAGA_ACCENT_SEQUENCE.length];
        used.add(token);
        rotation++;
        return token;
      };
      const childSets = children.map((c) => ({
        accent: accentFor(c),
        set: new Set(subtreeItems(c.id, 1, new Set())),
      }));
      const doneBy = new Map<SagaAccentToken, number>();
      for (const k of counted) {
        if (!isCompleted(k)) continue;
        const owner = childSets.find((cs) => cs.set.has(k));
        const accent: SagaAccentToken = owner ? owner.accent : "beige";
        doneBy.set(accent, (doneBy.get(accent) ?? 0) + 1);
      }
      for (const [accent, done] of doneBy) segments.push({ accent, fraction: done / total });
    }

    // Bloque «siguiente» (§4.3, estados excluyentes).
    let next: NextBlock;
    // DELIBERADO (Minor 5, review de Task 5, 2ª ronda): «reading» sale de
    // `tree` (todo el subárbol), no de `counted`, y por eso puede destacar una
    // obra `optional` que el lector tenga empezada aunque no mueva la barra.
    // No es la misma asimetría que se corrigió en «next» (Important 2): ahí
    // la card SUGIERE un paso, y sugerir algo que no cuenta es el descuadre
    // de los issues #91/#185. Aquí la card solo REPORTA un hecho (qué tienes
    // abierto ahora mismo) — no hay «paso» que proponer mal si el lector ya
    // lo eligió él solo.
    const reading = tree
      .map((k) => ({ k, e: entryByItem.get(k) }))
      .filter((x): x is { k: string; e: LibEntry } => x.e?.status === "in_progress")
      .sort((a, b) => (a.e.updatedAt < b.e.updatedAt ? 1 : -1))[0];
    if (reading) {
      const m = metaByItem.get(reading.k);
      const [itemType, itemId] = reading.k.split(":") as [ItemType, string];
      next = { kind: "reading", itemType, itemId, title: m?.title ?? "", coverUrl: m?.coverUrl ?? null };
    } else if (tree.length === 0) {
      // La saga no tiene NINGÚN miembro en su propio subárbol: ni siquiera
      // `tree` (que ignora `optional`/`optionalInParent` y ve TODO el
      // subárbol vía membresías) encuentra una obra.
      //
      // `order` (createCuratedOrder) tampoco puede tener nada aquí: fase 3
      // (Task 4) retiró el grafo, así que `order` y `tree` recorren
      // exactamente el mismo árbol (`sagas`/`memberships` desde `followedId`)
      // — el caso viejo del #170 (un nodo de grafo de ESTA saga apuntando a
      // un ítem miembro de OTRA saga seguida) ya no puede pasar.
      next = { kind: "empty" };
    } else if (total === 0) {
      // Important 1 (review de Task 5, 2ª ronda): `total` es `counted.length`
      // desde que el denominador dejó de salir de `order` (progress.ts). Con
      // `tree.length > 0` ya descartado arriba, llegar aquí solo puede
      // significar que TODAS las obras del subárbol son `optional` (o que el
      // único bloque hijo es `optionalInParent`): hay portadas (`order`/`tree`
      // no filtran por optional) pero ninguna obra cuenta para el avance.
      //
      // No es "empty" (mentiría: sí hay portadas y obras reales que mostrar,
      // el bug que reportó el reviewer — 2 portadas, 0/0, ningún bloque). No
      // es "completed" tampoco (mentiría en la otra dirección: nadie ha
      // terminado nada, un "✓ completada" sería falso). Y no hay un
      // "siguiente" honesto que proponer: proponer una obra optional es
      // exactamente el descuadre de #91/#185 que Important 2 vino a evitar.
      // Verdad para el lector: hay obras, pero ninguna le mueve la barra —
      // estado propio, ni vacío ni completo.
      next = { kind: "allOptional" };
    } else if (completed < total) {
      // El «siguiente» propone la próxima obra que ADEMÁS cuenta (decisión del
      // dueño del producto, review de Task 5, Important 2): una obra optional
      // no se exige, así que tampoco se empuja — proponerla es leer "b" en la
      // card y ver que la barra no se mueve, el descuadre de los issues
      // #91/#185. Por eso se recorre `order` (la secuencia curada) pero
      // filtrando primero a lo que está en `counted`.
      //
      // Fallback a `counted` sin filtrar: nacido del caso Mundodisco (grafo
      // sin ningún order_no dejaba `order` vacío con `counted` lleno). Fase 3
      // (Task 4) retiró el grafo, así que `order` ya no puede salir vacío
      // aquí (ya se descartó `tree.length === 0` arriba, y `order`/`tree`
      // recorren el mismo árbol) — se conserva como cinturón, no porque el
      // caso siga siendo alcanzable: sin él, `.find` devolvía undefined y
      // esto reventaba en vez de mostrar el número.
      const countedSet = new Set(counted);
      const orderCounted = order.filter((o) => countedSet.has(o));
      const k = orderCounted.find((o) => !isCompleted(o)) ?? counted.find((o) => !isCompleted(o))!;
      const m = metaByItem.get(k);
      const [itemType, itemId] = k.split(":") as [ItemType, string];
      next = { kind: "next", itemType, itemId, title: m?.title ?? "", coverUrl: m?.coverUrl ?? null };
    } else {
      // Misma causa raíz que el fallback de arriba: el denominador ya no sale
      // de `order`, así que la media tiene que leer de `counted` — con `order`
      // vacío (el caso Mundodisco, grafo sin order_no, ya no alcanzable desde
      // la fase 3) esto daba `rated: []` y la card mostraba "sin nota" tras
      // terminar la saga entera (Important 1 del review).
      const rated = counted
        .map((k) => ratingByItem.get(k)?.rating)
        .filter((r): r is number => r !== undefined);
      const rating = rated.length > 0
        ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
        : null;
      next = { kind: "completed", rating };
    }

    // Tipo y creador dominantes del orden principal (fallback: subárbol).
    const basis = order.length > 0 ? order : tree;
    const mode = <T,>(values: T[]): T | null => {
      const counts = new Map<T, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      let best: T | null = null;
      let bestCount = 0;
      for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
      return best;
    };
    const dominantType = mode(
      basis.flatMap((k) => (metaByItem.has(k) ? [metaByItem.get(k)!.itemType] : [])),
    );
    const creator = mode(basis.flatMap((k) => (creatorByItem.has(k) ? [creatorByItem.get(k)!] : [])));

    const recency = tree
      .map((k) => entryByItem.get(k)?.updatedAt ?? "")
      .reduce((max, u) => (u > max ? u : max), "");
    const started = completed > 0 || reading !== undefined;
    const allDone = total > 0 && completed === total;
    const bucket = allDone ? 2 : started ? 0 : 1;

    cards.push({
      bucket,
      recency,
      card: {
        sagaId: followedId,
        name: root.name,
        // Fase 3 (Task 4): ya no hay `saga_nodes` que consultar para saber si
        // "hay mapa". El mapa se DERIVA de lo curado (deriveSagaMap,
        // get-saga-detail.ts) y convierte CADA miembro del subárbol en un
        // nodo sin filtrar ninguno — así que "el mapa tiene algún nodo" es
        // exactamente "el subárbol tiene algún miembro", que es `tree` (ya
        // calculado arriba).
        //
        // Fase 3, Task 4-bis: eso dejó de ser suficiente por sí solo — "hay
        // nodo" pasó a ser casi siempre cierto y ya no distingue qué mapa
        // aporta. El curador decide con `root.showMap` (sagas.show_map);
        // mismo criterio que `detail.hasGraph` en la ficha
        // (`saga.showMap && graph !== null`), sin pagar el coste de
        // reconstruir groups/windows aquí solo para contar nodos.
        hasGraph: root.showMap && tree.length > 0,
        covers: basis
          .flatMap((k) => (metaByItem.get(k)?.coverUrl ? [metaByItem.get(k)!.coverUrl!] : []))
          .slice(0, 3),
        dominantType,
        creator,
        childrenCount: (childrenByParent.get(followedId) ?? []).length,
        routeName: routeNameBySaga.get(followedId) ?? null,
        progress: {
          completed,
          total,
          pct: total > 0 ? Math.round((completed / total) * 100) : 0,
          segments,
        },
        next,
      },
    });
  }

  return cards
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.bucket === 1) return a.card.name.localeCompare(b.card.name, "es");
      if (a.recency !== b.recency) return a.recency < b.recency ? 1 : -1;
      return a.card.name.localeCompare(b.card.name, "es");
    })
    .map((c) => c.card);
}
