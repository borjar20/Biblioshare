# Rediseño del índice `/sagas` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar `/sagas` del shape simple actual (nombre, subsagas, contador, portada, seguir) al
diseño "Explorar sagas (A · Denso)" con datos reales: desglose de tipo, itinerarios, progreso,
colección, grafo derivado, filtros, vista Universos, orden y paginación por "Cargar más".

**Architecture:** Sin cambio de esquema. Toda la lógica nueva vive en funciones puras y
testeables (`build-saga-index.ts`, `filter-saga-index.ts`, `collapse-saga-children.ts`);
`get-saga-index.ts` sigue siendo solo glue de Supabase (sin tests propios, igual que hoy). El
filtrado/orden/paginación pasa en memoria sobre las cards ya construidas — el catálogo es
pequeño (~85 sagas en prod). Filtros reutilizan `FiltersDropdown` (ya usado por `/coleccion`),
no un componente nuevo.

**Tech Stack:** Next.js App Router (RSC), Supabase, next-intl, Vitest, Tailwind.

## Global Constraints

- Sin migraciones: todo se lee de `sagas`, `saga_items`, `passes`, `saga_routes`,
  `saga_route_choices` tal como existen hoy.
- `passes` es la ÚNICA fuente de "estado vivo del usuario" — nunca `library_entries`/`diary_entries`.
- El copy nuevo va en `messages/es.json` vía `useTranslations`/`getTranslations`, nunca hardcoded.
- Reutilizar clases Tailwind y patrones ya existentes en el repo (badges de
  `saga-library-card.tsx`, pills de `library-filters.tsx`) en vez de inventar estilos nuevos.
- `orden` (spec Fase 3) tiene un único valor válido (`alfabetico`) por ahora: no se renderiza un
  control de orden en la UI todavía — un desplegable con una sola opción sin alternativa es UI
  muerta. El contrato de querystring queda listo para un segundo valor cuando exista.
- Spec de referencia: `docs/superpowers/specs/2026-07-29-sagas-explorar-indice-rediseno-design.md`.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/sagas/build-saga-index.ts` | Modificar | Construye `SagaIndexCard[]` con los campos nuevos (tipo, grafo, itinerarios, progreso, colección) |
| `src/lib/sagas/build-saga-index.test.ts` | Modificar | Tests de lo anterior |
| `src/lib/sagas/collapse-saga-children.ts` | Crear | Helper puro: colapsa una lista a `max` visibles + resto |
| `src/lib/sagas/collapse-saga-children.test.ts` | Crear | Tests |
| `src/lib/sagas/filter-saga-index.ts` | Crear | Filtra `SagaIndexCard[]` por vista/tipo/itinerarios/colección/mínimo |
| `src/lib/sagas/filter-saga-index.test.ts` | Crear | Tests |
| `src/lib/sagas/get-saga-index.ts` | Modificar | Glue: añade las queries nuevas (routes, passes, route_choices) |
| `messages/es.json` | Modificar | Copy nuevo bajo `sagaIndex` |
| `src/components/saga/saga-index-card.tsx` | Crear | Tarjeta de saga del índice (badges, chips, progreso) |
| `src/components/saga/saga-index-filters.tsx` | Crear | Buscador + vista Todas/Sigo/Universos + `FiltersDropdown` |
| `src/app/sagas/page.tsx` | Modificar | Parseo de querystring, paginación, orquesta filtros+grid |

---

## Task 1: `SagaIndexCard` con los campos nuevos

**Files:**
- Modify: `src/lib/sagas/build-saga-index.ts`
- Modify: `src/lib/sagas/build-saga-index.test.ts`

**Interfaces:**
- Consumes: `countedKeys` de `./progress` (`countedKeys(rootId, sagas: ProgressSaga[], memberships: ProgressMembership[]): string[]`), `SYNTHETIC_SLUGS` de `./get-saga-routes`, `MEDIA_ACCENT`-independiente (no se usa aquí, el tipo por letra sale de `item_type` en crudo).
- Produces: `SagaIndexCard` (con `typeBreakdown`, `hasGraph`, `routeCount`, `progress`, `ownedCount`, `isFollowed`), `SagaIndexExtras`, `buildSagaIndex(sagas, memberships, query?, extras?)` — usados por Task 4 (glue) y Task 3 (filtro).

- [ ] **Step 1: Actualizar fixtures existentes (los tipos de fila ganan campos obligatorios)**

Sustituir el contenido completo de `src/lib/sagas/build-saga-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSagaIndex, type SagaIndexSagaRow, type SagaIndexMembershipRow } from "./build-saga-index";

const saga = (
  id: string,
  name: string,
  parent: string | null = null,
  accent: string | null = null,
  showMap = false,
): SagaIndexSagaRow => ({
  id,
  name,
  parent_saga_id: parent,
  accent_color: accent,
  cover_url: null,
  optional_in_parent: false,
  show_map: showMap,
});

const member = (
  saga_id: string,
  item_type: string,
  item_id: string,
  optional = false,
): SagaIndexMembershipRow => ({ saga_id, item_type, item_id, optional });

describe("buildSagaIndex", () => {
  it("solo las raíces tienen tarjeta, en orden alfabético", () => {
    const cards = buildSagaIndex(
      [saga("u", "Zeta"), saga("v", "Alfa"), saga("c", "Hija", "u")],
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(["Alfa", "Zeta"]);
    expect(cards[1].children.map((ch) => ch.name)).toEqual(["Hija"]);
  });

  it("titleCount agrega el árbol entero y deduplica la doble membresía", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [
        member("u", "movie", "m1"),
        member("c", "movie", "m2"),
        // m1 también es miembro directo de la hija: cuenta UNA vez
        member("c", "movie", "m1"),
      ],
    );
    expect(cards[0].titleCount).toBe(2);
  });

  it("acento de chip: persistido gana; sin persistir rota la secuencia", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("a", "A", "u", "purpura"), saga("b", "B", "u")],
      [],
    );
    expect(cards[0].children[0].accent).toBe("purpura");
    expect(cards[0].children[1].accent).toBe("verde");
  });

  it("children ordenados alfabéticamente aunque el input entre desordenado", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("b", "B", "u"), saga("a", "A", "u")],
      [],
    );
    expect(cards[0].children.map((c) => c.name)).toEqual(["A", "B"]);
    expect(cards[0].children[0].accent).toBe("terracota");
    expect(cards[0].children[1].accent).toBe("verde");
  });

  it("query filtra por nombre de la raíz o de cualquier descendiente", () => {
    const rows = [saga("u", "UCM"), saga("c", "Iron Man", "u"), saga("x", "Dune")];
    expect(buildSagaIndex(rows, [], "iron").map((c) => c.name)).toEqual(["UCM"]);
    expect(buildSagaIndex(rows, [], "dune").map((c) => c.name)).toEqual(["Dune"]);
    expect(buildSagaIndex(rows, [], "zzz")).toEqual([]);
  });

  it("huérfana (padre inexistente) se trata como raíz; un ciclo no cuelga", () => {
    expect(buildSagaIndex([saga("h", "Huérfana", "no-existe")], []).map((c) => c.name)).toEqual(["Huérfana"]);
    expect(buildSagaIndex([saga("a", "A", "b"), saga("b", "B", "a")], [])).toEqual([]);
  });

  it("typeBreakdown cuenta obras distintas del subárbol por tipo", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [member("u", "book", "b1"), member("u", "movie", "m1"), member("c", "book", "b2")],
    );
    expect(cards[0].typeBreakdown).toEqual({ book: 2, movie: 1, series: 0 });
  });

  it("hasGraph exige show_map Y al menos un título en el subárbol", () => {
    const conMapa = buildSagaIndex([saga("u", "U", null, null, true)], [member("u", "book", "b1")]);
    expect(conMapa[0].hasGraph).toBe(true);

    const sinTitulos = buildSagaIndex([saga("u", "U", null, null, true)], []);
    expect(sinTitulos[0].hasGraph).toBe(false);

    const sinInterruptor = buildSagaIndex([saga("u", "U", null, null, false)], [member("u", "book", "b1")]);
    expect(sinInterruptor[0].hasGraph).toBe(false);
  });

  it("routeCount cuenta las rutas curadas de esa saga (extras.routes)", () => {
    const cards = buildSagaIndex([saga("u", "U")], [], "", {
      isAuthenticated: false,
      routes: [
        { saga_id: "u", slug: "orden-recomendado", name: "Orden recomendado" },
        { saga_id: "u", slug: "rincewind", name: "Rincewind" },
        { saga_id: "otra", slug: "x", name: "X" },
      ],
      passes: [],
      routeChoices: [],
      followedIds: new Set(),
    });
    expect(cards[0].routeCount).toBe(2);
  });

  it("progress es null sin autenticar, y cuenta completed/total con passes", () => {
    const sagas = [saga("u", "U"), saga("c", "Hija", "u")];
    const memberships = [member("u", "book", "b1"), member("c", "book", "b2"), member("c", "book", "b3", true)];

    const anon = buildSagaIndex(sagas, memberships);
    expect(anon[0].progress).toBeNull();

    const auth = buildSagaIndex(sagas, memberships, "", {
      isAuthenticated: true,
      routes: [],
      passes: [
        { item_type: "book", item_id: "b1", status: "completed" },
        { item_type: "book", item_id: "b2", status: "in_progress" },
      ],
      routeChoices: [],
      followedIds: new Set(),
    });
    // b3 es optional: no cuenta en el denominador. Denominador = {b1,b2} = 2.
    expect(auth[0].progress).toEqual({ completed: 1, total: 2, pct: 50, readingLabel: null });
  });

  it("ownedCount cuenta el subárbol completo (incluye optional), 0 sin autenticar", () => {
    const sagas = [saga("u", "U"), saga("c", "Hija", "u")];
    const memberships = [member("u", "book", "b1"), member("c", "book", "b2", true)];

    const anon = buildSagaIndex(sagas, memberships);
    expect(anon[0].ownedCount).toBe(0);

    const auth = buildSagaIndex(sagas, memberships, "", {
      isAuthenticated: true,
      routes: [],
      passes: [
        { item_type: "book", item_id: "b1", status: "planned" },
        { item_type: "book", item_id: "b2", status: "planned" },
      ],
      routeChoices: [],
      followedIds: new Set(),
    });
    expect(auth[0].ownedCount).toBe(2);
  });

  it("readingLabel: ruta adoptada resuelta por nombre, sintética excluida", () => {
    const base = {
      isAuthenticated: true,
      routes: [{ saga_id: "u", slug: "orden-recomendado", name: "Orden recomendado" }],
      passes: [],
      followedIds: new Set<string>(),
    };
    const conRuta = buildSagaIndex([saga("u", "U")], [], "", {
      ...base,
      routeChoices: [{ saga_id: "u", route_slug: "orden-recomendado" }],
    });
    expect(conRuta[0].progress?.readingLabel).toBe("Orden recomendado");

    const sintetica = buildSagaIndex([saga("u", "U")], [], "", {
      ...base,
      routeChoices: [{ saga_id: "u", route_slug: "lectura" }],
    });
    expect(sintetica[0].progress?.readingLabel).toBeNull();
  });

  it("isFollowed refleja extras.followedIds", () => {
    const cards = buildSagaIndex([saga("u", "U"), saga("v", "V")], [], "", {
      isAuthenticated: true,
      routes: [],
      passes: [],
      routeChoices: [],
      followedIds: new Set(["u"]),
    });
    expect(cards.find((c) => c.id === "u")?.isFollowed).toBe(true);
    expect(cards.find((c) => c.id === "v")?.isFollowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (los nuevos campos no existen aún)**

Run: `npx vitest run src/lib/sagas/build-saga-index.test.ts`
Expected: FAIL — `Property 'typeBreakdown' does not exist` / assertions con `undefined`.

- [ ] **Step 3: Implementar en `build-saga-index.ts`**

Sustituir el contenido completo del archivo:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sagas/build-saga-index.test.ts`
Expected: PASS (todos los `it` en verde).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/build-saga-index.ts src/lib/sagas/build-saga-index.test.ts
git commit -m "feat(sagas): amplia build-saga-index con tipo/grafo/itinerarios/progreso/coleccion"
```

---

## Task 2: `collapseSagaChildren` (colapso de chips de subsaga)

**Files:**
- Create: `src/lib/sagas/collapse-saga-children.ts`
- Create: `src/lib/sagas/collapse-saga-children.test.ts`

**Interfaces:**
- Produces: `collapseSagaChildren<T>(items: T[], max: number): { visible: T[]; hiddenCount: number }` — usado por Task 6 (`SagaIndexCard` component).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/collapse-saga-children.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collapseSagaChildren } from "./collapse-saga-children";

describe("collapseSagaChildren", () => {
  it("con menos o igual que max, todo visible y sin resto", () => {
    expect(collapseSagaChildren([1, 2], 2)).toEqual({ visible: [1, 2], hiddenCount: 0 });
    expect(collapseSagaChildren([1], 2)).toEqual({ visible: [1], hiddenCount: 0 });
    expect(collapseSagaChildren([], 2)).toEqual({ visible: [], hiddenCount: 0 });
  });

  it("con más que max, corta y cuenta el resto", () => {
    expect(collapseSagaChildren([1, 2, 3, 4, 5, 6], 2)).toEqual({ visible: [1, 2], hiddenCount: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sagas/collapse-saga-children.test.ts`
Expected: FAIL — `Cannot find module './collapse-saga-children'`.

- [ ] **Step 3: Implementar**

Crear `src/lib/sagas/collapse-saga-children.ts`:

```ts
// Colapso genérico de listas largas de chips (subsagas del índice, spec Fase
// 2): las primeras `max` se muestran, el resto se resume en un contador.
export function collapseSagaChildren<T>(
  items: T[],
  max: number,
): { visible: T[]; hiddenCount: number } {
  if (items.length <= max) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, max), hiddenCount: items.length - max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sagas/collapse-saga-children.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/collapse-saga-children.ts src/lib/sagas/collapse-saga-children.test.ts
git commit -m "feat(sagas): helper collapseSagaChildren para chips de subsaga"
```

---

## Task 3: `filterSagaIndex` (vista, tipo, itinerarios, colección, mínimo)

**Files:**
- Create: `src/lib/sagas/filter-saga-index.ts`
- Create: `src/lib/sagas/filter-saga-index.test.ts`

**Interfaces:**
- Consumes: `SagaIndexCard` de `./build-saga-index` (campos `isFollowed`, `children`, `typeBreakdown`, `routeCount`, `ownedCount`, `titleCount`).
- Produces: `SagaIndexView` (`"todas" | "sigo" | "universos"`), `SagaIndexType` (`"libro" | "pelicula" | "serie"`), `SagaIndexFilterParams`, `filterSagaIndex(cards, params): SagaIndexCard[]` — usados por Task 7 (`SagaIndexFilters`) y Task 8 (`page.tsx`).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/filter-saga-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterSagaIndex, type SagaIndexFilterParams } from "./filter-saga-index";
import type { SagaIndexCard } from "./build-saga-index";

const baseParams: SagaIndexFilterParams = {
  vista: "todas",
  tipos: [],
  itinerarios: false,
  coleccion: false,
  min5: false,
};

const card = (overrides: Partial<SagaIndexCard>): SagaIndexCard => ({
  id: "id",
  name: "Nombre",
  coverUrl: null,
  accent: "terracota",
  titleCount: 3,
  children: [],
  typeBreakdown: { book: 3, movie: 0, series: 0 },
  hasGraph: false,
  routeCount: 0,
  progress: null,
  ownedCount: 0,
  isFollowed: false,
  ...overrides,
});

describe("filterSagaIndex", () => {
  it("sin filtros, devuelve todo igual", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    expect(filterSagaIndex(cards, baseParams)).toEqual(cards);
  });

  it("vista=sigo deja solo isFollowed", () => {
    const cards = [card({ id: "a", isFollowed: true }), card({ id: "b", isFollowed: false })];
    expect(filterSagaIndex(cards, { ...baseParams, vista: "sigo" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("vista=universos deja solo sagas con subsagas", () => {
    const cards = [
      card({ id: "a", children: [{ id: "x", name: "X", accent: "verde" }] }),
      card({ id: "b", children: [] }),
    ];
    expect(filterSagaIndex(cards, { ...baseParams, vista: "universos" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("tipo filtra por OR entre los tipos marcados", () => {
    const cards = [
      card({ id: "a", typeBreakdown: { book: 1, movie: 0, series: 0 } }),
      card({ id: "b", typeBreakdown: { book: 0, movie: 1, series: 0 } }),
      card({ id: "c", typeBreakdown: { book: 0, movie: 0, series: 1 } }),
    ];
    expect(
      filterSagaIndex(cards, { ...baseParams, tipos: ["libro", "pelicula"] }).map((c) => c.id),
    ).toEqual(["a", "b"]);
  });

  it("itinerarios exige routeCount > 0", () => {
    const cards = [card({ id: "a", routeCount: 1 }), card({ id: "b", routeCount: 0 })];
    expect(filterSagaIndex(cards, { ...baseParams, itinerarios: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("coleccion exige ownedCount > 0", () => {
    const cards = [card({ id: "a", ownedCount: 2 }), card({ id: "b", ownedCount: 0 })];
    expect(filterSagaIndex(cards, { ...baseParams, coleccion: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("min5 exige titleCount >= 5", () => {
    const cards = [card({ id: "a", titleCount: 5 }), card({ id: "b", titleCount: 4 })];
    expect(filterSagaIndex(cards, { ...baseParams, min5: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("los filtros se combinan por AND", () => {
    const cards = [
      card({ id: "a", isFollowed: true, routeCount: 1 }),
      card({ id: "b", isFollowed: true, routeCount: 0 }),
      card({ id: "c", isFollowed: false, routeCount: 1 }),
    ];
    expect(
      filterSagaIndex(cards, { ...baseParams, vista: "sigo", itinerarios: true }).map((c) => c.id),
    ).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sagas/filter-saga-index.test.ts`
Expected: FAIL — `Cannot find module './filter-saga-index'`.

- [ ] **Step 3: Implementar**

Crear `src/lib/sagas/filter-saga-index.ts`:

```ts
import type { SagaIndexCard } from "./build-saga-index";

export type SagaIndexView = "todas" | "sigo" | "universos";
export type SagaIndexType = "libro" | "pelicula" | "serie";

export const TYPE_TO_FIELD: Record<SagaIndexType, "book" | "movie" | "series"> = {
  libro: "book",
  pelicula: "movie",
  serie: "series",
};

export type SagaIndexFilterParams = {
  vista: SagaIndexView;
  tipos: SagaIndexType[];
  itinerarios: boolean;
  coleccion: boolean;
  min5: boolean;
};

// Filtra las cards YA construidas por build-saga-index (que ya vienen
// ordenadas alfabéticamente y con la búsqueda por texto aplicada) — spec
// Fase 3. No ordena: con un único valor de `orden` disponible, el orden de
// entrada ya es el correcto.
export function filterSagaIndex(
  cards: SagaIndexCard[],
  params: SagaIndexFilterParams,
): SagaIndexCard[] {
  return cards.filter((card) => {
    if (params.vista === "sigo" && !card.isFollowed) return false;
    if (params.vista === "universos" && card.children.length === 0) return false;
    if (
      params.tipos.length > 0 &&
      !params.tipos.some((t) => card.typeBreakdown[TYPE_TO_FIELD[t]] > 0)
    ) {
      return false;
    }
    if (params.itinerarios && card.routeCount === 0) return false;
    if (params.coleccion && card.ownedCount === 0) return false;
    if (params.min5 && card.titleCount < 5) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sagas/filter-saga-index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/filter-saga-index.ts src/lib/sagas/filter-saga-index.test.ts
git commit -m "feat(sagas): filterSagaIndex para vista/tipo/itinerarios/coleccion/min5"
```

---

## Task 4: `get-saga-index.ts` — queries nuevas (glue)

**Files:**
- Modify: `src/lib/sagas/get-saga-index.ts`

**Interfaces:**
- Consumes: `buildSagaIndex` y `SagaIndexExtras` de Task 1.
- Produces: `getSagaIndexData(supabase, query)` sin cambios de firma externa — `page.tsx` (Task 8) sigue llamándolo igual.

Este archivo es glue de Supabase sin lógica de negocio (la lógica ya vive, testeada, en
`build-saga-index.ts`) — sigue el patrón existente del repo de no tener test propio; se verifica
por inspección + la QA end-to-end de Task 10.

- [ ] **Step 1: Sustituir el contenido completo de `src/lib/sagas/get-saga-index.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, type UserRole } from "@/lib/auth/roles";
import { buildSagaIndex, type SagaIndexCard } from "./build-saga-index";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SagaIndexData = {
  cards: SagaIndexCard[];
  followedIds: Set<string>;
  isAuthenticated: boolean;
  viewerRole: UserRole | null;
};

// Datos del índice /sagas: catálogo completo de sagas + membresías en
// consultas planas (el catálogo de sagas es pequeño; agregar en JS evita
// aggregates de PostgREST), más rutas curadas, follows, pases activos y ruta
// adoptada del viewer si hay sesión (spec 2026-07-29: tipo/grafo/itinerarios/
// progreso/colección, todo derivado, sin tablas nuevas).
export async function getSagaIndexData(
  supabase: SupabaseServerClient,
  query: string,
): Promise<SagaIndexData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sagasRes, itemsRes, routesRes, followsRes, passesRes, choicesRes, viewerRole] =
    await Promise.all([
      supabase
        .from("sagas")
        .select("id, name, parent_saga_id, accent_color, cover_url, optional_in_parent, show_map"),
      supabase.from("saga_items").select("saga_id, item_type, item_id, optional"),
      supabase.from("saga_routes").select("saga_id, slug, name"),
      user
        ? supabase.from("saga_follows").select("saga_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { saga_id: string }[] }),
      user
        ? supabase
            .from("passes")
            .select("item_type, item_id, status")
            .eq("user_id", user.id)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as { item_type: string; item_id: string; status: string }[] }),
      user
        ? supabase.from("saga_route_choices").select("saga_id, route_slug").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { saga_id: string; route_slug: string }[] }),
      user ? getCurrentUserRole(supabase) : Promise.resolve(null),
    ]);

  const followedIds = new Set((followsRes.data ?? []).map((f) => f.saga_id));

  return {
    cards: buildSagaIndex(sagasRes.data ?? [], itemsRes.data ?? [], query, {
      isAuthenticated: user !== null,
      routes: routesRes.data ?? [],
      passes: passesRes.data ?? [],
      routeChoices: choicesRes.data ?? [],
      followedIds,
    }),
    followedIds,
    isAuthenticated: user !== null,
    viewerRole,
  };
}
```

- [ ] **Step 2: Verificar que el resto de la suite sigue en verde (este archivo no tiene test propio, pero un error de tipos rompería la compilación de otros tests que lo importan indirectamente)**

Run: `npx vitest run src/lib/sagas`
Expected: PASS (todos los tests de la carpeta, incluidos los de las Tasks 1-3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/sagas/get-saga-index.ts
git commit -m "feat(sagas): get-saga-index trae routes/passes/route_choices para el indice"
```

---

## Task 5: Copy nuevo en `messages/es.json`

**Files:**
- Modify: `messages/es.json`

**Interfaces:**
- Produces: claves bajo `sagaIndex.*` consumidas por Task 6 (`SagaIndexCard`) y Task 7 (`SagaIndexFilters`).

- [ ] **Step 1: Añadir las claves nuevas dentro del bloque `"sagaIndex": { ... }` (línea 1315), justo antes de `"errors": {`**

Buscar en `messages/es.json`:

```json
    "accentAuto": "Automático",
    "create": "Crear saga",
    "creating": "Creando…",
    "errors": {
```

Sustituir por:

```json
    "accentAuto": "Automático",
    "create": "Crear saga",
    "creating": "Creando…",
    "badgeUniverse": "Universo",
    "badgeGraph": "◆ Grafo",
    "badgeItineraries": "{count, plural, =1 {✦ 1 itinerario} other {✦ # itinerarios}}",
    "typeCount": {
      "book": "{count, plural, =1 {1 libro} other {# libros}}",
      "movie": "{count, plural, =1 {1 película} other {# películas}}",
      "series": "{count, plural, =1 {1 serie} other {# series}}"
    },
    "moreSubsagas": "{count, plural, =1 {+1 más} other {+# más}}",
    "ownedCount": "{count, plural, =1 {◐ 1 en tu colección} other {◐ # en tu colección}}",
    "readingLabel": "leyendo «{name}»",
    "view": {
      "todas": "Todas",
      "sigo": "Las que sigo",
      "universos": "Universos"
    },
    "filtersLabel": "Filtros",
    "filterTypeLabel": "Tipo",
    "filterOtherLabel": "Otros",
    "filterItineraries": "✦ Con itinerarios",
    "filterCollection": "◐ En mi colección",
    "filterMin5": "≥ 5 títulos",
    "clearFilters": "Limpiar",
    "showingCount": "Mostrando {shown} de {total} sagas con los filtros activos.",
    "loadMore": "Cargar más",
    "errors": {
```

- [ ] **Step 2: Validar que el JSON sigue siendo válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n(sagas): copy del rediseno del indice de sagas"
```

---

## Task 6: Componente `SagaIndexCard`

**Files:**
- Create: `src/components/saga/saga-index-card.tsx`

**Interfaces:**
- Consumes: `SagaIndexCard` (tipo) de `../../lib/sagas/build-saga-index`, `collapseSagaChildren` de Task 2, `SAGA_ACCENT` de `./accents`, `MEDIA_ACCENT` de `@/lib/catalog/media-accent`, `SagaFollowButton` (ya existente).
- Produces: `<SagaIndexCard card={...} isAuthenticated={...} />` — usado por Task 8 (`page.tsx`).

Componente presentacional (RSC async por `getTranslations`); sin lógica de negocio propia que
testear por separado — la única lógica (colapso de chips) ya la cubre el test de Task 2.
Verificación visual en Task 10 (qa-verifier).

- [ ] **Step 1: Crear `src/components/saga/saga-index-card.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaIndexCard as SagaIndexCardData } from "@/lib/sagas/build-saga-index";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { collapseSagaChildren } from "@/lib/sagas/collapse-saga-children";

const MAX_VISIBLE_CHILDREN = 2;
const TYPE_ORDER = ["book", "movie", "series"] as const;

export async function SagaIndexCard({
  card,
  isAuthenticated,
}: {
  card: SagaIndexCardData;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("sagaIndex");
  const tSaga = await getTranslations("saga");
  const { visible, hiddenCount } = collapseSagaChildren(card.children, MAX_VISIBLE_CHILDREN);
  const isUniverse = card.children.length > 0;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {/* Portada o placeholder con el acento de la saga. El Link va en
            portada+nombre, no en la tarjeta entera: el botón Seguir no puede
            anidarse dentro de un enlace. */}
        <Link href={`/saga/${card.id}`} className="shrink-0">
          {card.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.coverUrl}
              alt=""
              className="h-[84px] w-[56px] rounded-md object-cover"
            />
          ) : (
            <span
              aria-hidden
              className={`block h-[84px] w-[56px] rounded-md opacity-80 ${SAGA_ACCENT[card.accent].bg}`}
            />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <Link
              href={`/saga/${card.id}`}
              className="truncate font-serif text-[15.5px] font-semibold hover:underline"
            >
              {card.name}
            </Link>
            {isUniverse && (
              <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-muted-foreground uppercase">
                {t("badgeUniverse")}
              </span>
            )}
            {card.hasGraph && (
              <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-gold uppercase">
                {t("badgeGraph")}
              </span>
            )}
            {card.routeCount > 0 && (
              <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-accent uppercase">
                {t("badgeItineraries", { count: card.routeCount })}
              </span>
            )}
          </div>

          <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
            {tSaga("count", { count: card.titleCount })}
            {card.children.length > 0 && ` · ${tSaga("subsagas", { count: card.children.length })}`}
          </span>

          {(card.typeBreakdown.book > 0 || card.typeBreakdown.movie > 0 || card.typeBreakdown.series > 0) && (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
              {TYPE_ORDER.filter((type) => card.typeBreakdown[type] > 0).map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${MEDIA_ACCENT[type].bg}`} />
                  {t(`typeCount.${type}`, { count: card.typeBreakdown[type] })}
                </span>
              ))}
            </span>
          )}

          {card.children.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((child) => (
                <Link
                  key={child.id}
                  href={`/saga/${child.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span aria-hidden className={`h-2 w-2 rounded-full ${SAGA_ACCENT[child.accent].bg}`} />
                  {child.name}
                </Link>
              ))}
              {hiddenCount > 0 && (
                <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  {t("moreSubsagas", { count: hiddenCount })}
                </span>
              )}
            </div>
          )}

          {card.ownedCount > 0 && (
            <span className="w-fit rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              {t("ownedCount", { count: card.ownedCount })}
            </span>
          )}

          {card.progress && card.progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className={`block h-full rounded-full ${SAGA_ACCENT[card.accent].bg}`}
                  style={{ width: `${card.progress.pct}%` }}
                />
              </div>
              <span className="font-mono text-[9.5px] whitespace-nowrap text-muted-foreground">
                {card.progress.completed}/{card.progress.total}
                {card.progress.readingLabel &&
                  ` · ${t("readingLabel", { name: card.progress.readingLabel })}`}
              </span>
            </div>
          )}
        </div>
      </div>
      {isAuthenticated && <SagaFollowButton sagaId={card.id} isFollowing={card.isFollowed} />}
    </article>
  );
}
```

- [ ] **Step 2: Verificar que el proyecto sigue tipando bien**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos atribuibles a este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/saga-index-card.tsx
git commit -m "feat(sagas): componente SagaIndexCard con badges/progreso/chips"
```

---

## Task 7: Componente `SagaIndexFilters`

**Files:**
- Create: `src/components/saga/saga-index-filters.tsx`

**Interfaces:**
- Consumes: `SagaIndexFilterParams`, `SagaIndexView`, `SagaIndexType` de Task 3; `FiltersDropdown` (ya existente, `src/components/library/filters-dropdown.tsx`); `SearchIcon` (`@/components/ui/icons`).
- Produces: `<SagaIndexFilters search={...} params={...} />` — usado por Task 8 (`page.tsx`).

- [ ] **Step 1: Crear `src/components/saga/saga-index-filters.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/ui/icons";
import { FiltersDropdown } from "@/components/library/filters-dropdown";
import {
  TYPE_TO_FIELD,
  type SagaIndexFilterParams,
  type SagaIndexType,
  type SagaIndexView,
} from "@/lib/sagas/filter-saga-index";

const VIEWS: SagaIndexView[] = ["todas", "sigo", "universos"];
const TYPES: SagaIndexType[] = ["libro", "pelicula", "serie"];

function segClass(active: boolean) {
  return `flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
  }`;
}

function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

export async function SagaIndexFilters({
  search,
  params,
}: {
  search?: string;
  params: SagaIndexFilterParams;
}) {
  const t = await getTranslations("sagaIndex");
  const tSearch = await getTranslations("search");

  function buildHref(next: Partial<SagaIndexFilterParams>) {
    const merged = { ...params, ...next };
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (merged.vista !== "todas") qs.set("vista", merged.vista);
    if (merged.tipos.length > 0) qs.set("tipo", merged.tipos.join(","));
    if (merged.itinerarios) qs.set("itinerarios", "1");
    if (merged.coleccion) qs.set("coleccion", "1");
    if (merged.min5) qs.set("min5", "1");
    const qsStr = qs.toString();
    return `/sagas${qsStr ? `?${qsStr}` : ""}`;
  }

  function toggleTypeHref(type: SagaIndexType) {
    const tipos = params.tipos.includes(type)
      ? params.tipos.filter((x) => x !== type)
      : [...params.tipos, type];
    return buildHref({ tipos });
  }

  const activeCount =
    params.tipos.length +
    (params.itinerarios ? 1 : 0) +
    (params.coleccion ? 1 : 0) +
    (params.min5 ? 1 : 0);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Búsqueda server por query param (GET), patrón /buscar. */}
      <form action="/sagas" className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </form>

      {/* En móvil (<sm) apila: segmentado ancho completo, luego Filtros —
          spec Fase 5. En sm+ van en la misma fila. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full rounded-lg bg-surface-muted p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <Link key={v} href={buildHref({ vista: v })} className={segClass(params.vista === v)}>
              {t(`view.${v}`)}
            </Link>
          ))}
        </div>

        <FiltersDropdown label={t("filtersLabel")} activeCount={activeCount}>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("filterTypeLabel")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((type) => (
                <Link key={type} href={toggleTypeHref(type)} className={pillClass(params.tipos.includes(type))}>
                  {tSearch(`types.${TYPE_TO_FIELD[type]}`)}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("filterOtherLabel")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link href={buildHref({ itinerarios: !params.itinerarios })} className={pillClass(params.itinerarios)}>
                {t("filterItineraries")}
              </Link>
              <Link href={buildHref({ coleccion: !params.coleccion })} className={pillClass(params.coleccion)}>
                {t("filterCollection")}
              </Link>
              <Link href={buildHref({ min5: !params.min5 })} className={pillClass(params.min5)}>
                {t("filterMin5")}
              </Link>
            </div>
          </div>

          {activeCount > 0 && (
            <Link
              href={buildHref({ tipos: [], itinerarios: false, coleccion: false, min5: false })}
              className="self-start text-[11px] font-medium text-accent hover:underline"
            >
              {t("clearFilters")}
            </Link>
          )}
        </FiltersDropdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipado**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos atribuibles a este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/saga-index-filters.tsx
git commit -m "feat(sagas): componente SagaIndexFilters (vista + FiltersDropdown reusado)"
```

---

## Task 8: `page.tsx` — parseo de querystring, filtro, paginación

**Files:**
- Modify: `src/app/sagas/page.tsx`

**Interfaces:**
- Consumes: `getSagaIndexData` (Task 4), `filterSagaIndex`/`SagaIndexFilterParams`/`SagaIndexView`/`SagaIndexType` (Task 3), `SagaIndexFilters` (Task 7), `SagaIndexCard` component (Task 6).

- [ ] **Step 1: Sustituir el contenido completo de `src/app/sagas/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaIndexData } from "@/lib/sagas/get-saga-index";
import {
  filterSagaIndex,
  type SagaIndexFilterParams,
  type SagaIndexType,
  type SagaIndexView,
} from "@/lib/sagas/filter-saga-index";
import { SagaIndexFilters } from "@/components/saga/saga-index-filters";
import { SagaIndexCard } from "@/components/saga/saga-index-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Sagas — Biblioshare" };

const PAGE_SIZE = 12;
const VALID_VIEWS: SagaIndexView[] = ["todas", "sigo", "universos"];
const VALID_TYPES: SagaIndexType[] = ["libro", "pelicula", "serie"];

export default async function SagasIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    vista?: string;
    tipo?: string;
    itinerarios?: string;
    coleccion?: string;
    min5?: string;
    n?: string;
  }>;
}) {
  const raw = await searchParams;
  const query = raw.q?.trim() ?? "";
  const filterParams: SagaIndexFilterParams = {
    vista: VALID_VIEWS.includes(raw.vista as SagaIndexView) ? (raw.vista as SagaIndexView) : "todas",
    tipos: (raw.tipo?.split(",") ?? []).filter((v): v is SagaIndexType =>
      VALID_TYPES.includes(v as SagaIndexType),
    ),
    itinerarios: raw.itinerarios === "1",
    coleccion: raw.coleccion === "1",
    min5: raw.min5 === "1",
  };
  const n = Math.max(PAGE_SIZE, Number(raw.n) || PAGE_SIZE);

  const t = await getTranslations("sagaIndex");
  const supabase = await createClient();
  const data = await getSagaIndexData(supabase, query);
  const canCurate = hasMinRole(data.viewerRole, "collaborator");

  const filtered = filterSagaIndex(data.cards, filterParams);
  const visible = filtered.slice(0, n);

  function loadMoreHref() {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (filterParams.vista !== "todas") qs.set("vista", filterParams.vista);
    if (filterParams.tipos.length > 0) qs.set("tipo", filterParams.tipos.join(","));
    if (filterParams.itinerarios) qs.set("itinerarios", "1");
    if (filterParams.coleccion) qs.set("coleccion", "1");
    if (filterParams.min5) qs.set("min5", "1");
    qs.set("n", String(n + PAGE_SIZE));
    return `/sagas?${qs.toString()}`;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canCurate && (
          <Link
            href="/sagas/nueva"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ＋ {t("new")}
          </Link>
        )}
      </div>

      <SagaIndexFilters search={query || undefined} params={filterParams} />

      {visible.length === 0 ? (
        <EmptyState
          glyph={<SearchIcon className="h-7 w-7" />}
          title={t("emptyTitle")}
          message={t("emptyDescription")}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((card) => (
              <SagaIndexCard key={card.id} card={card} isAuthenticated={data.isAuthenticated} />
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <p className="text-[12.5px] text-muted-foreground">
              {t("showingCount", { shown: visible.length, total: filtered.length })}
            </p>
            {filtered.length > visible.length && (
              <Link
                href={loadMoreHref()}
                className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                {t("loadMore")}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tipado + suite completa**

Run: `npx tsc --noEmit && npx vitest run src/lib/sagas`
Expected: sin errores; toda la suite de `src/lib/sagas` en verde.

- [ ] **Step 3: Arrancar el dev server y comprobar manualmente `/sagas`**

Run: `npm run dev` (si no hay ya uno en 3000 — comprobar antes con
`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, matar si sobra, ver
higiene de entorno en AGENTS.md)

Visitar `http://localhost:3000/sagas` y comprobar: la tarjeta de una saga con subsagas muestra el
badge Universo, los pills de vista/filtros navegan (la URL cambia y la lista se filtra), y
"Cargar más" aparece solo si hay más de `PAGE_SIZE` resultados tras filtrar.

- [ ] **Step 4: Commit**

```bash
git add src/app/sagas/page.tsx
git commit -m "feat(sagas): pagina /sagas con filtros, vista y paginacion Cargar mas"
```

---

## Task 9: QA end-to-end + sincronización de documentación

**Files:** ninguno propio — este task dispara verificación y actualiza doc de estado (no de esquema, no hay migración).

- [ ] **Step 1: Verificación visual con el agente `qa-verifier`**

Pedir al agente `qa-verifier` que abra `/sagas` (desktop y viewport móvil ~390px) y compruebe:
- Card de universo (con subsagas) muestra badge Universo, chips de subsaga colapsados a 2 + "+N
  más" cuando hay más de 2.
- Con sesión iniciada y al menos una saga con pases activos: aparece el chip "◐ N en tu
  colección" y la barra de progreso con `completed/total`.
- Pills de tipo/itinerarios/colección/mínimo-títulos filtran de verdad (la URL cambia y la
  cuenta de "Mostrando X de Y" baja).
- Vista "Universos" deja solo cards con subsagas; vista "Las que sigo" exige sesión + follows.
- "Cargar más" incrementa la cantidad visible sin duplicar tarjetas.
- En viewport móvil (~390px): buscador ancho completo, segmentado Todas/Sigo/Universos ancho
  completo apilado ENCIMA de la fila Filtros (no al lado), `FiltersDropdown` se abre y cierra
  bien con el espacio disponible.

- [ ] **Step 2: Ejecutar la suite completa antes de cerrar**

Run: `npx vitest run`
Expected: PASS, sin regresiones en el resto del proyecto.

- [ ] **Step 3: Sincronizar documentación (regla de "definición de hecho" de AGENTS.md)**

Delegar al agente `backlog-scribe`: marcar en `docs/requirements/backlog.md`/`REQUIREMENTS.md`
que el rediseño del índice `/sagas` (spec `2026-07-29-sagas-explorar-indice-rediseno-design.md`)
está hecho, y registrar en `docs/requirements/decisiones.md` (append-only) la decisión de reusar
`FiltersDropdown` en vez de un sheet nuevo, y la de no paginar con cursor/offset real mientras el
catálogo sea pequeño — ambas tomadas durante esta implementación, no en el spec original.

- [ ] **Step 4: Commit final de docs (si `backlog-scribe` no comitea por su cuenta)**

```bash
git add docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs(sagas): cierra el rediseno del indice en backlog y decisiones"
```

---

## Self-Review (hecho al escribir este plan)

**Cobertura del spec:** Fase 1 (datos) → Tasks 1+4. Fase 2 (tarjeta) → Tasks 2+6. Fase 3
(toolbar/filtros) → Tasks 3+7. Fase 4 (paginación) → Task 8. Fase 5 (móvil) → clases responsive
ya incluidas en Task 7/8 (no hay task aparte: la revisión del código real durante este mismo
plan mostró que no hace falta componente nuevo, ver nota en el spec). Verificación → Task 9.

**Placeholders:** ninguno — cada step tiene código completo o comando+resultado esperado
concretos.

**Consistencia de tipos:** `SagaIndexCard` (Task 1) es el mismo shape consumido literalmente por
`filterSagaIndex` (Task 3), `SagaIndexCard` component (Task 6) y `page.tsx` (Task 8) — mismos
nombres de campo en los tres sitios (`typeBreakdown`, `hasGraph`, `routeCount`, `progress`,
`ownedCount`, `isFollowed`). `SagaIndexFilterParams`/`SagaIndexView`/`SagaIndexType` de Task 3 se
importan sin redefinir en Task 7 y Task 8.
