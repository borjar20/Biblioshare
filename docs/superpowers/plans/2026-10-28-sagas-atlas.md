# Atlas de la saga — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir `/saga/[id]/mapa` (grafo React Flow) y `/saga/[id]/como-leerla` (timeline interino) por
un atlas a pantalla completa con zoom semántico, tres lentes (Orden, Rol, Publicación) y dos capas
(Itinerario, Progreso).

**Architecture:** Lógica pura en `src/lib/sagas/atlas/`. `deriveAtlas` parte de
`deriveShelf(deriveTimeline(shelfGraph))` y devuelve obras y regiones; `layoutOrden`, `layoutRol` y
`layoutPublicacion` las colocan en coordenadas de mundo. La vista es DOM y SVG dentro de un plano con
`transform`, gobernado por la cámara pura de Entre nosotros, movida a `src/lib/atlas/camera.ts`. La
página es un Server Component sin `use cache`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + CSS module, next-intl,
Vitest (+ RTL con `// @vitest-environment jsdom`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-sagas-atlas-design.md`. Léela antes de cualquier tarea.

## Global Constraints

- Docs, comentarios y copy en **español**. Las cadenas visibles van en `messages/es.json` bajo
  `saga.atlas.*`. Antes de añadir claves, mira cómo está organizado `messages/` (agente
  `i18n-keeper` si hay más locales).
- **Sin `use cache`** en nada que lea `detail` (regla #437, `AGENTS.md`).
- El estado del lector sale de `passes` vía `getSagaDetail`. **Nunca** de `library_entries`.
- **Sin migraciones ni cambios de esquema.** Si una tarea parece necesitarlos, para y avisa.
- Next.js 16: antes de usar una API de Next (`redirect`, `searchParams`, `useRouter`,
  `useSearchParams`), consulta `node_modules/next/dist/docs/`.
- Node 22 en bash: `export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH"`.
- Unitarios: `npx vitest run <ruta>`. Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Un solo `next dev`, en el puerto 3000. En worktree: `npx next dev --webpack -p 3000`. Los e2e van
  contra `npm run build` + `npx next start -p 3000`.
- Los objetivos táctiles miden ≥ 44 px. Ninguna señal depende solo del color.
- Commits pequeños, con el mensaje terminado en
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tokens de color del lienzo: `--map-window`, `--map-tandem` y `--map-itinerary-jump`
  (`src/app/globals.css`), y los acentos de `SAGA_ACCENT` (`src/lib/sagas/accents.ts`).

## Mapa de ficheros

```
src/lib/atlas/camera.ts               (movido) cámara pura compartida
src/lib/atlas/types.ts                (movido) Point, Camera, Viewport, Extent
src/lib/sagas/atlas/itinerary.ts      itinerarySteps: entradas → pasos por obra (#1541)
src/lib/sagas/atlas/route-counter.ts  routeCounter: «Llevas X de Y» de la ruta activa
src/lib/sagas/atlas/model.ts          deriveAtlas
src/lib/sagas/atlas/layout.ts         layoutOrden, layoutRol, layoutPublicacion, islas
src/lib/sagas/atlas/summary.ts        summarize por lente
src/lib/sagas/atlas/lens.ts           parseo de ?lente= / ?rol= y traducción de params viejos
src/lib/sagas/atlas/camera-storage.ts sessionStorage de la cámara (try/catch)
src/components/saga/atlas/
  saga-atlas.tsx          isla cliente raíz
  atlas-plane.tsx         plano transformado (SVG de fondo + obras)
  atlas-work.tsx          una obra por nivel de zoom
  atlas-backdrop.tsx      regiones, arcos, carriles, eje, hilos (SVG)
  use-atlas-camera.ts     viewport, gestos, rueda, pellizco, persistencia
  itinerary-sheet.tsx     chip + hoja/desplegable de itinerarios
  work-sheet.tsx          mini-ficha
  atlas-list.tsx          «Ver como lista»
  adopt-route-button.tsx  (mudado desde src/components/saga/)
  skip-optional-button.tsx (reescrito para AtlasWork)
  atlas.module.css
src/app/saga/[id]/mapa/page.tsx       atlas (reescrito)
src/app/saga/[id]/como-leerla/page.tsx  solo redirect
e2e/sagas-atlas.spec.ts               nuevo
```

---

### Task 1: Mover la cámara a un módulo compartido

**Files:**
- Create: `src/lib/atlas/camera.ts`, `src/lib/atlas/types.ts`, `src/lib/atlas/camera.test.ts`
- Delete: `src/lib/comparisons/atlas/camera.ts`, `src/lib/comparisons/atlas/camera.test.ts`
- Modify: `src/lib/comparisons/atlas/types.ts` y todos los imports de `@/lib/comparisons/atlas/camera`
  (`grep -rn "comparisons/atlas/camera" src`: `atlas-engine.ts`, `atlas-canvas.test.tsx`,
  `paint-islas.ts`, `paint-opinion.ts`, `paint-opinion.test.ts`, `paint-quien.ts`, `paint-tiempo.ts`)

**Interfaces:**
- Produces: `@/lib/atlas/camera` exporta sin cambios `MIN_ZOOM`, `MAX_ZOOM`, `clamp`, `toScreen`,
  `toWorld`, `zoomAt`, `panBy`, `zoomToward`, `fit`, `stepCamera` y `approach`. `@/lib/atlas/types`
  exporta `Point`, `Camera`, `Viewport` y `Extent`.

- [ ] **Step 1:** `git mv src/lib/comparisons/atlas/camera.ts src/lib/atlas/camera.ts` y lo mismo con
  `camera.test.ts`. Crea `src/lib/atlas/types.ts` con los cuatro tipos geométricos, copiados de
  `src/lib/comparisons/atlas/types.ts`:

```ts
// Geometría compartida por los atlas (Entre nosotros y sagas).
export type Point = { x: number; y: number };
export type Camera = { x: number; y: number; k: number };
export type Viewport = { width: number; height: number };
export type Extent = { minX: number; minY: number; maxX: number; maxY: number };
```

- [ ] **Step 2:** En `src/lib/comparisons/atlas/types.ts`, sustituye esas cuatro líneas por
  `export type { Point, Camera, Viewport, Extent } from '@/lib/atlas/types';`. En
  `src/lib/atlas/camera.ts`, el import pasa a `from './types'` (ya lo es; comprueba que resuelve al
  nuevo `types.ts`).
- [ ] **Step 3:** Cambia cada import `@/lib/comparisons/atlas/camera` por `@/lib/atlas/camera`.
- [ ] **Step 4:** Ejecuta `npx vitest run src/lib/atlas src/lib/comparisons src/components/comparisons`
  y `npx tsc --noEmit`. Esperado: todo PASS y sin errores.
- [ ] **Step 5:** Commit `refactor(atlas): cámara compartida en src/lib/atlas`.

---

### Task 2: Pasos del itinerario por obra (#1541) y contador

**Files:**
- Modify: `src/lib/sagas/shelf-sections.ts` (extraer `mainOrderFor`)
- Create: `src/lib/sagas/atlas/itinerary.ts`, `src/lib/sagas/atlas/itinerary.test.ts`
- Create: `src/lib/sagas/atlas/route-counter.ts`, `src/lib/sagas/atlas/route-counter.test.ts`

**Interfaces:**
- Consumes: `RawRouteEntry` (`route-types.ts`), `keyOfRouteEntry` (`hydrate-route-draft.ts`),
  `createCuratedOrder` (`curated-order.ts`), `resolveRoute` (`resolve-route.ts`).
- Produces:
  - `mainOrderFor(detail: Pick<SagaDetail,"groups"|"windows"|"orderSagas"|"orderMemberships">): (sagaId: string) => string[]`,
    exportada desde `shelf-sections.ts`;
  - `type ItineraryStep = { key: string; step: number; note: string | null }`;
  - `itinerarySteps(entries: RawRouteEntry[], mainOrderOf: (sagaId: string) => string[]): ItineraryStep[]`;
  - `routeCounter(detail: Pick<SagaDetail,"groups"|"childRefs"|"windows"|"orderSagas"|"orderMemberships">, entries: RawRouteEntry[]): { completed: number; total: number }`.

- [ ] **Step 1: extraer `mainOrderFor`.** En `shelf-sections.ts`, mueve las dos líneas que construyen
  `titles` y `mainOrder` dentro de `curatedRouteSections` a una función exportada, y haz que
  `curatedRouteSections` la use:

```ts
/** Orden principal de cada subsaga (`tipo:id`), el de `createCuratedOrder`: la
 *  MISMA expansión de bloques que usan la balda, RouteView y el atlas. */
export function mainOrderFor(
  detail: Pick<SagaDetail, "groups" | "windows" | "orderSagas" | "orderMemberships">,
): (sagaId: string) => string[] {
  const titles = new Map<string, string>(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m.title]));
  return createCuratedOrder(detail.orderSagas, detail.orderMemberships, (k) => titles.get(k) ?? "", detail.windows);
}
```

  Ejecuta `npx vitest run src/lib/sagas/shelf-sections.test.ts`. Esperado: PASS, sin cambios de
  comportamiento.

- [ ] **Step 2: test de `itinerarySteps`.**

```ts
// src/lib/sagas/atlas/itinerary.test.ts
import { describe, expect, it } from "vitest";
import type { RawRouteEntry } from "../route-types";
import { itinerarySteps } from "./itinerary";

const item = (position: number, id: string, note: string | null = null): RawRouteEntry =>
  ({ position, itemType: "book", itemId: id, childSagaId: null, note });
const block = (position: number, sagaId: string, note: string | null = null): RawRouteEntry =>
  ({ position, itemType: null, itemId: null, childSagaId: sagaId, note });
const mainOrderOf = (sagaId: string) => (sagaId === "guardia" ? ["book:g1", "book:g2"] : []);

describe("itinerarySteps", () => {
  it("expande un bloque en sus obras, numeradas por obra y con la nota del paso (#1541)", () => {
    expect(itinerarySteps([block(1, "guardia", "Empieza aquí")], mainOrderOf)).toEqual([
      { key: "i:book:g1", step: 1, note: "Empieza aquí" },
      { key: "i:book:g2", step: 2, note: "Empieza aquí" },
    ]);
  });
  it("mixto: obra + bloque, en orden de position aunque lleguen barajadas", () => {
    expect(itinerarySteps([block(2, "guardia"), item(1, "a", "Primero")], mainOrderOf).map((s) => [s.key, s.step]))
      .toEqual([["i:book:a", 1], ["i:book:g1", 2], ["i:book:g2", 3]]);
  });
  it("deduplica por primera aparición", () => {
    expect(itinerarySteps([item(1, "g2"), block(2, "guardia")], mainOrderOf).map((s) => s.key))
      .toEqual(["i:book:g2", "i:book:g1"]);
  });
  it("un bloque vacío o inexistente no aporta pasos", () => {
    expect(itinerarySteps([block(1, "nada")], mainOrderOf)).toEqual([]);
  });
});
```

- [ ] **Step 3:** Ejecuta `npx vitest run src/lib/sagas/atlas/itinerary.test.ts`. Esperado: FAIL,
  no existe el módulo.
- [ ] **Step 4: implementación.**

```ts
// src/lib/sagas/atlas/itinerary.ts
import { keyOfRouteEntry } from "../hydrate-route-draft";
import type { RawRouteEntry } from "../route-types";

export type ItineraryStep = { key: string; step: number; note: string | null };

/** Pasos de un itinerario curado, uno por OBRA (#1541). Un paso-bloque
 *  (`s:<uuid>`) se expande en las obras de esa subsaga en su orden principal
 *  (`mainOrderFor`), la misma expansión que `expandRouteKeys` usa en la balda, y
 *  cada obra hereda la nota del paso. Se queda la primera aparición de cada
 *  obra. Consecuencia asumida: `step` cuenta obras, no pasos del editor. */
export function itinerarySteps(entries: RawRouteEntry[], mainOrderOf: (sagaId: string) => string[]): ItineraryStep[] {
  const out: ItineraryStep[] = [];
  const seen = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.position - b.position)) {
    const key = keyOfRouteEntry(e);
    const keys = key.startsWith("s:") ? mainOrderOf(key.slice(2)).map((k) => `i:${k}`) : [key];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, step: out.length + 1, note: e.note });
    }
  }
  return out;
}
```

- [ ] **Step 5:** Ejecuta el test. Esperado: PASS.
- [ ] **Step 6: `routeCounter`.** Test primero. Usa un fixture `detail` mínimo: dos grupos con
  `DetailMember` (copia la forma de los fixtures de `src/lib/sagas/resolve-route.test.ts`), una obra
  `status: "completed"` y la entrada de bloque. Espera `{ completed: 1, total: 2 }`. Después, la
  implementación, que es la construcción de `lookup` de `route-view.tsx` (líneas 49–99) movida aquí:

```ts
// src/lib/sagas/atlas/route-counter.ts
import { isSagaAccentToken } from "../accents";
import type { SagaDetail } from "../get-saga-detail";
import { resolveRoute } from "../resolve-route";
import type { RawRouteEntry } from "../route-types";
import { mainOrderFor } from "../shelf-sections";

/** «Llevas X de Y» de un itinerario curado: el mismo `resolveRoute` que pintaba
 *  la cabecera de RouteView, con el mismo lookup. Cuenta miembros únicos. */
export function routeCounter(
  detail: Pick<SagaDetail, "groups" | "childRefs" | "windows" | "orderSagas" | "orderMemberships">,
  entries: RawRouteEntry[],
): { completed: number; total: number } {
  const members = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m]));
  const groupAccent = new Map(detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])));
  const childNames = new Map(detail.childRefs.map((c) => [c.id, c.name] as const));
  const childAccent = new Map(
    detail.childRefs.map((c) => [c.id, groupAccent.get(c.id) ?? (isSagaAccentToken(c.accentColor) ? c.accentColor : "beige")] as const),
  );
  const { completed, total } = resolveRoute(entries, { members, childNames, childAccent, mainOrderOf: mainOrderFor(detail) });
  return { completed, total };
}
```

- [ ] **Step 7:** Ejecuta `npx vitest run src/lib/sagas/atlas src/lib/sagas/shelf-sections.test.ts`.
  Esperado: PASS.
- [ ] **Step 8:** Commit `feat(sagas): pasos de itinerario por obra para el atlas (#1541)`.

---

### Task 3: Modelo `deriveAtlas`

**Files:**
- Create: `src/lib/sagas/atlas/model.ts`, `src/lib/sagas/atlas/model.test.ts`

**Interfaces:**
- Consumes: `deriveShelf`, `Shelf`, `ShelfMode` (`derive-shelf.ts`), `TimelineSection` y `TimelineRow`
  (`derive-timeline.ts`), `ItineraryStep` (Task 2).
- Produces (exactamente estos nombres):

```ts
export type AtlasWorkState = "done" | "now" | "todo";
export type AtlasWindow = { reason: WindowReason | null; afterKey: string | null; beforeKey: string | null;
  afterTitle: string | null; beforeTitle: string | null; notice: "antes" | "dentro" | "pasada" | null };
export type AtlasTandem = { mode: TandemMode | null; note: string | null; partnerKeys: string[] };
export type AtlasWork = {
  key: string; title: string; href: string; coverUrl: string | null;
  state: AtlasWorkState; role: SagaItemRole | null;
  optional: boolean; skipped: boolean; ownerSagaId: string;
  regionKey: string; readingNo: number | null; readingIndex: number; year: number | null;
  /** Opcional sin número que cuelga bajo su subsaga (los `extras` de la balda). */
  extra: boolean;
  window: AtlasWindow | null; tandem: AtlasTandem | null;
  step: number | null; stepNote: string | null;
};
export type AtlasRegion = { key: string; name: string | null; accent: SagaAccentToken;
  state: "done" | "current" | "future"; counted: number; completed: number };
export type AtlasModel = { works: AtlasWork[]; regions: AtlasRegion[]; nowKey: string | null;
  mode: ShelfMode; nextTitle: string | null; hasItinerary: boolean };
export function deriveAtlas(input: {
  sections: TimelineSection[]; authenticated: boolean;
  years: Map<string, number | null>; steps: ItineraryStep[] | null;
}): AtlasModel;
```

`years` va indexado por id de nodo (`i:<tipo>:<uuid>`).

- [ ] **Step 1: tests.** Reutiliza los helpers `n`, `entry` y `sec` de `derive-shelf.test.ts`
  (cópialos; no se importa entre tests). Casos:

```ts
// src/lib/sagas/atlas/model.test.ts (extracto: escribe los siete casos)
import { describe, expect, it } from "vitest";
import type { TimelineRow, TimelineSection } from "../derive-timeline";
import type { SagaGraphNode } from "../map-types";
import { deriveAtlas } from "./model";
// …helpers n/entry/sec copiados de derive-shelf.test.ts…
const base = { authenticated: true, years: new Map<string, number | null>(), steps: null };

it("orden de lectura: readingIndex consecutivo, «ahora» y regiones con estado", () => {
  const m = deriveAtlas({ ...base, sections: [
    sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
    sec([entry(n("b"), 2), entry(n("c"), 3)], "s2", "Dos"),
  ] });
  expect(m.works.map((w) => [w.key, w.readingIndex, w.state, w.regionKey])).toEqual([
    ["i:book:a", 0, "done", "s1"], ["i:book:b", 1, "now", "s2"], ["i:book:c", 2, "todo", "s2"],
  ]);
  expect(m.nowKey).toBe("i:book:b");
  expect(m.regions.map((r) => [r.key, r.state, r.counted, r.completed])).toEqual([["s1", "done", 1, 1], ["s2", "current", 2, 0]]);
});
it("ventana: anclas, motivo y aviso salen de la fila del timeline", () => {
  const a = n("a"), b = n("b"), w = n("w", { windowReason: "contexto" });
  const row: TimelineRow = { kind: "window", no: null, node: w, after: a, before: b, reason: "contexto",
    track: { fromPct: 0, toPct: 50, youPct: 10, notice: "dentro" } };
  const m = deriveAtlas({ ...base, sections: [sec([entry(a, 1), row, entry(b, 2)])] });
  expect(m.works.find((x) => x.key === "i:book:w")?.window).toEqual({ reason: "contexto",
    afterKey: "i:book:a", beforeKey: "i:book:b", afterTitle: "A", beforeTitle: "B", notice: "dentro" });
});
// tándem: partnerKeys son las otras obras del hueco; mode/note de la fila.
// rol, opcional y saltada se copian del nodo; ownerSagaId también.
// rama opcional (branch) → extra: true y readingNo null.
// sin sesión: ningún «now», nowKey null y mode "start".
// steps: step/stepNote solo en las obras nombradas; hasItinerary true; year sale de `years`.
```

- [ ] **Step 2:** Ejecuta el test. Esperado: FAIL.
- [ ] **Step 3: implementación.**

```ts
// src/lib/sagas/atlas/model.ts
import type { SagaAccentToken } from "../accents";
import { deriveShelf, type ShelfMode, type ShelfSlot, type ShelfWork } from "../derive-shelf";
import type { TimelineRow, TimelineSection } from "../derive-timeline";
import type { SagaGraphNode } from "../map-types";
import type { SagaItemRole, TandemMode, WindowReason } from "../types";
import type { ItineraryStep } from "./itinerary";
// …tipos exportados de arriba…

// Modelo del atlas de la saga (spec 2026-10-28 §4.1). Puro. NO decide nada que
// ya decida la balda: «ahora», estados de región y anclas salen de `deriveShelf`;
// aquí solo se aplana en una lista de obras con lo que el lienzo necesita.
export function deriveAtlas(input: {
  sections: TimelineSection[]; authenticated: boolean;
  years: Map<string, number | null>; steps: ItineraryStep[] | null;
}): AtlasModel {
  const shelf = deriveShelf(input.sections, { authenticated: input.authenticated });

  // Fila del timeline de cada nodo: de ahí salen ventana y tándem, que la balda resume.
  const rowOf = new Map<string, { node: SagaGraphNode; row: TimelineRow | null }>();
  for (const s of input.sections) for (const row of s.rows) {
    for (const node of row.kind === "tandem" ? row.nodes : [row.node]) rowOf.set(node.id, { node, row });
    if (row.kind === "entry" || row.kind === "tandem") for (const b of row.branches) rowOf.set(b.node.id, { node: b.node, row: null });
  }
  const stepOf = new Map((input.steps ?? []).map((s) => [s.key, s] as const));

  const works: AtlasWork[] = [];
  const push = (w: ShelfWork, regionKey: string, extra: boolean, slot: ShelfSlot | null) => {
    const info = rowOf.get(w.key);
    const row = info?.row ?? null;
    const step = stepOf.get(w.key) ?? null;
    works.push({
      key: w.key, title: w.title, href: w.href, coverUrl: w.coverUrl, state: w.state, role: w.role,
      optional: w.optional, skipped: w.skipped, ownerSagaId: info?.node.ownerSagaId ?? "",
      regionKey, readingNo: w.no, readingIndex: works.length, year: input.years.get(w.key) ?? null, extra,
      window: row?.kind === "window" && row.node.id === w.key
        ? { reason: row.reason, afterKey: row.after?.id ?? null, beforeKey: row.before?.id ?? null,
            afterTitle: row.after?.label ?? null, beforeTitle: row.before?.label ?? null, notice: row.track?.notice ?? null }
        : null,
      tandem: slot?.kind === "tandem" && row?.kind === "tandem"
        ? { mode: row.mode, note: row.note, partnerKeys: slot.works.filter((o) => o.key !== w.key).map((o) => o.key) }
        : null,
      step: step?.step ?? null, stepNote: step?.note ?? null,
    });
  };
  for (const g of shelf.groups) {
    for (const slot of g.slots) for (const w of slot.kind === "tandem" ? slot.works : [slot.work]) push(w, g.key, false, slot);
    for (const w of g.extras) push(w, g.key, true, null);
  }

  return {
    works,
    regions: shelf.groups.map((g) => ({ key: g.key, name: g.name, accent: g.accent, state: g.state, counted: g.counted, completed: g.completed })),
    nowKey: works.find((w) => w.state === "now")?.key ?? null,
    mode: shelf.mode,
    nextTitle: shelf.nextUp?.work.title ?? null,
    hasItinerary: input.steps !== null,
  };
}
```

- [ ] **Step 4:** Ejecuta el test. Esperado: PASS los siete casos.
- [ ] **Step 5:** Commit `feat(sagas): modelo del atlas de la saga`.

---

### Task 4: Layouts de las tres lentes

**Files:**
- Create: `src/lib/sagas/atlas/layout.ts`, `src/lib/sagas/atlas/layout.test.ts`

**Interfaces:**
- Consumes: `AtlasModel`, `AtlasWork` (Task 3), `SAGA_ITEM_ROLES` (`roles.ts`), `Extent`
  (`@/lib/atlas/types`).
- Produces:

```ts
export type Orientation = "h" | "v";
export type Lens = "orden" | "rol" | "publicacion";
export const COVER_W = 60, COVER_H = 90;
export type PlacedWork = { key: string; x: number; y: number; scale: number }; // centro de la portada
export type AtlasLayout = {
  items: PlacedWork[];
  regions: Array<{ key: string; x: number; y: number; w: number; h: number }>; // solo Orden
  islands: Array<{ key: string; x: number; y: number; r: number }>;            // solo Orden, ≥ 2 regiones
  arcs: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; via: { x: number; y: number } }>;
  guides: Array<{ kind: "lane" | "tick"; key: string; x: number; y: number }>; // carriles (Rol) / años (Publicación)
  threads: Array<{ kind: "rol" | "publicacion"; keys: string[] }>;
  extent: Extent;
};
export function layoutAtlas(model: AtlasModel, lens: Lens, orientation: Orientation): AtlasLayout;
```

Reglas (spec §5.1). Se calcula siempre en horizontal, con `a` el eje del orden y `c` el transversal,
y al final `v` intercambia x↔y en items, regiones, islas, arcos y guías (w↔h):

- **Orden:** `STEP = 84`, `REGION_GAP = 60`, `PAD = 24`.
  - Recorre las obras no `extra` y sin `window` por `readingIndex`. Cada una ocupa `a = cursor`,
    `c = 0`, y `cursor += STEP`.
  - La segunda y siguientes obras de un tándem (`tandem.partnerKeys` contiene una obra ya colocada)
    no avanzan: `a = a_pareja + 14`, `c = 10`.
  - Al cambiar de `regionKey`, `cursor += REGION_GAP`.
  - Las obras con `window` se colocan después: `a` = punto medio entre las anclas colocadas (si solo
    hay una, esa + STEP/2; si ninguna, el final de su región) y `c = -130`. Llevan un arco de ancla a
    ancla con `via` en la propia obra. Sin las dos anclas no hay arco.
  - Las `extra` van bajo su región: `c = 140`, `scale = 0.7`, desde el inicio de la región con paso
    `STEP * 0.7`.
  - Región = rectángulo de sus obras de fila (`c` de −COVER_H/2−PAD a +COVER_H/2+PAD; las de
    ventana y las extra no ensanchan el rectángulo).
  - Isla = centro del rectángulo, `r = 30 * sqrt(número de obras de la región)`. Solo si hay ≥ 2
    regiones.
- **Rol:** carriles = `["principal", ...SAGA_ITEM_ROLES]` filtrados a los presentes (`role === null`
  es «principal»). `a = readingIndex * STEP`, `c = índiceCarril * 150`. Una guía `lane` por carril
  en `a = -STEP`. Un `thread` `rol` por obra con rol: `[clave de la principal anterior por readingIndex, clave]`.
  Si no hay principal anterior, sin hilo.
- **Publicación:** años distintos ordenados. `a = índiceAño * STEP * 1.3`; dentro del mismo año, las
  obras se apilan por `readingIndex` en `c = -i * (COVER_H + 16)`. Las obras sin año van en una
  columna final `a = nAños * STEP * 1.3 + STEP`. Una guía `tick` por año (key = año) y otra
  `"sin-año"` si hace falta, todas en `c = 70`. Un `thread` `publicacion` con todas las claves por
  `readingIndex`.
- `extent` = caja de los items (±COVER_W/2, ±COVER_H/2 × scale), arcos e islas, más 40 de margen.

- [ ] **Step 1: tests.**

```ts
// src/lib/sagas/atlas/layout.test.ts (casos mínimos; añade fixtures con un helper `work(key, extra)`)
it("es determinista", () => expect(layoutAtlas(model, "orden", "h")).toEqual(layoutAtlas(model, "orden", "h")));
it("orden: dos obras de fila nunca comparten posición salvo el tándem", () => { /* … */ });
it("orden: la ventana flota entre sus anclas con un arco", () => {
  const l = layoutAtlas(modelConVentana, "orden", "h");
  const [a, w, b] = ["i:book:a", "i:book:w", "i:book:b"].map((k) => l.items.find((i) => i.key === k)!);
  expect(w.x).toBe((a.x + b.x) / 2);
  expect(w.y).toBeLessThan(a.y);
  expect(l.arcs).toHaveLength(1);
});
it("orden: v intercambia los ejes", () => {
  const h = layoutAtlas(model, "orden", "h"), v = layoutAtlas(model, "orden", "v");
  expect(v.items.map((i) => [i.x, i.y])).toEqual(h.items.map((i) => [i.y, i.x]));
});
it("orden: islas solo con dos o más regiones", () => { /* 1 región → islands [] */ });
it("rol: solo carriles de roles presentes, principal primero", () => {
  expect(layoutAtlas(modelConRoles, "rol", "h").guides.map((g) => g.key)).toEqual(["principal", "relato"]);
});
it("publicación: misma columna para el mismo año y columna «sin-año» al final", () => { /* … */ });
```

- [ ] **Step 2:** Ejecuta el test. Esperado: FAIL.
- [ ] **Step 3:** Implementa `layoutAtlas` con esas reglas: tres funciones internas (`orden`, `rol`,
  `publicacion`) que devuelven el layout en horizontal, más `swap(layout)` para `v`.
- [ ] **Step 4:** Ejecuta el test. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(sagas): layouts de las lentes del atlas`.

---

### Task 5: Resumen, lente en la URL y textos

**Files:**
- Create: `src/lib/sagas/atlas/summary.ts`, `summary.test.ts`, `lens.ts`, `lens.test.ts`
- Modify: `messages/es.json` (bloque `saga.atlas`)

**Interfaces:**
- Produces:

```ts
// summary.ts
export type AtlasSummary =
  | { key: "ordenNext"; values: { done: number; total: number; title: string } }
  | { key: "ordenStart"; values: { title: string } }
  | { key: "ordenFinished" | "ordenAllOptional" | "empty"; values: Record<string, never> }
  | { key: "rol"; counts: Array<{ role: SagaItemRole | "principal"; count: number }> }
  | { key: "publicacion"; values: { from: number; to: number; outOfOrder: number } }
  | { key: "publicacionSinAnos"; values: Record<string, never> };
export function summarize(model: AtlasModel, lens: Lens): AtlasSummary;
// lens.ts
export function parseLens(raw: string | undefined): Lens;                 // desconocido → "orden"
export function parseRole(raw: string | undefined): SagaItemRole | null;  // desconocido → null
/** Traduce parámetros viejos (?ruta=publicacion, ?orden=publicacion, ?rol=) a los del atlas.
 *  Devuelve null si no hay nada que traducir. */
export function legacyAtlasQuery(q: { ruta?: string; orden?: string; rol?: string; lente?: string }): URLSearchParams | null;
```

Reglas:
- `ordenNext`: `total` = obras no opcionales; `done` = de esas, `state === "done"`; `title` =
  `model.nextTitle`.
- `outOfOrder`: entre las obras con año, cuántas tienen distinto índice al ordenarlas por
  `(year, readingIndex)` que por `readingIndex`.
- `legacyAtlasQuery`:
  - `ruta=publicacion` u `orden=publicacion` → `lente=publicacion`, y se quita la ruta;
  - `rol` válido sin `lente` → `lente=rol&rol=…`;
  - cualquier otra `ruta` se conserva.

  Si el resultado es igual a la entrada, devuelve `null`. Así se evita un bucle de redirects.

- [ ] **Step 1:** Escribe los tests: un caso por clave de `summarize` y cuatro de
  `legacyAtlasQuery` (publicación por `ruta`, por `orden`, `rol`, y `null` sin cambios).
- [ ] **Step 2:** Ejecútalos. Esperado: FAIL.
- [ ] **Step 3:** Implementa los dos módulos.
- [ ] **Step 4:** Añade a `messages/es.json` en `saga`:

```json
"atlas": {
  "eyebrow": "Atlas · {count, plural, =1 {1 obra} other {# obras}}",
  "back": "Volver a la saga",
  "lensOrden": "Orden", "lensRol": "Rol", "lensPublicacion": "Publicación",
  "lensGroup": "Lente",
  "legendOrden": "Línea = orden de lectura · arco = ventana · solapadas = tándem",
  "legendRol": "Un carril por rol · el hilo une cada obra con la principal de la que cuelga",
  "legendPublicacion": "Eje de años · la cifra es su puesto de lectura",
  "progress": "Progreso",
  "itinerary": "Itinerario: {name}",
  "itineraryTitle": "Elige itinerario",
  "itineraryManage": "Gestionar itinerarios",
  "list": "Ver como lista", "map": "Ver el mapa",
  "zoomIn": "Acercar", "zoomOut": "Alejar", "fit": "Encajar",
  "ordenNext": "Llevas <b>{done} de {total}</b> · te toca <b>{title}</b>",
  "ordenStart": "Empieza por <b>{title}</b>",
  "ordenFinished": "La terminaste",
  "ordenAllOptional": "Todo lo de esta saga es opcional",
  "empty": "Esta saga aún no tiene obras",
  "rolCount": "{count} {role}",
  "publicacion": "De {from} a {to} · <b>{outOfOrder}</b> se leen fuera de su orden de salida",
  "publicacionSinAnos": "Ninguna obra tiene año de publicación",
  "noYear": "sin año",
  "principal": "principales",
  "now": "ahora", "done": "leída", "todo": "pendiente", "skipped": "saltada",
  "open": "Abrir ficha",
  "windowBetween": "Encaja entre {after} y {before}",
  "windowAfter": "Encaja después de {title}",
  "windowBefore": "Encaja antes de {title}",
  "windowFitsNow": "Ahora encaja",
  "tandemSimultaneo": "A la vez que {titles}",
  "tandemIndistinto": "En cualquier orden con {titles}",
  "step": "Paso {n} del itinerario",
  "workAria": "{title}, {state}",
  "planeAria": "Atlas de {saga}, lente {lens}. {summary}"
}
```

  Los motivos de ventana, los roles y los textos de saltar reutilizan las claves existentes:
  `saga.timelineWindowReasonSpoiler`/`Contexto`, `saga.roleLabel.*`, `saga.roleShort.*`,
  `saga.timelineSkip`/`Unskip`/`SkipAria`/`UnskipAria` y `saga.routeAdopt`/`routeAdopted`/`routeProgress`.
  En la Task 10, al borrar el timeline, **no** se borran las claves que use el atlas.
- [ ] **Step 5:** Ejecuta los tests y `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 6:** Commit `feat(sagas): resumen y parámetros del atlas`.

---

### Task 6: Página del atlas, plano, cámara y lente Orden  ⟵ checkpoint visual

**Files:**
- Rewrite: `src/app/saga/[id]/mapa/page.tsx`
- Modify: `src/components/nav/fullscreen-routes.ts` (+ su test si existe)
- Create: `src/lib/sagas/atlas/camera-storage.ts` (+ test),
  `src/components/saga/atlas/{saga-atlas,atlas-plane,atlas-work,atlas-backdrop}.tsx`,
  `use-atlas-camera.ts`, `atlas.module.css`, `saga-atlas.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `<SagaAtlas …/>` con estas props (las Tasks 7–9 añaden comportamiento, no props nuevas
  salvo las marcadas):

```ts
export type SagaAtlasProps = {
  sagaId: string; sagaName: string; workCount: number;
  model: AtlasModel; authenticated: boolean;
  initialLens: Lens; initialRole: SagaItemRole | null;
  routes: Array<{ slug: string; name: string; summary: string | null; curated: boolean }>;
  activeRoute: string; adoptedRoute: string | null;
  counter: { completed: number; total: number } | null;   // ruta activa curada
  canEdit: boolean;
};
```

- [ ] **Step 1: página servidor.** Reescribe `mapa/page.tsx`:

```tsx
// Atlas de la saga (spec 2026-10-28). Sustituye al grafo y a «Cómo leerla».
// Sin `use cache` (regla #437): `detail` lleva estados y pases del lector.
export default async function SagaAtlasPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lente?: string; ruta?: string; orden?: string; rol?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const legacy = legacyAtlasQuery(sp);
  if (legacy) redirect(`${sagaHref(id)}/mapa?${legacy}`);
  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  if (detail.shelfGraph.nodes.length === 0) redirect(sagaHref(id));
  const t = await getTranslations("saga");
  const routes = shelfRoutesFor(detail, t("orderReading")).filter((r) => r.slug !== "publicacion");
  const activeRoute = resolveActiveRoute({ routes, routeChoice: detail.routeChoice }, { ruta: sp.ruta });
  const row = routes.find((r) => r.slug === activeRoute && r.id !== undefined);
  const entries = row?.id ? await getRouteEntries(supabase, row.id) : null;
  const sections = deriveTimeline(detail.shelfGraph, { authenticated: detail.isAuthenticated, showOptional: detail.showOptionalReadings });
  const years = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`i:${m.itemType}:${m.itemId}`, m.year] as const));
  const model = deriveAtlas({ sections, authenticated: detail.isAuthenticated, years,
    steps: entries ? itinerarySteps(entries, mainOrderFor(detail)) : null });
  return (
    <SagaAtlas sagaId={id} sagaName={detail.saga.name} workCount={detail.memberCount} model={model}
      authenticated={detail.isAuthenticated} initialLens={parseLens(sp.lente)} initialRole={parseRole(sp.rol)}
      routes={routes.map((r) => ({ slug: r.slug, name: r.name, summary: r.summary, curated: r.id !== undefined }))}
      activeRoute={activeRoute} adoptedRoute={detail.routeChoice}
      counter={entries ? routeCounter(detail, entries) : null}
      canEdit={hasMinRole(detail.viewerRole, "collaborator")} />
  );
}
```

  Mantén `generateMetadata` con el título «{saga} · Atlas — Biblioshare».

- [ ] **Step 2: ruta inmersiva.** En `isFullscreenRoute` añade
  `|| /^\/saga\/[^/]+\/mapa$/.test(pathname)`. `/mapa/editar` **no** entra. Añade el caso al test de
  `fullscreen-routes` si existe; si no, créalo con `/saga/x/mapa` → true y `/saga/x/mapa/editar` →
  false.
- [ ] **Step 3: `camera-storage.ts`.** Exporta `readCamera(sagaId): Camera | null` y
  `writeCamera(sagaId, cam)`, con la clave `saga-atlas:<id>` y todo dentro de try/catch. Test:
  ida y vuelta con un `sessionStorage` falso, y `null` si `getItem` lanza.
- [ ] **Step 4: `use-atlas-camera.ts`.** Es un hook que, dado `ref` del contenedor, `extent`,
  `focus: {x,y} | null` (la obra «ahora») y `sagaId`, devuelve
  `{ camera, viewport, zoomBy(f), fitAll(), focusOn(p, k?), bind }`.
  - El viewport sale de un `ResizeObserver`.
  - Cámara inicial: `readCamera`. Si no hay, `focusOn(focus, 1)`, o `fit(extent, vp, {x:48,y:200})`
    si no hay foco.
  - Gestos con Pointer Events y `setPointerCapture`, con un umbral de 5 px para decidir arrastre.
    Un puntero hace `panBy`; dos punteros, pellizco con `zoomAt` en el punto medio. La rueda hace
    `zoomAt(cam, vp, cursor, Math.exp(-deltaY * 0.0015))` con `preventDefault` (listener
    `{ passive: false }`). El doble clic hace `zoomToward(…, 2)`.
  - `writeCamera` va con debounce de 200 ms.
  - Usa solo `@/lib/atlas/camera`.
- [ ] **Step 5: plano y obras.**
  - `atlas-plane.tsx` pinta un `div` absoluto con
    `style={{ transform: \`translate(${vp.width/2 - cam.x*cam.k}px, ${vp.height/2 - cam.y*cam.k}px) scale(${cam.k})\`, transformOrigin: "0 0" }}`.
    Dentro van `<AtlasBackdrop>` (un `<svg>` con `overflow: visible`) y una `<AtlasWork>` por item.
  - Nivel de zoom: `level = cam.k < 0.5 && layout.islands.length > 0 ? "islands" : cam.k > 1.6 ? "detail" : "covers"`.
    En `islands` las obras se ocultan con `visibility: hidden` y el backdrop pinta las islas como
    `<button>`; al tocar una, `focusOn` sobre el centro de su región con k = 1.
  - `AtlasWork` es un `<button>` con posición absoluta en `transform: translate(x - W/2, y - H/2) scale(s)`,
    `transition: transform 450ms` (anulada con `@media (prefers-reduced-motion: reduce)`) y
    `data-work-key`. Su `aria-label` es `t("atlas.workAria", { title, state })`.
  - La portada usa `next/image` con el loader del proyecto; si no hay, un lomo con
    `SAGA_ACCENT[region.accent]`. En `detail`, título y `roleShort` debajo.
- [ ] **Step 6: backdrop de Orden.** Regiones como `rect` con `rx=16`, relleno del acento al 10 % y
  nombre encima (si `name` es null, el nombre de la saga). Los arcos son un `path`
  `M x1 y1 Q via x2 y2` con `stroke="var(--map-window)" strokeDasharray="4 4"`.
- [ ] **Step 7: `saga-atlas.tsx`.**
  - Estado: `lens` (inicial `initialLens`), `orientation` (`vp.width >= vp.height ? "h" : "v"`) y
    `layout = useMemo(() => layoutAtlas(model, lens, orientation))`.
  - Barra superior: «‹» a la ficha, eyebrow, título y resumen con
    `t.rich(summary.key, { b: (c) => <b>{c}</b>, ...values })` en un `aria-live="polite"`.
  - Dock con las tres lentes como botones `aria-pressed`. Al cambiar, `router.replace` con
    `?lente=` (conservando `ruta`) y `fitAll()`. Atajos `1`–`3`, `+`, `-` y `0` en el contenedor
    (`tabIndex={0}`).
  - Botones + − ⤢.
  - Siempre oscuro: los tokens van en `atlas.module.css` (`--ground`, `--panel`, `--line`, `--fg`,
    `--muted`, `--faint`), copiados de `src/components/comparisons/atlas/atlas.module.css`, y la
    raíz con `h-dvh w-full overflow-hidden` y safe areas.
- [ ] **Step 8: tests RTL** (`saga-atlas.test.tsx`, `// @vitest-environment jsdom`). Mock de
  `next/navigation` (`useRouter` con `replace`) y de `next/image` como en `saga-shelf.test.tsx`, y
  `NextIntlClientProvider` con `messages/es.json` como en `atlas-view.test.tsx`. Mock de
  `ResizeObserver` con 1200×800. Casos:
  - pinta un botón por obra con su `aria-label`;
  - la lente activa tiene `aria-pressed="true"`;
  - pulsar «Rol» llama a `replace` con `lente=rol`;
  - el resumen enseña «Llevas 1 de 3».
- [ ] **Step 9:** Ejecuta `npx vitest run src/components/saga/atlas src/lib/sagas/atlas src/components/nav`,
  `npx tsc --noEmit` y `npm run lint`. Esperado: PASS.
- [ ] **Step 10: verificación visual.** `npx next dev --webpack -p 3000` y abre
  `/saga/33d7bb93-da3d-4453-a6da-1722beff134d/mapa` (dev, [QA Itinerarios] Universo) y la saga con más
  obras de dev. Haz capturas en 1440×900 y 390×844 (vertical). Comprueba el zoom alejado (islas), el
  arrastre, la rueda y el foco en «ahora». **Para y enseña las capturas al usuario antes de seguir.**
- [ ] **Step 11:** Commit `feat(sagas): atlas de la saga con la lente Orden`.

---

### Task 7: Lentes Rol y Publicación

**Files:**
- Modify: `atlas-backdrop.tsx`, `saga-atlas.tsx`, `saga-atlas.test.tsx`

- [ ] **Step 1: backdrop.** Para `guides` `lane`: una línea horizontal a lo largo de todo el
  `extent` y la etiqueta a la izquierda (`t("atlas.principal")` o `t(\`roleLabel.${key}\`)`). Para
  `tick`: el año (o `t("atlas.noYear")`) bajo el eje y una línea base. Para `threads`:
  - `rol`: un `path` fino de la principal a la obra con rol, en `var(--muted)` y discontinuo;
  - `publicacion`: una polilínea suave (cuadráticas) por las claves en orden, en dorado al 50 %.

  Las posiciones salen de `layout.items` por clave.
- [ ] **Step 2: números de lectura.** En Publicación, cada `AtlasWork` lleva un badge con
  `readingNo` (o `·` si es null), sea cual sea el nivel de zoom.
- [ ] **Step 3: `?rol=`.** Con `lens === "rol"` y `initialRole`, el carril de ese rol se pinta con
  opacidad 1 y las obras de otros carriles con 0,35. Al tocar la etiqueta de un carril se fija o se
  quita el resaltado (`router.replace` con `rol=`).
- [ ] **Step 4: tests.**
  - Con `initialLens="rol"`, hay una etiqueta por rol presente.
  - Con `initialRole="relato"`, las obras sin ese rol llevan `data-dimmed="true"`.
  - Con `initialLens="publicacion"`, el resumen nombra el rango de años.
- [ ] **Step 5:** Ejecuta los tests, `tsc` y lint. Esperado: PASS. Commit
  `feat(sagas): lentes Rol y Publicación del atlas`.

---

### Task 8: Capas Itinerario y Progreso, y hoja de itinerarios  ⟵ checkpoint visual

**Files:**
- Create: `src/components/saga/atlas/itinerary-sheet.tsx`
- Move: `src/components/saga/adopt-route-button.tsx` → `src/components/saga/atlas/adopt-route-button.tsx`
  (`git mv`; actualiza sus imports)
- Modify: `saga-atlas.tsx`, `atlas-work.tsx`, `atlas-backdrop.tsx`, tests

- [ ] **Step 1: capa Progreso** (estado `progressOn`, por defecto `authenticated`; el interruptor
  solo se pinta con sesión, con `aria-pressed`). Con la capa encendida:
  - `done`: ✓ en la esquina y opacidad 1;
  - `now`: aro dorado de 3 px, halo (`box-shadow`) y etiqueta `t("atlas.now")`;
  - `todo`: opacidad 0,4;
  - `skipped`: tachado diagonal y 0,3.

  Apagada, todo a 1 sin marcas. El estado también va en `aria-label`, así que no depende del color.
- [ ] **Step 2: capa Itinerario.** Si `model.hasItinerary`:
  - en el backdrop, un `path` `var(--map-itinerary-jump)` de 2 px que une las obras con `step` en
    orden, con un círculo numerado bajo cada una;
  - las obras con `step === null` van a opacidad 0,3 (`data-dimmed`).

  Se combina con Progreso: gana el mínimo de opacidades.
- [ ] **Step 3: `itinerary-sheet.tsx`.**
  - Un chip `⟿ {nombre activo} ▾`, botón con `aria-expanded`. Si ninguna ruta es `curated`, se pinta
    como etiqueta sin desplegar.
  - Al abrir: con `≥ 640 px`, un popover anclado al chip; si no, una hoja inferior con fondo. Las
    dos se cierran con Escape y al tocar fuera.
  - Lista de rutas con radio. Al elegir una, `router.replace` con `?ruta=<slug>` (conservando
    `lente`), y el servidor vuelve a renderizar con sus pasos.
  - Bajo la activa: su `summary`, `t("routeProgress", counter)` si hay `counter`, y
    `<AdoptRouteButton>` si `authenticated && curated`.
  - `canEdit`: enlace `✎ {t("atlas.itineraryManage")}` a `/saga/<id>/rutas`.
- [ ] **Step 4: tests.**
  - Abrir el chip lista las rutas sin «Publicación».
  - Elegir una llama a `replace` con `ruta=`.
  - Con `counter`, sale «Llevas 0 de 2 de esta ruta».
  - Sin sesión no hay Adoptar ni interruptor de Progreso.
  - Con `hasItinerary`, las obras sin paso llevan `data-dimmed`.
  - Con Progreso, la obra «ahora» lleva la etiqueta «ahora».
- [ ] **Step 5:** Ejecuta los tests, `tsc` y lint. Esperado: PASS.
- [ ] **Step 6: verificación visual.** Repite las capturas de la Task 6 con
  `?ruta=la-guardia` (hilo y obras del bloque, #1541) y con sesión del colaborador de pruebas
  (credenciales en `e2e/sagas-itinerarios.spec.ts`). **Para y enseña las capturas al usuario.**
- [ ] **Step 7:** Commit `feat(sagas): capas de itinerario y progreso del atlas`.

---

### Task 9: Mini-ficha, saltar opcionales, lista accesible y teclado

**Files:**
- Create: `work-sheet.tsx`, `skip-optional-button.tsx`, `atlas-list.tsx` (en `src/components/saga/atlas/`) y sus tests
- Modify: `saga-atlas.tsx`, `atlas-work.tsx`

- [ ] **Step 1: `skip-optional-button.tsx`.** Es un `<form action>` como el de
  `src/components/saga/timeline/skip-optional-button.tsx`, pero recibe
  `{ sagaId: string; work: AtlasWork }`. `parseItemKey(work.key)` da el par (tipo, id), y la action
  es `skipOptional`/`unskipOptional` de `@/lib/sagas/optional-actions` con `work.ownerSagaId`.
  Mantén los `data-testid` `skip-optional`/`unskip-optional` (los usan los e2e) y las etiquetas
  `saga.timelineSkip*`. Botón de al menos 44 px. Las actions ya revalidan; comprueba en
  `optional-actions.ts` que la lista de `revalidatePath` incluye `/mapa`. Si no, añádelo en la
  Task 10.
- [ ] **Step 2: `work-sheet.tsx`** (estado `selectedKey` en `saga-atlas`).
  - Al hacer clic en una obra se selecciona. Con `≥ 640 px`, tarjeta flotante junto a la obra; si
    no, hoja inferior.
  - Contenido:
    - portada, título, `readingNo` y `RoleChip` (no es async en cliente: usa
      `t(\`roleLabel.${role}\`)` con `ROLE_GLYPH`);
    - ventana: `windowBetween`/`windowAfter`/`windowBefore` + motivo + `windowFitsNow` si
      `notice === "dentro"`;
    - tándem: `tandemSimultaneo`/`tandemIndistinto` con los títulos de `partnerKeys`;
    - paso: `t("atlas.step", { n })` y `stepNote` en cursiva.
  - Acciones: `<Link href={work.href}>{t("atlas.open")}</Link>` y, si `authenticated && work.optional`,
    `<SkipOptionalButton>`.
  - Se cierra con Escape, con ✕ y al tocar el lienzo vacío.
- [ ] **Step 3: `atlas-list.tsx`.** El botón «Ver como lista» (`aria-pressed`) sustituye el plano por
  una `<ol>` desplazable sobre el mismo fondo, en el orden de la lente:
  - Orden: `readingIndex`;
  - Rol: por carril y luego `readingIndex`;
  - Publicación: `(year ?? ∞, readingIndex)`.

  Cada `<li>` lleva un `<Link>` a la ficha con el número, el título y una línea de texto con estado,
  rol, ventana, tándem y paso, como en la mini-ficha, más el botón de saltar si procede.
- [ ] **Step 4: teclado.** Las obras están en el DOM en orden de `readingIndex`, así que Tab ya
  recorre el orden de lectura. En `onFocus` de cada obra, si su posición cae fuera del viewport, se
  llama a `focusOn(pos)` sin cambiar el zoom. Enter y Espacio abren la mini-ficha (es un `<button>`).
- [ ] **Step 5: tests.**
  - Clic en una obra con ventana enseña «Encaja entre A y B».
  - La mini-ficha de una opcional con sesión tiene `skip-optional`; sin sesión, no.
  - «Abrir ficha» enlaza a `work.href`.
  - «Ver como lista» pinta una `ol` con tantos `li` como obras y en orden de lectura; con
    `lens="publicacion"`, en orden de año.
  - Escape cierra la mini-ficha.
- [ ] **Step 6:** Ejecuta los tests, `tsc` y lint. Esperado: PASS. Commit
  `feat(sagas): mini-ficha, lista accesible y teclado del atlas`.

---

### Task 10: Redirects, enlaces de la ficha, `show_map` y retirada

**Files:**
- Rewrite: `src/app/saga/[id]/como-leerla/page.tsx`
- Modify: `src/app/saga/[id]/page.tsx`, `src/components/saga/ficha/saga-shelf.tsx` (+ test),
  `src/components/saga/ficha/atlas-teaser.test.tsx`, `src/lib/catalog/item-href.ts`,
  `src/lib/reactivity/revalidate.ts` (+ test), `src/lib/sagas/optional-actions.ts` y
  `route-actions.ts` (revalidaciones), `messages/es.json`, `package.json`
- Delete: `src/components/saga/{saga-map-tab,route-view,route-selector,route-block,reading-timeline,reading-timeline.test,map-cta}.tsx`,
  `src/components/saga/timeline/`, `src/components/saga/graph/`

- [ ] **Step 1: `sagaAtlasHref`.** En `item-href.ts`, sustituye `sagaReadingHref` por
  `export function sagaAtlasHref(id: string): string { return \`${sagaHref(id)}/mapa\`; }`.
  Actualiza los usos (`grep -rn sagaReadingHref src`).
- [ ] **Step 2: `/como-leerla`.** Queda así:

```tsx
import { redirect } from "next/navigation";
import { sagaAtlasHref } from "@/lib/catalog/item-href";

// «Cómo leerla» fue la página interina de la ficha (spec 2026-10-27 §5). El atlas
// (spec 2026-10-28) la sustituye: redirect con los mismos parámetros, que
// `/mapa` traduce (?ruta=publicacion → lente, ?rol= → lente rol).
export default async function SagaReadingRedirect({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(qs ? `${sagaAtlasHref(id)}?${qs}` : sagaAtlasHref(id));
}
```

- [ ] **Step 3: ficha.** En `saga/[id]/page.tsx`:
  - el redirect de `?tab=mapa` usa `sagaAtlasHref`;
  - `readingHref` pasa a `${sagaAtlasHref(id)}?ruta=${encodeURIComponent(activeRoute)}`; con
    `activeRoute === "publicacion"`, `?lente=publicacion`;
  - la tarjeta sigue saliendo con `detail.graph` (que es `show_map`) y enlaza a `sagaAtlasHref(id)`.

  En `messages/es.json`:
  - `saga.readingLink` pasa a «Ver en el mapa»;
  - `sagaEditor.showMapLabel` pasa a «Destacar el mapa en la ficha»;
  - `sagaEditor.showMapHint` pasa a «El atlas está siempre disponible; esto añade la tarjeta de acceso
    en la ficha. En una saga de pocos títulos no suele aportar.»

  Actualiza `saga-shelf.test.tsx` y `atlas-teaser.test.tsx` a las URLs nuevas.
- [ ] **Step 4: revalidación.** En `revalidate.ts`, `revalidatePath(sagaReadingHref(id))` pasa a
  `revalidatePath(sagaAtlasHref(id))`, y el test espera `"/saga/s-1/mapa"`. Revisa que las actions
  de saltar opcional y de adoptar itinerario revaliden la saga por esa función. Si alguna lleva la
  ruta en duro, cámbiala.
- [ ] **Step 5: retirada.** Borra los ficheros listados. Después:
  - `grep -rn "saga/graph\|timeline/\|reading-timeline\|saga-map-tab\|route-view\|route-selector\|route-block\|map-cta\|@xyflow" src e2e`
    debe salir vacío salvo `e2e`, que se rehace en la Task 11;
  - quita `@xyflow/react` de `package.json` y ejecuta `npm install`;
  - si `src/lib/sagas/layout-map.ts`, `graph-metrics.ts`, `map-overlays.ts` o `count-roles.ts` se
    quedan sin importadores fuera de sus tests, bórralos con sus tests. `deriveTimeline`,
    `deriveSagaMap` y `mini-map` **siguen**.
- [ ] **Step 6: claves i18n huérfanas.** Para cada clave de `saga.*` que usaban los componentes
  borrados (`timeline*`, `map*`, `route*`, `readingEyebrow`…), comprueba con
  `grep -rn "\"<clave>\"\|'<clave>'\|t(\"<clave>\|<clave>" src` si queda algún uso, incluido el
  atlas. Borra solo las que no tengan ninguno.
- [ ] **Step 7:** `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (la suite entera) y
  `npm run build`. Esperado: todo PASS.
- [ ] **Step 8:** Commit `refactor(sagas): el atlas sustituye a «Cómo leerla» y al grafo`.

---

### Task 11: e2e contra build de producción

**Files:**
- Create: `e2e/sagas-atlas.spec.ts`
- Modify: `e2e/sagas-itinerarios.spec.ts`, `e2e/sagas-opcionales-saltables.spec.ts`,
  `e2e/sagas-grafo-estados.spec.ts`, `e2e/sagas-mapa-derivado.spec.ts`,
  `e2e/sagas-orden-designado.spec.ts`, `e2e/sagas-ficha-lector.spec.ts`

- [ ] **Step 1: inventario.** `grep -n "como-leerla\|/mapa\|tab=mapa\|timeline\|role-filter\|skip-optional" e2e/sagas-*.spec.ts`.
  Clasifica cada test en tres grupos:
  1. lo que comprobaba sigue teniendo sentido en el atlas: se muda a `/mapa` con localizadores del
     atlas;
  2. probaba piezas del timeline que ya no existen (filas, ribbons, `RoleFilterBar`) y el atlas lo
     cubre: se sustituye por su equivalente;
  3. sin equivalente: se borra y se anota por qué en el informe de la tarea.
- [ ] **Step 2: `sagas-atlas.spec.ts`.** Proyectos de escritorio y Pixel 7 si la config los
  permite; si no, `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })` en un
  `describe` aparte. Usa el login calcado de `sagas-itinerarios.spec.ts` (no importar entre specs).
  Casos, con `UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d"`:
  1. Sin sesión, `/saga/<id>/mapa`: tres lentes, resumen «Empieza por…» y sin interruptor de Progreso.
  2. Con sesión: la obra «ahora» (`[data-work-key]` con «ahora» en el nombre accesible) cae dentro
     del viewport.
  3. Lentes: pulsar Rol cambia la URL a `lente=rol`; Publicación enseña el resumen «De … a …».
  4. «Ver como lista» enseña una `ol` con las obras de la saga.
  5. `?ruta=la-guardia` pinta «¡Guardias! ¡Guardias!» y «Pies de barro» con badge de paso 1 y 2
     (#1541).
  6. Adoptar desde la hoja. Limpia antes `saga_route_choices` por REST (patrón `clearRouteChoice`).
  7. Saltar una opcional desde la mini-ficha y deshacerlo. Reutiliza el seed y la limpieza de
     `sagas-opcionales-saltables.spec.ts`.
  8. Redirects: `/como-leerla?ruta=publicacion` acaba en `/mapa?lente=publicacion`;
     `/saga/<id>?tab=mapa&rol=relato` acaba en `/mapa?lente=rol&rol=relato`.
  9. Una saga con `show_map = false` (el universo QA de itinerarios lo es) abre el atlas sin
     redirigir.
- [ ] **Step 3: build y ejecución.** Mata cualquier servidor en el 3000
  (`Get-NetTCPConnection -LocalPort 3000`), luego `npm run build`, arranca `npx next start -p 3000`
  en segundo plano y espera con `curl` a que responda. Ejecuta
  `npx playwright test e2e/sagas-atlas.spec.ts` y después las specs mudadas, en tandas de 2–3
  (`docs/TRAMPAS.md` §5). Esperado: todo PASS. Si algo falla, `superpowers:systematic-debugging`
  antes de tocar nada.
- [ ] **Step 4:** Para el servidor. Commit `test(sagas): e2e del atlas de la saga`.

---

### Task 12: Documentación y cierre

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir al final), `docs/requirements/backlog.md`,
  `docs/superpowers/specs/2026-10-28-sagas-atlas-design.md` (status), `docs/architecture/graph.json`
  (+ `node docs/architecture/sync.mjs`), `docs/UI-GLOSARIO.md` si nombra «Cómo leerla» o «Mapa de
  lectura»
- Create: `docs/testing/2026-10-28-sagas-atlas.md`

- [ ] **Step 1: `decisiones.md`**, entrada nueva «2026-10-28 · Atlas de la saga» con:
  - el atlas sustituye a `/mapa` (React Flow) y a `/como-leerla`;
  - `show_map` solo destaca la tarjeta;
  - DOM en vez de canvas, y por qué;
  - Publicación pasa de ruta a lente;
  - el hilo de itinerario numera obras y expande bloques (#1541);
  - `@xyflow/react` sale del proyecto.
- [ ] **Step 2: backlog.** Añade y marca «Rework de sagas · subproyecto 2 (atlas de la saga)», con
  enlaces a la spec y a la evidencia, y marca #1541.
- [ ] **Step 3: `graph.json`.** En los nodos y el flujo de la ficha de saga, quita los nodos de
  timeline, grafo y como-leerla y añade el nodo del atlas (ficheros de `src/lib/sagas/atlas/` y
  `src/components/saga/atlas/`) con sus trampas: «sin `use cache`», «`show_map` no condiciona» y
  «`step` cuenta obras». Ejecuta `node docs/architecture/sync.mjs`. Esperado: sin referencias rotas.
- [ ] **Step 4: evidencia.** `docs/testing/2026-10-28-sagas-atlas.md` con los comandos y resultados
  (unitarios, build, e2e) y las capturas de las Tasks 6 y 8.
- [ ] **Step 5: issues.** Abre una issue por cada cosa pendiente o descartada durante la ejecución,
  con una etiqueta de área, una de tipo y una de prioridad (`docs/agents/issue-tracker.md`). Como
  mínimo, valora estas:
  - umbrales del zoom semántico ajustados con datos reales de prod;
  - rendimiento del atlas en Android con el Cosmere.
- [ ] **Step 6:** Commit `docs(sagas): cierre del atlas de la saga`.
