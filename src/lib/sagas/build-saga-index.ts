import { SAGA_ACCENT_SEQUENCE, isSagaAccentToken, type SagaAccentToken } from "./accents";

export type SagaIndexSagaRow = {
  id: string;
  name: string;
  parent_saga_id: string | null;
  accent_color: string | null;
  cover_url: string | null;
};

export type SagaIndexMembershipRow = {
  saga_id: string;
  item_type: string;
  item_id: string;
};

export type SagaIndexChild = { id: string; name: string; accent: SagaAccentToken };

export type SagaIndexCard = {
  id: string;
  name: string;
  coverUrl: string | null;
  accent: SagaAccentToken;
  /** obras DISTINTAS (item_type+item_id) de la raíz y todos sus descendientes */
  titleCount: number;
  children: SagaIndexChild[];
};

// Índice de /sagas (spec fase 3.5 §1): tarjetas SOLO de las raíces; las
// subsagas van como chips de su raíz. Un ítem con membresía en varias sagas
// del mismo árbol cuenta una vez. `query` deja pasar una raíz si su nombre o
// el de cualquier descendiente contiene el texto (así «iron» encuentra UCM).
export function buildSagaIndex(
  sagas: SagaIndexSagaRow[],
  memberships: SagaIndexMembershipRow[],
  query = "",
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

    cards.push({
      id: root.id,
      name: root.name,
      coverUrl: root.cover_url,
      accent: isSagaAccentToken(root.accent_color) ? root.accent_color : "terracota",
      titleCount: titles.size,
      children,
    });
  }

  return cards.sort((a, b) => a.name.localeCompare(b.name, "es"));
}
