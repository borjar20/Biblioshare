# Atlas de sagas y universos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/sagas` deja de ser una rejilla y pasa a ser un atlas a pantalla completa con cuatro territorios según la relación del lector con cada saga (por tipo de obra sin sesión), mini-ficha, buscador, filtros que atenúan y «Ver como lista».

**Architecture:** El servidor lee las tarjetas con `getSagaIndexData` (sin cambios de esquema) y se las pasa a un componente cliente. El cliente deriva el modelo (`deriveIndexAtlas`, puro) y el layout (`layoutIndexAtlas`, puro) y los pinta en un plano DOM + SVG con la cámara compartida del atlas de la saga. Seguir una saga es optimista: el cliente sobrescribe `isFollowed` y vuelve a derivar.

**Tech Stack:** Next.js 16 (Cache Components), React 19, next-intl, CSS modules, Supabase, Vitest (node y jsdom), Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-28-sagas-indice-atlas-design.md`](../specs/2026-10-28-sagas-indice-atlas-design.md). Ante cualquier duda, manda la spec.

## Global Constraints

- Sin `use cache` en ninguna lectura de esta feature: `getSagaIndexData` depende de la sesión (regla #437, `AGENTS.md`).
- El estado del lector sale **siempre de `passes`**, nunca de `library_entries`.
- Sin migraciones. Si alguna parece necesaria, se para y se consulta.
- «Empezada» = alguna obra contada de la saga con un pase activo `in_progress` o `completed`. `planned` no cuenta.
- Zonas con sesión, por prioridad: `en-curso` (empezada y sin terminar) → `sigues` (seguida, no empezada) → `terminadas` (`progress.total > 0` y todas completadas) → `por-descubrir` (el resto, en comarcas). Sin sesión: `libros`, `peliculas`, `series`, `mixtas`.
- Comarca (y zona sin sesión): el único tipo con obras; con más de uno, `mixtas`. Una saga con 0 obras de todos los tipos va a `mixtas`.
- Orden: `en-curso` por `lastTouchedAt` descendente; `sigues` y `terminadas` alfabético (`localeCompare(…, "es")`); cada comarca y cada zona sin sesión por `titleCount` descendente y, a igualdad, alfabético. Zonas y comarcas vacías no se devuelven.
- Zoom semántico: `k < 0.5` solo zonas; `0.5 ≤ k ≤ 1.6` portadas con nombre; `k > 1.6` además tipo, número de obras y barra de avance.
- Mini-ficha: hoja inferior por debajo de 640 px (`NARROW_QUERY = "(max-width: 639.98px)"`), tarjeta flotante desde 640 px.
- Áreas táctiles de al menos 44 px, compensadas con `--k` como en el atlas de la saga.
- Copy y docs en español. Las claves nuevas van en `messages/es.json` bajo `sagaIndex.atlas.*`. Revisa si hay otros locales en `messages/`; si los hay, añade la clave también allí, en español.
- La cámara se guarda en `sessionStorage` con la clave `sagas-atlas`, junto con la orientación.
- Los filtros se escriben en la URL con `window.history.replaceState`, sembrados desde `useSearchParams`.
- Node 22 en bash: `export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH"`.
- Vitest: entorno node por defecto; los tests de componentes llevan `// @vitest-environment jsdom` en la primera línea.
- Commits en español, con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git stash` a secas.
- e2e contra `npm run build` + `npx next start -p 3000` con `--retries=0`. Un solo servidor en el puerto 3000.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/atlas/types.ts` | Añade `Orientation` (compartido) |
| `src/lib/atlas/visible-camera.ts` (movido) | Centrar y encajar en la zona libre, posición de la tarjeta flotante |
| `src/lib/atlas/camera-storage.ts` (movido) | Cámara en `sessionStorage` con una clave que decide quien llama |
| `src/components/atlas/use-atlas-camera.ts` (movido) | Cámara, gestos y persistencia |
| `src/components/atlas/use-dismissable.ts` (movido) | Cierre común de hojas |
| `src/lib/sagas/build-saga-index.ts` | `started` y `lastTouchedAt` por tarjeta |
| `src/lib/sagas/get-saga-index.ts` | `updated_at` en el `select` de `passes` |
| `src/lib/sagas/index-atlas/params.ts` | Lectura y escritura de la URL; coincidencia con filtros y búsqueda |
| `src/lib/sagas/index-atlas/model.ts` | `deriveIndexAtlas`: zonas, comarcas y orden |
| `src/lib/sagas/index-atlas/summary.ts` | Resumen de una línea |
| `src/lib/sagas/index-atlas/layout.ts` | `layoutIndexAtlas`: cajas de zona, comarca y saga |
| `src/components/sagas/atlas/*` | Componentes del atlas del índice |
| `src/app/sagas/page.tsx` | Shell + Suspense + datos → `<SagasAtlas>` |
| `src/components/nav/fullscreen-routes.ts` | `/sagas` a pantalla completa |
| `e2e/sagas-indice-atlas.spec.ts` | e2e nueva |

---

### Task 1: Infraestructura de atlas compartida

Mueve las piezas de cámara y hojas del atlas de la saga a un sitio común y desacopla la clave de almacenamiento. El atlas de la saga no cambia de comportamiento.

**Files:**
- Modify: `src/lib/atlas/types.ts`
- Move: `src/lib/sagas/atlas/visible-camera.ts` → `src/lib/atlas/visible-camera.ts` (y su `.test.ts`)
- Move: `src/lib/sagas/atlas/camera-storage.ts` → `src/lib/atlas/camera-storage.ts` (y su `.test.ts`)
- Move: `src/components/saga/atlas/use-atlas-camera.ts` → `src/components/atlas/use-atlas-camera.ts`
- Move: `src/components/saga/atlas/use-dismissable.ts` → `src/components/atlas/use-dismissable.ts`
- Modify: `src/lib/sagas/atlas/layout.ts:8` (re-exporta `Orientation`)
- Modify: los importadores — `src/components/saga/atlas/atlas-list.tsx`, `itinerary-sheet.tsx`, `saga-atlas.tsx`, `work-sheet.tsx`, `work-sheet.test.tsx` y cualquiera que encuentre `grep -rn "visible-camera\|camera-storage\|use-atlas-camera\|use-dismissable" src`

**Interfaces:**
- Produces:
  - `src/lib/atlas/types.ts`: `export type Orientation = "h" | "v";`
  - `src/lib/atlas/camera-storage.ts`: `export type CameraContext = { lens: string; orientation: Orientation }`; `readCamera(key: string, ctx: CameraContext): Camera | null`; `writeCamera(key: string, cam: Camera, ctx: CameraContext): void`. `key` es la clave COMPLETA de `sessionStorage`; ya no se le antepone nada.
  - `src/components/atlas/use-atlas-camera.ts`: `useAtlasCamera({ ref, viewport, insets?, extent, focus, storageKey, lens, orientation }: { …; storageKey: string; lens: string; orientation: Orientation })`, con el mismo retorno que hoy: `{ camera, viewport, animated, zoomBy, fitAll, focusOn, bind }`. También exporta `useViewport` y `useChromeInsets`, sin cambios.
  - `src/components/atlas/use-dismissable.ts`: `NARROW_QUERY` y `useDismissable`, sin cambios.

- [ ] **Step 1: Mover con historia**

```bash
mkdir -p src/components/atlas
git mv src/lib/sagas/atlas/visible-camera.ts src/lib/atlas/visible-camera.ts
git mv src/lib/sagas/atlas/visible-camera.test.ts src/lib/atlas/visible-camera.test.ts
git mv src/lib/sagas/atlas/camera-storage.ts src/lib/atlas/camera-storage.ts
git mv src/lib/sagas/atlas/camera-storage.test.ts src/lib/atlas/camera-storage.test.ts
git mv src/components/saga/atlas/use-atlas-camera.ts src/components/atlas/use-atlas-camera.ts
git mv src/components/saga/atlas/use-dismissable.ts src/components/atlas/use-dismissable.ts
```

- [ ] **Step 2: `Orientation` compartida**

En `src/lib/atlas/types.ts` añade al final:

```ts
export type Orientation = "h" | "v";
```

En `src/lib/sagas/atlas/layout.ts`, sustituye `export type Orientation = "h" | "v";` por:

```ts
export type { Orientation } from "@/lib/atlas/types";
import type { Orientation } from "@/lib/atlas/types";
```

(Junta el `import type` con los demás imports del fichero.)

- [ ] **Step 3: Actualizar el test de almacenamiento (debe fallar)**

En `src/lib/atlas/camera-storage.test.ts`:
- las llamadas pasan la clave completa: `readCamera("saga-atlas:abc", ORDEN)`, `writeCamera("saga-atlas:abc", …)`, etc.;
- las claves sembradas a mano (`s.data.set("saga-atlas:a", …)`) se quedan igual;
- el import cambia a `./camera-storage` (mismo directorio);
- añade:

```ts
it("usa la clave tal cual, sin prefijo", () => {
  const s = fakeStorage();
  vi.stubGlobal("sessionStorage", s);
  writeCamera("sagas-atlas", { x: 1, y: 2, k: 1 }, { lens: "indice", orientation: "h" });
  expect([...s.data.keys()]).toEqual(["sagas-atlas"]);
  expect(readCamera("sagas-atlas", { lens: "indice", orientation: "h" })).toEqual({ x: 1, y: 2, k: 1 });
});
```

Si `fakeStorage` no expone `data` como `Map`, adapta la aserción a lo que exponga.

Run: `npx vitest run src/lib/atlas/camera-storage.test.ts`
Expected: FAIL (la implementación aún antepone `saga-atlas:`).

- [ ] **Step 4: Implementar `camera-storage.ts`**

```ts
import type { Camera, Orientation } from "./types";

// Cámara de un atlas en sessionStorage: para volver de una ficha al sitio donde estabas.
// Todo acceso va en try/catch: en modo privado, con datos bloqueados o en el servidor, leer
// da null y escribir no hace nada. Junto a la cámara se guardan la lente y la orientación en
// que se movió: unas coordenadas de una lente no significan nada en otra (ni en vertical), así
// que solo se restauran si ambas coinciden. Un valor sin ellas (formato antiguo) se ignora.
// `key` es la clave completa: `saga-atlas:<id>` en el atlas de la saga, `sagas-atlas` en el índice.
export type CameraContext = { lens: string; orientation: Orientation };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function readCamera(key: string, ctx: CameraContext): Camera | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(key);
    if (!raw) return null;
    const { lens, orientation, x, y, k } = JSON.parse(raw) as Record<string, unknown>;
    if (lens !== ctx.lens || orientation !== ctx.orientation) return null;
    return finite(x) && finite(y) && finite(k) && k > 0 ? { x, y, k } : null;
  } catch {
    return null;
  }
}

export function writeCamera(key: string, cam: Camera, ctx: CameraContext): void {
  try {
    globalThis.sessionStorage?.setItem(
      key,
      JSON.stringify({ lens: ctx.lens, orientation: ctx.orientation, x: cam.x, y: cam.y, k: cam.k }),
    );
  } catch {
    // Sin almacenamiento la cámara simplemente no se recuerda.
  }
}
```

- [ ] **Step 5: Hook con `storageKey`**

En `src/components/atlas/use-atlas-camera.ts`:
- imports: `readCamera`/`writeCamera`/`CameraContext` desde `@/lib/atlas/camera-storage`; `centreIn`/`fitVisible`/`NO_INSETS`/`Insets` desde `@/lib/atlas/visible-camera`; `Orientation` desde `@/lib/atlas/types`. Quita el import de `Lens` y `Orientation` de `@/lib/sagas/atlas/layout`.
- en la firma, `sagaId: string` pasa a ser `storageKey: string`, `lens: Lens` pasa a `lens: string` y `orientation` a `Orientation`;
- dentro, cada `sagaId` pasa a ser `storageKey` (en `readCamera`, `writeCamera` y el registro `pending`, cuyo campo `sagaId` se renombra a `key`);
- el comentario de cabecera dice «Cámara de los atlas (saga e índice)».

- [ ] **Step 6: Actualizar importadores**

- `src/components/saga/atlas/saga-atlas.tsx`: importa `useAtlasCamera`, `useViewport` y `useChromeInsets` desde `@/components/atlas/use-atlas-camera`, y llama con `storageKey: \`saga-atlas:${sagaId}\`` en lugar de `sagaId`.
- El resto: cambia las rutas de import (`@/lib/atlas/visible-camera`, `@/components/atlas/use-dismissable`).
- `src/lib/atlas/visible-camera.test.ts`: import relativo `./visible-camera`.

- [ ] **Step 7: Verificar**

```bash
npx vitest run src/lib/atlas src/lib/sagas/atlas src/components/saga/atlas src/components/comparisons
npx tsc --noEmit
npx eslint src/lib/atlas src/components/atlas src/components/saga/atlas
```

Expected: todo en verde; `tsc` y `eslint` sin errores.

- [ ] **Step 8: Commit**

```bash
git add -A src/lib/atlas src/components/atlas src/lib/sagas/atlas src/components/saga/atlas
git commit -m "refactor(atlas): cámara, almacenamiento y hojas compartidos entre atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Datos y URL del índice

**Files:**
- Modify: `src/lib/sagas/build-saga-index.ts` (tipos `SagaIndexPassRow` y `SagaIndexCard`, cálculo por raíz)
- Modify: `src/lib/sagas/get-saga-index.ts` (el `select` de `passes`)
- Test: `src/lib/sagas/build-saga-index.test.ts`
- Create: `src/lib/sagas/index-atlas/params.ts`
- Test: `src/lib/sagas/index-atlas/params.test.ts`

**Interfaces:**
- Produces:
  - `SagaIndexPassRow = { item_type: string; item_id: string; status: string; updated_at?: string | null }`
  - `SagaIndexCard` gana `started: boolean` y `lastTouchedAt: string | null`. Sin sesión: `false` y `null`.
  - En `params.ts`:

```ts
export type IndexType = "libro" | "pelicula" | "serie";
export type IndexFilters = { tipos: IndexType[]; itinerarios: boolean; coleccion: boolean; min5: boolean };
export type IndexFocus = "sigues" | "universos" | null;
export type IndexParams = { q: string; filters: IndexFilters; focus: IndexFocus };
export const NO_FILTERS: IndexFilters;
export function parseIndexParams(get: (name: string) => string | null): IndexParams;
export function indexQueryString(p: { q: string; filters: IndexFilters }): string; // sin «?»; vacío si no hay nada
export function hasFilters(f: IndexFilters): boolean;
export function matchesFilters(
  s: { typeBreakdown: { book: number; movie: number; series: number }; routeCount: number; ownedCount: number; titleCount: number },
  f: IndexFilters,
): boolean;
export function normalizeSearch(text: string): string; // minúsculas y sin tildes
export function matchesQuery(s: { name: string; children: Array<{ name: string }> }, q: string): boolean;
```

- [ ] **Step 1: Tests de `started` y `lastTouchedAt` (deben fallar)**

Al final del `describe` de `build-saga-index.test.ts`:

```ts
describe("started y lastTouchedAt", () => {
  const extras = (passes: Array<{ item_type: string; item_id: string; status: string; updated_at?: string }>) => ({
    isAuthenticated: true, routes: [], passes, routeChoices: [], followedIds: new Set<string>(),
  });

  it("una obra en curso o leída la marca empezada; planeada, no", () => {
    const sagas = [saga("a", "A"), saga("b", "B"), saga("c", "C")];
    const ms = [member("a", "book", "a1"), member("b", "book", "b1"), member("c", "book", "c1")];
    const cards = buildSagaIndex(sagas, ms, "", extras([
      { item_type: "book", item_id: "a1", status: "in_progress", updated_at: "2026-10-01T00:00:00Z" },
      { item_type: "book", item_id: "b1", status: "completed", updated_at: "2026-10-05T00:00:00Z" },
      { item_type: "book", item_id: "c1", status: "planned", updated_at: "2026-10-09T00:00:00Z" },
    ]));
    expect(cards.map((c) => [c.name, c.started, c.lastTouchedAt])).toEqual([
      ["A", true, "2026-10-01T00:00:00Z"],
      ["B", true, "2026-10-05T00:00:00Z"],
      ["C", false, null],
    ]);
  });

  it("solo cuentan las obras contadas: una opcional empezada no la empieza", () => {
    const cards = buildSagaIndex([saga("a", "A")], [member("a", "book", "x", true), member("a", "book", "y")], "",
      extras([{ item_type: "book", item_id: "x", status: "in_progress", updated_at: "2026-10-01T00:00:00Z" }]));
    expect(cards[0].started).toBe(false);
  });

  it("lastTouchedAt es el pase más reciente del subárbol, también de una subsaga", () => {
    const cards = buildSagaIndex([saga("u", "U"), saga("h", "H", "u")], [member("u", "book", "u1"), member("h", "book", "h1")], "",
      extras([
        { item_type: "book", item_id: "u1", status: "completed", updated_at: "2026-09-01T00:00:00Z" },
        { item_type: "book", item_id: "h1", status: "in_progress", updated_at: "2026-10-02T00:00:00Z" },
      ]));
    expect(cards[0]).toMatchObject({ started: true, lastTouchedAt: "2026-10-02T00:00:00Z" });
  });

  it("sin sesión: nunca empezada", () => {
    const cards = buildSagaIndex([saga("a", "A")], [member("a", "book", "a1")]);
    expect(cards[0]).toMatchObject({ started: false, lastTouchedAt: null });
  });
});
```

Run: `npx vitest run src/lib/sagas/build-saga-index.test.ts`
Expected: FAIL (`started` no existe).

- [ ] **Step 2: Implementar en `build-saga-index.ts`**

- En `SagaIndexPassRow` añade `updated_at?: string | null;`.
- En `SagaIndexCard` añade, tras `isFollowed`:

```ts
  /** alguna obra contada con pase `in_progress` o `completed` (spec 2026-10-28 índice §4) */
  started: boolean;
  /** `updated_at` más reciente de esos pases; null si no está empezada */
  lastTouchedAt: string | null;
```

- Junto a `completedKeys`, construye:

```ts
  // Pase más reciente por obra empezada (en curso o leída). `planned` no empieza nada.
  const touchedAt = new Map<string, string>();
  for (const p of extras.passes) {
    if (p.status !== "in_progress" && p.status !== "completed") continue;
    const key = `${p.item_type}:${p.item_id}`;
    const at = p.updated_at ?? "";
    if (!touchedAt.has(key) || at > touchedAt.get(key)!) touchedAt.set(key, at);
  }
```

- En el bloque `if (extras.isAuthenticated)`, reutiliza `counted`:

```ts
      const touched = counted.map((k) => touchedAt.get(k)).filter((v): v is string => v !== undefined);
      started = touched.length > 0;
      lastTouchedAt = started ? touched.reduce((a, b) => (b > a ? b : a)) || null : null;
```

  Declara `let started = false; let lastTouchedAt: string | null = null;` antes del `if`, y añade `started, lastTouchedAt` al `cards.push`.
- Si `countedKeys` devuelve claves con un formato distinto de `tipo:id`, ajústalo al suyo: lo decide su implementación en `progress.ts`.

- [ ] **Step 3: `updated_at` en la consulta**

En `src/lib/sagas/get-saga-index.ts`, el `select` de `passes` pasa a ser `.select("item_type, item_id, status, updated_at")`, y el tipo del `Promise.resolve` vacío de ese mismo bloque gana `updated_at: string | null`. Si `get-saga-index.test.ts` falla por el `select`, actualiza la expectativa.

Run: `npx vitest run src/lib/sagas/build-saga-index.test.ts src/lib/sagas/get-saga-index.test.ts`
Expected: PASS.

- [ ] **Step 4: Tests de `params.ts` (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import { hasFilters, indexQueryString, matchesFilters, matchesQuery, NO_FILTERS, parseIndexParams } from "./params";

const from = (qs: string) => {
  const sp = new URLSearchParams(qs);
  return parseIndexParams((n) => sp.get(n));
};

describe("parseIndexParams", () => {
  it("lee filtros, búsqueda y foco", () => {
    expect(from("q=%20Mundo%20&tipo=libro,serie,nada&itinerarios=1&coleccion=1&min5=1&vista=sigo")).toEqual({
      q: "Mundo",
      filters: { tipos: ["libro", "serie"], itinerarios: true, coleccion: true, min5: true },
      focus: "sigues",
    });
  });
  it("vista=universos enfoca universos; todas, n y lo desconocido se ignoran", () => {
    expect(from("vista=universos").focus).toBe("universos");
    expect(from("vista=todas&n=48")).toEqual({ q: "", filters: NO_FILTERS, focus: null });
  });
});

describe("indexQueryString", () => {
  it("omite lo que está por defecto y no escribe la vista", () => {
    expect(indexQueryString({ q: "", filters: NO_FILTERS })).toBe("");
    expect(indexQueryString({ q: "ab c", filters: { ...NO_FILTERS, tipos: ["pelicula"], min5: true } })).toBe("q=ab+c&tipo=pelicula&min5=1");
  });
});

describe("matchesFilters", () => {
  const s = { typeBreakdown: { book: 3, movie: 0, series: 0 }, routeCount: 0, ownedCount: 2, titleCount: 3 };
  it("sin filtros coincide todo", () => expect(matchesFilters(s, NO_FILTERS)).toBe(true));
  it("tipo: basta con uno de los elegidos", () => {
    expect(matchesFilters(s, { ...NO_FILTERS, tipos: ["pelicula", "libro"] })).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, tipos: ["serie"] })).toBe(false);
  });
  it("itinerarios, colección y ≥5", () => {
    expect(matchesFilters(s, { ...NO_FILTERS, itinerarios: true })).toBe(false);
    expect(matchesFilters(s, { ...NO_FILTERS, coleccion: true })).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, min5: true })).toBe(false);
  });
  it("hasFilters", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, coleccion: true })).toBe(true);
  });
});

describe("matchesQuery", () => {
  const s = { name: "Mundodisco", children: [{ name: "La Guardia" }, { name: "Las brujas" }] };
  it("sin tildes ni mayúsculas, en la saga o en sus subsagas", () => {
    expect(matchesQuery(s, "")).toBe(true);
    expect(matchesQuery(s, "MUNDO")).toBe(true);
    expect(matchesQuery(s, "guardía")).toBe(true);
    expect(matchesQuery(s, "cosmere")).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/sagas/index-atlas/params.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 5: Implementar `params.ts`**

```ts
// URL del atlas de /sagas (spec 2026-10-28 índice §3): filtros que atenúan, búsqueda y foco
// de los enlaces viejos (`vista`). `vista=todas` y `n` se ignoran: eran de la rejilla.
export type IndexType = "libro" | "pelicula" | "serie";
export type IndexFilters = { tipos: IndexType[]; itinerarios: boolean; coleccion: boolean; min5: boolean };
export type IndexFocus = "sigues" | "universos" | null;
export type IndexParams = { q: string; filters: IndexFilters; focus: IndexFocus };

export const NO_FILTERS: IndexFilters = { tipos: [], itinerarios: false, coleccion: false, min5: false };
const TYPES: readonly IndexType[] = ["libro", "pelicula", "serie"];
const FIELD: Record<IndexType, "book" | "movie" | "series"> = { libro: "book", pelicula: "movie", serie: "series" };

export function parseIndexParams(get: (name: string) => string | null): IndexParams {
  const tipos = (get("tipo") ?? "").split(",").filter((v): v is IndexType => (TYPES as readonly string[]).includes(v));
  const vista = get("vista");
  return {
    q: (get("q") ?? "").trim(),
    filters: { tipos, itinerarios: get("itinerarios") === "1", coleccion: get("coleccion") === "1", min5: get("min5") === "1" },
    focus: vista === "sigo" ? "sigues" : vista === "universos" ? "universos" : null,
  };
}

export function indexQueryString({ q, filters }: { q: string; filters: IndexFilters }): string {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (filters.tipos.length > 0) qs.set("tipo", filters.tipos.join(","));
  if (filters.itinerarios) qs.set("itinerarios", "1");
  if (filters.coleccion) qs.set("coleccion", "1");
  if (filters.min5) qs.set("min5", "1");
  return qs.toString();
}

export const hasFilters = (f: IndexFilters) => f.tipos.length > 0 || f.itinerarios || f.coleccion || f.min5;

export function matchesFilters(
  s: { typeBreakdown: { book: number; movie: number; series: number }; routeCount: number; ownedCount: number; titleCount: number },
  f: IndexFilters,
): boolean {
  if (f.tipos.length > 0 && !f.tipos.some((t) => s.typeBreakdown[FIELD[t]] > 0)) return false;
  if (f.itinerarios && s.routeCount === 0) return false;
  if (f.coleccion && s.ownedCount === 0) return false;
  if (f.min5 && s.titleCount < 5) return false;
  return true;
}

export const normalizeSearch = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesQuery(s: { name: string; children: Array<{ name: string }> }, q: string): boolean {
  const needle = normalizeSearch(q.trim());
  if (!needle) return true;
  return [s.name, ...s.children.map((c) => c.name)].some((n) => normalizeSearch(n).includes(needle));
}
```

Run: `npx vitest run src/lib/sagas/index-atlas/params.test.ts src/lib/sagas/build-saga-index.test.ts`
Expected: PASS. Después, `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/build-saga-index.ts src/lib/sagas/build-saga-index.test.ts src/lib/sagas/get-saga-index.ts src/lib/sagas/get-saga-index.test.ts src/lib/sagas/index-atlas
git commit -m "feat(sagas): saga empezada, último pase y URL del atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modelo y resumen del índice

**Files:**
- Create: `src/lib/sagas/index-atlas/model.ts`, `src/lib/sagas/index-atlas/model.test.ts`
- Create: `src/lib/sagas/index-atlas/summary.ts`, `src/lib/sagas/index-atlas/summary.test.ts`

**Interfaces:**
- Consumes: `SagaIndexCard` (`src/lib/sagas/build-saga-index.ts`, con `started` y `lastTouchedAt` de la Task 2), `SagaAccentToken`, `sagaHref` (`src/lib/catalog/item-href.ts`).
- Produces:

```ts
export type ComarcaKey = "libros" | "peliculas" | "series" | "mixtas";
export type IndexZoneKey = "en-curso" | "sigues" | "terminadas" | "por-descubrir" | ComarcaKey;
export type IndexAtlasChild = { id: string; name: string; href: string; accent: SagaAccentToken; titleCount: number };
export type IndexAtlasSaga = {
  id: string; name: string; href: string; coverUrl: string | null; accent: SagaAccentToken;
  zone: IndexZoneKey; comarca: ComarcaKey | null;
  titleCount: number; typeBreakdown: { book: number; movie: number; series: number };
  creator: string | null; routeCount: number; ownedCount: number; isFollowed: boolean;
  progress: { completed: number; total: number } | null;
  children: IndexAtlasChild[];
};
export type IndexAtlasComarca = { key: ComarcaKey; sagas: IndexAtlasSaga[] };
export type IndexAtlasZone = { key: IndexZoneKey; count: number; sagas: IndexAtlasSaga[]; comarcas: IndexAtlasComarca[] | null };
export type IndexAtlasModel = { zones: IndexAtlasZone[]; sagaCount: number; universeCount: number; followedCount: number; authenticated: boolean };
export function deriveIndexAtlas(cards: SagaIndexCard[], authenticated: boolean): IndexAtlasModel;
/** Todas las sagas en orden de zona, de comarca y de saga: el orden de lista y de tabulación. */
export function orderedSagas(model: IndexAtlasModel): IndexAtlasSaga[];
```

En `por-descubrir`, `sagas` es la concatenación de sus comarcas en orden y `comarcas` no es null. En las demás zonas, `comarcas` es null. `count` es `sagas.length`.

```ts
// summary.ts
export type IndexSummary =
  | { key: "enCurso"; values: { name: string; more: number; followed: number } }
  | { key: "sinCurso"; values: { followed: number; discover: number } }
  | { key: "anonimo"; values: { sagas: number; universes: number } }
  | { key: "sinCoincidencias"; values: Record<string, never> };
export function summarizeIndex(model: IndexAtlasModel, matching: number): IndexSummary;
```

`matching` es cuántas sagas pasan filtros y búsqueda. Si `matching === 0` y hay sagas, el resumen es `sinCoincidencias`.

- [ ] **Step 1: Tests del modelo (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas, orderedSagas } from "./model";

function card(id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard {
  return {
    id, name: id.toUpperCase(), coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
    typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
    progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
    started: false, lastTouchedAt: null, ...extra,
  };
}
const zoneOf = (m: ReturnType<typeof deriveIndexAtlas>) =>
  Object.fromEntries(m.zones.flatMap((z) => z.sagas.map((s) => [s.id, z.key])));

describe("deriveIndexAtlas con sesión", () => {
  it("cada regla de zona, con su prioridad", () => {
    const m = deriveIndexAtlas([
      card("curso", { started: true, isFollowed: true, progress: { completed: 1, total: 3, pct: 33, readingLabel: null } }),
      card("sigo", { isFollowed: true }),
      card("hecha", { started: true, isFollowed: true, progress: { completed: 3, total: 3, pct: 100, readingLabel: null } }),
      card("nueva"),
      card("soloopc", { progress: { completed: 0, total: 0, pct: 0, readingLabel: null } }),
    ], true);
    expect(zoneOf(m)).toEqual({ curso: "en-curso", sigo: "sigues", hecha: "terminadas", nueva: "por-descubrir", soloopc: "por-descubrir" });
    expect(m.zones.map((z) => z.key)).toEqual(["en-curso", "sigues", "terminadas", "por-descubrir"]);
  });

  it("por descubrir: comarcas por tipo, con Mixtas, y más obras primero", () => {
    const m = deriveIndexAtlas([
      card("b1", { titleCount: 2 }),
      card("b2", { titleCount: 9 }),
      card("p1", { typeBreakdown: { book: 0, movie: 4, series: 0 }, titleCount: 4 }),
      card("mx", { typeBreakdown: { book: 1, movie: 1, series: 0 }, titleCount: 2 }),
      card("vacia", { typeBreakdown: { book: 0, movie: 0, series: 0 }, titleCount: 0 }),
    ], true);
    const pd = m.zones.find((z) => z.key === "por-descubrir")!;
    expect(pd.comarcas!.map((c) => [c.key, c.sagas.map((s) => s.id)])).toEqual([
      ["libros", ["b2", "b1"]], ["peliculas", ["p1"]], ["mixtas", ["mx", "vacia"]],
    ]);
    expect(pd.sagas.map((s) => s.id)).toEqual(["b2", "b1", "p1", "mx", "vacia"]);
    expect(pd.sagas.every((s) => s.comarca !== null)).toBe(true);
  });

  it("orden: en curso por último pase; sigues y terminadas alfabético", () => {
    const m = deriveIndexAtlas([
      card("a", { started: true, lastTouchedAt: "2026-01-01" }),
      card("b", { started: true, lastTouchedAt: "2026-05-01" }),
      card("z", { isFollowed: true, name: "Zeta" }),
      card("e", { isFollowed: true, name: "Época" }),
    ], true);
    expect(m.zones[0].sagas.map((s) => s.id)).toEqual(["b", "a"]);
    expect(m.zones[1].sagas.map((s) => s.name)).toEqual(["Época", "Zeta"]);
  });

  it("zonas vacías fuera; contadores", () => {
    const m = deriveIndexAtlas([card("u", { isFollowed: true, children: [{ id: "h", name: "H", accent: "beige", titleCount: 1 }] })], true);
    expect(m.zones.map((z) => z.key)).toEqual(["sigues"]);
    expect(m).toMatchObject({ sagaCount: 1, universeCount: 1, followedCount: 1, authenticated: true });
    expect(m.zones[0].sagas[0].children[0]).toEqual({ id: "h", name: "H", href: "/saga/h", accent: "beige", titleCount: 1 });
  });
});

describe("deriveIndexAtlas sin sesión", () => {
  it("zonas por tipo, aunque la tarjeta diga que la sigue", () => {
    const m = deriveIndexAtlas([
      card("b", { isFollowed: true }),
      card("s", { typeBreakdown: { book: 0, movie: 0, series: 2 }, titleCount: 2 }),
    ], false);
    expect(m.zones.map((z) => [z.key, z.comarcas])).toEqual([["libros", null], ["series", null]]);
    expect(m.zones[0].sagas[0]).toMatchObject({ zone: "libros", comarca: null, progress: null });
  });
});

describe("orderedSagas", () => {
  it("zona a zona, en su orden", () => {
    const m = deriveIndexAtlas([card("n"), card("c", { started: true })], true);
    expect(orderedSagas(m).map((s) => s.id)).toEqual(["c", "n"]);
  });
});
```

Si `sagaHref` devuelve otra forma que `/saga/<id>`, ajusta la expectativa de `href` a lo que devuelva.

Run: `npx vitest run src/lib/sagas/index-atlas/model.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 2: Implementar `model.ts`**

```ts
import { sagaHref } from "@/lib/catalog/item-href";
import type { SagaAccentToken } from "../accents";
import type { SagaIndexCard } from "../build-saga-index";

// Modelo del atlas de /sagas (spec 2026-10-28 índice §4.1). Puro: el cliente lo vuelve a
// derivar tras seguir una saga (actualización optimista).
export type ComarcaKey = "libros" | "peliculas" | "series" | "mixtas";
export type IndexZoneKey = "en-curso" | "sigues" | "terminadas" | "por-descubrir" | ComarcaKey;
export type IndexAtlasChild = { id: string; name: string; href: string; accent: SagaAccentToken; titleCount: number };
export type IndexAtlasSaga = {
  id: string; name: string; href: string; coverUrl: string | null; accent: SagaAccentToken;
  zone: IndexZoneKey; comarca: ComarcaKey | null;
  titleCount: number; typeBreakdown: { book: number; movie: number; series: number };
  creator: string | null; routeCount: number; ownedCount: number; isFollowed: boolean;
  progress: { completed: number; total: number } | null;
  children: IndexAtlasChild[];
};
export type IndexAtlasComarca = { key: ComarcaKey; sagas: IndexAtlasSaga[] };
export type IndexAtlasZone = { key: IndexZoneKey; count: number; sagas: IndexAtlasSaga[]; comarcas: IndexAtlasComarca[] | null };
export type IndexAtlasModel = { zones: IndexAtlasZone[]; sagaCount: number; universeCount: number; followedCount: number; authenticated: boolean };

const COMARCAS: readonly ComarcaKey[] = ["libros", "peliculas", "series", "mixtas"];
const READER_ZONES = ["en-curso", "sigues", "terminadas", "por-descubrir"] as const;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
const bySize = (a: IndexAtlasSaga, b: IndexAtlasSaga) => b.titleCount - a.titleCount || byName(a, b);

/** El único tipo con obras; con más de uno (o ninguno), Mixtas. */
function comarcaOf(t: SagaIndexCard["typeBreakdown"]): ComarcaKey {
  const present = (["book", "movie", "series"] as const).filter((k) => t[k] > 0);
  if (present.length !== 1) return "mixtas";
  return present[0] === "book" ? "libros" : present[0] === "movie" ? "peliculas" : "series";
}

function readerZone(c: SagaIndexCard): (typeof READER_ZONES)[number] {
  const done = c.progress !== null && c.progress.total > 0 && c.progress.completed >= c.progress.total;
  if (c.started && !done) return "en-curso";
  if (c.isFollowed && !c.started) return "sigues";
  if (done) return "terminadas";
  return "por-descubrir";
}

export function deriveIndexAtlas(cards: SagaIndexCard[], authenticated: boolean): IndexAtlasModel {
  const sagas = cards.map((c): IndexAtlasSaga => {
    const comarca = comarcaOf(c.typeBreakdown);
    const zone: IndexZoneKey = authenticated ? readerZone(c) : comarca;
    return {
      id: c.id, name: c.name, href: sagaHref(c.id), coverUrl: c.coverUrl, accent: c.accent,
      zone, comarca: zone === "por-descubrir" ? comarca : null,
      titleCount: c.titleCount, typeBreakdown: c.typeBreakdown, creator: c.creator,
      routeCount: c.routeCount, ownedCount: c.ownedCount, isFollowed: authenticated && c.isFollowed,
      progress: authenticated && c.progress ? { completed: c.progress.completed, total: c.progress.total } : null,
      children: c.children.map((h) => ({ id: h.id, name: h.name, href: sagaHref(h.id), accent: h.accent, titleCount: h.titleCount })),
    };
  });
  const lastTouched = new Map(cards.map((c) => [c.id, c.lastTouchedAt ?? ""] as const));

  const zones: IndexAtlasZone[] = [];
  const push = (key: IndexZoneKey, list: IndexAtlasSaga[], comarcas: IndexAtlasComarca[] | null = null) => {
    if (list.length > 0) zones.push({ key, count: list.length, sagas: list, comarcas });
  };
  if (authenticated) {
    const inZone = (k: IndexZoneKey) => sagas.filter((s) => s.zone === k);
    push("en-curso", inZone("en-curso").sort((a, b) => (lastTouched.get(b.id)! > lastTouched.get(a.id)! ? 1 : lastTouched.get(b.id)! < lastTouched.get(a.id)! ? -1 : byName(a, b))));
    push("sigues", inZone("sigues").sort(byName));
    push("terminadas", inZone("terminadas").sort(byName));
    const comarcas = COMARCAS
      .map((key) => ({ key, sagas: sagas.filter((s) => s.zone === "por-descubrir" && s.comarca === key).sort(bySize) }))
      .filter((c) => c.sagas.length > 0);
    push("por-descubrir", comarcas.flatMap((c) => c.sagas), comarcas);
  } else {
    for (const key of COMARCAS) push(key, sagas.filter((s) => s.zone === key).sort(bySize));
  }

  return {
    zones,
    sagaCount: sagas.length,
    universeCount: sagas.filter((s) => s.children.length > 0).length,
    followedCount: sagas.filter((s) => s.isFollowed).length,
    authenticated,
  };
}

export const orderedSagas = (model: IndexAtlasModel) => model.zones.flatMap((z) => z.sagas);
```

Run: `npx vitest run src/lib/sagas/index-atlas/model.test.ts`
Expected: PASS.

- [ ] **Step 3: Tests del resumen (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas } from "./model";
import { summarizeIndex } from "./summary";

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: id.toUpperCase(), coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});

describe("summarizeIndex", () => {
  it("en curso: la primera y cuántas más, y cuántas sigues", () => {
    const m = deriveIndexAtlas([
      card("a", { started: true, lastTouchedAt: "2026-02" }), card("b", { started: true, lastTouchedAt: "2026-01" }),
      card("c", { isFollowed: true }), card("d"),
    ], true);
    expect(summarizeIndex(m, 4)).toEqual({ key: "enCurso", values: { name: "A", more: 1, followed: 1 } });
  });
  it("sin nada en curso: sigues y por descubrir", () => {
    const m = deriveIndexAtlas([card("c", { isFollowed: true }), card("d"), card("e")], true);
    expect(summarizeIndex(m, 3)).toEqual({ key: "sinCurso", values: { followed: 1, discover: 2 } });
  });
  it("sin sesión: sagas y universos", () => {
    const m = deriveIndexAtlas([card("u", { children: [{ id: "h", name: "H", accent: "beige", titleCount: 1 }] }), card("v")], false);
    expect(summarizeIndex(m, 2)).toEqual({ key: "anonimo", values: { sagas: 2, universes: 1 } });
  });
  it("nada coincide", () => {
    const m = deriveIndexAtlas([card("d")], true);
    expect(summarizeIndex(m, 0)).toEqual({ key: "sinCoincidencias", values: {} });
  });
});
```

Run: `npx vitest run src/lib/sagas/index-atlas/summary.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar `summary.ts`**

```ts
import type { IndexAtlasModel } from "./model";

// Resumen de una línea de la barra superior (spec 2026-10-28 índice §5). Puro: la UI pone el
// texto con `sagaIndex.atlas.summary.<key>`.
export type IndexSummary =
  | { key: "enCurso"; values: { name: string; more: number; followed: number } }
  | { key: "sinCurso"; values: { followed: number; discover: number } }
  | { key: "anonimo"; values: { sagas: number; universes: number } }
  | { key: "sinCoincidencias"; values: Record<string, never> };

export function summarizeIndex(model: IndexAtlasModel, matching: number): IndexSummary {
  if (model.sagaCount > 0 && matching === 0) return { key: "sinCoincidencias", values: {} };
  if (!model.authenticated) return { key: "anonimo", values: { sagas: model.sagaCount, universes: model.universeCount } };
  const enCurso = model.zones.find((z) => z.key === "en-curso");
  if (enCurso) {
    return { key: "enCurso", values: { name: enCurso.sagas[0].name, more: enCurso.count - 1, followed: model.followedCount } };
  }
  const discover = model.zones.find((z) => z.key === "por-descubrir")?.count ?? 0;
  return { key: "sinCurso", values: { followed: model.followedCount, discover } };
}
```

Run: `npx vitest run src/lib/sagas/index-atlas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/index-atlas
git commit -m "feat(sagas): zonas, comarcas y resumen del atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Layout del índice

**Files:**
- Create: `src/lib/sagas/index-atlas/layout.ts`, `src/lib/sagas/index-atlas/layout.test.ts`

**Interfaces:**
- Consumes: `IndexAtlasModel`, `IndexZoneKey`, `ComarcaKey` (Task 3); `Extent`, `Orientation`, `Point` (`@/lib/atlas/types`).
- Produces:

```ts
export const SAGA_W = 64;
export const SAGA_H = 96;
export const CHILD_SCALE = 1 / 3;
export const MAX_CHILDREN = 6;
export type ZoneBox = { key: IndexZoneKey; x: number; y: number; w: number; h: number }; // esquina superior izquierda
export type ComarcaBox = { key: ComarcaKey; x: number; y: number }; // posición del rótulo
export type SagaBox = { id: string; x: number; y: number; scale: number; parentId: string | null }; // centro de la portada
export type IslandBox = { id: string; x: number; y: number; w: number; h: number; hidden: number }; // contorno de un universo; `hidden` = subsagas que no caben
export type IndexLayout = { zones: ZoneBox[]; comarcas: ComarcaBox[]; sagas: SagaBox[]; islands: IslandBox[]; extent: Extent };
export function layoutIndexAtlas(model: IndexAtlasModel, orientation: Orientation): IndexLayout;
/** Centro de una zona: el foco de la cámara para `vista=sigo` y para «En curso». */
export function zoneCentre(layout: IndexLayout, key: IndexZoneKey): Point | null;
```

**Reglas (de la spec §4.2; las medidas son de este plan):**
- `CELL_W = SAGA_W + 28 = 92`, `CELL_H = SAGA_H + 40 = 136` (portada más nombre bajo ella).
- Una saga ocupa 1 celda; un universo, 2 celdas seguidas en la misma fila (portada a la izquierda y la rejilla de subsagas a la derecha).
- Columnas por zona: horizontal, 4 en las zonas del lector y 8 en `por-descubrir` y en las zonas sin sesión; vertical, 3 en todas. Un universo no se parte entre filas: si no cabe, empieza fila nueva.
- `ZONE_PAD = 28`; `ZONE_HEADER = 36` (rótulo de la zona); `COMARCA_HEADER = 26`: cada comarca empieza fila nueva con su rótulo encima.
- Ancho de zona = `2 * ZONE_PAD + columnas usadas * CELL_W`, con un mínimo de una columna. Alto = `ZONE_HEADER + ZONE_PAD + filas * CELL_H + rótulos de comarca`.
- Horizontal: zonas de izquierda a derecha, alineadas arriba en `y = 0`, separadas por `ZONE_GAP = 56`. Vertical: de arriba abajo, alineadas a la izquierda en `x = 0`, con la misma separación.
- Subsagas de un universo: hasta `MAX_CHILDREN` en una rejilla de 2 columnas × 3 filas dentro de la segunda celda, a escala `CHILD_SCALE`; `hidden = children.length - MAX_CHILDREN` si sobra (mínimo 0). `IslandBox` envuelve las dos celdas con 8 px de margen.
- `extent` envuelve todas las zonas.

- [ ] **Step 1: Tests (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas } from "./model";
import { CHILD_SCALE, layoutIndexAtlas, MAX_CHILDREN, SAGA_H, SAGA_W, zoneCentre, type IndexLayout } from "./layout";

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: id, coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});
const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, name: `K${i}`, accent: "beige" as const, titleCount: 1 }));

function catalog(): SagaIndexCard[] {
  return [
    card("curso", { started: true, lastTouchedAt: "2026" }),
    card("uni", { isFollowed: true, children: kids(8) }),
    card("sigo", { isFollowed: true }),
    ...Array.from({ length: 30 }, (_, i) => card(`b${i}`, { titleCount: 30 - i })),
    ...Array.from({ length: 7 }, (_, i) => card(`p${i}`, { typeBreakdown: { book: 0, movie: 2, series: 0 } })),
  ];
}

/** Ninguna pareja de portadas se toca (cajas a su escala). */
function overlaps(l: IndexLayout): string[] {
  const box = (s: IndexLayout["sagas"][number]) => ({
    x0: s.x - (SAGA_W * s.scale) / 2, x1: s.x + (SAGA_W * s.scale) / 2,
    y0: s.y - (SAGA_H * s.scale) / 2, y1: s.y + (SAGA_H * s.scale) / 2,
  });
  const out: string[] = [];
  for (let i = 0; i < l.sagas.length; i++) for (let j = i + 1; j < l.sagas.length; j++) {
    const a = box(l.sagas[i]), b = box(l.sagas[j]);
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push(`${l.sagas[i].id}/${l.sagas[j].id}`);
  }
  return out;
}

describe("layoutIndexAtlas", () => {
  for (const o of ["h", "v"] as const) {
    it(`sin solapes y cada saga dentro de su zona (${o})`, () => {
      const m = deriveIndexAtlas(catalog(), true);
      const l = layoutIndexAtlas(m, o);
      expect(overlaps(l)).toEqual([]);
      for (const z of m.zones) {
        const zb = l.zones.find((b) => b.key === z.key)!;
        for (const s of z.sagas) {
          const sb = l.sagas.find((b) => b.id === s.id && b.parentId === null)!;
          expect(sb.x).toBeGreaterThan(zb.x);
          expect(sb.x).toBeLessThan(zb.x + zb.w);
          expect(sb.y).toBeGreaterThan(zb.y);
          expect(sb.y).toBeLessThan(zb.y + zb.h);
        }
      }
    });
  }

  it("horizontal: zonas de izquierda a derecha; vertical: de arriba abajo", () => {
    const m = deriveIndexAtlas(catalog(), true);
    const h = layoutIndexAtlas(m, "h").zones;
    const v = layoutIndexAtlas(m, "v").zones;
    expect(h.map((z) => z.key)).toEqual(m.zones.map((z) => z.key));
    for (let i = 1; i < h.length; i++) expect(h[i].x).toBeGreaterThan(h[i - 1].x + h[i - 1].w);
    for (let i = 1; i < v.length; i++) expect(v[i].y).toBeGreaterThan(v[i - 1].y + v[i - 1].h);
  });

  it("universo: isla con hasta 6 subsagas pequeñas y el resto contado", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "h");
    const children = l.sagas.filter((s) => s.parentId === "uni");
    expect(children).toHaveLength(MAX_CHILDREN);
    expect(children.every((c) => c.scale === CHILD_SCALE)).toBe(true);
    expect(l.islands).toEqual([expect.objectContaining({ id: "uni", hidden: 2 })]);
  });

  it("por descubrir: un rótulo por comarca", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "h");
    expect(l.comarcas.map((c) => c.key)).toEqual(["libros", "peliculas"]);
  });

  it("zoneCentre y extent", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "h");
    const z = l.zones.find((b) => b.key === "sigues")!;
    expect(zoneCentre(l, "sigues")).toEqual({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
    expect(zoneCentre(l, "terminadas")).toBeNull();
    expect(l.extent.minX).toBeLessThanOrEqual(Math.min(...l.zones.map((b) => b.x)));
    expect(l.extent.maxX).toBeGreaterThanOrEqual(Math.max(...l.zones.map((b) => b.x + b.w)));
  });

  it("modelo vacío: sin zonas y extent degenerado en el origen", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas([], true), "h");
    expect(l).toEqual({ zones: [], comarcas: [], sagas: [], islands: [], extent: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
  });
});
```

Run: `npx vitest run src/lib/sagas/index-atlas/layout.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar `layout.ts`**

```ts
import type { Extent, Orientation, Point } from "@/lib/atlas/types";
import type { ComarcaKey, IndexAtlasModel, IndexAtlasSaga, IndexZoneKey } from "./model";

// Layout del atlas de /sagas (spec 2026-10-28 índice §4.2). Puro. Cada zona es una rejilla
// de celdas; un universo ocupa dos (portada + rejilla de subsagas). Las coordenadas de las
// sagas son el CENTRO de la portada; las de zonas e islas, su esquina superior izquierda.
export const SAGA_W = 64;
export const SAGA_H = 96;
export const CHILD_SCALE = 1 / 3;
export const MAX_CHILDREN = 6;
const CELL_W = SAGA_W + 28;
const CELL_H = SAGA_H + 40;
const ZONE_PAD = 28;
const ZONE_HEADER = 36;
const COMARCA_HEADER = 26;
const ZONE_GAP = 56;
const ISLAND_MARGIN = 8;
const READER_ZONES: readonly IndexZoneKey[] = ["en-curso", "sigues", "terminadas"];

export type ZoneBox = { key: IndexZoneKey; x: number; y: number; w: number; h: number };
export type ComarcaBox = { key: ComarcaKey; x: number; y: number };
export type SagaBox = { id: string; x: number; y: number; scale: number; parentId: string | null };
export type IslandBox = { id: string; x: number; y: number; w: number; h: number; hidden: number };
export type IndexLayout = { zones: ZoneBox[]; comarcas: ComarcaBox[]; sagas: SagaBox[]; islands: IslandBox[]; extent: Extent };

const columnsFor = (key: IndexZoneKey, o: Orientation) => (o === "v" ? 3 : READER_ZONES.includes(key) ? 4 : 8);
const span = (s: IndexAtlasSaga) => (s.children.length > 0 ? 2 : 1);

/** Empaqueta `groups` (una sola sin rótulo, o las comarcas con el suyo) en una zona con
 *  origen (ox, oy). Devuelve cajas y el tamaño ocupado. */
function packZone(
  key: IndexZoneKey,
  groups: Array<{ comarca: ComarcaKey | null; sagas: IndexAtlasSaga[] }>,
  cols: number, ox: number, oy: number,
  out: Pick<IndexLayout, "comarcas" | "sagas" | "islands">,
): { w: number; h: number } {
  let y = oy + ZONE_HEADER;
  let usedCols = 1;
  for (const g of groups) {
    if (g.comarca) {
      out.comarcas.push({ key: g.comarca, x: ox + ZONE_PAD, y: y + COMARCA_HEADER / 2 });
      y += COMARCA_HEADER;
    }
    let col = 0;
    let rows = g.sagas.length > 0 ? 1 : 0;
    for (const s of g.sagas) {
      const n = Math.min(span(s), cols);
      if (col + n > cols) { col = 0; rows += 1; }
      const cx = ox + ZONE_PAD + col * CELL_W + CELL_W / 2;
      const cy = y + (rows - 1) * CELL_H + SAGA_H / 2;
      out.sagas.push({ id: s.id, x: cx, y: cy, scale: 1, parentId: null });
      if (s.children.length > 0) {
        const left = ox + ZONE_PAD + col * CELL_W;
        out.islands.push({
          id: s.id, x: left - ISLAND_MARGIN, y: cy - SAGA_H / 2 - ISLAND_MARGIN,
          w: n * CELL_W + 2 * ISLAND_MARGIN - (CELL_W - SAGA_W) / 2, h: SAGA_H + 2 * ISLAND_MARGIN,
          hidden: Math.max(0, s.children.length - MAX_CHILDREN),
        });
        const cw = SAGA_W * CHILD_SCALE, ch = SAGA_H * CHILD_SCALE;
        const gx = cx + CELL_W / 2 + (CELL_W - SAGA_W) / 2 - 8; // arranque de la rejilla en la 2.ª celda
        s.children.slice(0, MAX_CHILDREN).forEach((c, i) => {
          out.sagas.push({
            id: c.id, scale: CHILD_SCALE, parentId: s.id,
            x: gx + (i % 2) * (cw + 6) + cw / 2,
            y: cy - SAGA_H / 2 + Math.floor(i / 2) * ch + ch / 2,
          });
        });
      }
      col += n;
      usedCols = Math.max(usedCols, col);
    }
    y += rows * CELL_H;
  }
  return { w: 2 * ZONE_PAD + usedCols * CELL_W, h: y - oy + ZONE_PAD };
}

export function layoutIndexAtlas(model: IndexAtlasModel, orientation: Orientation): IndexLayout {
  const out: IndexLayout = { zones: [], comarcas: [], sagas: [], islands: [], extent: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  let cursor = 0;
  for (const z of model.zones) {
    const groups = z.comarcas ? z.comarcas.map((c) => ({ comarca: c.key, sagas: c.sagas })) : [{ comarca: null, sagas: z.sagas }];
    const ox = orientation === "h" ? cursor : 0;
    const oy = orientation === "h" ? 0 : cursor;
    const { w, h } = packZone(z.key, groups, columnsFor(z.key, orientation), ox, oy, out);
    out.zones.push({ key: z.key, x: ox, y: oy, w, h });
    cursor += (orientation === "h" ? w : h) + ZONE_GAP;
  }
  if (out.zones.length > 0) {
    out.extent = {
      minX: Math.min(...out.zones.map((b) => b.x)), minY: Math.min(...out.zones.map((b) => b.y)),
      maxX: Math.max(...out.zones.map((b) => b.x + b.w)), maxY: Math.max(...out.zones.map((b) => b.y + b.h)),
    };
  }
  return out;
}

export function zoneCentre(layout: IndexLayout, key: IndexZoneKey): Point | null {
  const z = layout.zones.find((b) => b.key === key);
  return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null;
}
```

Si el test de solapes falla por la rejilla de subsagas (choca con la portada del universo o con la celda siguiente), ajusta `gx` y la separación de 6 px sin tocar los tests. El test es el contrato.

Run: `npx vitest run src/lib/sagas/index-atlas`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sagas/index-atlas/layout.ts src/lib/sagas/index-atlas/layout.test.ts
git commit -m "feat(sagas): layout por zonas e islas del atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Plano, página y pantalla completa (punto de control visual 1)

Sustituye la rejilla por el atlas, con plano, zonas, sagas, barra superior, zoom y cámara. La mini-ficha, el buscador, los filtros y la lista llegan en las tareas 6 a 8. Al acabar esta tarea, **para y pide el visto bueno del usuario** con capturas de escritorio y móvil.

**Files:**
- Create: `src/components/sagas/atlas/sagas-atlas.tsx` (orquesta, cliente)
- Create: `src/components/sagas/atlas/index-plane.tsx`
- Create: `src/components/sagas/atlas/index-saga.tsx`
- Create: `src/components/sagas/atlas/index-chrome.tsx` (barra superior y zoom)
- Create: `src/components/sagas/atlas/sagas-atlas.module.css`
- Create: `src/components/sagas/atlas/sagas-atlas-skeleton.tsx`
- Create: `src/components/sagas/atlas/sagas-atlas.test.tsx`
- Modify: `src/app/sagas/page.tsx` (todo el fichero)
- Modify: `src/components/nav/fullscreen-routes.ts` (+ su test, si existe)
- Modify: `messages/es.json` (`sagaIndex.atlas`)

**Interfaces:**
- Consumes: `deriveIndexAtlas`, `orderedSagas`, `IndexAtlasModel`, `IndexAtlasSaga` (Task 3); `layoutIndexAtlas`, `zoneCentre`, `SAGA_W`, `SAGA_H`, `IndexLayout` (Task 4); `summarizeIndex` (Task 3); `parseIndexParams` (Task 2); `useAtlasCamera`, `useViewport`, `useChromeInsets` (Task 1); `SagaIndexCard` (`build-saga-index.ts`); `SAGA_ACCENT` (`src/lib/sagas/accents.ts`).
- Produces:

```ts
// sagas-atlas.tsx
export type SagasAtlasProps = { cards: SagaIndexCard[]; authenticated: boolean; canCurate: boolean };
export function SagasAtlas(props: SagasAtlasProps): JSX.Element;
// index-plane.tsx
export type IndexLevel = "zones" | "covers" | "detail";
export function indexZoomLevel(k: number): IndexLevel; // k < 0.5 zones; k > 1.6 detail; si no, covers
export function IndexPlane(props: {
  model: IndexAtlasModel; layout: IndexLayout; camera: Camera; viewport: Viewport; animated: boolean;
  dimmed: (s: IndexAtlasSaga) => boolean; selectedId: string | null;
  onSelect: (s: IndexAtlasSaga) => void; onFocusSaga: (s: IndexAtlasSaga) => void;
}): JSX.Element;
// index-saga.tsx
export function IndexSaga(props: {
  saga: IndexAtlasSaga | IndexAtlasChild; box: SagaBox; level: IndexLevel; dimmed: boolean; selected: boolean;
  progress: { completed: number; total: number } | null; zoneOf?: string; onSelect?: () => void; onFocus?: () => void;
}): JSX.Element;
```

Atributos DOM estables, que usan las e2e y las tareas siguientes:
- `data-sagas-atlas` y `data-ready="true"` en la raíz, cuando ya ha medido y pintado el primer layout;
- `data-atlas-stage` en el escenario;
- `data-zone="<key>"` en cada zona;
- `data-saga-id="<id>"` y `data-zone-of="<zona>"` en cada botón de saga;
- `data-dimmed` en una saga atenuada;
- `header[data-atlas-chrome="top"]` en la barra superior.

- [ ] **Step 1: Ruta a pantalla completa (test primero)**

Si existe `src/components/nav/fullscreen-routes.test.ts`, añade:

```ts
it("/sagas es pantalla completa; /sagas/nueva no", () => {
  expect(isFullscreenRoute("/sagas")).toBe(true);
  expect(isFullscreenRoute("/sagas/nueva")).toBe(false);
});
```

Si no existe, créalo con ese caso y `import { isFullscreenRoute } from "./fullscreen-routes";`. Comprueba que falla. Después añade `|| pathname === "/sagas"` a la condición, y al comentario: «`/sagas` es el atlas de sagas y universos (spec 2026-10-28 índice §3); `/sagas/nueva` no». Comprueba que pasa.

- [ ] **Step 2: Copy**

En `messages/es.json`, dentro de `sagaIndex`, añade:

```json
"atlas": {
  "eyebrow": "Atlas · {count, plural, =1 {1 saga} other {# sagas}}",
  "summary": {
    "enCurso": "En curso: <b>{name}</b>{more, plural, =0 {} other { y # más}} · sigues {followed}",
    "sinCurso": "Sigues {followed} · {discover} por descubrir",
    "anonimo": "{sagas, plural, =1 {1 saga} other {# sagas}} · {universes, plural, =1 {1 universo} other {# universos}}",
    "sinCoincidencias": "Ninguna saga cumple los filtros"
  },
  "zone": {
    "en-curso": "En curso", "sigues": "Sigues", "terminadas": "Terminadas", "por-descubrir": "Por descubrir",
    "libros": "Libros", "peliculas": "Películas", "series": "Series", "mixtas": "Mixtas"
  },
  "zoneCount": "{name} · {count}",
  "zoomIn": "Acercar", "zoomOut": "Alejar", "fit": "Ver todo el mapa",
  "planeLabel": "Mapa de sagas",
  "sagaLabel": "{name}, {count, plural, =1 {1 título} other {# títulos}}",
  "universeLabel": "{name}, universo de {count, plural, =1 {1 saga} other {# sagas}}",
  "moreChildren": "+{count}",
  "back": "Inicio"
}
```

`back` es la etiqueta del «‹» de la barra superior, que lleva a `/`.

- [ ] **Step 3: Test de componente (debe fallar)**

`src/components/sagas/atlas/sagas-atlas.test.tsx`, en jsdom. Monta `SagasAtlas` con `NextIntlClientProvider` (locale `es` y `messages/es.json`, como `atlas-test-harness.test-utils.tsx` del atlas de la saga). Mockea `next/navigation` (`useSearchParams` → `new URLSearchParams(search)`, `useRouter`) igual que ese harness, y `ResizeObserver` con un viewport de 1200×800, también como allí. Copia el patrón del harness; no lo importes.

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { renderSagasAtlas } from "./sagas-atlas-test-harness.test-utils";

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: `Saga ${id}`, coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});

describe("SagasAtlas", () => {
  it("pinta una zona por territorio y cada saga en la suya", () => {
    renderSagasAtlas({ cards: [card("a", { started: true }), card("b", { isFollowed: true }), card("c")], authenticated: true });
    expect([...document.querySelectorAll("[data-zone]")].map((z) => z.getAttribute("data-zone"))).toEqual(["en-curso", "sigues", "por-descubrir"]);
    expect(document.querySelector('[data-saga-id="b"]')?.getAttribute("data-zone-of")).toBe("sigues");
  });
  it("barra superior: eyebrow y resumen", () => {
    renderSagasAtlas({ cards: [card("a", { started: true }), card("b", { isFollowed: true })], authenticated: true });
    const top = document.querySelector('header[data-atlas-chrome="top"]')!;
    expect(top.textContent).toContain("Atlas · 2 sagas");
    expect(top.textContent).toContain("En curso: Saga a");
    expect(top.textContent).toContain("sigues 1");
  });
  it("sin sesión: zonas por tipo y resumen de catálogo", () => {
    renderSagasAtlas({ cards: [card("a"), card("p", { typeBreakdown: { book: 0, movie: 2, series: 0 } })], authenticated: false });
    expect([...document.querySelectorAll("[data-zone]")].map((z) => z.getAttribute("data-zone"))).toEqual(["libros", "peliculas"]);
    expect(screen.getByText("2 sagas · 0 universos")).toBeTruthy();
  });
  it("cada saga es un botón con nombre accesible", () => {
    renderSagasAtlas({ cards: [card("a")], authenticated: true });
    expect(screen.getByRole("button", { name: "Saga a, 3 títulos" })).toBeTruthy();
  });
});
```

Crea `sagas-atlas-test-harness.test-utils.tsx` con `renderSagasAtlas({ cards, authenticated, canCurate = false, search = "" })`.

Run: `npx vitest run src/components/sagas/atlas`
Expected: FAIL.

- [ ] **Step 4: Implementar los componentes**

Toma como referencia `src/components/saga/atlas/saga-atlas.tsx`, `atlas-plane.tsx`, `atlas-work.tsx`, `atlas-chrome.tsx` y `atlas.module.css`. Copia su forma (plano transformado, `--k`, `data-ready`, cromo medido), no sus componentes.

`index-plane.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import type { Camera, Viewport } from "@/lib/atlas/types";
import type { IndexAtlasModel, IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import type { IndexLayout } from "@/lib/sagas/index-atlas/layout";
import { IndexSaga } from "./index-saga";
import styles from "./sagas-atlas.module.css";

export type IndexLevel = "zones" | "covers" | "detail";
export const indexZoomLevel = (k: number): IndexLevel => (k < 0.5 ? "zones" : k > 1.6 ? "detail" : "covers");

/** El plano: zonas (fondo), islas de universo y sagas, en el orden de lista (orden de tabulación). */
export function IndexPlane({ model, layout, camera, viewport, animated, dimmed, selectedId, onSelect, onFocusSaga }: {
  model: IndexAtlasModel; layout: IndexLayout; camera: Camera; viewport: Viewport; animated: boolean;
  dimmed: (s: IndexAtlasSaga) => boolean; selectedId: string | null;
  onSelect: (s: IndexAtlasSaga) => void; onFocusSaga: (s: IndexAtlasSaga) => void;
}) {
  const t = useTranslations("sagaIndex.atlas");
  const level = indexZoomLevel(camera.k);
  const tx = viewport.width / 2 - camera.x * camera.k;
  const ty = viewport.height / 2 - camera.y * camera.k;
  return (
    <div
      className={styles.plane}
      data-animated={animated || undefined}
      data-level={level}
      style={{ transform: `translate(${tx}px, ${ty}px) scale(${camera.k})`, ["--k" as string]: camera.k }}
    >
      {layout.zones.map((z) => {
        const zone = model.zones.find((m) => m.key === z.key)!;
        return (
          <section key={z.key} className={styles.zone} data-zone={z.key} style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
            aria-label={t("zoneCount", { name: t(`zone.${z.key}`), count: zone.count })}>
            <span className={styles.zoneLabel} aria-hidden="true">{t("zoneCount", { name: t(`zone.${z.key}`), count: zone.count })}</span>
          </section>
        );
      })}
      {layout.comarcas.map((c) => (
        <span key={c.key} className={styles.comarcaLabel} style={{ left: c.x, top: c.y }} aria-hidden="true">{t(`zone.${c.key}`)}</span>
      ))}
      {layout.islands.map((i) => (
        <span key={i.id} className={styles.island} data-island={i.id} style={{ left: i.x, top: i.y, width: i.w, height: i.h }} aria-hidden="true">
          {i.hidden > 0 && <span className={styles.islandMore}>{t("moreChildren", { count: i.hidden })}</span>}
        </span>
      ))}
      {model.zones.flatMap((z) => z.sagas).map((s) => {
        const box = layout.sagas.find((b) => b.id === s.id && b.parentId === null)!;
        return (
          <div key={s.id}>
            <IndexSaga saga={s} box={box} level={level} dimmed={dimmed(s)} selected={selectedId === s.id}
              progress={s.progress} zoneOf={s.zone} onSelect={() => onSelect(s)} onFocus={() => onFocusSaga(s)} />
            {layout.sagas.filter((b) => b.parentId === s.id).map((cb) => {
              const child = s.children.find((c) => c.id === cb.id)!;
              return <IndexSaga key={cb.id} saga={child} box={cb} level={level} dimmed={dimmed(s)} selected={false} progress={null} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
```

`index-saga.tsx`:
- Una saga raíz es un `<button type="button">` con `data-saga-id`, `data-zone-of={zoneOf}` (prop opcional `zoneOf?: string`), `data-dimmed`, `data-selected`, `aria-haspopup="dialog"`, `aria-expanded={selected}` y `aria-label`. La etiqueta es `t("sagaLabel", { name, count: titleCount })`, o `t("universeLabel", { name, count: children.length + 1 })` si tiene subsagas.
- Una subsaga (`IndexAtlasChild`, sin `onSelect`) es un `<a href={child.href}>` con `data-saga-id`, `aria-label={t("sagaLabel", { name, count: titleCount })}` y `tabIndex={-1}`. Es enlace real (la e2e `sagas-v2-curacion` busca `a[href="/saga/<hijaId>"]`), pero fuera del orden de tabulación: a las subsagas se llega por la mini-ficha y la lista.
- Posición: `transform: translate(${box.x - SAGA_W / 2}px, ${box.y - SAGA_H / 2}px) scale(${box.scale})`, con `width: SAGA_W`, `height: SAGA_H` y `["--s"]: box.scale`.
- Portada: `next/image` con `fill` y `sizes="160px"` si hay `coverUrl`; si no, un bloque `background: SAGA_ACCENT[accent].cssVar` con las iniciales del nombre (las dos primeras palabras: «La Rueda del Tiempo» → «LR»).
- Nombre bajo la portada en `covers` y `detail` (no en subsagas). En `detail`, además, una línea con el desglose (`sagaIndex.typeCount.*`, que ya existe) y, si hay `progress` con `total > 0`, una barra (`<span className={styles.bar}><i style={{ width: \`${pct}%\` }} /></span>`).
- En `zones`, `visibility: hidden` (fuera del orden de tabulación, como en el atlas de la saga).

`index-chrome.tsx`:
- `IndexTopBar({ count, summary, actions, ref })`: un `header` con `data-atlas-chrome="top"`, un «‹» (`<Link href="/" aria-label={t("back")}>`), eyebrow, `<h1>` «Sagas» (`sagaIndex.title`), el resumen en un `<p aria-live="polite">` y un hueco `actions` a la derecha.
- `IndexZoom({ onZoomIn, onZoomOut, onFit })`: tres botones con `aria-label` `zoomIn`, `zoomOut` y `fit`.
- Un `div` con `data-atlas-chrome="dock"`, que es el `ref` del dock para `useChromeInsets`. Queda vacío hasta la Task 7.

`sagas-atlas.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { deriveIndexAtlas, type IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { layoutIndexAtlas, zoneCentre } from "@/lib/sagas/index-atlas/layout";
import { summarizeIndex } from "@/lib/sagas/index-atlas/summary";
import { parseIndexParams } from "@/lib/sagas/index-atlas/params";
import type { Orientation } from "@/lib/atlas/types";
import { useAtlasCamera, useChromeInsets, useViewport } from "@/components/atlas/use-atlas-camera";
import { IndexPlane } from "./index-plane";
import { IndexTopBar, IndexZoom } from "./index-chrome";
import styles from "./sagas-atlas.module.css";

export type SagasAtlasProps = { cards: SagaIndexCard[]; authenticated: boolean; canCurate: boolean };
const bold = (chunks: ReactNode) => <b>{chunks}</b>;

export function SagasAtlas({ cards, authenticated, canCurate }: SagasAtlasProps) {
  const t = useTranslations("sagaIndex");
  const searchParams = useSearchParams();
  const params = useMemo(() => parseIndexParams((n) => searchParams.get(n)), [searchParams]);
  const model = useMemo(() => deriveIndexAtlas(cards, authenticated), [cards, authenticated]);

  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(stageRef);
  const insets = useChromeInsets(stageRef, topRef, dockRef);
  const orientation: Orientation = viewport.width >= viewport.height ? "h" : "v";
  const layout = useMemo(() => layoutIndexAtlas(model, orientation), [model, orientation]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready || viewport.width === 0) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [ready, viewport.width]);

  // Foco inicial: el de los enlaces viejos (`vista`), si no «En curso».
  const focus = useMemo(() => {
    if (params.focus === "sigues") return zoneCentre(layout, "sigues");
    if (params.focus === "universos") {
      const i = layout.islands[0];
      return i ? { x: i.x + i.w / 2, y: i.y + i.h / 2 } : null;
    }
    return zoneCentre(layout, "en-curso");
  }, [params.focus, layout]);
  const { camera, animated, zoomBy, fitAll, focusOn, bind } = useAtlasCamera({
    ref: stageRef, viewport, insets, extent: layout.extent, focus, storageKey: "sagas-atlas", lens: "indice", orientation,
  });

  const summary = summarizeIndex(model, model.sagaCount);
  return (
    <div className={styles.root} data-sagas-atlas data-ready={ready || undefined}>
      <div ref={stageRef} className={styles.stage} data-atlas-stage role="region" aria-label={t("atlas.planeLabel")} {...bind}>
        <IndexPlane model={model} layout={layout} camera={camera} viewport={viewport} animated={animated && ready}
          dimmed={() => false} selectedId={null} onSelect={() => {}} onFocusSaga={() => {}} />
      </div>
      <IndexTopBar ref={topRef} count={model.sagaCount}
        summary={t.rich(`atlas.summary.${summary.key}`, { ...summary.values, b: bold })} actions={null} />
      <div ref={dockRef} className={styles.dock} data-atlas-chrome="dock" />
      <IndexZoom onZoomIn={() => zoomBy(1.4)} onZoomOut={() => zoomBy(1 / 1.4)} onFit={fitAll} />
    </div>
  );
}
```

En esta tarea, `canCurate`, `focusOn` y los manejadores de selección quedan cableados sin efecto: los usan las tareas 6 a 8. Si `eslint` se queja de variables sin usar, prefíjalas con `_` en la desestructuración o difiere su desestructuración. No añadas `eslint-disable`.

`sagas-atlas.module.css`. Parte de `atlas.module.css` y adapta:
- `.root`: `position: fixed; inset: 0;` fondo oscuro (los mismos tokens que el atlas de la saga) y `color-scheme: dark`;
- `.stage` y `.plane`: como en el atlas;
- `.zone`: `position: absolute; border-radius: 28px;` fondo un tono por encima del lienzo, con borde sutil. `[data-zone="en-curso"]` lleva el borde en el dorado del «ahora» del atlas de la saga;
- `.zoneLabel`: arriba a la izquierda, en versalitas pequeñas. En `[data-level="zones"]` se escala con `calc(1 / var(--k))` para seguir legible de lejos;
- `.comarcaLabel` e `.island`: contorno de 1.5 px en `color-mix` del acento de la saga (`--accent` inline en `IndexSaga`, o un neutro);
- portadas, área táctil de 44 px compensada con `--k` y `--s`, atenuado `[data-dimmed] { opacity: .25 }` y seleccionado: como `.work` en `atlas.module.css`;
- `[data-animated] .plane { transition: transform 300ms ease }` solo cuando `data-ready`.

`sagas-atlas-skeleton.tsx`: el lienzo oscuro con tres manchas `Skeleton` en fila. Es el `fallback` del `<Suspense>`.

- [ ] **Step 5: La página**

Sustituye `src/app/sagas/page.tsx` por:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaIndexData } from "@/lib/sagas/get-saga-index";
import { SagasAtlas } from "@/components/sagas/atlas/sagas-atlas";
import { SagasAtlasSkeleton } from "@/components/sagas/atlas/sagas-atlas-skeleton";

export const metadata: Metadata = { title: "Sagas — Biblioshare" };

// Atlas de sagas y universos (spec 2026-10-28 índice). Sin `use cache` (regla #437): las
// tarjetas llevan seguidas, avance y colección del lector. Shell síncrono; la sesión se lee
// dentro del <Suspense> (Cache Components). La búsqueda NO filtra en el servidor: el atlas
// pinta el catálogo entero y atenúa en el cliente (`?q=` lo lee el componente).
export default function SagasIndexPage() {
  return (
    <Suspense fallback={<SagasAtlasSkeleton />}>
      <SagasAtlasContent />
    </Suspense>
  );
}

async function SagasAtlasContent() {
  const supabase = await createClient();
  const data = await getSagaIndexData(supabase, "");
  return <SagasAtlas cards={data.cards} authenticated={data.isAuthenticated} canCurate={hasMinRole(data.viewerRole, "collaborator")} />;
}
```

Si `getSagaIndexData` recibe `query` solo para filtrar en `buildSagaIndex`, pasar `""` desactiva ese filtro. Compruébalo. El estado vacío (`cards.length === 0`) lo pinta `SagasAtlas` en la Task 7.

- [ ] **Step 6: Verificar**

```bash
npx vitest run src/components/sagas src/lib/sagas/index-atlas src/components/nav
npx tsc --noEmit
npm run lint
```

Expected: verde. Después, en el navegador (`npx next dev --webpack -p 3000`, con el puerto libre), abre `/sagas` con sesión de devtest en escritorio (1280×800) y en móvil (390×844) y comprueba:
- las zonas se ven y la cámara arranca en «En curso» (o encaja todo si no hay);
- el zoom +, − y encajar funciona, y la rueda y el arrastre mueven el plano;
- no hay errores en consola.

Haz capturas de escritorio y de móvil en `docs/testing/sagas-indice-atlas/t5-escritorio.jpg` y `t5-movil.jpg`. Mata el `next dev` al acabar.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/sagas src/app/sagas/page.tsx src/components/nav messages docs/testing/sagas-indice-atlas
git commit -m "feat(sagas): /sagas pasa a ser un atlas por territorios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Punto de control visual 1.** Enseña las capturas al usuario y espera su visto bueno antes de la Task 6.

---

### Task 6: Mini-ficha y seguir optimista

**Files:**
- Create: `src/components/sagas/atlas/index-sheet.tsx`, `src/components/sagas/atlas/index-sheet.test.tsx`
- Modify: `src/components/sagas/atlas/sagas-atlas.tsx`, `sagas-atlas.module.css`, `messages/es.json`

**Interfaces:**
- Consumes: `IndexAtlasSaga` (Task 3), `useDismissable` y `NARROW_QUERY` (Task 1), `cardPosition` e `Insets` (`@/lib/atlas/visible-camera`), `followSaga` y `unfollowSaga` (`src/lib/sagas/follow-actions.ts`), `sagaAtlasHref` (`src/lib/catalog/item-href.ts`).
- Produces:

```ts
export type SheetAnchor = { x: number; y: number; halfW: number; halfH: number };
export function IndexSheet(props: {
  saga: IndexAtlasSaga; authenticated: boolean; anchor: SheetAnchor | null; viewport: Viewport; insets: Insets;
  pending: boolean; error: boolean;
  onFollow: (follow: boolean) => void; onChild: (childId: string) => void; onClose: (refocus: boolean) => void;
}): JSX.Element;
```

**Comportamiento (spec §5.2):**
- Es un `role="dialog"` con `aria-labelledby` apuntando al nombre, y usa `useDismissable({ open: true, ref, close: onClose, ignore: (el) => !!el.closest("[data-saga-id]") })`.
- Por debajo de 640 px es una hoja inferior. Desde 640 px es una tarjeta flotante en `cardPosition(anchor, viewport, insets, { width: 280, height: medida })`. Copia el patrón de medida de `src/components/saga/atlas/work-sheet.tsx`, que mide la tarjeta tras pintarla.
- Contenido:
  - eyebrow: `universeEyebrow` si tiene subsagas; si no, el desglose por tipo (`sagaIndex.typeCount.*`);
  - el nombre (`h2`);
  - `creator`, si lo hay;
  - si `progress` y `total > 0`: barra y `progress` («Llevas X de N»).
- Acciones:
  - «Abrir ficha» (`<Link href={saga.href}>`) y «Ver atlas» (`<Link href={sagaAtlasHref(saga.id)}>`);
  - con sesión, un botón «Seguir» o «Sigues», con `aria-pressed={saga.isFollowed}` y `disabled={pending}`, que llama a `onFollow(!saga.isFollowed)`;
  - sin sesión, `<Link href="/login?next=%2Fsagas">` con `loginToFollow`;
  - si `error`, un `<p role="alert">` con `followError`.
- Universo: una lista de subsagas, cada una un `<a href={child.href}>` con su nombre y número de títulos, y un botón «Ver en el mapa» (`aria-label` con el nombre) que llama a `onChild(child.id)`.

Copy nuevo en `sagaIndex.atlas.sheet`:

```json
"sheet": {
  "universeEyebrow": "Universo · {count, plural, =1 {1 saga} other {# sagas}}",
  "progress": "Llevas <b>{completed} de {total}</b>",
  "open": "Abrir ficha", "atlas": "Ver atlas",
  "follow": "Seguir", "following": "Sigues",
  "loginToFollow": "Entra para seguirla",
  "followError": "No se pudo seguir; inténtalo de nuevo",
  "children": "Sagas del universo",
  "showInMap": "Ver {name} en el mapa",
  "close": "Cerrar"
}
```

**En `sagas-atlas.tsx`:**
- Estado `selectedId`.
- Seguir, optimista: `const [follows, setFollows] = useState<Map<string, boolean>>(new Map())`; las tarjetas efectivas son `cards.map((c) => follows.has(c.id) ? { ...c, isFollowed: follows.get(c.id)! } : c)` y alimentan `deriveIndexAtlas`.
- Al seguir: `setFollows(+id)`, `startTransition(async () => { try { await (follow ? followSaga : unfollowSaga)(id) } catch { revierte; setError(id) } })`, con `pending` mientras dura. La saga cambia de zona al instante, y la cámara NO se mueve.
- Tras mover la saga, la mini-ficha sigue abierta y anclada a la nueva posición (el `anchor` se recalcula con el layout nuevo).
- Al seleccionar una saga con subsagas, la cámara se acerca a su isla (`focusOn(centro de la isla, max(camera.k, 1.2))`) y abre la mini-ficha.
- `onChild(childId)`: `focusOn` del `SagaBox` de esa subsaga a `k = 3`, y la ficha sigue abierta.
- Al cerrar con `refocus`, el foco vuelve a `[data-saga-id="<id>"]`, como `closeSheet` en `saga-atlas.tsx`.

- [ ] **Step 1: Tests (deben fallar)**

`index-sheet.test.tsx` (jsdom), con un harness mínimo de `NextIntlClientProvider`:
- con sesión, «Seguir» llama a `onFollow(true)`; con `isFollowed`, el botón dice «Sigues» con `aria-pressed="true"` y llama a `onFollow(false)`;
- sin sesión, no hay botón de seguir y hay un enlace «Entra para seguirla» con `href="/login?next=%2Fsagas"`;
- `error` muestra el `role="alert"`;
- un universo lista sus subsagas como enlaces a `/saga/<id>`, y «Ver K0 en el mapa» llama a `onChild("k0")`;
- Escape llama a `onClose(true)`.

En `sagas-atlas.test.tsx` añade, mockeando `@/lib/sagas/follow-actions` con `vi.mock`:
- Enter sobre la saga abre el diálogo;
- «Seguir» mueve la saga a `sigues` (`data-zone-of`) antes de que resuelva la acción;
- si la acción rechaza, vuelve a su zona y aparece el alerta.

Run: `npx vitest run src/components/sagas`
Expected: FAIL.

- [ ] **Step 2: Implementar** según lo anterior. Toma `work-sheet.tsx` como referencia de estructura, medida y estilos (`.sheet`, `.card` en `atlas.module.css`).

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/components/sagas src/lib/sagas/index-atlas
npx tsc --noEmit
npm run lint
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/sagas messages
git commit -m "feat(sagas): mini-ficha del atlas del índice y seguir sin recargar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Buscador, filtros y estados vacíos

**Files:**
- Create: `src/components/sagas/atlas/index-search.tsx`, `src/components/sagas/atlas/index-filters.tsx` y sus `.test.tsx`
- Modify: `src/components/sagas/atlas/sagas-atlas.tsx`, `index-chrome.tsx`, `sagas-atlas.module.css`, `messages/es.json`

**Interfaces:**
- Consumes: `parseIndexParams`, `indexQueryString`, `matchesFilters`, `matchesQuery`, `normalizeSearch`, `hasFilters`, `NO_FILTERS`, `IndexFilters` (Task 2); `orderedSagas` (Task 3).
- Produces:

```ts
export function IndexSearch(props: {
  sagas: IndexAtlasSaga[]; query: string; onQuery: (q: string) => void;
  onPick: (target: { sagaId: string; childId: string | null }) => void;
}): JSX.Element;
export function IndexFilters(props: { filters: IndexFilters; onChange: (f: IndexFilters) => void }): JSX.Element;
```

**Comportamiento:**
- Estado local `query` y `filters`, sembrados desde `params` (Task 5). Cada cambio escribe la URL con `window.history.replaceState(null, "", indexQueryString(...) ? \`/sagas?${qs}\` : "/sagas")`, sin `router`.
- Atenuar: `dimmed(s) = !matchesFilters(s, filters) || !matchesQuery(s, query)`. `matching` (para el resumen) cuenta las sagas que coinciden.
- **Buscador.** Un `input type="search"` con `role="combobox"`, `aria-expanded` y `aria-controls` hacia un `role="listbox"`.
  - Con texto, muestra hasta 8 coincidencias en orden de lista: sagas cuyo nombre coincide y subsagas cuyo nombre coincide, con «en <universo>» como segunda línea. Cada coincidencia es un `role="option"`.
  - Flechas arriba y abajo mueven la opción activa, Enter elige y Escape vacía y cierra.
  - Elegir llama a `onPick`. En `sagas-atlas`: `focusOn` del `SagaBox` (la raíz a `k = 1.4`; una subsaga a `k = 3`) y abre la mini-ficha de la raíz.
  - Sin coincidencias, el listbox muestra `noMatches` y la cámara no se mueve.
- **Filtros.** Un grupo de botones conmutables (`aria-pressed`) en el dock: Libros, Películas, Series, Con itinerarios, En tu colección y ≥ 5 títulos. Con alguno activo, aparece «Quitar filtros», que vuelve a `NO_FILTERS`.
- Resumen: `summarizeIndex(model, matching)`. Con `sinCoincidencias`, la barra superior muestra también el botón «Quitar filtros», que limpia filtros y búsqueda.
- **Sin sagas** (`cards.length === 0`): en lugar del plano, el `EmptyState` actual (`src/components/ui/empty-state.tsx`) con `sagaIndex.emptyTitle` y, si `canCurate`, un enlace «Nueva saga» a `/sagas/nueva`.
- En la barra superior, `actions` = buscador + «Nueva saga» (solo con `canCurate`; `<Link href="/sagas/nueva">` con el texto de `sagaIndex.new`). «Ver como lista» llega en la Task 8.

Copy nuevo en `sagaIndex.atlas`:

```json
"search": { "label": "Buscar sagas", "placeholder": "Buscar sagas…", "noMatches": "Ninguna saga coincide", "inUniverse": "en {name}" },
"filters": { "label": "Filtros", "libro": "Libros", "pelicula": "Películas", "serie": "Series", "itinerarios": "Con itinerarios", "coleccion": "En tu colección", "min5": "≥ 5 títulos", "clear": "Quitar filtros" }
```

- [ ] **Step 1: Tests (deben fallar)**
- `index-search.test.tsx`:
  - escribir «guard» lista la subsaga «La Guardia» con «en Mundodisco»;
  - flecha abajo y Enter llama a `onPick({ sagaId: "mundo", childId: "guardia" })`;
  - «zzz» muestra «Ninguna saga coincide»;
  - Escape vacía (`onQuery("")`).
- `index-filters.test.tsx`: pulsar «Películas» llama a `onChange` con `tipos: ["pelicula"]`; «Quitar filtros» solo aparece con filtros activos.
- `sagas-atlas.test.tsx`:
  - con `search: "tipo=pelicula"`, las sagas de libros llevan `data-dimmed` y las de películas no;
  - pulsar un filtro llama a `history.replaceState` con `/sagas?tipo=…` (espía en `window.history.replaceState`);
  - con `cards: []` se ve el estado vacío, y con `canCurate` el enlace «Nueva saga».

Run: `npx vitest run src/components/sagas`
Expected: FAIL.

- [ ] **Step 2: Implementar**

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/components/sagas src/lib/sagas/index-atlas
npx tsc --noEmit
npm run lint
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/sagas messages
git commit -m "feat(sagas): buscador y filtros que atenúan en el atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Ver como lista» y teclado (punto de control visual 2)

**Files:**
- Create: `src/components/sagas/atlas/index-list.tsx`, `index-list.test.tsx`
- Modify: `src/components/sagas/atlas/sagas-atlas.tsx`, `index-chrome.tsx`, `sagas-atlas.module.css`, `messages/es.json`

**Interfaces:**
- Consumes: `IndexAtlasModel`, `orderedSagas` (Task 3); `inVisibleArea` (`@/lib/atlas/visible-camera`); `SAGA_W`, `SAGA_H` (Task 4).
- Produces: `export function IndexList(props: { model: IndexAtlasModel; dimmed: (s: IndexAtlasSaga) => boolean; insets: Insets }): JSX.Element;`

**Comportamiento (spec §5.4):**
- Un botón «Ver como lista» / «Ver el mapa» en la barra superior, con `aria-pressed`, alterna entre plano y lista.
- La lista es una capa desplazable sobre el lienzo, entre la barra y el dock, que respeta `insets`.
  - Una `<section aria-labelledby>` por zona, con su `h2` («En curso · 3»). En `por-descubrir`, un `h3` por comarca.
  - Cada saga es un `<li>` con `<a href={saga.href}>`: nombre, número de títulos y «Llevas X de N» si hay avance.
  - Un universo lleva sus subsagas en una sublista de enlaces.
  - Una saga que no coincide con filtros o búsqueda lleva `data-dimmed` y un texto oculto «(no coincide con los filtros)». No se oculta.
- Mientras la lista está abierta, la mini-ficha se cierra y el plano queda `inert`.
- **Teclado en el plano.**
  - Tab recorre las sagas raíz en el orden de `orderedSagas` (ya es el orden DOM, Task 5).
  - Al recibir foco por teclado, la cámara las trae a la vista si no lo están (`inVisibleArea` con medio ancho y medio alto de la portada). Usa el mismo detector de foco de teclado que `saga-atlas.tsx` (`keydown` / `pointerdown` en captura).
  - Enter o Espacio abre la mini-ficha (ya lo hace el `onClick` del botón). Escape la cierra y devuelve el foco (Task 6).

Copy nuevo en `sagaIndex.atlas`:

```json
"list": { "show": "Ver como lista", "hide": "Ver el mapa", "label": "Sagas en lista", "notMatching": "(no coincide con los filtros)" }
```

- [ ] **Step 1: Tests (deben fallar)**
- `index-list.test.tsx`:
  - un `h2` por zona en orden; en por-descubrir, `h3` de comarca;
  - los enlaces `/saga/<id>` en el orden de `orderedSagas`;
  - las subsagas como sublista;
  - una saga atenuada lleva `data-dimmed` y el texto oculto.
- `sagas-atlas.test.tsx`:
  - «Ver como lista» muestra la lista, `aria-pressed="true"`, y el plano queda `inert`;
  - otra pulsación vuelve al mapa;
  - Tab desde la barra superior enfoca la primera saga en orden de lista.

Run: `npx vitest run src/components/sagas`
Expected: FAIL.

- [ ] **Step 2: Implementar**

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/components/sagas src/lib/sagas/index-atlas
npx tsc --noEmit
npm run lint
```

Expected: verde. Después, en el navegador (una sola instancia de `next dev --webpack -p 3000`), con sesión de devtest, escritorio y móvil:
- abre la mini-ficha de un universo y de una saga suelta;
- sigue una saga y déjala de seguir (al acabar, deja el seguimiento como estaba);
- busca una subsaga;
- filtra por Películas;
- abre «Ver como lista»;
- recorre el plano con Tab.

Capturas en `docs/testing/sagas-indice-atlas/t8-escritorio-ficha.jpg`, `t8-movil-ficha.jpg`, `t8-escritorio-filtros.jpg` y `t8-movil-lista.jpg`. Mata `next dev` al acabar.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/sagas messages docs/testing/sagas-indice-atlas
git commit -m "feat(sagas): lista accesible y teclado en el atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Punto de control visual 2.** Enseña las capturas al usuario y espera su visto bueno antes de la Task 9.

---

### Task 9: Retirar la rejilla

**Files:**
- Delete: `src/components/saga/saga-index-card.tsx`, `src/components/saga/saga-index-filters.tsx`, `src/components/saga/saga-load-more.tsx` y sus tests, si existen
- Modify: `src/lib/sagas/filter-saga-index.ts` (y su test)
- Modify: `messages/es.json` (claves de `sagaIndex` sin uso)

**Interfaces:**
- Produces: ninguna. Tras esta tarea, `filterSagaIndex` y `SagaIndexView` no existen.

- [ ] **Step 1: Comprobar que nadie los usa**

```bash
grep -rn "saga-index-card\|saga-index-filters\|saga-load-more\|filterSagaIndex\|SagaIndexView\|SagaIndexFilterParams\|TYPE_TO_FIELD" src e2e
```

Expected: solo los propios ficheros a borrar, `filter-saga-index.ts` y su test. Si aparece otro uso, cámbialo a `params.ts` (`matchesFilters`, `IndexType`) antes de borrar.

- [ ] **Step 2: Borrar**

```bash
git rm src/components/saga/saga-index-card.tsx src/components/saga/saga-index-filters.tsx src/components/saga/saga-load-more.tsx
git rm src/lib/sagas/filter-saga-index.ts src/lib/sagas/filter-saga-index.test.ts
```

(Añade al `git rm` los tests de esos componentes, si existen.) `matchesFilters` de `params.ts` sustituye a `filterSagaIndex`, y sus casos ya están en `params.test.ts`.

- [ ] **Step 3: Limpiar el copy**

Para cada clave hoja de `sagaIndex` (fuera de `sagaIndex.atlas`), busca su uso: `grep -rn "\"<clave>\"\|'<clave>'\|\.<clave>\b\|(\`<clave>" src`. Recuerda que hay usos con `useTranslations("sagaIndex")` + `t("clave")` y con `t("sagaIndex.clave")`. Borra las que no se usen en ningún sitio.

No borres las que usen `src/app/sagas/nueva`, el editor, `typeCount` (lo usa el atlas) ni `title`, `new`, `emptyTitle` y `emptyDescription`. Si hay otros ficheros de locale en `messages/`, borra las mismas claves allí.

- [ ] **Step 4: Verificar**

```bash
npx vitest run src/lib/sagas src/components/sagas src/components/saga src/app
npx tsc --noEmit
npm run lint
npm run build
```

Expected: todo en verde y el build OK. Si el build da el aviso «uncached data during prerendering» en `/sagas`, la lectura de sesión se ha salido del `<Suspense>`: corrígelo.

- [ ] **Step 5: Commit**

```bash
git add -A src messages
git commit -m "refactor(sagas): retira la rejilla del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: e2e contra build de producción

**Files:**
- Create: `e2e/sagas-indice-atlas.spec.ts`
- Modify (solo si fallan por el cambio): `e2e/sagas-v2-curacion.spec.ts`, `e2e/ia-navegacion.spec.ts`

**Contexto:**
- Las e2e van contra el proyecto Supabase de dev, sembrado con sagas QA. Toma los helpers de `e2e/sagas-atlas.spec.ts` (`api` con service key, `loginAsCollaborator`, `loginAsDevtest`, `COLLAB_USER_ID`). **Cópialos**: el repo no importa entre specs.
- El estado de un lector se lee por REST, no se supone: el seed puede variar (precedente: `expectedCounts` en `e2e/sagas-itinerarios.spec.ts`).

- [ ] **Step 1: Escribir la spec**

```ts
import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// Atlas de /sagas (spec 2026-10-28 índice). Contra build de producción.
// (constantes y helpers copiados de sagas-atlas.spec.ts: COLLAB_EMAIL, COLLAB_PASSWORD,
//  COLLAB_USER_ID, SUPABASE_URL, SERVICE_KEY, api(), loginAsCollaborator())

const V2_UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";

async function gotoIndex(page: Page, url = "/sagas") {
  await page.goto(url);
  await expect(page.locator("[data-sagas-atlas][data-ready='true'] [data-atlas-stage]")).toBeVisible();
}
const saga = (page: Page, id: string) => page.locator(`[data-saga-id="${id}"]`).first();

/** Zona esperada de una saga raíz para el colaborador, calculada por REST con las mismas
 *  reglas que deriveIndexAtlas: obras contadas del subárbol, pases activos, seguimiento. */
async function expectedZone(sagaId: string): Promise<string> {
  // 1. ids del subárbol: sagas?select=id,parent_saga_id,optional_in_parent
  // 2. obras contadas: saga_items?saga_id=in.(…)&optional=eq.false (excluye subsagas opcionales)
  // 3. pases: passes?user_id=eq.${COLLAB_USER_ID}&is_active=eq.true&select=item_type,item_id,status
  // 4. seguida: saga_follows?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${sagaId}
  // Reglas: started && !done → en-curso; follows && !started → sigues; done → terminadas; si no, por-descubrir.
  // Implementa los cuatro pasos con api() y devuelve la clave.
}
```

Implementa `expectedZone` completa, con la regla de obras contadas de `countedKeys` en `src/lib/sagas/progress.ts`: léela y replícala. Después, los tests:

1. **«con sesión: cada saga en su zona».** Login de colaborador, `gotoIndex`. Para `V2_UNIVERSO_ID` y dos raíces más, leídas por REST (`sagas?parent_saga_id=is.null&limit=2&order=name`), `expect(saga(page, id)).toHaveAttribute("data-zone-of", await expectedZone(id))`. Las zonas visibles (`[data-zone]`) van en el orden En curso → Sigues → Terminadas → Por descubrir, saltando las que falten.
2. **«sin sesión: zonas por tipo».** Contexto sin `storageState`. Ningún `[data-zone]` es una zona del lector; existe `[data-zone="libros"]`, y la barra superior contiene «universo».
3. **«mini-ficha y ficha».** Foco en `saga(page, V2_UNIVERSO_ID)`, Enter, `getByRole("dialog")` visible con «Abrir ficha». Pulsarlo navega a `/saga/${V2_UNIVERSO_ID}`.
4. **«buscar y volar».** Escribe parte del nombre de una subsaga de `V2_UNIVERSO_ID` (léela por REST) en el buscador; la opción aparece; Enter. El diálogo del universo queda abierto y la URL lleva `?q=`.
5. **«seguir mueve a Sigues».**
   - Elige por REST una raíz que el colaborador no siga y que no esté empezada; esa saga está en `por-descubrir`.
   - Ábrela y pulsa «Seguir»: pasa a `data-zone-of="sigues"` sin recargar.
   - Recarga: sigue en `sigues`.
   - Limpieza en `finally`: `api(\`saga_follows?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${id}\`, { method: "DELETE" })`.
6. **«filtro por tipo atenúa».** Pulsa «Películas». Una saga solo de libros lleva `data-dimmed` y la URL contiene `tipo=pelicula`. «Quitar filtros» lo deshace.
7. **«lista y teclado».**
   - «Ver como lista»: un `h2` por zona y los enlaces `/saga/<id>`.
   - Vuelve al mapa; con Tab desde el botón de zoom o el buscador, el foco llega a un `[data-saga-id]`; Enter abre el diálogo; Escape lo cierra y el foco vuelve a esa saga.
8. **«enlace viejo `?vista=sigo`».** Siembra un seguimiento por REST (limpieza en `finally`) y `gotoIndex(page, "/sagas?vista=sigo")`: la zona Sigues está dentro del viewport (`boundingBox` de `[data-zone="sigues"]` con su centro dentro de `page.viewportSize()`).

Repite 3 y 7 en un `test.describe` con `test.use({ viewport: { width: 390, height: 844 } })`. En móvil el diálogo es una hoja inferior: `boundingBox().y + height` ≈ alto del viewport.

- [ ] **Step 2: Build y servidor**

```bash
npm run build
npx next start -p 3000   # en segundo plano; comprueba antes que el 3000 está libre
```

- [ ] **Step 3: Ejecutar**

```bash
npx playwright test e2e/sagas-indice-atlas.spec.ts e2e/sagas-v2-curacion.spec.ts e2e/ia-navegacion.spec.ts --retries=0 --reporter=line
```

Expected: todo en verde. Si `sagas-v2-curacion` falla buscando `a[href="/saga/<hijaId>"]`:
- si el enlace no es visible porque la subsaga cae fuera del viewport, cambia ese assert a `toHaveCount(1)` y comenta el porqué (el plano es un lienzo con cámara);
- si falta en el DOM, es un bug del atlas: arréglalo.

Si alguna otra e2e de sagas falla por el cambio, mira primero si ya fallaba en `main` (#1543 y #1544 ya fallan); no la «arregles» a ciegas.

- [ ] **Step 4: Parar el servidor** (puerto 3000 libre) y commit:

```bash
git add e2e
git commit -m "test(sagas): e2e del atlas del índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentación y cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-10-28-sagas-indice-atlas-design.md` (estado y «Ajustes durante la implementación»)
- Modify: `docs/requirements/decisiones.md` (entrada nueva al final; es append-only)
- Modify: `docs/requirements/backlog.md` (casilla del subproyecto 3)
- Modify: `docs/architecture/graph.json` (regenerado)
- Create: `docs/testing/2026-10-28-sagas-indice-atlas.md`
- Modify: `docs/UI-GLOSARIO.md`, si nombra «Explorar sagas» o la rejilla

- [ ] **Step 1: Spec.** `status: implementado (rama claude/sagas-indice-atlas, PR pendiente)`. Al final, la sección «Ajustes durante la implementación», con lo que cambió respecto a la spec (medidas, decisiones de los puntos de control, lo que se descartó).
- [ ] **Step 2: `decisiones.md`.** Entrada «Atlas de sagas y universos (2026-10-28)». Recoge:
  - territorios según la relación del lector, y por tipo sin sesión;
  - la rejilla se retira y los filtros atenúan;
  - sin «Te toca» por saga en el índice, y por qué;
  - `?vista` pasa a ser foco;
  - la búsqueda deja de filtrar en el servidor;
  - la infraestructura de cámara y hojas pasa a ser compartida (`src/lib/atlas`, `src/components/atlas`).
- [ ] **Step 3: `backlog.md`.** Marca o añade «Rework de sagas · subproyecto 3 (atlas de sagas y universos)» con un resumen de una línea, como las entradas de los subproyectos 1 y 2.
- [ ] **Step 4: `graph.json`.** Sigue `docs/architecture/README.md` para regenerarlo y para pasar `sync.mjs`. Añade el flujo «índice de sagas → atlas» si el formato tiene flujos por pantalla.
- [ ] **Step 5: Evidencia.** `docs/testing/2026-10-28-sagas-indice-atlas.md`, con la misma estructura que `docs/testing/2026-10-28-sagas-atlas.md`:
  - comprobaciones (vitest, tsc, lint, build);
  - tabla de e2e;
  - puntos de control con sus capturas;
  - qué no se ha verificado (Android real, rendimiento con el catálogo de producción).
- [ ] **Step 6: Issues.** Para cada cosa pendiente o descubierta, una issue en `borjar20/Biblioshare`, con una etiqueta de área, una de tipo y una de prioridad (ver `AGENTS.md`). Como mínimo: gestos y rendimiento en Android real (`area:sagas,tipo:cobertura,P2`). Lee antes `docs/agents/issue-tracker.md`.
- [ ] **Step 7: Commit**

```bash
git add docs
git commit -m "docs(sagas): cierre del atlas de sagas y universos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
