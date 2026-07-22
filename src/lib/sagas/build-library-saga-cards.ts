import type { ItemType } from "@/lib/catalog/types";
import {
  SAGA_ACCENT_SEQUENCE,
  isSagaAccentToken,
  type SagaAccentToken,
} from "./accents";
import { createMainOrder } from "./main-order";

// Cards de la pestaña «Sagas» de Mi Biblioteca (spec §4.3, frame COL). Todo
// puro: la capa de datos (get-followed-sagas) resuelve las filas. La regla de
// cómputo es la de §1.5 y vive en ./main-order (compartida con el hero desde
// el issue #91): denominador = títulos del orden principal.

export type LibSaga = { id: string; parentSagaId: string | null; name: string; accentColor: string | null };
export type LibMembership = { sagaId: string; itemType: ItemType; itemId: string; position: number | null };
export type LibNode = {
  sagaId: string;
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  orderNo: number | null;
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
  nodes: LibNode[],
  items: LibItemMeta[],
  entries: LibEntry[],
  ratings: LibRating[],
  creators: LibCreator[],
  // Opcional con default: parámetro añadido en la Task 7 sin romper las
  // llamadas existentes (tests) que aún no lo pasan.
  routeChoices: LibRouteChoice[] = [],
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
  const nodesBySaga = new Map<string, LibNode[]>();
  for (const n of nodes) {
    const list = nodesBySaga.get(n.sagaId) ?? [];
    list.push(n);
    nodesBySaga.set(n.sagaId, list);
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

  const mainOrder = createMainOrder(sagas, memberships, nodes, titleOf);

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

    const order = mainOrder(followedId);
    const tree = [...new Set(subtreeItems(followedId, 0, new Set()))];
    const total = order.length;
    const isCompleted = (k: string) => entryByItem.get(k)?.everCompleted === true;
    const completed = order.filter(isCompleted).length;

    // Segmentos por hija directa (universos): un ítem del orden pertenece a la
    // primera hija (por orden de grupo) en cuyo subárbol milite; el resto es
    // nexo (beige). Acentos: persistido manda; el fallback rota la secuencia
    // saltándose los usados, en orden de grupo (versión compacta de accentFor
    // de group-members — puede divergir de la ficha solo sin accent persistido).
    const children = [...(childrenByParent.get(followedId) ?? [])].sort((a, b) => {
      const pa = minPos(a.id);
      const pb = minPos(b.id);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
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
      for (const k of order) {
        if (!isCompleted(k)) continue;
        const owner = childSets.find((cs) => cs.set.has(k));
        const accent: SagaAccentToken = owner ? owner.accent : "beige";
        doneBy.set(accent, (doneBy.get(accent) ?? 0) + 1);
      }
      for (const [accent, done] of doneBy) segments.push({ accent, fraction: done / total });
    }

    // Bloque «siguiente» (§4.3, estados excluyentes).
    let next: NextBlock;
    const reading = tree
      .map((k) => ({ k, e: entryByItem.get(k) }))
      .filter((x): x is { k: string; e: LibEntry } => x.e?.status === "in_progress")
      .sort((a, b) => (a.e.updatedAt < b.e.updatedAt ? 1 : -1))[0];
    if (reading) {
      const m = metaByItem.get(reading.k);
      const [itemType, itemId] = reading.k.split(":") as [ItemType, string];
      next = { kind: "reading", itemType, itemId, title: m?.title ?? "", coverUrl: m?.coverUrl ?? null };
    } else if (total === 0) {
      next = { kind: "empty" };
    } else if (completed < total) {
      const k = order.find((o) => !isCompleted(o))!;
      const m = metaByItem.get(k);
      const [itemType, itemId] = k.split(":") as [ItemType, string];
      next = { kind: "next", itemType, itemId, title: m?.title ?? "", coverUrl: m?.coverUrl ?? null };
    } else {
      const rated = order
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
        hasGraph: (nodesBySaga.get(followedId) ?? []).length > 0,
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
