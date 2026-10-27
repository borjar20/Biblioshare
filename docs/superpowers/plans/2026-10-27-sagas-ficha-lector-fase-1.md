# Ficha de saga para el lector, fase 1: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.
> **Un implementador por árbol** (memoria del proyecto): las tareas se ejecutan en serie. Los revisores sí pueden ir en paralelo.

**Objetivo:** sustituir la ficha `/saga/[id]` (pestañas Info | Mapa) por la ficha nueva: hero cinemático, balda de orden con pilas por subsaga y minibarra, «Te toca», «Sobre la saga» y «Todas las obras».

**Arquitectura:** `deriveShelf`, una función pura, transforma las `TimelineSection` que ya produce `deriveTimeline` en el modelo de la balda. Un adaptador de servidor (`getShelfSections`) elige las secciones según el itinerario activo: lectura, publicación o curado. Los componentes solo pintan. Todo lo que hoy vive en la pestaña Mapa (timeline detallado, adoptar itinerario, saltar opcionales, lente de rol y grafo embebido) se muda a la página interina `/saga/[id]/como-leerla`, que el atlas (subproyecto 2) sustituirá.

**Stack:** Next.js 16 (App Router, RSC), React 19, Supabase, Tailwind v4, next-intl, Vitest + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-27-sagas-ficha-lector-design.md`](../specs/2026-10-27-sagas-ficha-lector-design.md)

## Restricciones globales

- **Sin migraciones ni cambios de esquema.** Si alguno pareciera necesario, se para y se consulta.
- **Sin `use cache`** en nada de este plan: todo depende de la sesión (regla #437 de `AGENTS.md`).
- El estado del lector sale de `passes` (vía `getSagaDetail`), **nunca** de `library_entries`.
- Copy, comentarios, issues y commits en **español**. Los textos nuevos van al namespace `saga` de `messages/es.json`.
- **Node 22:** el shell trae Node 20, que rompe vitest. En bash, antepón
  `export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH";` a cada comando `npx`/`npm`.
- **Next 16:** antes de usar una API de Next distinta de `redirect`, `notFound`, `Link` o `Image`, lee su guía en `node_modules/next/dist/docs/`.
- **Un solo `next dev`, en el puerto 3000**, arrancado a mano (memorias «Playwright: arrancar next dev a mano» y «Preview desde un worktree»). En un worktree, `npm run dev -- --webpack` si Turbopack no arranca por el junction de `node_modules`.
- Tokens de color del sistema Paper (`DESIGN.md`): `bg-accent`, `bg-green`, `bg-surface`, `bg-surface-muted`, `border-border`, `text-muted-foreground`, `--map-window`, `--map-tandem`. Nada de hex sueltos en componentes.
- Ancho de la ficha: `DETAIL_CONTAINER` (`src/components/detail/detail-container.ts`).

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/sagas/get-saga-detail.ts` | Modificar | Exponer `shelfGraph` (el grafo derivado, sin el interruptor `show_map`) |
| `src/lib/sagas/shelf-sections.ts` | Crear | `publicationSections` (pura) y `getShelfSections` (servidor): secciones según el itinerario activo |
| `src/lib/sagas/shelf-sections.test.ts` | Crear | Tests de `publicationSections` |
| `src/lib/sagas/derive-shelf.ts` | Crear | `deriveShelf`: modelo de la balda |
| `src/lib/sagas/derive-shelf.test.ts` | Crear | Tests de `deriveShelf` |
| `src/app/saga/[id]/como-leerla/page.tsx` | Crear | Página interina con el contenido de la vieja pestaña Mapa |
| `src/components/saga/saga-map-tab.tsx`, `route-selector.tsx`, `route-view.tsx` | Modificar | Los enlaces internos apuntan a `/como-leerla` |
| `src/lib/reactivity/revalidate.ts` | Modificar | `revalidateSagaPage` revalida también `/como-leerla` |
| `src/components/saga/ficha/hero-background.ts` (+ `.test.ts`) | Crear | `pickSagaHeroBackground` (pura) |
| `src/components/saga/ficha/saga-hero-cinematic.tsx` | Crear | Hero nuevo |
| `src/components/saga/ficha/saga-curator-menu.tsx` | Crear | Menú «⋯» de curador |
| `src/components/saga/ficha/saga-shelf.tsx` (+ `.test.tsx`) | Crear | Balda: pilas, slots, minibarra, chips y lista accesible |
| `src/components/saga/ficha/next-up-card.tsx` (+ `.test.tsx`) | Crear | «Te toca» |
| `src/components/saga/ficha/saga-about.tsx` | Crear | Sinopsis y columna de datos |
| `src/components/saga/saga-info.tsx` → `src/components/saga/ficha/saga-all-works.tsx` | Mover y recortar | Rejilla de todas las obras, con filtro |
| `src/components/saga/ficha/works-filter.tsx` | Crear | Filtro cliente tipo/estado |
| `src/app/saga/[id]/page.tsx` | Reescribir | Composición plana y redirección de `?tab=mapa` |
| `src/components/saga/saga-hero.tsx`, `saga-tabs.tsx` | Borrar | Sustituidos |
| `messages/es.json` | Modificar | Claves nuevas en `saga` |
| `e2e/sagas-*.spec.ts` (12 ficheros) | Modificar | De la pestaña a `/como-leerla` |
| `e2e/sagas-ficha-lector.spec.ts` | Crear | e2e de la ficha nueva |
| `docs/requirements/decisiones.md`, `backlog.md`, `docs/architecture/graph.json` | Modificar | Cierre documental |

---

### Tarea 1: `shelfGraph` y secciones por itinerario

**Ficheros:**
- Modificar: `src/lib/sagas/get-saga-detail.ts` (tipo `SagaDetail` hacia la línea 49; `return` hacia la línea 735)
- Crear: `src/lib/sagas/shelf-sections.ts`
- Test: `src/lib/sagas/shelf-sections.test.ts`

**Interfaces:**
- Consume: `deriveTimeline`, `TimelineSection`, `TimelineRow` (`src/lib/sagas/derive-timeline.ts`); `deriveSagaMap`, `MapLookup` (`derive-map.ts`); `getRouteEntries` (`get-saga-routes.ts`); `keyOfRouteEntry` (`hydrate-route-draft.ts`); `SagaGraph`, `SagaGraphNode` (`map-types.ts`); `DetailMember` (`types.ts`).
- Produce:
  - `SagaDetail.shelfGraph: SagaGraph`: siempre el grafo derivado, aunque `show_map` esté apagado (puede tener 0 nodos).
  - `publicationSections(graph: SagaGraph, members: DetailMember[]): TimelineSection[]`
  - `getShelfSections(supabase: SupabaseServerClient, detail: SagaDetail, activeRoute: string): Promise<TimelineSection[]>`

**Por qué `shelfGraph`:** `show_map` es la decisión del curador de no **enseñar el mapa**. La balda no es el mapa, y sin grafo no hay orden que pintar. `detail.graph` sigue igual para `/mapa` y para cualquier otro consumidor que mire `graph !== null`.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/lib/sagas/shelf-sections.test.ts
import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember } from "./types";
import { publicationSections } from "./shelf-sections";

function node(id: string, label: string): SagaGraphNode {
  return {
    id, kind: "item", x: 0, y: 0, level: "principal", orderNo: null, label,
    accent: "terracota", status: null, role: null, coverUrl: null, covers: [],
    href: `/libro/${id}`, memberCount: null, groupSagaId: null, groupName: null,
    step: null, tandem: null, windowReason: null, optional: false, skipped: false,
    ownerSagaId: "root",
  };
}

function member(itemId: string, title: string, year: number | null): DetailMember {
  return {
    itemType: "book", itemId, title, coverUrl: null, href: `/libro/${itemId}`,
    position: null, role: null, placement: null, optional: false,
    status: null, groupSagaId: null, ownerSagaId: "root", year, skipped: false,
  };
}

describe("publicationSections", () => {
  it("devuelve una sección con las obras por año de publicación y numeradas", () => {
    const graph: SagaGraph = {
      nodes: [node("i:book:b", "Dos"), node("i:book:a", "Uno"), node("i:book:c", "Sin año")],
      edges: [],
    };
    const members = [member("b", "Dos", 1970), member("a", "Uno", 1965), member("c", "Sin año", null)];

    const [section, ...rest] = publicationSections(graph, members);

    expect(rest).toHaveLength(0);
    expect(section.groupSagaId).toBeNull();
    expect(section.rows.map((r) => (r.kind === "entry" ? [r.no, r.node.label] : null))).toEqual([
      [1, "Uno"],
      [2, "Dos"],
      [3, "Sin año"],
    ]);
  });

  it("sin nodos devuelve una lista vacía", () => {
    expect(publicationSections({ nodes: [], edges: [] }, [])).toEqual([]);
  });

  it("omite un miembro sin nodo en el grafo en lugar de inventarlo", () => {
    const graph: SagaGraph = { nodes: [node("i:book:a", "Uno")], edges: [] };
    const [section] = publicationSections(graph, [member("a", "Uno", 1965), member("z", "Huérfano", 1990)]);
    expect(section.rows).toHaveLength(1);
  });
});
```

- [ ] **Paso 2: ejecutar el test y ver que falla**

Ejecuta: `npx vitest run src/lib/sagas/shelf-sections.test.ts`
Esperado: FAIL, «Cannot find module './shelf-sections'» o similar.

- [ ] **Paso 3: implementar `shelf-sections.ts`**

Comprueba antes el orden que da `sortByPublication` (`derive-timeline.ts:403`). Los años `null` deben ir al final. Si no los pone ahí, el test lo detecta: no lo dupliques, reutilízalo.

```ts
// src/lib/sagas/shelf-sections.ts
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { deriveSagaMap, type MapLookup } from "./derive-map";
import { deriveTimeline, sortByPublication, type TimelineSection } from "./derive-timeline";
import type { SagaDetail } from "./get-saga-detail";
import { getRouteEntries } from "./get-saga-routes";
import { keyOfRouteEntry } from "./hydrate-route-draft";
import type { SagaGraph } from "./map-types";
import type { DetailMember } from "./types";

// Secciones de la balda según el itinerario activo (spec 2026-10-27 §2/§4).
// Los tres caminos acaban en `TimelineSection[]` para que `deriveShelf` tenga
// UNA sola entrada: el orden curado y los itinerarios ya los calcula
// `deriveTimeline`, y aquí no se recalcula nada, solo se elige.

/** Orden «Publicación»: una sola sección, por año, numerada 1..N. Los nodos
 *  salen del grafo (no se fabrican desde el miembro) para que estado, rol,
 *  portada y opcionalidad sean exactamente los del resto de la ficha. */
export function publicationSections(graph: SagaGraph, members: DetailMember[]): TimelineSection[] {
  if (graph.nodes.length === 0) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const rows = sortByPublication(members)
    .map((m) => byId.get(`i:${m.itemType}:${m.itemId}`))
    .filter((n) => n !== undefined)
    .map((node, i) => ({ kind: "entry" as const, no: i + 1, node, branches: [] }));
  if (rows.length === 0) return [];
  return [{ groupSagaId: null, groupName: null, accent: rows[0].node.accent, continuation: false, rows }];
}

/** Elige las secciones del itinerario activo. Sin `use cache` (regla #437):
 *  `detail` lleva estados del lector. */
export async function getShelfSections(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  activeRoute: string,
): Promise<TimelineSection[]> {
  const opts = { authenticated: detail.isAuthenticated, showOptional: detail.showOptionalReadings };
  if (activeRoute === "publicacion") {
    return publicationSections(detail.shelfGraph, detail.groups.flatMap((g) => g.members));
  }
  if (activeRoute === "lectura") {
    return deriveTimeline(detail.shelfGraph, opts);
  }
  const row = detail.routes.find((r) => r.slug === activeRoute);
  if (row?.id === undefined) return deriveTimeline(detail.shelfGraph, opts);
  // Misma construcción que SagaMapTab para una ruta curada: el grafo derivado
  // con los pasos del itinerario, y la columna por PASOS (spine "route").
  const entries = await getRouteEntries(supabase, row.id);
  const lookup: MapLookup = {
    groupAccent: new Map(detail.groups.map((g) => [g.sagaId, g.accent] as const)),
    groupName: new Map(detail.groups.map((g) => [g.sagaId, g.name] as const)),
  };
  const routeGraph = deriveSagaMap(detail.groups, detail.windows, lookup, entries.map(keyOfRouteEntry));
  return deriveTimeline(routeGraph, { ...opts, spine: "route" });
}
```

Si `SupabaseServerClient` no se exporta desde `@/lib/supabase/server`, importa el tipo del mismo sitio del que lo importa `get-saga-detail.ts` (busca `SupabaseServerClient` en su cabecera).

- [ ] **Paso 4: añadir `shelfGraph` a `SagaDetail`**

En `src/lib/sagas/get-saga-detail.ts`, dentro de `export type SagaDetail = { … }`, justo después de `hasGraph: boolean;`:

```ts
  /** El grafo derivado SIN el interruptor `show_map` (spec 2026-10-27 §4): la
   *  balda de la ficha pinta el orden aunque el curador haya escondido el
   *  MAPA. Puede llegar con 0 nodos (saga vacía). Para «¿se enseña el mapa?»
   *  sigue mandando `graph`. */
  shelfGraph: SagaGraph;
```

Y en el objeto que devuelve `getSagaDetail`, después de `hasGraph,`:

```ts
    shelfGraph: derivedGraph,
```

- [ ] **Paso 5: ejecutar los tests y el typecheck**

Ejecuta: `npx vitest run src/lib/sagas/shelf-sections.test.ts src/lib/sagas/get-saga-detail.test.ts`
Esperado: PASS.
Ejecuta: `npx tsc --noEmit -p .`
Esperado: sin errores. Si algún mock de `SagaDetail` en un test (`grep -rln "hasGraph:" src --include=*.test.ts*`) se queja de que falta `shelfGraph`, añádele `shelfGraph: { nodes: [], edges: [] }`.

- [ ] **Paso 6: commit**

```bash
git add src/lib/sagas/shelf-sections.ts src/lib/sagas/shelf-sections.test.ts src/lib/sagas/get-saga-detail.ts
git add -u src
git commit -m "feat(sagas): shelfGraph y secciones de la balda por itinerario"
```

---

### Tarea 2: `deriveShelf`

**Ficheros:**
- Crear: `src/lib/sagas/derive-shelf.ts`
- Test: `src/lib/sagas/derive-shelf.test.ts`

**Interfaces:**
- Consume: `TimelineSection`, `TimelineRow` (`derive-timeline.ts`), `SagaGraphNode` (`map-types.ts`), `SagaAccentToken` (`accents.ts`), `SagaItemRole` (`types.ts`).
- Produce (exportado exactamente con estos nombres):

```ts
export type ShelfWorkState = "done" | "now" | "todo";
export type ShelfWork = {
  key: string;            // id del nodo, `i:<tipo>:<uuid>`
  title: string;
  href: string;
  coverUrl: string | null;
  state: ShelfWorkState;
  role: SagaItemRole | null;
  optional: boolean;
  skipped: boolean;
  no: number | null;      // número visible del timeline (no se renumera)
};
export type ShelfSlot =
  | { kind: "work"; work: ShelfWork }
  | { kind: "tandem"; works: ShelfWork[] }
  | {
      kind: "window";
      work: ShelfWork;
      afterTitle: string | null;
      beforeTitle: string | null;
      /** Índices (en `slots` del mismo grupo) de las anclas, o null si el ancla
       *  está en otro grupo o no existe. El componente dibuja el arco entre ellos. */
      spanFrom: number | null;
      spanTo: number | null;
      /** El lector está dentro del tramo y no la ha leído. */
      fitsNow: boolean;
    };
export type ShelfGroupState = "done" | "current" | "future";
export type ShelfGroup = {
  key: string;            // groupSagaId, "root" para miembros directos; "#n" si se repite
  name: string | null;    // null = miembros directos (el componente pone el nombre de la saga)
  accent: SagaAccentToken;
  state: ShelfGroupState;
  counted: number;        // obras que cuentan (no opcionales)
  completed: number;      // de esas, leídas
  slots: ShelfSlot[];     // en orden; opcionales con número incluidas
  extras: ShelfWork[];    // opcionales sin número (ramas): tras un separador
  pileCovers: string[];   // hasta 3 portadas para la pila
};
export type ShelfMode = "next" | "start" | "finished" | "allOptional" | "empty";
export type Shelf = {
  mode: ShelfMode;
  groups: ShelfGroup[];
  openGroupKey: string | null;
  nextUp: { work: ShelfWork; groupName: string | null; fitsNow: ShelfWork | null } | null;
  segments: Array<{ groupKey: string; weight: number; done: number; hasNow: boolean }>;
};
export function deriveShelf(sections: TimelineSection[], opts: { authenticated: boolean }): Shelf;
```

**Reglas** (cada una con su test):
1. Grupos: las secciones **consecutivas** con el mismo `groupSagaId` se funden en un grupo. Si una sección reaparece más tarde (`continuation`), forma otro grupo con clave `"<id>#2"`.
2. Filas: `entry` → slot `work`; `tandem` → slot `tandem`; `window` → slot `window`; `bridge` → slot `work`. Las `branches` de una fila: si `node.optional`, van a `extras` del grupo; si no, se añaden como slot `work` justo detrás de su fila.
3. Estado de obra: `completed` → `done`. Exactamente **una** obra del total es `now`: la primera con `in_progress` en orden de slots; si no hay ninguna, la primera no `done`, no opcional, no `skipped` y **que no sea sujeto de una ventana**. Una ventana es flexible por definición: se ofrece como «encaja ahora», nunca como «te toca». Los extras no cuentan. El resto, `todo`.
4. Sin sesión (`authenticated: false`): ninguna obra es `now`. `mode` es `"start"` y `nextUp` es la primera obra no opcional.
5. `mode`: sin obras → `"empty"`; con sesión y 0 obras que cuentan → `"allOptional"`; todas las que cuentan, leídas → `"finished"` (y `nextUp` null); si no, `"next"`.
6. Estado de grupo: contiene la obra `now` → `current`; `counted > 0 && completed === counted` → `done`; si no, `future`.
7. `openGroupKey`: el grupo `current`; si no lo hay, el primero no `done`; si todos lo están, el último.
8. `fitsNow` de una ventana: `row.track?.notice === "dentro"` y la obra no está `done`. `nextUp.fitsNow` es la primera ventana con `fitsNow`.
9. `segments`: uno por grupo, `weight` = número de obras de sus slots (los tándems cuentan sus obras), `done` = obras `done` de sus slots, `hasNow` si contiene la obra `now`.
10. `pileCovers`: las 3 primeras portadas no nulas de los slots del grupo.

- [ ] **Paso 1: escribir los tests que fallan**

```ts
// src/lib/sagas/derive-shelf.test.ts
import { describe, expect, it } from "vitest";
import type { TimelineRow, TimelineSection } from "./derive-timeline";
import type { SagaGraphNode } from "./map-types";
import { deriveShelf } from "./derive-shelf";

function n(id: string, extra: Partial<SagaGraphNode> = {}): SagaGraphNode {
  return {
    id: `i:book:${id}`, kind: "item", x: 0, y: 0, level: "principal", orderNo: 0,
    label: id.toUpperCase(), accent: "terracota", status: null, role: null,
    coverUrl: `/c/${id}.jpg`, covers: [], href: `/libro/${id}`, memberCount: null,
    groupSagaId: null, groupName: null, step: null, tandem: null, windowReason: null,
    optional: false, skipped: false, ownerSagaId: "root", ...extra,
  };
}
const entry = (
  node: SagaGraphNode,
  no: number | null = null,
  branches: Array<{ node: SagaGraphNode; edgeType: "opcional" | "requisito" }> = [],
): TimelineRow => ({ kind: "entry", no, node, branches });
function sec(rows: TimelineRow[], groupSagaId: string | null = null, groupName: string | null = null, continuation = false): TimelineSection {
  return { groupSagaId, groupName, accent: "terracota", continuation, rows };
}
const auth = { authenticated: true };

describe("deriveShelf", () => {
  it("saga simple: la primera no leída es «ahora» y el modo es next", () => {
    const shelf = deriveShelf([sec([
      entry(n("a", { status: "completed" }), 1),
      entry(n("b"), 2),
      entry(n("c"), 3),
    ])], auth);
    expect(shelf.mode).toBe("next");
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
    const states = shelf.groups[0].slots.map((s) => (s.kind === "work" ? s.work.state : null));
    expect(states).toEqual(["done", "now", "todo"]);
    expect(shelf.groups[0]).toMatchObject({ state: "current", counted: 3, completed: 1, key: "root" });
  });

  it("una obra en curso gana a la primera no leída", () => {
    const shelf = deriveShelf([sec([entry(n("a"), 1), entry(n("b", { status: "in_progress" }), 2)])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
  });

  it("universo: grupos por subsaga, estados done/current/future y grupo abierto", () => {
    const shelf = deriveShelf([
      sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
      sec([entry(n("b", { status: "completed" }), 2), entry(n("c"), 3)], "s2", "Dos"),
      sec([entry(n("d"), 4)], "s3", "Tres"),
    ], auth);
    expect(shelf.groups.map((g) => [g.key, g.state])).toEqual([["s1", "done"], ["s2", "current"], ["s3", "future"]]);
    expect(shelf.openGroupKey).toBe("s2");
    expect(shelf.segments).toEqual([
      { groupKey: "s1", weight: 1, done: 1, hasNow: false },
      { groupKey: "s2", weight: 2, done: 1, hasNow: true },
      { groupKey: "s3", weight: 1, done: 0, hasNow: false },
    ]);
  });

  it("funde secciones consecutivas del mismo grupo y separa una continuación posterior", () => {
    const shelf = deriveShelf([
      sec([entry(n("a"), 1)], "s1", "Uno"),
      sec([entry(n("b"), 2)], "s1", "Uno"),
      sec([entry(n("c"), 3)], "s2", "Dos"),
      sec([entry(n("d"), 4)], "s1", "Uno", true),
    ], auth);
    expect(shelf.groups.map((g) => g.key)).toEqual(["s1", "s2", "s1#2"]);
    expect(shelf.groups[0].slots).toHaveLength(2);
  });

  it("tándem: un slot con varias obras que cuentan por separado", () => {
    const shelf = deriveShelf([sec([
      entry(n("a", { status: "completed" }), 1),
      { kind: "tandem", no: 2, nodes: [n("b"), n("c")], mode: "simultaneo", note: null, branches: [] },
    ])], auth);
    const slot = shelf.groups[0].slots[1];
    expect(slot.kind).toBe("tandem");
    expect(slot.kind === "tandem" && slot.works.map((w) => w.state)).toEqual(["now", "todo"]);
    expect(shelf.segments[0].weight).toBe(3);
  });

  it("ventana: índices de anclas, nunca es «ahora», y «encaja ahora» cuando el lector está dentro", () => {
    const a = n("a", { status: "completed" });
    const c = n("c");
    const shelf = deriveShelf([sec([
      entry(a, 1),
      { kind: "window", no: null, node: n("w"), after: a, before: c, reason: null,
        track: { fromPct: 0, toPct: 100, youPct: 50, notice: "dentro" } },
      entry(c, 2),
    ])], auth);
    const w = shelf.groups[0].slots[1];
    expect(w).toMatchObject({ kind: "window", afterTitle: "A", beforeTitle: "C", spanFrom: 0, spanTo: 2, fitsNow: true });
    expect(shelf.nextUp?.work.key).toBe("i:book:c");
    expect(shelf.nextUp?.fitsNow?.key).toBe("i:book:w");
  });

  it("ramas: las opcionales van a extras y las no opcionales siguen a su fila", () => {
    const shelf = deriveShelf([sec([
      entry(n("a"), 1, [
        { node: n("x", { optional: true, orderNo: null }), edgeType: "opcional" },
        { node: n("r", { orderNo: null }), edgeType: "requisito" },
      ]),
      entry(n("b"), 2),
    ])], auth);
    const g = shelf.groups[0];
    expect(g.extras.map((w) => w.key)).toEqual(["i:book:x"]);
    expect(g.slots.map((s) => (s.kind === "work" ? s.work.key : ""))).toEqual(["i:book:a", "i:book:r", "i:book:b"]);
  });

  it("rol y opcional con número se conservan en el slot", () => {
    const shelf = deriveShelf([sec([entry(n("a", { role: "spinoff", optional: true }), 1)])], auth);
    const s = shelf.groups[0].slots[0];
    expect(s.kind === "work" && [s.work.role, s.work.optional]).toEqual(["spinoff", true]);
  });

  it("todo leído: modo finished, sin nextUp, grupo abierto el último", () => {
    const shelf = deriveShelf([
      sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
      sec([entry(n("b", { status: "completed" }), 2)], "s2", "Dos"),
    ], auth);
    expect(shelf.mode).toBe("finished");
    expect(shelf.nextUp).toBeNull();
    expect(shelf.openGroupKey).toBe("s2");
  });

  it("todo opcional: modo allOptional", () => {
    const shelf = deriveShelf([sec([entry(n("a", { optional: true }), 1)])], auth);
    expect(shelf.mode).toBe("allOptional");
  });

  it("sin sesión: nadie está en «ahora» y nextUp es la primera que cuenta", () => {
    const shelf = deriveShelf([sec([entry(n("o", { optional: true }), 1), entry(n("a"), 2), entry(n("b"), 3)])], { authenticated: false });
    expect(shelf.mode).toBe("start");
    expect(shelf.nextUp?.work.key).toBe("i:book:a");
    const states = shelf.groups[0].slots.map((s) => (s.kind === "work" ? s.work.state : null));
    expect(states).toEqual(["todo", "todo", "todo"]);
  });

  it("una obra saltada no puede ser «ahora»", () => {
    const shelf = deriveShelf([sec([entry(n("a", { optional: true, skipped: true }), 1), entry(n("b"), 2)])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
  });

  it("sin secciones: modo empty", () => {
    expect(deriveShelf([], auth)).toMatchObject({ mode: "empty", groups: [], nextUp: null, openGroupKey: null });
  });

  it("pila: hasta tres portadas no nulas", () => {
    const shelf = deriveShelf([sec([entry(n("a"), 1), entry(n("b", { coverUrl: null }), 2), entry(n("c"), 3), entry(n("d"), 4), entry(n("e"), 5)])], auth);
    expect(shelf.groups[0].pileCovers).toEqual(["/c/a.jpg", "/c/c.jpg", "/c/d.jpg"]);
  });
});
```

Si `"spinoff"` o `"simultaneo"` no están en el vocabulario de `SagaItemRole` / `TandemMode` (`src/lib/sagas/types.ts`), usa un valor que sí lo esté.

- [ ] **Paso 2: ejecutar y ver que falla**

Ejecuta: `npx vitest run src/lib/sagas/derive-shelf.test.ts`
Esperado: FAIL, módulo no encontrado.

- [ ] **Paso 3: implementar `derive-shelf.ts`**

```ts
// src/lib/sagas/derive-shelf.ts
import type { SagaAccentToken } from "./accents";
import type { TimelineRow, TimelineSection } from "./derive-timeline";
import type { SagaGraphNode } from "./map-types";
import type { SagaItemRole } from "./types";

// Modelo de la balda de la ficha de saga (spec 2026-10-27 §2–§4). Puro: entra
// lo que ya produce `deriveTimeline` (o `publicationSections`) y sale lo que
// la balda pinta. Aquí vive TODA la decisión — qué obra es «ahora», qué grupo
// se abre, qué ventana encaja —; los componentes solo pintan.

// (Pega aquí, sin cambios, los tipos exportados del bloque «Interfaces» de
// esta tarea: ShelfWorkState, ShelfWork, ShelfSlot, ShelfGroupState,
// ShelfGroup, ShelfMode y Shelf.)

type WindowRef = {
  draft: Draft;
  slot: Extract<ShelfSlot, { kind: "window" }>;
  afterId: string | null;
  beforeId: string | null;
  inside: boolean;
};

type Draft = Omit<ShelfGroup, "state" | "counted" | "completed" | "pileCovers"> & { titleIndex: Map<string, number> };

function toWork(node: SagaGraphNode, no: number | null): ShelfWork {
  return {
    key: node.id,
    title: node.label,
    href: node.href,
    coverUrl: node.coverUrl,
    state: node.status === "completed" ? "done" : "todo",
    role: node.role,
    optional: node.optional,
    skipped: node.skipped,
    no,
  };
}

function slotWorks(slot: ShelfSlot): ShelfWork[] {
  return slot.kind === "tandem" ? slot.works : [slot.work];
}

export function deriveShelf(sections: TimelineSection[], opts: { authenticated: boolean }): Shelf {
  // 1. Grupos: funde consecutivas del mismo groupSagaId; numera repeticiones.
  const drafts: Draft[] = [];
  const seen = new Map<string, number>();
  const windows: WindowRef[] = [];
  // `toWork` reduce el estado a done/todo; aquí se recuerda qué nodos estaban
  // `in_progress` para elegir «ahora».
  const inProgress = new Set<string>();

  for (const section of sections) {
    const base = section.groupSagaId ?? "root";
    const last = drafts.at(-1);
    let draft: Draft;
    if (last && last.key.split("#")[0] === base) {
      draft = last;
    } else {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      draft = {
        key: count === 1 ? base : `${base}#${count}`,
        name: section.groupName,
        accent: section.accent,
        slots: [],
        extras: [],
        titleIndex: new Map(),
      };
      drafts.push(draft);
    }
    for (const row of section.rows) pushRow(draft, row, windows, inProgress);
  }

  // 2. Anclas de las ventanas, ya con todos los slots del grupo colocados.
  for (const w of windows) {
    w.slot.spanFrom = w.afterId === null ? null : (w.draft.titleIndex.get(w.afterId) ?? null);
    w.slot.spanTo = w.beforeId === null ? null : (w.draft.titleIndex.get(w.beforeId) ?? null);
  }

  // 3. «Ahora»: una sola obra en todo el estante.
  const ordered = drafts.flatMap((d) => d.slots.flatMap(slotWorks));
  const counted = ordered.filter((w) => !w.optional);
  const windowKeys = new Set(windows.map((w) => w.slot.work.key));
  let now: ShelfWork | null = null;
  if (opts.authenticated) {
    now =
      ordered.find((w) => w.state !== "done" && inProgress.has(w.key)) ??
      ordered.find((w) => w.state !== "done" && !w.optional && !w.skipped && !windowKeys.has(w.key)) ??
      null;
    if (now) now.state = "now";
  }

  // 4. Ventanas que encajan ahora (necesitan el estado definitivo).
  for (const w of windows) w.slot.fitsNow = w.inside && w.slot.work.state !== "done";

  // 5. Grupos con su estado.
  const groups: ShelfGroup[] = drafts.map(({ titleIndex: _ignored, ...d }) => {
    const works = d.slots.flatMap(slotWorks);
    const c = works.filter((w) => !w.optional);
    const completed = c.filter((w) => w.state === "done").length;
    const state: ShelfGroupState = works.some((w) => w.state === "now")
      ? "current"
      : c.length > 0 && completed === c.length
        ? "done"
        : "future";
    return {
      ...d,
      state,
      counted: c.length,
      completed,
      pileCovers: works.map((w) => w.coverUrl).filter((u): u is string => u !== null).slice(0, 3),
    };
  });

  const openGroupKey =
    groups.find((g) => g.state === "current")?.key ??
    groups.find((g) => g.state !== "done")?.key ??
    groups.at(-1)?.key ??
    null;

  const segments = groups.map((g) => {
    const works = g.slots.flatMap(slotWorks);
    return {
      groupKey: g.key,
      weight: works.length,
      done: works.filter((w) => w.state === "done").length,
      hasNow: works.some((w) => w.state === "now"),
    };
  });

  // 6. Modo y «Te toca».
  const fitsNow = windows.find((w) => w.slot.fitsNow)?.slot.work ?? null;
  const groupOf = (work: ShelfWork) => groups.find((g) => g.slots.some((s) => slotWorks(s).includes(work)));
  let mode: ShelfMode;
  let nextUp: Shelf["nextUp"] = null;
  if (ordered.length === 0) mode = "empty";
  else if (!opts.authenticated) {
    mode = "start";
    const first = counted[0] ?? ordered[0];
    nextUp = { work: first, groupName: groupOf(first)?.name ?? null, fitsNow: null };
  } else if (counted.length === 0) mode = "allOptional";
  else if (counted.every((w) => w.state === "done")) mode = "finished";
  else {
    mode = "next";
    if (now) nextUp = { work: now, groupName: groupOf(now)?.name ?? null, fitsNow };
  }

  return { mode, groups, openGroupKey, nextUp, segments };
}
```

`pushRow`, en el mismo fichero:

```ts
function pushRow(draft: Draft, row: TimelineRow, windows: WindowRef[], inProgress: Set<string>): void {
  const mark = (node: SagaGraphNode) => {
    if (node.status === "in_progress") inProgress.add(node.id);
    draft.titleIndex.set(node.id, draft.slots.length);
  };
  switch (row.kind) {
    case "entry":
    case "bridge": {
      mark(row.node);
      draft.slots.push({ kind: "work", work: toWork(row.node, row.kind === "entry" ? row.no : null) });
      break;
    }
    case "tandem": {
      row.nodes.forEach(mark);
      draft.slots.push({ kind: "tandem", works: row.nodes.map((nd) => toWork(nd, row.no)) });
      break;
    }
    case "window": {
      mark(row.node);
      const slot: Extract<ShelfSlot, { kind: "window" }> = {
        kind: "window",
        work: toWork(row.node, row.no),
        afterTitle: row.after?.label ?? null,
        beforeTitle: row.before?.label ?? null,
        spanFrom: null,
        spanTo: null,
        fitsNow: false,
      };
      draft.slots.push(slot);
      windows.push({ draft, slot, afterId: row.after?.id ?? null, beforeId: row.before?.id ?? null, inside: row.track?.notice === "dentro" });
      break;
    }
  }
  if (row.kind === "entry" || row.kind === "tandem") {
    for (const b of row.branches) {
      if (b.node.optional) draft.extras.push(toWork(b.node, null));
      else {
        mark(b.node);
        draft.slots.push({ kind: "work", work: toWork(b.node, null) });
      }
    }
  }
}
```

Las obras de `extras` no pasan por `mark`, así que nunca son «ahora» ni cuentan en los segmentos (regla 3 y regla 9).

- [ ] **Paso 4: ejecutar y ver que pasa**

Ejecuta: `npx vitest run src/lib/sagas/derive-shelf.test.ts`
Esperado: PASS, 14 tests. Después, `npx tsc --noEmit -p .` sin errores.

- [ ] **Paso 5: commit**

```bash
git add src/lib/sagas/derive-shelf.ts src/lib/sagas/derive-shelf.test.ts
git commit -m "feat(sagas): deriveShelf, el modelo de la balda de la ficha"
```

---

### Tarea 3: página interina `/saga/[id]/como-leerla`

La pestaña Mapa desaparece de la ficha en la Tarea 8, pero lo que contiene (timeline, grafo embebido, `RouteView`, adoptar, saltar opcionales y lente `?rol=`) tiene que seguir alcanzable hasta que llegue el atlas. Esta tarea lo muda **sin cambiar su comportamiento**.

**Ficheros:**
- Crear: `src/app/saga/[id]/como-leerla/page.tsx`
- Modificar: `src/components/saga/route-selector.tsx:17`, `src/components/saga/route-view.tsx:129`, `src/components/saga/saga-map-tab.tsx:80`
- Modificar: `src/lib/reactivity/revalidate.ts:129-131`
- Modificar: los 12 e2e que usan la pestaña (lista en el paso 5)
- Modificar: `messages/es.json` (namespace `saga`)

**Interfaces:**
- Produce: la ruta `/saga/[id]/como-leerla?ruta=<slug>&rol=<rol>` y la función `sagaReadingHref(id: string): string` en `src/lib/catalog/item-href.ts`, que devuelve `${sagaHref(id)}/como-leerla`.

- [ ] **Paso 1: `sagaReadingHref`**

En `src/lib/catalog/item-href.ts`, junto a `sagaHref`:

```ts
/** Página interina «Cómo leerla» (spec 2026-10-27): el timeline detallado, los
 *  itinerarios y la lente de rol, hasta que el atlas de la saga la sustituya. */
export function sagaReadingHref(id: string): string {
  return `${sagaHref(id)}/como-leerla`;
}
```

- [ ] **Paso 2: los enlaces internos dejan de apuntar a `?tab=mapa`**

En `route-selector.tsx`, la función `href` recibe ya `base`. Cambia la línea 17 a:

```ts
  const href = (slug: string) => `${base}?ruta=${slug}`;
```

y en `saga-map-tab.tsx` pasa `base={sagaReadingHref(detail.saga.id)}` a `RouteSelector` (sustituye `base={base}`). Cambia también la línea 80:

```ts
  const baseHref = `${sagaReadingHref(detail.saga.id)}?ruta=${encodeURIComponent(activeRoute)}`;
```

En `route-view.tsx:129`:

```ts
  const baseHref = `${sagaReadingHref(detail.saga.id)}?ruta=${encodeURIComponent(slug)}`;
```

Añade el import de `sagaReadingHref` en los dos ficheros. Busca algún otro `?tab=mapa` que quede: `grep -rn "tab=mapa" src` solo debería devolver el comentario de `role-filter-bar.tsx:30`. Actualízalo para que diga `/como-leerla?ruta=…`.

- [ ] **Paso 3: la página**

Las páginas hermanas `/mapa` y `/rutas` usan `redirect` y `notFound`, igual que esta.

```tsx
// src/app/saga/[id]/como-leerla/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaMapTab } from "@/components/saga/saga-map-tab";

// «Cómo leerla» (spec 2026-10-27 §5): el contenido de la antigua pestaña
// «Mapa de lectura», sin cambios de comportamiento, en su propia página. Es
// INTERINA: el atlas de la saga (subproyecto 2) la sustituye.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} · cómo leerla — Biblioshare` : "Biblioshare" };
}

export default async function SagaReadingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orden?: string; ruta?: string; rol?: string }>;
}) {
  const { id } = await params;
  const { orden, ruta, rol } = await searchParams;
  const t = await getTranslations("saga");
  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  const activeRoute = resolveActiveRoute(detail, { ruta, orden });
  const activeRole: SagaItemRole | null = (SAGA_ITEM_ROLES as readonly string[]).includes(rol ?? "")
    ? (rol as SagaItemRole)
    : null;

  return (
    <div className={`${DETAIL_CONTAINER} flex flex-col gap-4 py-6`}>
      <header className="flex items-center gap-3">
        <Link href={sagaHref(id)} aria-label={t("backToSaga")} className="grid h-9 w-9 place-items-center rounded-lg border border-border">
          ‹
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("readingEyebrow")}</p>
          <h1 className="truncate font-serif text-[22px] font-semibold">{detail.saga.name}</h1>
        </div>
      </header>
      <SagaMapTab
        detail={detail}
        activeRoute={activeRoute}
        canEdit={hasMinRole(detail.viewerRole, "collaborator")}
        activeRole={activeRole}
      />
    </div>
  );
}
```

`resolveActiveRoute` es la precedencia de ruta que hoy vive dentro de `src/app/saga/[id]/page.tsx`. Extráela a `src/lib/sagas/resolve-active-route.ts` **tal cual**, con su comentario, para que la ficha (Tarea 8) y esta página no puedan divergir:

```ts
// src/lib/sagas/resolve-active-route.ts
import type { SagaDetail } from "./get-saga-detail";

// Ruta activa. Precedencia: ?ruta= explícito → compatibilidad con el viejo
// ?orden=publicacion (enlaces ya compartidos) → la adoptada → la primera.
// Un slug desconocido (ruta borrada, enlace viejo) degrada a la primera en
// vez de dar 404: por eso la adopción guarda el slug y no un route_id.
export function resolveActiveRoute(
  detail: Pick<SagaDetail, "routes" | "routeChoice">,
  { ruta, orden }: { ruta?: string; orden?: string },
): string {
  const known = new Set(detail.routes.map((r) => r.slug));
  return (
    (ruta && known.has(ruta) && ruta) ||
    (orden === "publicacion" && known.has("publicacion") && "publicacion") ||
    (detail.routeChoice && known.has(detail.routeChoice) && detail.routeChoice) ||
    detail.routes[0]?.slug ||
    "publicacion"
  );
}
```

Añade un test corto en `src/lib/sagas/resolve-active-route.test.ts` con los cuatro casos: `?ruta=` conocida, `?orden=publicacion`, la adoptada y un slug desconocido que degrada a la primera.

```ts
import { describe, expect, it } from "vitest";
import { resolveActiveRoute } from "./resolve-active-route";

const detail = {
  routes: [{ slug: "lectura" }, { slug: "publicacion" }, { slug: "cronologico" }] as never,
  routeChoice: "cronologico",
};

describe("resolveActiveRoute", () => {
  it("?ruta= conocida manda", () => expect(resolveActiveRoute(detail, { ruta: "publicacion" })).toBe("publicacion"));
  it("compatibilidad con ?orden=publicacion", () => expect(resolveActiveRoute({ ...detail, routeChoice: null }, { orden: "publicacion" })).toBe("publicacion"));
  it("sin parámetros, la adoptada", () => expect(resolveActiveRoute(detail, {})).toBe("cronologico"));
  it("slug desconocido degrada a la adoptada y, sin ella, a la primera", () => {
    expect(resolveActiveRoute({ ...detail, routeChoice: null }, { ruta: "borrada" })).toBe("lectura");
  });
});
```

Añade a `messages/es.json`, namespace `saga`, después de `"tabMap"`:

```json
    "readingEyebrow": "Cómo leerla",
    "readingLink": "Cómo leerla",
```

(`backToSaga` ya existe: lo usa la página `/mapa`.)

- [ ] **Paso 4: revalidación**

En `src/lib/reactivity/revalidate.ts`, `revalidateSagaPage` pasa a revalidar las dos rutas. Adoptar un itinerario y saltar una opcional se hacen ahora desde `/como-leerla`:

```ts
/** La ficha de una saga concreta y su página «Cómo leerla» (spec 2026-10-27),
 *  que pinta los mismos estados: adoptar un itinerario o saltar una opcional
 *  se hace desde allí y tiene que verse en las dos. */
export function revalidateSagaPage(id: string): void {
  revalidatePath(sagaHref(id));
  revalidatePath(sagaReadingHref(id));
}
```

Ejecuta `npx vitest run src/lib/reactivity`. Si `revalidate.test.ts` comprueba las llamadas exactas de `revalidateSagaPage`, añade la nueva ruta a lo esperado.

- [ ] **Paso 5: e2e que usaban la pestaña**

En estos ficheros cambia `?tab=mapa` por la ruta nueva: `${sagaUrl}?tab=mapa&ruta=x` pasa a ser `${sagaUrl}/como-leerla?ruta=x`, y `?tab=mapa` a secas, a `/como-leerla`.

`e2e/sagas-grafo-estados.spec.ts`, `sagas-itinerarios.spec.ts`, `sagas-mapa-derivado.spec.ts`, `sagas-opcionales-saltables.spec.ts`, `sagas-orden-designado.spec.ts`, `sagas-rol-narrativo.spec.ts`, `sagas-roles.spec.ts`, `sagas-tandem-metadatos.spec.ts`, `sagas-tandem-opcional.spec.ts`, `sagas-timeline-estados.spec.ts`, `sagas-v2-mapa.spec.ts`, `sagas-ventana-motivo-track.spec.ts`.

Localízalos con `grep -n "tab=mapa\|Mapa de lectura" e2e/sagas-*.spec.ts`. `sagas-v2-mapa.spec.ts:43` y `:100` buscan el **botón** «Mapa de lectura». Cámbialos para que naveguen a `/como-leerla` y, en la línea 100 (que comprueba que la pestaña NO aparece sin grafo), comprueba en su lugar que la página `/como-leerla` muestra el selector de itinerario sin el timeline (`getByTestId("reading-timeline")` con `toHaveCount(0)`). Mantén lo demás de cada aserción.

Hasta la Tarea 8, la ficha sigue teniendo la pestaña: estos e2e van directos a la página nueva y no dependen de ella.

- [ ] **Paso 6: verificar**

Ejecuta: `npx vitest run src/lib/sagas src/lib/reactivity src/components/saga` → PASS.
Ejecuta: `npx tsc --noEmit -p .` → sin errores.
Con `next dev` en el puerto 3000 (arrancado a mano):
`npx playwright test e2e/sagas-itinerarios.spec.ts e2e/sagas-timeline-estados.spec.ts e2e/sagas-v2-mapa.spec.ts` → PASS. Si algún spec falla por algo ajeno a esta mudanza, compáralo contra `main` antes de tocarlo.

- [ ] **Paso 7: commit**

```bash
git add src/app/saga/[id]/como-leerla src/lib/sagas/resolve-active-route.ts src/lib/sagas/resolve-active-route.test.ts src/lib/catalog/item-href.ts src/lib/reactivity/revalidate.ts messages/es.json e2e
git add -u src
git commit -m "feat(sagas): página interina Cómo leerla con el contenido de la pestaña Mapa"
```

---

### Tarea 4: hero cinemático de saga y menú de curador

**Ficheros:**
- Crear: `src/components/saga/ficha/hero-background.ts` y `hero-background.test.ts`
- Crear: `src/components/saga/ficha/saga-hero-cinematic.tsx`
- Crear: `src/components/saga/ficha/saga-curator-menu.tsx`
- Modificar: `messages/es.json`

**Interfaces:**
- Produce:
  - `pickSagaHeroBackground(input: { backdropUrl: string | null; covers: string[] }): { kind: "backdrop"; src: string } | { kind: "mosaic"; covers: string[] } | { kind: "none" }`
  - `<SagaHeroCinematic detail={SagaDetail} backdropUrl={string | null} curatorMenu={ReactNode} />` (server)
  - `<SagaCuratorMenu sagaId={string} hasParent={boolean} />` (cliente)
- Consume: `SagaDetail` (campos `saga`, `parent`, `byline`, `memberCount`, `childCount`, `avgRating`, `groups`, `isAuthenticated`, `isFollowing`), `SagaFollowButton` (`src/components/saga/saga-follow-button.tsx`), `DETAIL_CONTAINER`, `formatDots`, `RatingDots`.

- [ ] **Paso 1: test de `pickSagaHeroBackground`**

```ts
// src/components/saga/ficha/hero-background.test.ts
import { describe, expect, it } from "vitest";
import { pickSagaHeroBackground } from "./hero-background";

describe("pickSagaHeroBackground", () => {
  it("el backdrop de TMDB manda", () => {
    expect(pickSagaHeroBackground({ backdropUrl: "/b.jpg", covers: ["/a.jpg"] })).toEqual({ kind: "backdrop", src: "/b.jpg" });
  });
  it("sin backdrop, mosaico de hasta 12 portadas, repetidas si hay menos de 6", () => {
    const r = pickSagaHeroBackground({ backdropUrl: null, covers: ["/1", "/2", "/3"] });
    expect(r).toEqual({ kind: "mosaic", covers: ["/1", "/2", "/3", "/1", "/2", "/3"] });
    const many = pickSagaHeroBackground({ backdropUrl: null, covers: Array.from({ length: 20 }, (_, i) => `/${i}`) });
    expect(many.kind === "mosaic" && many.covers).toHaveLength(12);
  });
  it("sin nada, none", () => {
    expect(pickSagaHeroBackground({ backdropUrl: null, covers: [] })).toEqual({ kind: "none" });
  });
});
```

- [ ] **Paso 2: ejecutar y ver que falla.** `npx vitest run src/components/saga/ficha/hero-background.test.ts` → FAIL.

- [ ] **Paso 3: implementar**

```ts
// src/components/saga/ficha/hero-background.ts
// Fondo del hero de saga (spec 2026-10-27 §1). Las sagas no tienen backdrop
// propio: el de TMDB de su primera película, o un mosaico de portadas de sus
// obras. Puro para poder probarlo, como `pickHeroBackground` de la ficha de obra.
export type SagaHeroBackground =
  | { kind: "backdrop"; src: string }
  | { kind: "mosaic"; covers: string[] }
  | { kind: "none" };

const MOSAIC_MAX = 12;
const MOSAIC_MIN = 6;

export function pickSagaHeroBackground({ backdropUrl, covers }: { backdropUrl: string | null; covers: string[] }): SagaHeroBackground {
  if (backdropUrl) return { kind: "backdrop", src: backdropUrl };
  if (covers.length === 0) return { kind: "none" };
  const out = covers.slice(0, MOSAIC_MAX);
  // Con pocas portadas, repetir llena el lienzo: un mosaico de 3 teselas se lee
  // como tres cuadros sueltos, no como textura.
  while (out.length < MOSAIC_MIN) out.push(...covers.slice(0, MOSAIC_MIN - out.length));
  return { kind: "mosaic", covers: out };
}
```

- [ ] **Paso 4: el menú de curador**

Sigue el patrón de `<dialog>` nativo de `src/components/detail/hero-menu.tsx`. Ábrelo antes y copia su manejo de `showModal`/`close`, su botón de 34 px y sus clases. Sustituye los tres enlaces de curador de `saga-info.tsx`:

```tsx
// src/components/saga/ficha/saga-curator-menu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// «⋯» de curación del hero de saga (spec 2026-10-27 §1). Sustituye la fila de
// enlaces sueltos de la antigua pestaña Info: Editar ficha, Anidar en universo
// (solo sin padre) e Itinerarios. Solo se monta para collaborator+.
export function SagaCuratorMenu({ sagaId, hasParent }: { sagaId: string; hasParent: boolean }) {
  const t = useTranslations("saga");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const item = "block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-surface-muted";
  return (
    <>
      <button
        type="button"
        aria-label={t("curatorMenu")}
        onClick={() => setOpen(true)}
        className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-border bg-surface/80 backdrop-blur"
      >
        ⋯
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialogRef.current && setOpen(false)}
        className="m-auto w-[min(92vw,320px)] rounded-2xl border border-border bg-surface p-2 backdrop:bg-scrim"
      >
        <Link href={`/saga/${sagaId}/editar`} className={item}>✎ {t("editSheet")}</Link>
        {!hasParent && <Link href={`/saga/${sagaId}/editar#universo`} className={item}>⌂ {t("nestInUniverse")}</Link>}
        <Link href={`/saga/${sagaId}/rutas`} className={item}>✎ {t("routesManage")}</Link>
      </dialog>
    </>
  );
}
```

Si `backdrop:bg-scrim` no existe como utilidad, usa la misma clase de fondo que ponga `hero-menu.tsx` en su `<dialog>`.

- [ ] **Paso 5: el hero**

Toma de `item-hero.tsx` el degradado del fondo y la escala tipográfica, sin reinventarlos:

```tsx
// src/components/saga/ficha/saga-hero-cinematic.tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { formatDots } from "@/lib/rating/dots";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { pickSagaHeroBackground } from "./hero-background";

// Hero cinemático de la ficha de saga (spec 2026-10-27 §1). Un solo árbol
// para móvil y PC, como `ItemHero`. Nunca hay texto sobre imagen nítida: el
// degradado llega a --background antes del bloque de título.
export async function SagaHeroCinematic({
  detail,
  backdropUrl,
  curatorMenu,
}: {
  detail: SagaDetail;
  backdropUrl: string | null;
  curatorMenu: ReactNode;
}) {
  const t = await getTranslations("saga");
  const { saga, parent, byline, memberCount, childCount, avgRating } = detail;
  const covers = detail.groups.flatMap((g) => g.members).map((m) => m.coverUrl).filter((u): u is string => u !== null);
  const bg = pickSagaHeroBackground({ backdropUrl, covers });
  const years = detail.groups.flatMap((g) => g.members).map((m) => m.year).filter((y): y is number => y !== null);
  const span = years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : null;

  return (
    <div className="relative" data-testid="saga-hero">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[260px] overflow-hidden sm:h-[300px] lg:h-[380px]">
        {bg.kind === "backdrop" && (
          <Image src={bg.src} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="object-cover object-[center_25%]" />
        )}
        {bg.kind === "mosaic" && (
          <div className="absolute -inset-6 grid scale-110 grid-cols-4 gap-1 opacity-70 blur-md sm:grid-cols-6">
            {bg.covers.map((src, i) => (
              <div key={i} className="relative aspect-[2/3]">
                <Image src={src} alt="" fill sizes="120px" className="object-cover" />
              </div>
            ))}
          </div>
        )}
        {bg.kind === "none" && <div className="absolute inset-0 bg-surface-muted" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-10% via-background/85 via-45% to-background to-70%" />
      </div>

      <header className={`relative ${DETAIL_CONTAINER} flex flex-col gap-2 pt-[120px] pb-4 sm:pt-[150px] lg:pt-[210px]`}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase">
            {childCount > 0 ? t("eyebrowUniverse") : t("eyebrow")} · {t("count", { count: memberCount })}
            {childCount > 0 && <> · {t("subsagas", { count: childCount })}</>}
          </p>
          {curatorMenu}
        </div>
        <h1 className="[overflow-wrap:anywhere] font-serif text-[30px] leading-[1.03] font-semibold sm:text-[38px] lg:text-[48px]">
          {saga.name}
        </h1>
        <p className="font-serif text-sm text-foreground-soft italic lg:text-lg">
          {[byline && t("by", { name: byline }), span, avgRating !== null && t("avgRating", { rating: formatDots(avgRating)! })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {parent && (
            <Link href={sagaHref(parent.id)} className="rounded-full bg-surface-muted px-3 py-1 font-mono text-[10px] text-muted-foreground">
              {t("partOf", { name: parent.name })}
            </Link>
          )}
          {detail.isAuthenticated && <SagaFollowButton sagaId={saga.id} isFollowing={detail.isFollowing} />}
        </div>
      </header>
    </div>
  );
}
```

Claves nuevas en `messages/es.json`, namespace `saga`:

```json
    "eyebrowUniverse": "Universo",
    "curatorMenu": "Opciones de curación",
```

El comentario de `avgRating` en `saga-hero.tsx` (#643: `formatDots`, nunca la nota cruda) también aplica aquí. Copia esa línea de comentario encima del uso.

- [ ] **Paso 6: verificar.** `npx vitest run src/components/saga/ficha` → PASS; `npx tsc --noEmit -p .` → sin errores.

- [ ] **Paso 7: commit**

```bash
git add src/components/saga/ficha messages/es.json
git commit -m "feat(sagas): hero cinemático de saga con mosaico y menú de curación"
```

---

### Tarea 5: la balda (`SagaShelf`)

**Ficheros:**
- Crear: `src/components/saga/ficha/saga-shelf.tsx` (cliente)
- Test: `src/components/saga/ficha/saga-shelf.test.tsx`
- Modificar: `messages/es.json`

**Interfaces:**
- Consume: `Shelf`, `ShelfGroup`, `ShelfSlot`, `ShelfWork` (Tarea 2); `SAGA_ACCENT` (`src/lib/sagas/accents.ts`); `SagaRoute` (el tipo de `detail.routes`, en `src/lib/sagas/route-types.ts`).
- Produce: `<SagaShelf shelf={Shelf} sagaName={string} routes={Array<{ slug: string; name: string }>} activeRoute={string} baseHref={string} readingHref={string} />`.
  - `baseHref`: URL de la ficha. Los chips enlazan a `${baseHref}?ruta=<slug>`.
  - `readingHref`: `/saga/[id]/como-leerla?ruta=<activa>`.

**Comportamiento:**
- Cabecera: «El orden», chips de itinerario (solo si `routes.length > 1`), «N de M» a la derecha (suma de `completed` y `counted` de todos los grupos; sin sesión no se pinta) y el enlace «Cómo leerla →».
- Fila: cada grupo que no es el abierto se pinta como **pila** (`<button>`, hasta 3 portadas solapadas y la etiqueta `nombre · completed/counted ✓` o `nombre · counted`). El grupo abierto se pinta como **balda**: una rejilla `grid-auto-flow: column` con dos filas (fila 1 para los arcos de ventana, fila 2 para las portadas) y, tras ella, los `extras` en pequeño detrás de un separador. Si solo hay un grupo, no hay pilas.
- Pulsar una pila o un segmento de la minibarra cambia el grupo abierto (estado local, inicial `shelf.openGroupKey`).
- Portada `now`: más grande, contorno `outline-accent` de 3 px y etiqueta de texto «ahora» (no solo color). `done`: contorno verde y un ✓ en una esquina. `todo`: opacidad 55 %. Sin portada: lomo `SAGA_ACCENT[accent].bg` con el título en vertical.
- Tándem: dos portadas solapadas con contorno `var(--map-tandem)` y la etiqueta «tándem».
- Ventana: la portada, desplazada hacia arriba, con contorno discontinuo `var(--map-window)`. Si `spanFrom` y `spanTo` no son null, un arco (div con borde superior y laterales discontinuos) en la fila 1, de la columna `spanFrom+1` a la `spanTo+2`.
- Rol: etiqueta pequeña sobre la portada con el texto de `RoleChip`. Reutiliza el traductor que use `role-chip.tsx` (ábrelo y llama a la misma clave i18n), no inventes copy.
- Minibarra: un `<button>` por segmento, con `flex-grow: weight`, relleno verde proporcional a `done/weight` y una marca terracota si `hasNow`. `aria-label` con el nombre del grupo y «done de weight».
- Al montar, el contenedor horizontal hace `scrollIntoView({ inline: "center", block: "nearest" })` sobre la portada `now`, si existe. En móvil la fila desplaza con `snap-x`.
- Teclado: las portadas son `<a href>` (Tab recorre). Flechas izquierda y derecha mueven el foco al enlace vecino dentro de la balda.
- **Lista accesible:** debajo de la balda, un `<ol className="sr-only">` con **todas** las obras de todos los grupos, en orden, cada `<li>` con `título — estado (leída/ahora/pendiente)[, rol][, opcional][, ventana: entre X e Y][, tándem]` y un enlace. La balda visual lleva `aria-hidden` **solo** en los elementos decorativos (arcos y etiquetas), nunca en los enlaces.
- `data-testid`: `saga-shelf` en la raíz, `shelf-pile-<key>` en cada pila, `shelf-now` en la portada `now`, `shelf-segment-<key>` en cada segmento y `shelf-a11y-list` en el `ol`.

- [ ] **Paso 1: tests que fallan**

```tsx
// src/components/saga/ficha/saga-shelf.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Shelf, ShelfWork } from "@/lib/sagas/derive-shelf";
import { SagaShelf } from "./saga-shelf";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, v?: Record<string, unknown>) => (v ? `${key}:${JSON.stringify(v)}` : key) }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

const w = (key: string, state: ShelfWork["state"], extra: Partial<ShelfWork> = {}): ShelfWork =>
  ({ key, title: key.toUpperCase(), href: `/libro/${key}`, coverUrl: null, state, role: null, optional: false, skipped: false, no: null, ...extra });

const shelf: Shelf = {
  mode: "next",
  openGroupKey: "s2",
  nextUp: null,
  groups: [
    { key: "s1", name: "Uno", accent: "verde", state: "done", counted: 1, completed: 1, slots: [{ kind: "work", work: w("a", "done") }], extras: [], pileCovers: [] },
    { key: "s2", name: "Dos", accent: "terracota", state: "current", counted: 2, completed: 0, slots: [{ kind: "work", work: w("b", "now") }, { kind: "tandem", works: [w("c", "todo"), w("d", "todo")] }], extras: [w("x", "todo", { optional: true })], pileCovers: [] },
  ],
  segments: [
    { groupKey: "s1", weight: 1, done: 1, hasNow: false },
    { groupKey: "s2", weight: 3, done: 0, hasNow: true },
  ],
};

const props = { shelf, sagaName: "Dune", routes: [{ slug: "lectura", name: "Lectura" }, { slug: "publicacion", name: "Publicación" }], activeRoute: "lectura", baseHref: "/saga/1", readingHref: "/saga/1/como-leerla?ruta=lectura" };

describe("SagaShelf", () => {
  it("despliega el grupo abierto y apila el resto", () => {
    render(<SagaShelf {...props} />);
    expect(screen.getByTestId("shelf-pile-s1")).toBeTruthy();
    expect(screen.queryByTestId("shelf-pile-s2")).toBeNull();
    expect(screen.getByTestId("shelf-now").getAttribute("href")).toBe("/libro/b");
  });

  it("pulsar una pila la despliega", () => {
    render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s1"));
    expect(screen.getByTestId("shelf-pile-s2")).toBeTruthy();
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
  });

  it("pulsar un segmento de la minibarra despliega su grupo", () => {
    render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-segment-s1"));
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
  });

  it("chips de itinerario solo con más de una ruta, y enlazan con ?ruta=", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    expect(screen.getByRole("link", { name: "Publicación" }).getAttribute("href")).toBe("/saga/1?ruta=publicacion");
    rerender(<SagaShelf {...props} routes={[{ slug: "lectura", name: "Lectura" }]} />);
    expect(screen.queryByRole("link", { name: "Publicación" })).toBeNull();
  });

  it("la lista accesible contiene todas las obras, también las de grupos plegados y los extras", () => {
    render(<SagaShelf {...props} />);
    const items = within(screen.getByTestId("shelf-a11y-list")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });
});
```

- [ ] **Paso 2: ejecutar y ver que falla.** `npx vitest run src/components/saga/ficha/saga-shelf.test.tsx` → FAIL.

- [ ] **Paso 3: implementar `saga-shelf.tsx`**

```tsx
// src/components/saga/ficha/saga-shelf.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { Shelf, ShelfGroup, ShelfSlot, ShelfWork } from "@/lib/sagas/derive-shelf";

// La balda de la ficha de saga (spec 2026-10-27 §2). Solo pinta lo que decide
// `deriveShelf`; el único estado propio es QUÉ grupo está desplegado.
export function SagaShelf({
  shelf, sagaName, routes, activeRoute, baseHref, readingHref,
}: {
  shelf: Shelf;
  sagaName: string;
  routes: Array<{ slug: string; name: string }>;
  activeRoute: string;
  baseHref: string;
  readingHref: string;
}) {
  const t = useTranslations("saga");
  const [open, setOpen] = useState(shelf.openGroupKey);
  const rowRef = useRef<HTMLDivElement>(null);
  const counted = shelf.groups.reduce((s, g) => s + g.counted, 0);
  const completed = shelf.groups.reduce((s, g) => s + g.completed, 0);
  const groupName = (g: ShelfGroup) => g.name ?? sagaName;

  useEffect(() => {
    rowRef.current?.querySelector("[data-testid='shelf-now']")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = [...(rowRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-shelf-link]") ?? [])];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i === -1) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  }

  if (shelf.mode === "empty") return null;

  return (
    <section data-testid="saga-shelf" aria-labelledby="shelf-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="shelf-title" className="mr-1 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("shelfTitle")}</h2>
        {routes.length > 1 &&
          routes.map((r) => (
            <Link
              key={r.slug}
              href={`${baseHref}?ruta=${encodeURIComponent(r.slug)}`}
              scroll={false}
              aria-current={r.slug === activeRoute ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${r.slug === activeRoute ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`}
            >
              {r.name}
            </Link>
          ))}
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {shelf.mode !== "start" && counted > 0 && <span>{t("shelfCount", { completed, total: counted })}</span>}
          <Link href={readingHref} className="font-semibold text-foreground underline-offset-2 hover:underline">{t("readingLink")} →</Link>
        </span>
      </div>

      <div ref={rowRef} onKeyDown={onKeyDown} className="flex snap-x items-end gap-4 overflow-x-auto pt-8 pb-2">
        {shelf.groups.map((g) =>
          g.key === open || shelf.groups.length === 1 ? (
            <OpenGroup key={g.key} group={g} label={groupName(g)} showLabel={shelf.groups.length > 1} />
          ) : (
            <Pile key={g.key} group={g} label={groupName(g)} onOpen={() => setOpen(g.key)} />
          ),
        )}
      </div>

      {shelf.groups.length > 1 && (
        <div className="flex h-2 gap-0.5">
          {shelf.segments.map((s) => {
            const g = shelf.groups.find((x) => x.key === s.groupKey)!;
            return (
              <button
                key={s.groupKey}
                type="button"
                data-testid={`shelf-segment-${s.groupKey}`}
                aria-label={t("shelfSegment", { name: groupName(g), done: s.done, total: s.weight })}
                onClick={() => setOpen(s.groupKey)}
                style={{ flexGrow: s.weight }}
                className={`relative h-full basis-0 overflow-hidden rounded-full bg-surface-muted ${s.groupKey === open ? "ring-2 ring-foreground/30" : ""}`}
              >
                <span className="absolute inset-y-0 left-0 bg-green" style={{ width: `${(s.done / Math.max(1, s.weight)) * 100}%` }} />
                {s.hasNow && <span className="absolute inset-y-0 w-1.5 bg-accent" style={{ left: `${(s.done / Math.max(1, s.weight)) * 100}%` }} />}
              </button>
            );
          })}
        </div>
      )}

      <ol data-testid="shelf-a11y-list" className="sr-only">
        {shelf.groups.flatMap((g) => [...g.slots.flatMap((s) => slotA11y(s)), ...g.extras.map((x) => ({ work: x, extra: "" }))]).map(({ work, extra }) => (
          <li key={work.key}>
            <a href={work.href}>
              {work.title} — {t(`shelfState_${work.state}`)}
              {work.role ? `, ${work.role}` : ""}
              {work.optional ? `, ${t("optionalChip")}` : ""}
              {extra}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );

  function slotA11y(s: ShelfSlot): Array<{ work: ShelfWork; extra: string }> {
    if (s.kind === "tandem") return s.works.map((work) => ({ work, extra: `, ${t("shelfTandem")}` }));
    if (s.kind === "window")
      return [{ work: s.work, extra: `, ${t("shelfWindowA11y", { after: s.afterTitle ?? "—", before: s.beforeTitle ?? "—" })}` }];
    return [{ work: s.work, extra: "" }];
  }
}

function Pile({ group, label, onOpen }: { group: ShelfGroup; label: string; onOpen: () => void }) {
  const tick = group.state === "done" ? " ✓" : "";
  const count = group.state === "future" ? `${group.counted}` : `${group.completed}/${group.counted}`;
  return (
    <button
      type="button"
      data-testid={`shelf-pile-${group.key}`}
      onClick={onOpen}
      className={`flex shrink-0 snap-center flex-col items-center gap-1 ${group.state === "future" ? "opacity-60" : ""}`}
    >
      <span className="relative block h-[62px] w-[58px]">
        {(group.pileCovers.length > 0 ? group.pileCovers : [null, null, null]).map((src, i) => (
          <span
            key={i}
            style={{ left: i * 7, bottom: i * 3 }}
            className={`absolute block h-[54px] w-[36px] overflow-hidden rounded-[3px] shadow-cover ${group.state === "done" ? "outline-2 outline-green" : ""} ${src ? "" : SAGA_ACCENT[group.accent].bg}`}
          >
            {src && <Image src={src} alt="" fill sizes="36px" className="object-cover" />}
          </span>
        ))}
      </span>
      <span className="max-w-[90px] truncate font-mono text-[10px] text-muted-foreground">{label} · {count}{tick}</span>
    </button>
  );
}

function OpenGroup({ group, label, showLabel }: { group: ShelfGroup; label: string; showLabel: boolean }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {showLabel && <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{label} · {group.completed}/{group.counted}</span>}
      <div className="flex items-end gap-4 border-b-[3px] border-surface-muted pb-1.5">
        <div className="grid auto-cols-max grid-flow-col grid-rows-[auto_auto] items-end gap-x-2">
          {group.slots.map((s, i) => s.kind === "window" && s.spanFrom !== null && s.spanTo !== null && (
            <span
              key={`arc-${i}`}
              aria-hidden
              style={{ gridColumn: `${s.spanFrom + 1} / ${s.spanTo + 2}`, gridRow: 1 }}
              className="mb-1 h-3 rounded-t-lg border-x-[1.5px] border-t-[1.5px] border-dashed border-[var(--map-window)]"
            />
          ))}
          {group.slots.map((s, i) => (
            <div key={i} style={{ gridColumn: i + 1, gridRow: 2 }} className="snap-center">
              <SlotView slot={s} />
            </div>
          ))}
        </div>
        {group.extras.length > 0 && (
          <div className="flex items-end gap-1.5 border-l border-border pl-3">
            {group.extras.map((x) => <Cover key={x.key} work={x} accent={group.accent} small />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotView({ slot }: { slot: ShelfSlot }) {
  const t = useTranslations("saga");
  if (slot.kind === "work") return <Cover work={slot.work} />;
  if (slot.kind === "tandem")
    return (
      <div className="relative flex">
        {slot.works.map((w, i) => (
          <div key={w.key} className={i > 0 ? "-ml-5" : ""}>
            <Cover work={w} ring="outline-[var(--map-tandem)]" />
          </div>
        ))}
        <Tag text={t("shelfTandem")} />
      </div>
    );
  return (
    <div className="relative -translate-y-4">
      <Cover work={slot.work} ring="outline-dashed outline-[var(--map-window)]" />
      <Tag text={t("shelfWindow")} />
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span aria-hidden className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-1.5 font-mono text-[8px] whitespace-nowrap text-muted-foreground">
      {text}
    </span>
  );
}

function Cover({ work, ring, small, accent }: { work: ShelfWork; ring?: string; small?: boolean; accent?: keyof typeof SAGA_ACCENT }) {
  const t = useTranslations("saga");
  const size = work.state === "now" ? "h-[96px] w-[64px] sm:h-[120px] sm:w-[80px]" : small ? "h-[48px] w-[32px]" : "h-[66px] w-[44px] sm:h-[84px] sm:w-[56px]";
  const state =
    work.state === "now" ? "outline-[3px] outline-accent" : work.state === "done" ? "outline-2 outline-green" : "opacity-55";
  return (
    <Link
      href={work.href}
      data-shelf-link
      data-testid={work.state === "now" ? "shelf-now" : undefined}
      title={work.title}
      className={`relative block shrink-0 overflow-hidden rounded-[4px] shadow-cover outline-offset-1 ${size} ${ring ?? state} ${work.skipped ? "grayscale" : ""}`}
    >
      {work.coverUrl ? (
        <Image src={work.coverUrl} alt={work.title} fill sizes="80px" className="object-cover" />
      ) : (
        <span className={`flex h-full items-center justify-center p-1 text-center text-[9px] leading-tight text-background ${SAGA_ACCENT[accent ?? "beige"].bg}`}>{work.title}</span>
      )}
      {work.state === "done" && <span aria-hidden className="absolute top-0.5 right-0.5 rounded-full bg-green px-1 text-[9px] text-background">✓</span>}
      {work.state === "now" && <span aria-hidden className="absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center font-mono text-[8px] tracking-wider text-accent-foreground uppercase">{t("shelfNowTag")}</span>}
      {work.role && <span aria-hidden className="absolute top-0.5 left-0.5 rounded-full bg-surface/90 px-1 font-mono text-[7px] text-muted-foreground">{work.role}</span>}
    </Link>
  );
}
```

**Etiqueta de rol:** el código de arriba pinta `work.role` en crudo como marcador. Antes de cerrar la tarea, sustitúyelo (en `Cover` y en la lista accesible) por el texto traducido. Abre `src/components/saga/role-chip.tsx`, mira qué clave i18n usa para cada rol y llama a la misma. Si `RoleChip` es un componente de servidor, extrae su mapa `rol → clave` a `src/lib/sagas/role-style.ts` (si no vive ya allí) e impórtalo desde los dos sitios.

Claves nuevas en `messages/es.json`, namespace `saga`:

```json
    "shelfTitle": "El orden",
    "shelfCount": "{completed} de {total}",
    "shelfSegment": "{name}: {done} de {total}",
    "shelfTandem": "tándem",
    "shelfWindow": "ventana",
    "shelfWindowA11y": "ventana: entre {after} y {before}",
    "shelfNowTag": "ahora",
    "shelfState_done": "leída",
    "shelfState_now": "ahora",
    "shelfState_todo": "pendiente",
```

(`optionalChip` ya existe en `saga`: lo usa `SagaInfo`.)

- [ ] **Paso 4: ejecutar y ver que pasa.** `npx vitest run src/components/saga/ficha/saga-shelf.test.tsx` → PASS (5 tests). `npx tsc --noEmit -p .` → sin errores.

- [ ] **Paso 5: commit**

```bash
git add src/components/saga/ficha/saga-shelf.tsx src/components/saga/ficha/saga-shelf.test.tsx messages/es.json
git add -u src
git commit -m "feat(sagas): la balda de la ficha, con pilas, minibarra y lista accesible"
```

---

### Tarea 6: «Te toca» (`NextUpCard`)

**Ficheros:**
- Crear: `src/components/saga/ficha/next-up-card.tsx` (servidor)
- Test: `src/components/saga/ficha/next-up-card.test.tsx`
- Modificar: `messages/es.json`

**Interfaces:**
- Consume: `Shelf` (Tarea 2) y `detail.progress` / `detail.avgRating` no. La nota media del lector **no** está en `SagaDetail`, así que «La terminaste» no la muestra en la fase 1. Se añade en la fase 2 con «Tu paso».
- Produce: `<NextUpCard shelf={Shelf} />`, que devuelve `null` en modo `empty`.

**Variantes:**
- `next`: portada (60×90), eyebrow «Te toca», título, «nº N» si `work.no`, el nombre del grupo si no es null y, si `nextUp.fitsNow`, la línea «Ahora encaja también **X**» con enlace. Botón primario «Ir a la obra» → `work.href`. La acción de empezar vive en la ficha de la obra (su `PassCard`). Aquí no se duplica la lógica de pases.
- `start`: eyebrow «Empieza por» y la misma tarjeta.
- `finished`: «La terminaste» y el texto «Has leído todo lo que cuenta de esta saga.».
- `allOptional`: el texto existente `allOptional`.

- [ ] **Paso 1: test**

```tsx
// src/components/saga/ficha/next-up-card.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shelf, ShelfWork } from "@/lib/sagas/derive-shelf";
import { NextUpCard } from "./next-up-card";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((k: string) => k, { rich: (k: string) => k }),
}));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));
afterEach(cleanup);

const work: ShelfWork = { key: "i:book:b", title: "Hijos de Dune", href: "/libro/b", coverUrl: null, state: "now", role: null, optional: false, skipped: false, no: 3 };
const base: Shelf = { mode: "next", groups: [], openGroupKey: null, segments: [], nextUp: { work, groupName: "Crónicas", fitsNow: null } };

describe("NextUpCard", () => {
  it("modo next: eyebrow Te toca y enlace a la obra", async () => {
    render(await NextUpCard({ shelf: base }));
    expect(screen.getByText("nextUpEyebrow")).toBeTruthy();
    expect(screen.getByRole("link", { name: /nextUpGo/ }).getAttribute("href")).toBe("/libro/b");
  });
  it("modo start: eyebrow Empieza por", async () => {
    render(await NextUpCard({ shelf: { ...base, mode: "start" } }));
    expect(screen.getByText("nextUpStart")).toBeTruthy();
  });
  it("modo finished", async () => {
    render(await NextUpCard({ shelf: { ...base, mode: "finished", nextUp: null } }));
    expect(screen.getByText("nextUpFinished")).toBeTruthy();
  });
  it("modo empty no pinta nada", async () => {
    expect(await NextUpCard({ shelf: { ...base, mode: "empty", nextUp: null } })).toBeNull();
  });
});
```

- [ ] **Paso 2: ejecutar y ver que falla.**

- [ ] **Paso 3: implementar**

```tsx
// src/components/saga/ficha/next-up-card.tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Shelf } from "@/lib/sagas/derive-shelf";

// «Te toca» (spec 2026-10-27 §3). Lleva a la ficha de la obra: empezar un pase
// es cosa de su PassCard, aquí no se duplica esa lógica.
export async function NextUpCard({ shelf }: { shelf: Shelf }) {
  const t = await getTranslations("saga");
  const card = "rounded-[14px] border border-border bg-surface p-4";

  if (shelf.mode === "empty") return null;
  if (shelf.mode === "finished" || shelf.mode === "allOptional") {
    return (
      <section className={card} data-testid="next-up">
        <p className="font-mono text-[10px] tracking-[0.14em] text-green uppercase">{shelf.mode === "finished" ? t("nextUpFinished") : t("shelfTitle")}</p>
        <p className="mt-1 text-sm text-foreground-soft">{shelf.mode === "finished" ? t("nextUpFinishedText") : t("allOptional")}</p>
      </section>
    );
  }
  const next = shelf.nextUp;
  if (!next) return null;
  const { work } = next;
  const bold = { b: (chunks: ReactNode) => <b>{chunks}</b> };
  return (
    <section className={`${card} flex gap-4`} data-testid="next-up">
      <div className="relative h-[90px] w-[60px] shrink-0 overflow-hidden rounded-[4px] bg-surface-muted shadow-cover">
        {work.coverUrl && <Image src={work.coverUrl} alt="" fill sizes="60px" className="object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{shelf.mode === "start" ? t("nextUpStart") : t("nextUpEyebrow")}</p>
        <h2 className="mt-0.5 font-serif text-lg leading-tight font-semibold">{work.title}</h2>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {[next.groupName, work.no !== null && t("orderNo", { n: work.no })].filter(Boolean).join(" · ")}
        </p>
        {next.fitsNow && (
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href={next.fitsNow.href} className="underline-offset-2 hover:underline">
              {t.rich("nextUpFitsNow", { title: next.fitsNow.title, ...bold })}
            </Link>
          </p>
        )}
        <Link href={work.href} className="mt-3 inline-flex rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover">
          {t("nextUpGo")}
        </Link>
      </div>
    </section>
  );
}
```

Claves en `messages/es.json` (`saga`):

```json
    "nextUpEyebrow": "Te toca",
    "nextUpStart": "Empieza por",
    "nextUpGo": "Ir a la obra",
    "nextUpFitsNow": "Ahora encaja también <b>{title}</b>",
    "nextUpFinished": "La terminaste",
    "nextUpFinishedText": "Has leído todo lo que cuenta de esta saga.",
```

(`orderNo` ya existe: `"Nº {n}"`.)

- [ ] **Paso 4: verificar.** `npx vitest run src/components/saga/ficha/next-up-card.test.tsx` → PASS.

- [ ] **Paso 5: commit**

```bash
git add src/components/saga/ficha/next-up-card.tsx src/components/saga/ficha/next-up-card.test.tsx messages/es.json
git commit -m "feat(sagas): tarjeta Te toca de la ficha"
```

---

### Tarea 7: «Sobre la saga» y «Todas las obras»

**Ficheros:**
- Crear: `src/components/saga/ficha/saga-about.tsx`
- Mover: `git mv src/components/saga/saga-info.tsx src/components/saga/ficha/saga-all-works.tsx`
- Crear: `src/components/saga/ficha/works-filter.tsx` (cliente)
- Modificar: `messages/es.json`

**Interfaces:**
- Produce:
  - `<SagaAbout detail={SagaDetail} canConfigure={boolean} />`: sinopsis, columna de datos y el aviso de obras sin clasificar (solo para curadores).
  - `<SagaAllWorks groups={MemberGroup[]} windows={Record<string, ResolvedWindow>} />`: la rejilla de antes, sin sinopsis, sin botones de curación y sin aviso, envuelta en `WorksFilter`.
  - `<WorksFilter>{children}</WorksFilter>`: chips Todas/Libros/Películas/Series y Todas/Leídas/Pendientes. Oculta los `li[data-type]` que no encajan.

- [ ] **Paso 1: `SagaAbout`**

```tsx
// src/components/saga/ficha/saga-about.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { formatDots } from "@/lib/rating/dots";
import { RAIL } from "@/lib/ui/layout";

// «Sobre la saga» (spec 2026-10-27 §1.4): sinopsis + columna de datos, el
// mismo reparto `1fr | 340px` que la Info de la ficha de obra.
export async function SagaAbout({ detail, canConfigure }: { detail: SagaDetail; canConfigure: boolean }) {
  const t = await getTranslations("saga");
  const members = detail.groups.flatMap((g) => g.members);
  const byType = { book: 0, movie: 0, series: 0 };
  for (const m of members) byType[m.itemType] += 1;
  const years = members.map((m) => m.year).filter((y): y is number => y !== null);
  const unclassified = members.filter((m) => m.placement === null).length;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="saga-about">
      <div>
        <h2 className="mb-2 font-serif text-xl font-semibold">{t("aboutTitle")}</h2>
        <p className="text-[14px] leading-relaxed text-foreground">{detail.saga.overview ?? t("noSynopsis")}</p>
        {canConfigure && unclassified > 0 && (
          <aside className="mt-4 flex items-start gap-2.5 rounded-xl border border-border px-3.5 py-3">
            <span className="text-[15px] text-muted-foreground">◇</span>
            <p className="text-xs leading-relaxed">
              {t("unclassifiedNotice", { count: unclassified })}{" "}
              <Link href={`/saga/${detail.saga.id}/editar`} className="font-semibold underline">{t("unclassifiedCta")}</Link>
            </p>
          </aside>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 self-start rounded-[14px] border border-border bg-surface p-4 text-sm">
        <dt className="text-muted-foreground">{t("aboutWorks")}</dt>
        <dd>{detail.memberCount}</dd>
        <dt className="text-muted-foreground">{t("aboutTypes")}</dt>
        <dd>{t("aboutTypesValue", byType)}</dd>
        {years.length > 0 && (<><dt className="text-muted-foreground">{t("aboutYears")}</dt><dd>{Math.min(...years)}–{Math.max(...years)}</dd></>)}
        {detail.avgRating !== null && (<><dt className="text-muted-foreground">{t("aboutRating")}</dt><dd>{formatDots(detail.avgRating)}</dd></>)}
        {detail.childCount > 0 && (<><dt className="text-muted-foreground">{t("aboutSubsagas")}</dt><dd>{detail.childCount}</dd></>)}
      </dl>
    </section>
  );
}
```

Quita el import de `RAIL` si no lo usas (el literal `340px` va en la clase porque Tailwind lo necesita en el fuente; ver el comentario de `HOME_TWO_COL` en `layout.ts`).

Claves (`saga`):

```json
    "aboutTitle": "Sobre la saga",
    "aboutWorks": "Obras",
    "aboutTypes": "Tipos",
    "aboutTypesValue": "{book, plural, =0 {} other {# libros}}{movie, plural, =0 {} other { · # películas}}{series, plural, =0 {} other { · # series}}",
    "aboutYears": "Años",
    "aboutRating": "Media",
    "aboutSubsagas": "Subsagas",
    "allWorksTitle": "Todas las obras",
    "filterAll": "Todas",
    "filterBooks": "Libros",
    "filterMovies": "Películas",
    "filterSeries": "Series",
    "filterDone": "Leídas",
    "filterPending": "Pendientes",
```

`aboutTypesValue` puede dejar un « · » inicial si no hay libros. Si pasa, sustitúyelo por un formateo en el componente: `[byType.book && t("typeBooks",…), …].filter(Boolean).join(" · ")` con tres claves plurales sueltas (`typeBooks`, `typeMovies`, `typeSeries`). Elige esa opción si te resulta más clara.

- [ ] **Paso 2: recortar `SagaInfo` → `SagaAllWorks`**

```bash
git mv src/components/saga/saga-info.tsx src/components/saga/ficha/saga-all-works.tsx
```

En el fichero movido:
1. Renombra `export async function SagaInfo` a `SagaAllWorks`. Su firma pasa a `{ groups, windows }` (fuera `overview`, `canConfigure`, `sagaId` y `hasParent`).
2. Borra la `<section>` de la sinopsis, el `<aside>` del aviso de no clasificadas (ahora en `SagaAbout`) y el bloque `<div className="flex flex-wrap items-center gap-2">` con los tres `Link` de curación (ahora en `SagaCuratorMenu`). Deja el `<h2>` con `t("allWorksTitle")` en lugar de `t("itemsTitle")`.
3. Corrige los imports relativos: `./role-chip` pasa a `../role-chip`.
4. En los dos sitios donde se pinta un `<li>` con `MemberCell` (en `GroupBody` y en la lista de `freeMembers`), añade al `<li>`:
   `data-type={m.itemType} data-status={m.status === "completed" ? "done" : "pending"}`
5. Envuelve todo lo que devuelve en `<WorksFilter>…</WorksFilter>` y cambia el `px-4 pb-10` del contenedor raíz por nada: el padding lo pone la página.
6. Actualiza el comentario de cabecera: «Todas las obras (spec 2026-10-27 §1.8), antes la pestaña Info».

- [ ] **Paso 3: `WorksFilter`**

```tsx
// src/components/saga/ficha/works-filter.tsx
"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// Filtro de «Todas las obras» (spec 2026-10-27 §1.8). Esconde por CSS los
// `li[data-type][data-status]` que no encajan: la rejilla la pinta el servidor,
// con su reparto por subsaga, y aquí no se vuelve a calcular nada.
const TYPE_HIDE = {
  all: "",
  book: "[&_li[data-type]:not([data-type=book])]:hidden",
  movie: "[&_li[data-type]:not([data-type=movie])]:hidden",
  series: "[&_li[data-type]:not([data-type=series])]:hidden",
} as const;
const STATUS_HIDE = {
  all: "",
  done: "[&_li[data-status=pending]]:hidden",
  pending: "[&_li[data-status=done]]:hidden",
} as const;

export function WorksFilter({ children }: { children: ReactNode }) {
  const t = useTranslations("saga");
  const [type, setType] = useState<keyof typeof TYPE_HIDE>("all");
  const [status, setStatus] = useState<keyof typeof STATUS_HIDE>("all");
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-semibold ${on ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`;
  return (
    <div className={`${TYPE_HIDE[type]} ${STATUS_HIDE[status]}`} data-testid="works-filter">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "book", "movie", "series"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={type === k} className={chip(type === k)} onClick={() => setType(k)}>
            {t({ all: "filterAll", book: "filterBooks", movie: "filterMovies", series: "filterSeries" }[k])}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {(["all", "done", "pending"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={status === k} className={chip(status === k)} onClick={() => setStatus(k)}>
            {t({ all: "filterAll", done: "filterDone", pending: "filterPending" }[k])}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
```

`WorksFilter` es cliente y `SagaAllWorks` es servidor: pasarle hijos ya renderizados está permitido (los hijos viajan como payload RSC).

- [ ] **Paso 4: verificar.** `npx tsc --noEmit -p .` → sin errores (la ficha vieja aún importa `SagaInfo`: arréglalo en el paso siguiente si el typecheck lo marca, o deja ese error para la Tarea 8, que reescribe la página. En ese caso, haz el commit de esta tarea junto con la 8). `grep -rn "saga-info" src e2e` → solo la página de la ficha.

- [ ] **Paso 5: commit** (si el typecheck pasa; si no, júntalo con la Tarea 8)

```bash
git add src/components/saga/ficha messages/es.json
git add -u src
git commit -m "feat(sagas): Sobre la saga y Todas las obras con filtro"
```

---

### Tarea 8: la ficha nueva

**Ficheros:**
- Reescribir: `src/app/saga/[id]/page.tsx`
- Borrar: `src/components/saga/saga-hero.tsx`, `src/components/saga/saga-tabs.tsx`
- Revisar: `src/app/saga/[id]/loading.tsx` (esqueleto)

**Interfaces:**
- Consume todo lo anterior.

- [ ] **Paso 1: reescribir la página**

```tsx
// src/app/saga/[id]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaHref, sagaReadingHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { deriveShelf } from "@/lib/sagas/derive-shelf";
import { getShelfSections } from "@/lib/sagas/shelf-sections";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaHeroCinematic } from "@/components/saga/ficha/saga-hero-cinematic";
import { SagaCuratorMenu } from "@/components/saga/ficha/saga-curator-menu";
import { SagaShelf } from "@/components/saga/ficha/saga-shelf";
import { NextUpCard } from "@/components/saga/ficha/next-up-card";
import { SagaAbout } from "@/components/saga/ficha/saga-about";
import { SagaAllWorks } from "@/components/saga/ficha/saga-all-works";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} — Biblioshare` : "Biblioshare" };
}

// Ficha de saga para el lector (spec 2026-10-27). Composición plana: cada
// bloque recibe ya calculado lo que pinta. Sin `use cache` (regla #437).
export default async function SagaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string; rol?: string }>;
}) {
  const { id } = await params;
  const { tab, orden, ruta, rol } = await searchParams;

  // Enlaces viejos a la pestaña «Mapa de lectura»: su contenido vive ahora en
  // «Cómo leerla», con los mismos parámetros.
  if (tab === "mapa") {
    const q = new URLSearchParams();
    if (ruta) q.set("ruta", ruta);
    if (orden) q.set("orden", orden);
    if (rol) q.set("rol", rol);
    const qs = q.toString();
    redirect(qs ? `${sagaReadingHref(id)}?${qs}` : sagaReadingHref(id));
  }

  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  const canCurate = hasMinRole(detail.viewerRole, "collaborator");
  const activeRoute = resolveActiveRoute(detail, { ruta, orden });

  const [sections, backdropUrl] = await Promise.all([
    getShelfSections(supabase, detail, activeRoute),
    firstMovieBackdrop(supabase, detail),
  ]);
  const shelf = deriveShelf(sections, { authenticated: detail.isAuthenticated });

  return (
    <div className="flex w-full flex-col pb-12">
      <SagaHeroCinematic
        detail={detail}
        backdropUrl={backdropUrl}
        curatorMenu={canCurate ? <SagaCuratorMenu sagaId={detail.saga.id} hasParent={detail.parent !== null} /> : null}
      />
      <div className={`${DETAIL_CONTAINER} flex flex-col gap-8`}>
        <SagaShelf
          shelf={shelf}
          sagaName={detail.saga.name}
          routes={detail.routes.map((r) => ({ slug: r.slug, name: r.name }))}
          activeRoute={activeRoute}
          baseHref={sagaHref(detail.saga.id)}
          readingHref={`${sagaReadingHref(detail.saga.id)}?ruta=${encodeURIComponent(activeRoute)}`}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <NextUpCard shelf={shelf} />
          {/* Columna derecha reservada a «Entre amigos» (fase 3). */}
        </div>
        <SagaAbout detail={detail} canConfigure={canCurate} />
        <section>
          <SagaAllWorks groups={detail.groups} windows={detail.windows} />
        </section>
      </div>
    </div>
  );
}

// Backdrop de TMDB de la primera película de la saga que lo tenga (spec §1).
// Una consulta pequeña y con sesión: las películas son catálogo público, pero
// no hay `use cache` en esta página (regla #437) y no hace falta ninguno.
async function firstMovieBackdrop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  detail: NonNullable<Awaited<ReturnType<typeof getSagaDetail>>>,
): Promise<string | null> {
  const movies = detail.groups.flatMap((g) => g.members).filter((m) => m.itemType === "movie");
  if (movies.length === 0) return null;
  const { data } = await supabase
    .from("movies")
    .select("id, backdrop_url, release_year")
    .in("id", movies.map((m) => m.itemId))
    .not("backdrop_url", "is", null)
    .order("release_year", { ascending: true, nullsFirst: false })
    .limit(1);
  return (data?.[0]?.backdrop_url as string | undefined) ?? null;
}
```

Antes de dar `redirect` por bueno, confirma en `node_modules/next/dist/docs/` que en esta versión `redirect()` dentro de un page component sigue lanzando y cortando el render (las páginas `/mapa` y `/rutas` ya lo usan así; si la doc dice otra cosa, sigue la doc). Comprueba también que `SagaRoute` tiene `name`. Si se llama distinto (`label`, `title`), usa ese campo.

- [ ] **Paso 2: borrar lo sustituido**

```bash
git rm src/components/saga/saga-hero.tsx src/components/saga/saga-tabs.tsx
grep -rn "saga-hero\"\|saga-tabs\|SagaHero\b\|SagaTabs\|tabInfo\|\"tabMap\"" src e2e
```

El grep no debe devolver usos de componentes. Si `saga.tabInfo` y `saga.tabMap` quedan sin uso en `messages/es.json`, bórralos. `saga.tabInfo` aparece dos veces en el JSON: borra solo la del namespace `saga`, cerca de la línea 2337. Usa el agente `i18n-keeper` si quieres una pasada de claves huérfanas en `saga`.

- [ ] **Paso 3: esqueleto**

Abre `src/app/saga/[id]/loading.tsx` y ajústalo a la forma nueva: un bloque de hero de unos 300 px de alto, una fila de pilas y portadas y una tarjeta. Usa `Skeleton` y `SkeletonLine` de `@/components/ui/skeleton` dentro de `DETAIL_CONTAINER`, igual que el esqueleto actual usa los suyos. No dejes el esqueleto de pestañas.

- [ ] **Paso 4: verificar**

```bash
npx tsc --noEmit -p .
npx vitest run src/lib/sagas src/components/saga src/lib/reactivity
```

Esperado: sin errores y todo en verde. Después, con `next dev` en el 3000, abre en el navegador (qa-verifier o el pane) una saga de dev con subsagas y otra sin ellas, en 390 px y en 1440 px:
- la ficha abre con la balda centrada en «ahora»;
- los chips cambian la balda;
- pulsar una pila la despliega;
- `?tab=mapa&ruta=publicacion` redirige a `/como-leerla?ruta=publicacion`;
- sin sesión (ventana privada) no hay «ahora» y la tarjeta dice «Empieza por»;
- no hay scroll horizontal de página en 390 px (solo dentro de la balda).

- [ ] **Paso 5: commit**

```bash
git add -A src messages/es.json
git commit -m "feat(sagas): ficha de saga nueva con hero, balda y Te toca (fase 1)"
```

---

### Tarea 9: e2e de la ficha nueva, contra build de producción

**Ficheros:**
- Crear: `e2e/sagas-ficha-lector.spec.ts`
- Revisar: los e2e de sagas que todavía comprueban la ficha vieja

Antes de escribir nada, lee `e2e/sagas-v2.spec.ts` y `e2e/sagas-timeline-estados.spec.ts` para copiar **su** patrón de seed, login y limpieza (prefijos desechables, helpers de `e2e/`). No inventes helpers. Lee también la memoria «Contrato de imports de club-ronda»: no añadas imports nuevos a `e2e/club-ronda.spec.ts`.

- [ ] **Paso 1: escribir el spec**

Casos (con el seed de universo de dos subsagas y una obra leída que ya usan los specs de timeline):
1. La ficha muestra `saga-hero` y `saga-shelf`. `shelf-now` existe y apunta a la primera obra no leída.
2. La pila de la subsaga terminada (`shelf-pile-<id>`) existe. Al pulsarla se despliega y aparece la pila de la otra.
3. Pulsar `shelf-segment-<id>` despliega ese grupo.
4. Con dos itinerarios, pulsar el chip «Publicación» cambia la URL a `?ruta=publicacion` y cambia el orden de la balda (compara el `href` de la primera portada antes y después).
5. `next-up` contiene el título de la obra «ahora» y su enlace lleva a su ficha.
6. `/saga/<id>?tab=mapa&ruta=publicacion` acaba en `/saga/<id>/como-leerla?ruta=publicacion` y muestra el selector de itinerario.
7. Sin sesión (contexto nuevo sin `storageState`): no existe `shelf-now` y `next-up` contiene «Empieza por».
8. `shelf-a11y-list` tiene tantos `li` como obras tiene la saga sembrada.

- [ ] **Paso 2: revisar los specs que aún miran la ficha vieja**

`grep -n "Títulos que la componen\|itemsTitle\|saga-hero-progress\|Info\b" e2e/sagas-*.spec.ts`. El testid `saga-hero-progress` (#91) desaparece con el hero viejo. Si algún spec lo usa, cámbialo por la suma que enseña `SagaShelf` («N de M»). El hero viejo contaba el universo entero. La balda cuenta el itinerario activo, igual que antes contaba `RouteView`. Antes de reescribir la aserción, comprueba qué contaba la vieja: si comparaba «no cambia al cambiar de ruta», ese invariante ahora es falso a propósito. Ajusta el test y deja constancia en el commit.

- [ ] **Paso 3: ejecutar contra build de producción**

```bash
npm run build
npx next start -p 3000
```

En otra terminal:

```bash
npx playwright test e2e/sagas-ficha-lector.spec.ts e2e/sagas-v2.spec.ts e2e/sagas-itinerarios.spec.ts e2e/sagas-timeline-estados.spec.ts e2e/sagas-v2-mapa.spec.ts
```

Esperado: PASS. Para el servidor al acabar (higiene del entorno de `AGENTS.md`).

- [ ] **Paso 4: commit**

```bash
git add e2e
git commit -m "test(sagas): e2e de la ficha de saga para el lector"
```

---

### Tarea 10: cierre documental

**Ficheros:**
- Modificar: `docs/requirements/decisiones.md` (entrada nueva al final)
- Modificar: `docs/requirements/backlog.md`
- Modificar: `docs/architecture/graph.json` (y lo que diga `docs/architecture/README.md` para regenerarlo)
- Modificar: `docs/superpowers/specs/2026-10-27-sagas-ficha-lector-design.md` (cabecera de estado y la nota sobre `/como-leerla`)
- Crear: `docs/testing/2026-10-27-sagas-ficha-lector-f1.md` (evidencia)

- [ ] **Paso 1: `decisiones.md`.** Entrada nueva al final (es append-only) con tres decisiones:
  1. La ficha de saga es una balda de pilas por subsaga, no un timeline.
  2. Las pestañas Info y Mapa desaparecen de la ficha. Su contenido detallado se muda a `/saga/[id]/como-leerla`, interina hasta el atlas. `?tab=mapa` redirige allí.
  3. La balda usa el grafo derivado aunque `show_map` esté apagado (`SagaDetail.shelfGraph`): el interruptor esconde el mapa, no el orden.

  Incluye también el cambio de semántica del contador: el hero ya no muestra el progreso del universo entero (#91), y el «N de M» de la balda es el del itinerario activo.
- [ ] **Paso 2: backlog.** Añade el ítem «Rework de sagas · subproyecto 1, fase 1 (ficha de saga para el lector)» marcado, con enlace a la spec, en la sección que corresponda a sagas. Deja sin marcar las fases 2 y 3.
- [ ] **Paso 3: grafo de arquitectura.** Regenera o edita `graph.json` según `docs/architecture/README.md`: el flujo de la ficha de saga pasa por `getSagaDetail → getShelfSections → deriveShelf → SagaShelf/NextUpCard`, y hay un nodo nuevo para `/como-leerla`.
- [ ] **Paso 4: spec.** En la cabecera: `status: fase 1 implementada (PR #…)`. En §5, sustituye «`?tab=mapa` … redirige a `/saga/[id]/mapa`» por la redirección real a `/como-leerla` y explica en una línea por qué: el timeline, adoptar y saltar solo vivían en la pestaña. Esto es un cambio respecto a la spec aprobada y queda registrado aquí y en `decisiones.md`.
- [ ] **Paso 5: evidencia.** `docs/testing/2026-10-27-sagas-ficha-lector-f1.md` con los comandos ejecutados, su resultado, las capturas de qa-verifier (390 y 1440) y lo que no se pudo verificar.
- [ ] **Paso 6: issues.**
  - Abre la de la fase 2 (`area:sagas,tipo:feature,P3`): «Tu paso», «Subsagas», acceso al atlas, la nota media en «La terminaste» y el cierre de #761.
  - Abre la de la fase 3 (`area:sagas,tipo:feature,P3`): «Entre amigos».
  - Si al implementar descubriste algo pendiente, ábrelo en su propia issue (lee antes `docs/agents/issue-tracker.md`).
- [ ] **Paso 7: commit**

```bash
git add docs
git commit -m "docs(sagas): cierre de la fase 1 de la ficha de saga para el lector"
```
