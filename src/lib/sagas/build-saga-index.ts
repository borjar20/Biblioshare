import type { ItemType } from "@/lib/catalog/types";
import { countedKeys, type ProgressMembership, type ProgressSaga } from "./progress";
import { SYNTHETIC_SLUGS } from "./get-saga-routes";
import { SAGA_ACCENT_SEQUENCE, isSagaAccentToken, type SagaAccentToken } from "./accents";

export type SagaIndexSagaRow = {
  id: string;
  name: string;
  parent_saga_id: string | null;
  accent_color: string | null;
  cover_url: string | null;
  optional_in_parent: boolean;
  show_map: boolean;
};

export type SagaIndexMembershipRow = {
  saga_id: string;
  item_type: string;
  item_id: string;
  optional: boolean;
};

export type SagaIndexRouteRow = { saga_id: string; slug: string; name: string };
export type SagaIndexPassRow = { item_type: string; item_id: string; status: string };
export type SagaIndexRouteChoiceRow = { saga_id: string; route_slug: string };

export type SagaIndexChild = { id: string; name: string; accent: SagaAccentToken };

export type SagaIndexProgress = {
  completed: number;
  total: number;
  pct: number;
  readingLabel: string | null;
};

export type SagaIndexCard = {
  id: string;
  name: string;
  coverUrl: string | null;
  accent: SagaAccentToken;
  /** obras DISTINTAS (item_type+item_id) de la raíz y todos sus descendientes */
  titleCount: number;
  children: SagaIndexChild[];
  typeBreakdown: { book: number; movie: number; series: number };
  hasGraph: boolean;
  routeCount: number;
  /** null si no hay usuario autenticado */
  progress: SagaIndexProgress | null;
  ownedCount: number;
  isFollowed: boolean;
};

export type SagaIndexExtras = {
  isAuthenticated: boolean;
  routes: SagaIndexRouteRow[];
  passes: SagaIndexPassRow[];
  routeChoices: SagaIndexRouteChoiceRow[];
  followedIds: Set<string>;
};

const EMPTY_EXTRAS: SagaIndexExtras = {
  isAuthenticated: false,
  routes: [],
  passes: [],
  routeChoices: [],
  followedIds: new Set(),
};

// Índice de /sagas (spec fase 3.5 §1, ampliado 2026-07-29): tarjetas SOLO de
// las raíces; las subsagas van como chips de su raíz. Un ítem con membresía
// en varias sagas del mismo árbol cuenta una vez. `query` deja pasar una raíz
// si su nombre o el de cualquier descendiente contiene el texto.
export function buildSagaIndex(
  sagas: SagaIndexSagaRow[],
  memberships: SagaIndexMembershipRow[],
  query = "",
  extras: SagaIndexExtras = EMPTY_EXTRAS,
): SagaIndexCard[] {
  const byId = new Map(sagas.map((s) => [s.id, s]));
  const byParent = new Map<string, SagaIndexSagaRow[]>();
  for (const s of sagas) {
    if (s.parent_saga_id === null || !byId.has(s.parent_saga_id)) continue;
    const siblings = byParent.get(s.parent_saga_id) ?? [];
    siblings.push(s);
    byParent.set(s.parent_saga_id, siblings);
  }

  const membersBySaga = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = membersBySaga.get(m.saga_id) ?? new Set<string>();
    set.add(`${m.item_type}:${m.item_id}`);
    membersBySaga.set(m.saga_id, set);
  }

  // Denominador de progreso: mismo criterio que progress.ts (countedKeys hace
  // su propio BFS interno por rootId sobre estas listas completas).
  const progressSagas: ProgressSaga[] = sagas.map((s) => ({
    id: s.id,
    parentSagaId: s.parent_saga_id,
    optionalInParent: s.optional_in_parent,
  }));
  const progressMemberships: ProgressMembership[] = memberships.map((m) => ({
    sagaId: m.saga_id,
    itemType: m.item_type as ItemType,
    itemId: m.item_id,
    optional: m.optional,
  }));

  const routeCountBySaga = new Map<string, number>();
  const curatedRouteNameBySlug = new Map<string, string>();
  for (const r of extras.routes) {
    routeCountBySaga.set(r.saga_id, (routeCountBySaga.get(r.saga_id) ?? 0) + 1);
    curatedRouteNameBySlug.set(`${r.saga_id}:${r.slug}`, r.name);
  }

  const completedKeys = new Set(
    extras.passes.filter((p) => p.status === "completed").map((p) => `${p.item_type}:${p.item_id}`),
  );
  const ownedKeys = new Set(extras.passes.map((p) => `${p.item_type}:${p.item_id}`));

  // Ruta adoptada por el usuario, igual que get-followed-sagas.ts: el slug
  // sintético (lectura/publicacion) no aporta, no tiene fila propia en
  // saga_routes y por tanto ya sale null del `.get` de abajo.
  const readingLabelBySaga = new Map<string, string>();
  for (const choice of extras.routeChoices) {
    if ((SYNTHETIC_SLUGS as readonly string[]).includes(choice.route_slug)) continue;
    const name = curatedRouteNameBySlug.get(`${choice.saga_id}:${choice.route_slug}`);
    if (name) readingLabelBySaga.set(choice.saga_id, name);
  }

  // Raíz: sin padre, o con padre que no está en el catálogo (defensivo).
  const roots = sagas.filter((s) => s.parent_saga_id === null || !byId.has(s.parent_saga_id));
  const normalized = query.trim().toLowerCase();

  const cards: SagaIndexCard[] = [];
  for (const root of roots) {
    // BFS con visitados: el trigger anti-ciclos ya lo impide en BD, pero un
    // ciclo aquí colgaría el render del índice entero.
    const tree: SagaIndexSagaRow[] = [];
    const queue = [root];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      tree.push(node);
      queue.push(...(byParent.get(node.id) ?? []));
    }

    if (normalized && !tree.some((s) => s.name.toLowerCase().includes(normalized))) continue;

    const titles = new Set<string>();
    for (const node of tree) {
      for (const key of membersBySaga.get(node.id) ?? []) titles.add(key);
    }

    const typeBreakdown = { book: 0, movie: 0, series: 0 };
    for (const key of titles) {
      const type = key.split(":")[0] as keyof typeof typeBreakdown;
      if (type in typeBreakdown) typeBreakdown[type]++;
    }

    // Orden alfabético estable para fijar también la rotación del acento
    const children = [...(byParent.get(root.id) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((child, i) => ({
        id: child.id,
        name: child.name,
        accent: isSagaAccentToken(child.accent_color)
          ? child.accent_color
          : SAGA_ACCENT_SEQUENCE[i % SAGA_ACCENT_SEQUENCE.length],
      }));

    let progress: SagaIndexProgress | null = null;
    if (extras.isAuthenticated) {
      const counted = countedKeys(root.id, progressSagas, progressMemberships);
      const completed = counted.filter((k) => completedKeys.has(k)).length;
      const total = counted.length;
      progress = {
        completed,
        total,
        pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        readingLabel: readingLabelBySaga.get(root.id) ?? null,
      };
    }

    cards.push({
      id: root.id,
      name: root.name,
      coverUrl: root.cover_url,
      accent: isSagaAccentToken(root.accent_color) ? root.accent_color : "terracota",
      titleCount: titles.size,
      children,
      typeBreakdown,
      hasGraph: root.show_map && titles.size > 0,
      routeCount: routeCountBySaga.get(root.id) ?? 0,
      progress,
      ownedCount: extras.isAuthenticated ? [...titles].filter((k) => ownedKeys.has(k)).length : 0,
      isFollowed: extras.followedIds.has(root.id),
    });
  }

  return cards.sort((a, b) => a.name.localeCompare(b.name, "es"));
}
