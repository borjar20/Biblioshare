# Ficha de saga para el lector, fase 2: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.
> **Un implementador por árbol:** las tareas se ejecutan en serie.

**Objetivo:** añadir a la ficha `/saga/[id]` los bloques que la fase 1 dejó fuera (issue #1539):

- «Tu paso por la saga»;
- «Subsagas»;
- el acceso al mapa;
- la nota media del lector en «La terminaste».

Con ellos se cierra #761.

**Arquitectura:**

- **Una lectura nueva con sesión:** `getSagaPassage`, que lee tus pases en las obras de la saga más las tallas de catálogo. Lleva sin `use cache` y va detrás de `<Suspense>`.
- **Tres derivaciones puras con tests:**
  - `derivePassage`: estadística de tu paso.
  - `deriveSubsagaDoors`: puertas a las subsagas.
  - `miniMapPoints`: vista previa del mapa.
- **Componentes que solo pintan.**

La página arranca la lectura sin esperarla y le pasa la promesa a dos islas en `<Suspense>`: «Tu paso» y la nota media de «La terminaste». Así el hero y la balda no esperan.

**Stack:** Next.js 16 (App Router, RSC), React 19, Supabase, Tailwind v4, next-intl, Vitest + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-27-sagas-ficha-lector-design.md`](../specs/2026-10-27-sagas-ficha-lector-design.md) §1.5–§1.7 y «Fases de entrega». Fase 1: [`2026-10-27-sagas-ficha-lector-fase-1.md`](2026-10-27-sagas-ficha-lector-fase-1.md).

## Decisiones de este plan (tomadas al escribirlo)

La spec describe los bloques en una línea cada uno. Estas son las concreciones:

1. **«Tu paso» solo aparece con sesión y con al menos un pase en las obras de la saga.**
   - **Qué muestra:**
     - desde cuándo (la fecha más antigua de tus pases);
     - obras terminadas y en curso;
     - páginas leídas y minutos vistos, sumando solo las tallas conocidas del catálogo (`books.total_pages`, `movies.duration_minutes`) y diciendo sobre cuántas;
     - tu favorita (la nota más alta; el empate lo gana la terminada más reciente);
     - tu nota media;
     - la curva de tus notas en el orden de la balda activa;
     - «Te saltaste X de Y opcionales» si la saga tiene opcionales. Este dato viene de #761.
   - **Qué no muestra:** las series no suman tiempo; aparecen solo en el recuento de obras.
2. **La curva sigue el orden de la balda del itinerario activo.**
   - Es un punto por obra terminada con nota.
   - Las obras sin nota no se dibujan, pero tampoco se colapsan: el eje X es la posición en la balda.
3. **«Subsagas» no depende del itinerario.**
   - Hay una puerta por hija directa con miembros, en el orden de `detail.groups`.
   - El progreso de cada puerta son sus obras no opcionales terminadas sobre el total, con el mismo criterio que la pila de la balda.
   - Si la saga no tiene hijas, el bloque no se pinta.
4. **Acceso al mapa:**
   - Solo aparece si `detail.graph !== null`, es decir, si el mapa está encendido y curado.
   - Enlaza a `/saga/[id]/mapa` con una vista previa SVG de los nodos del grafo.
   - Sin grafo no se pinta: «Cómo leerla →» ya está en la cabecera de la balda.
5. **«La terminaste»** añade «Tu nota media: N» cuando tienes alguna nota en las obras que cuentan. Si no tienes ninguna, se queda como está.
6. **#761 se cierra con esta fase:**
   - el progreso de cada saga es el contador de la balda;
   - la proporción de opcionales saltadas va en «Tu paso»;
   - el listado de sagas que sigues con su porcentaje ya existe en las tarjetas de saga de Biblioteca (`saga-library-card.tsx`).

   Se dice así en el cierre.

## Restricciones globales

- **Sin migraciones ni cambios de esquema.** Si alguno pareciera necesario, se para y se consulta.
- **Sin `use cache`** en nada de este plan; las lecturas nuevas dependen de la sesión (regla #437 de `AGENTS.md`). Van detrás de `<Suspense>`.
- **El estado del lector sale de `passes`, nunca de `library_entries`.** RLS decide qué pases ves; aun así se filtra por `user_id = <yo>` porque «Tu paso» es tuyo, no el de otros.
- Copy, comentarios, issues y commits en **español**. Los textos nuevos van al namespace `saga` de `messages/es.json` (el bloque que contiene `"eyebrow": "Saga"`).
- Las notas se guardan en la escala 1–10 y se enseñan con `formatDots` (`src/lib/rating/dots.ts`), nunca en crudo (#643).
- **Node 22:** en bash, antepón `export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH";` a cada comando `npx`/`npm`.
- **Un solo servidor en el puerto 3000, arrancado a mano.** Compruébalo con `Get-NetTCPConnection -LocalPort 3000`. En este worktree, `next dev` necesita `--webpack`. Los e2e van contra un build de producción (`npm run build` y `npx next start -p 3000`). Al acabar, para el servidor.
- **Tokens de color del sistema Paper.** Nada de hex sueltos. Comprueba en `src/app/globals.css` que existen las utilidades que uses.
- **Ancho:** `DETAIL_CONTAINER`.
- **Componentes de la fase 1, que manda el código real:**
  - `src/components/saga/ficha/*`;
  - `src/lib/sagas/derive-shelf.ts`, con los tipos `Shelf`, `ShelfWork` y `ShelfGroup`;
  - `src/lib/sagas/shelf-sections.ts`.
- **Finales de línea:** el índice usa LF y la copia de trabajo CRLF (autocrlf). Respeta lo que haya.
- Termina los mensajes de commit con la línea `Co-Authored-By` que te indique el despacho.

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/sagas/passage.ts` (+ `.test.ts`) | Crear | `derivePassage`, pura |
| `src/lib/sagas/get-saga-passage.ts` (+ `.test.ts`) | Crear | `getSagaPassage`, lectura con sesión |
| `src/components/saga/ficha/your-passage.tsx` (+ `.test.tsx`) | Crear | «Tu paso por la saga» y la curva |
| `src/lib/sagas/subsaga-doors.ts` (+ `.test.ts`) | Crear | `deriveSubsagaDoors`, pura |
| `src/components/saga/ficha/subsaga-doors.tsx` (+ `.test.tsx`) | Crear | «Subsagas» |
| `src/lib/sagas/mini-map.ts` (+ `.test.ts`) | Crear | `miniMapPoints`, pura |
| `src/components/saga/ficha/atlas-teaser.tsx` (+ `.test.tsx`) | Crear | Acceso al mapa |
| `src/components/saga/ficha/next-up-card.tsx` (+ test) | Modificar | Hueco `finishedExtra` en «La terminaste» |
| `src/components/saga/ficha/your-average.tsx` | Crear | Isla que pinta tu nota media |
| `src/app/saga/[id]/page.tsx` | Modificar | Montar los bloques nuevos con `<Suspense>` |
| `messages/es.json` | Modificar | Claves nuevas en `saga` |
| `e2e/sagas-ficha-lector.spec.ts` | Modificar | Casos de la fase 2 |
| `docs/…` | Modificar | Cierre documental |

---

### Tarea 1: `derivePassage` y `getSagaPassage`

**Ficheros:**
- Crear: `src/lib/sagas/passage.ts`, `src/lib/sagas/passage.test.ts`
- Crear: `src/lib/sagas/get-saga-passage.ts`, `src/lib/sagas/get-saga-passage.test.ts`

**Interfaces:**
- Consume: `ItemType` (`src/lib/catalog/types`), `ShelfWork` (`src/lib/sagas/derive-shelf.ts`), `SagaDetail` (`src/lib/sagas/get-saga-detail.ts`).
- Produce:

```ts
// passage.ts
export type PassRow = {
  itemType: ItemType;
  itemId: string;
  status: "planned" | "in_progress" | "completed" | "dropped";
  rating: number | null;          // 1–10
  startedOn: string | null;       // YYYY-MM-DD
  finishedOn: string | null;
  createdAt: string;              // ISO
};
export type CatalogSize = { pages: number | null; minutes: number | null };
export type PassageInput = {
  passes: PassRow[];
  /** Talla por clave `tipo:id` (solo libros y películas). */
  sizes: Map<string, CatalogSize>;
  /** Obras de la saga en el orden de la balda activa: clave `tipo:id`, título,
   *  si es opcional y si está saltada. */
  order: Array<{ key: string; title: string; href: string; optional: boolean; skipped: boolean }>;
};
export type Passage = {
  since: string | null;           // YYYY-MM-DD
  completed: number;              // obras distintas con algún pase completed
  inProgress: number;             // obras con pase in_progress y ninguno completed
  pages: { total: number; known: number; of: number } | null;   // null si no hay libros terminados
  minutes: { total: number; known: number; of: number } | null; // null si no hay pelis terminadas
  favorite: { key: string; title: string; href: string; rating: number } | null;
  average: number | null;         // media 1–10 de tu ÚLTIMA nota terminada por obra
  curve: Array<{ x: number; rating: number; key: string; title: string }>; // x = índice en `order`
  curveLength: number;            // order.length
  optional: { skipped: number; total: number } | null; // null si no hay opcionales
};
export function derivePassage(input: PassageInput): Passage | null; // null si no hay ningún pase

// get-saga-passage.ts
export async function getSagaPassage(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  order: PassageInput["order"],
): Promise<Passage | null>; // null sin sesión o sin pases
```

**Reglas de `derivePassage`** (una por test):

1. **Sin pases → `null`.**
2. **`since`:** la menor de `startedOn ?? finishedOn ?? createdAt.slice(0,10)` entre todos los pases.
3. **`completed`:** número de claves distintas con algún pase `completed`. **`inProgress`:** claves con algún pase `in_progress` que no están en `completed`. Los `dropped` y `planned` no cuentan en ninguno de los dos.
4. **Nota de una obra:** la `rating` del pase `completed` más reciente. «Más reciente» se mide por `finishedOn`, con `createdAt` de desempate; un `finishedOn` nulo va después de cualquier fecha. Si ese pase no tiene nota, la obra no tiene nota, aunque un pase anterior sí la tuviera.
5. **`average`:** la media de esas notas por obra. Es `null` si ninguna tiene nota.
6. **`favorite`:** la obra con la nota más alta. El empate lo gana la de `finishedOn` más reciente. Título y `href` salen de `order`; si la clave no está en `order`, se descarta como favorita.
7. **`pages`:**
   - Se calcula sobre los libros terminados.
   - `of` es cuántos hay, `known` cuántos tienen `pages` en `sizes` y `total` la suma de esas páginas.
   - Es `null` si no hay libros terminados.
   - **`minutes`** se calcula igual sobre las películas.
8. **`curve`:** para cada obra de `order` (índice `i`) con nota según la regla 4, un punto `{ x: i, rating, key, title }`. `curveLength = order.length`.
9. **`optional`:** sobre las obras de `order` con `optional === true`, `total` es cuántas son y `skipped` cuántas tienen `skipped`. Es `null` si `total === 0`.

- [ ] **Paso 1: tests que fallan**

```ts
// src/lib/sagas/passage.test.ts
import { describe, expect, it } from "vitest";
import { derivePassage, type PassRow, type PassageInput } from "./passage";

const p = (key: string, extra: Partial<PassRow> = {}): PassRow => {
  const [itemType, itemId] = key.split(":") as [PassRow["itemType"], string];
  return { itemType, itemId, status: "completed", rating: null, startedOn: null, finishedOn: null, createdAt: "2026-01-01T00:00:00Z", ...extra };
};
const o = (key: string, extra: Partial<PassageInput["order"][number]> = {}) => ({ key, title: key.toUpperCase(), href: `/x/${key}`, optional: false, skipped: false, ...extra });

describe("derivePassage", () => {
  it("sin pases devuelve null", () => {
    expect(derivePassage({ passes: [], sizes: new Map(), order: [o("book:a")] })).toBeNull();
  });

  it("since es la fecha más antigua entre inicio, fin y alta", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { startedOn: "2025-03-10", finishedOn: "2025-04-01" }),
        p("book:b", { finishedOn: "2024-12-01" }),
        p("book:c", { status: "planned", createdAt: "2024-06-05T10:00:00Z" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b"), o("book:c")],
    });
    expect(r?.since).toBe("2024-06-05");
  });

  it("cuenta terminadas y en curso por obra, sin dropped ni planned", () => {
    const r = derivePassage({
      passes: [
        p("book:a"), p("book:a", { createdAt: "2026-02-01T00:00:00Z" }),
        p("book:b", { status: "in_progress" }),
        p("book:c", { status: "completed" }), p("book:c", { status: "in_progress" }),
        p("book:d", { status: "dropped", finishedOn: "2026-01-02" }),
        p("book:e", { status: "planned" }),
      ],
      sizes: new Map(), order: [],
    });
    expect([r?.completed, r?.inProgress]).toEqual([2, 1]);
  });

  it("la nota de una obra es la del pase terminado más reciente, aunque sea nula", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 8, finishedOn: "2025-01-01" }),
        p("book:a", { rating: null, finishedOn: "2026-01-01" }),
        p("book:b", { rating: 6, finishedOn: "2025-05-01" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b")],
    });
    expect(r?.average).toBe(6);
    expect(r?.curve).toEqual([{ x: 1, rating: 6, key: "book:b", title: "BOOK:B" }]);
  });

  it("favorita: la nota más alta; el empate lo gana la terminada más reciente", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 9, finishedOn: "2025-01-01" }),
        p("book:b", { rating: 9, finishedOn: "2025-06-01" }),
        p("book:c", { rating: 7, finishedOn: "2026-01-01" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b"), o("book:c")],
    });
    expect(r?.favorite).toEqual({ key: "book:b", title: "BOOK:B", href: "/x/book:b", rating: 9 });
    expect(r?.average).toBeCloseTo(25 / 3);
  });

  it("páginas y minutos: suma de lo conocido y sobre cuántas", () => {
    const r = derivePassage({
      passes: [p("book:a"), p("book:b"), p("movie:m"), p("series:s"), p("book:c", { status: "in_progress" })],
      sizes: new Map([
        ["book:a", { pages: 300, minutes: null }],
        ["book:b", { pages: null, minutes: null }],
        ["movie:m", { pages: null, minutes: 120 }],
      ]),
      order: [],
    });
    expect(r?.pages).toEqual({ total: 300, known: 1, of: 2 });
    expect(r?.minutes).toEqual({ total: 120, known: 1, of: 1 });
  });

  it("sin libros terminados, pages es null", () => {
    const r = derivePassage({ passes: [p("movie:m")], sizes: new Map(), order: [] });
    expect(r?.pages).toBeNull();
  });

  it("opcionales saltadas sobre el total de opcionales del orden", () => {
    const r = derivePassage({
      passes: [p("book:a")], sizes: new Map(),
      order: [o("book:a"), o("book:x", { optional: true, skipped: true }), o("book:y", { optional: true })],
    });
    expect(r?.optional).toEqual({ skipped: 1, total: 2 });
    expect(r?.curveLength).toBe(3);
  });

  it("sin opcionales, optional es null", () => {
    expect(derivePassage({ passes: [p("book:a")], sizes: new Map(), order: [o("book:a")] })?.optional).toBeNull();
  });
});
```

- [ ] **Paso 2: ejecuta los tests y comprueba que fallan.** `npx vitest run src/lib/sagas/passage.test.ts` → FAIL (el módulo no existe).

- [ ] **Paso 3: implementa `passage.ts`**

```ts
// src/lib/sagas/passage.ts
import type { ItemType } from "@/lib/catalog/types";

// «Tu paso por la saga» (spec 2026-10-27 §1.5, fase 2). Puro: entran tus
// pases en las obras de la saga, las tallas de catálogo y el orden de la balda
// activa; sale lo que el bloque pinta. Las tallas que faltan no se inventan:
// se dice sobre cuántas se suma, como en get-format-stats.ts.

// (Pega aquí, sin cambios, los tipos PassRow, CatalogSize, PassageInput y
// Passage del bloque «Interfaces».)

const keyOf = (r: PassRow) => `${r.itemType}:${r.itemId}`;
const day = (r: PassRow) => r.startedOn ?? r.finishedOn ?? r.createdAt.slice(0, 10);

/** true si `a` terminó después que `b` (fin nulo = antes que cualquier fecha). */
function laterFinish(a: PassRow, b: PassRow): boolean {
  if (a.finishedOn !== b.finishedOn) {
    if (a.finishedOn === null) return false;
    if (b.finishedOn === null) return true;
    return a.finishedOn > b.finishedOn;
  }
  return a.createdAt > b.createdAt;
}

export function derivePassage({ passes, sizes, order }: PassageInput): Passage | null {
  if (passes.length === 0) return null;

  const since = passes.map(day).sort()[0] ?? null;

  // Último pase terminado por obra (regla 4).
  const lastDone = new Map<string, PassRow>();
  const started = new Set<string>();
  for (const r of passes) {
    const k = keyOf(r);
    if (r.status === "completed") {
      const prev = lastDone.get(k);
      if (!prev || laterFinish(r, prev)) lastDone.set(k, r);
    } else if (r.status === "in_progress") started.add(k);
  }
  const inProgress = [...started].filter((k) => !lastDone.has(k)).length;

  const rated = [...lastDone.entries()].filter(([, r]) => r.rating !== null) as Array<[string, PassRow & { rating: number }]>;
  const average = rated.length === 0 ? null : rated.reduce((s, [, r]) => s + r.rating, 0) / rated.length;

  const byKey = new Map(order.map((w, i) => [w.key, { ...w, i }] as const));
  let favorite: Passage["favorite"] = null;
  let favRow: PassRow | null = null;
  for (const [k, r] of rated) {
    const w = byKey.get(k);
    if (!w) continue;
    if (!favorite || r.rating > favorite.rating || (r.rating === favorite.rating && favRow && laterFinish(r, favRow))) {
      favorite = { key: k, title: w.title, href: w.href, rating: r.rating };
      favRow = r;
    }
  }

  const sizeSum = (type: ItemType, pick: (s: CatalogSize) => number | null) => {
    const done = [...lastDone.keys()].filter((k) => k.startsWith(`${type}:`));
    if (done.length === 0) return null;
    const known = done.map((k) => sizes.get(k)).map((s) => (s ? pick(s) : null)).filter((v): v is number => v !== null);
    return { total: known.reduce((a, b) => a + b, 0), known: known.length, of: done.length };
  };

  const curve = order.flatMap((w, i) => {
    const r = lastDone.get(w.key);
    return r && r.rating !== null ? [{ x: i, rating: r.rating, key: w.key, title: w.title }] : [];
  });

  const optionals = order.filter((w) => w.optional);
  return {
    since,
    completed: lastDone.size,
    inProgress,
    pages: sizeSum("book", (s) => s.pages),
    minutes: sizeSum("movie", (s) => s.minutes),
    favorite,
    average,
    curve,
    curveLength: order.length,
    optional: optionals.length === 0 ? null : { skipped: optionals.filter((w) => w.skipped).length, total: optionals.length },
  };
}
```

- [ ] **Paso 4: ejecuta los tests y comprueba que pasan.** `npx vitest run src/lib/sagas/passage.test.ts` → PASS (9 tests).

- [ ] **Paso 5: test de `getSagaPassage` (lectura) con Supabase de mentira**

Mira cómo se simula Supabase en `src/lib/sagas/get-saga-detail.test.ts` o en otro `*.test.ts` de `src/lib` que pruebe una lectura (busca `vi.mock("@/lib/supabase/server"` o un objeto `from()` encadenable). Usa ese mismo patrón.

Casos:
- **Sin sesión** (`detail.isAuthenticated === false`): devuelve `null` y **no** consulta nada. El mock lanza si se llama a `from`.
- **Con sesión:**
  - consulta `passes` filtrando por `user_id` = el del usuario actual, por `item_type` y por `in("item_id", ids)` de cada tipo presente en `detail.groups`;
  - consulta `books` (`id,total_pages`) solo con los libros que tienen algún pase, y `movies` (`id,duration_minutes`) igual;
  - pasa todo a `derivePassage`.
- **Un pase de otra obra que no es de la saga** no puede colarse: como la consulta filtra por los ids de la saga, el mock solo los devuelve si se piden. Comprueba que se piden los ids correctos.

El id del usuario sale de `getCurrentUser()` (`src/lib/auth/…`; búscalo, que lo usa `get-saga-detail.ts`). Mockéalo.

- [ ] **Paso 6: implementa `get-saga-passage.ts`**

```ts
// src/lib/sagas/get-saga-passage.ts
import type { ItemType } from "@/lib/catalog/types";
import type { SagaDetail } from "./get-saga-detail";
import { derivePassage, type CatalogSize, type PassRow, type Passage, type PassageInput } from "./passage";
// getCurrentUser: importa del MISMO sitio que get-saga-detail.ts.

// Lectura de «Tu paso» (fase 2). Depende de la sesión: sin `use cache` (regla
// #437) y se monta detrás de <Suspense>. Filtra por user_id aunque RLS ya
// acote: «Tu paso» es TUYO, no lo que el que mira puede ver de otros.
export async function getSagaPassage(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  order: PassageInput["order"],
): Promise<Passage | null> {
  if (!detail.isAuthenticated) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const m of detail.groups.flatMap((g) => g.members)) idsByType[m.itemType].push(m.itemId);

  const passes: PassRow[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, status, rating, started_on, finished_on, created_at")
        .eq("user_id", user.id)
        .eq("item_type", type)
        .in("item_id", idsByType[type]);
      for (const r of data ?? []) {
        passes.push({
          itemType: type, itemId: r.item_id, status: r.status, rating: r.rating,
          startedOn: r.started_on, finishedOn: r.finished_on, createdAt: r.created_at,
        });
      }
    }),
  );
  if (passes.length === 0) return null;

  const withPass = (type: ItemType) => [...new Set(passes.filter((r) => r.itemType === type).map((r) => r.itemId))];
  const bookIds = withPass("book");
  const movieIds = withPass("movie");
  const [books, movies] = await Promise.all([
    bookIds.length ? supabase.from("books").select("id, total_pages").in("id", bookIds) : Promise.resolve({ data: [] }),
    movieIds.length ? supabase.from("movies").select("id, duration_minutes").in("id", movieIds) : Promise.resolve({ data: [] }),
  ]);
  const sizes = new Map<string, CatalogSize>();
  for (const b of (books.data ?? []) as Array<{ id: string; total_pages: number | null }>) sizes.set(`book:${b.id}`, { pages: b.total_pages, minutes: null });
  for (const m of (movies.data ?? []) as Array<{ id: string; duration_minutes: number | null }>) sizes.set(`movie:${m.id}`, { pages: null, minutes: m.duration_minutes });

  return derivePassage({ passes, sizes, order });
}
```

Define `SupabaseServerClient` igual que en `src/lib/sagas/shelf-sections.ts` (tipo local `Awaited<ReturnType<typeof createClient>>`).

**`order` y `ShelfWork.key`:** `deriveShelf` usa el id de nodo `i:<tipo>:<uuid>` como clave. `derivePassage` usa `tipo:uuid`. El adaptador vive en la página (Tarea 5); esta tarea solo recibe `order` ya en formato `tipo:uuid`.

- [ ] **Paso 7: comprueba que todo pasa.** Ejecuta `npx vitest run src/lib/sagas/passage.test.ts src/lib/sagas/get-saga-passage.test.ts`, `npx eslint` sobre los cuatro ficheros y `npx tsc --noEmit -p .`. Todo debe salir en verde.

- [ ] **Paso 8: commit.** `feat(sagas): derivePassage y getSagaPassage para «Tu paso»`

---

### Tarea 2: «Tu paso por la saga» (`YourPassage`)

**Ficheros:**
- Crear: `src/components/saga/ficha/your-passage.tsx` y `your-passage.test.tsx`
- Modificar: `messages/es.json` (namespace `saga`)

**Interfaces:**
- Consume: `Passage` (Tarea 1), `formatDots`, `RatingDots` (`src/components/ui/rating-dots.tsx`).
- Produce:
  - `<YourPassage passage={Promise<Passage | null>} sagaName={string} />`: componente de servidor asíncrono que hace `await` de la promesa y devuelve `null` si llega `null`.
  - `<YourPassageSkeleton />`: el fallback del `<Suspense>`.

**Pinta:**
- `<section data-testid="your-passage">` con un `h2` «Tu paso por {sagaName}».
- **Una fila de datos, en un `<dl>`, cada uno solo si existe:**
  - «Desde» con el mes y año de `since` (`Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" })`);
  - «Terminadas» `completed`;
  - «En curso» `inProgress` (solo si es mayor que 0);
  - «Páginas» con `total` formateado `es-ES`, y «sobre {known} de {of}» si `known < of`;
  - «Tiempo» con los minutos en horas, «{h} h», y la misma salvedad;
  - «Tu media» con `formatDots(average)`;
  - «Opcionales saltadas» «{skipped} de {total}».
- **Favorita:** «Tu favorita: **título**» enlazado a `href`, con sus puntos en `RatingDots size="sm"`.
- **Curva:** si `curve.length >= 2`, un SVG de `viewBox="0 0 {W} 60"` con `W = max(curveLength-1,1)*24`.
  - Cada punto va en `cx = x*24` y `cy = 56 - (rating-1)/9*52`.
  - Una `polyline` une los puntos consecutivos. La curva salta los huecos sin dibujarlos: un punto en x=1 y otro en x=4 se unen con una línea, sin inventar los intermedios.
  - Lleva `role="img"` y un `aria-label` con «Tus notas en el orden de la saga: título N, título N…» (`formatDots`).
  - Color: `stroke-accent`/`fill-accent`. Si esas utilidades no existen, usa `text-accent` con `stroke="currentColor"`.
  - Con menos de 2 puntos no hay curva.
- **Esqueleto:** un bloque `h-[120px]` con `Skeleton` de `@/components/ui/skeleton`.

**Claves en `saga`:**

```json
    "passageTitle": "Tu paso por {name}",
    "passageSince": "Desde",
    "passageCompleted": "Terminadas",
    "passageInProgress": "En curso",
    "passagePages": "Páginas",
    "passageTime": "Tiempo",
    "passageHours": "{h} h",
    "passageOfKnown": "sobre {known} de {of}",
    "passageAverage": "Tu media",
    "passageSkipped": "Opcionales saltadas",
    "passageSkippedValue": "{skipped} de {total}",
    "passageFavorite": "Tu favorita: <b>{title}</b>",
    "passageCurveLabel": "Tus notas en el orden de la saga: {list}",
```

- [ ] **Paso 1: tests que fallan.** En `jsdom`, simula `getTranslations` devolviendo la clave más los valores, como en `next-up-card.test.tsx`, y simula `next/image`. Casos:
  1. Con `null`, no pinta nada.
  2. Con un `Passage` completo, aparecen el título, los siete datos y la favorita con su enlace.
  3. «En curso» no aparece si vale 0; «Páginas» sin «sobre» cuando `known === of`.
  4. Con 3 puntos hay `svg[role=img]` y una `polyline` con 3 pares; con 1 punto no hay SVG.
  5. `optional: null` oculta «Opcionales saltadas».
- [ ] **Paso 2: comprueba que fallan. Paso 3: implementa. Paso 4: comprueba que pasan.** Después, eslint y tsc.
- [ ] **Paso 5: commit.** `feat(sagas): bloque «Tu paso por la saga»`

---

### Tarea 3: «Subsagas» (`deriveSubsagaDoors` y `SubsagaDoors`)

**Ficheros:**
- Crear: `src/lib/sagas/subsaga-doors.ts` (+ `.test.ts`), `src/components/saga/ficha/subsaga-doors.tsx` (+ `.test.tsx`)
- Modificar: `messages/es.json`

**Interfaces:**
- Consume: `MemberGroup` (`src/lib/sagas/group-members.ts`), `SAGA_ACCENT`, `sagaHref`.
- Produce:

```ts
export type SubsagaDoor = {
  sagaId: string; name: string; accent: SagaAccentToken; href: string;
  covers: string[];          // hasta 3 portadas no nulas
  counted: number;           // miembros no opcionales
  completed: number;         // de esos, status === "completed"
  state: "done" | "started" | "todo"; // done: counted>0 && completed===counted; started: completed>0 o algún in_progress; todo: resto
};
export function deriveSubsagaDoors(groups: MemberGroup[]): SubsagaDoor[]; // solo grupos con sagaId !== null y al menos un miembro, en el orden recibido
```

- `<SubsagaDoors doors={SubsagaDoor[]} />` devuelve `null` si `doors` está vacío.
  - **Rejilla:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, con una tarjeta-enlace por puerta.
  - **Cada tarjeta:** borde superior de 3 px con `SAGA_ACCENT[accent].bg`, hasta 3 portadas solapadas, el nombre en serif, «{completed} de {counted}» (o «Terminada ✓» si está `done`) y una barra fina de progreso.
  - **Raíz:** `data-testid="subsaga-doors"`, con un `h2` «Subsagas».
  - **Sin sesión** (`completed` siempre 0) se ve «{counted} obras». Para eso el componente recibe `authenticated: boolean`.

**Claves en `saga`:** `"doorsTitle": "Subsagas"`, `"doorProgress": "{completed} de {counted}"`, `"doorDone": "Terminada"`, `"doorCount": "{count, plural, =1 {1 obra} other {# obras}}"`.

- [ ] **Paso 1: tests de `deriveSubsagaDoors`.** Casos:
  - el grupo con `sagaId` nulo (miembros directos) se excluye;
  - el grupo sin miembros se excluye;
  - el orden se conserva;
  - `counted` excluye las opcionales;
  - los estados `done`, `started` (uno `in_progress`) y `todo`;
  - `covers` se queda en 3 y salta las nulas;
  - `href = sagaHref(sagaId)`.

  Construye los `MemberGroup` a mano, con los campos de `group-members.ts`.
- [ ] **Paso 2: tests del componente.** Casos:
  - con `doors` vacío no pinta nada;
  - pinta una tarjeta por puerta con su enlace;
  - una puerta `done` dice «Terminada»;
  - sin sesión se ve el recuento y no «x de y».
- [ ] **Pasos 3–5:** comprueba que fallan, implementa y comprueba que pasan. Después, eslint, tsc y commit `feat(sagas): puertas a las subsagas`.

---

### Tarea 4: acceso al mapa (`miniMapPoints` y `AtlasTeaser`)

**Ficheros:**
- Crear: `src/lib/sagas/mini-map.ts` (+ `.test.ts`), `src/components/saga/ficha/atlas-teaser.tsx` (+ `.test.tsx`)
- Modificar: `messages/es.json`

**Interfaces:**
- Consume: `SagaGraph` (`src/lib/sagas/map-types.ts`), con nodos `x`, `y`, `kind`, `accent`, `status` y aristas `source`, `target`, `type`.
- Produce:

```ts
export type MiniMap = {
  width: number; height: number;                 // viewBox, siempre 160×80
  points: Array<{ id: string; cx: number; cy: number; accent: SagaAccentToken; done: boolean }>;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; dashed: boolean }>;
};
export function miniMapPoints(graph: SagaGraph, max?: number): MiniMap; // max = 40 nodos
```

**Reglas:**
- Solo cuentan los nodos `kind === "item"`.
- Si hay más de `max`, se quedan los `max` primeros por `orderNo` ascendente; los `null` van al final.
- Las coordenadas se normalizan a un margen interior de 8 px dentro de 160×80. Si todos tienen la misma x o la misma y, quedan centrados.
- Las líneas son las aristas cuyos dos extremos sobreviven. Son `dashed` las que no son de tipo `principal`.
- `done` vale `status === "completed"`.

`<AtlasTeaser href={string} map={MiniMap} />` es una tarjeta-enlace `data-testid="atlas-teaser"`:
- a la izquierda, el SVG decorativo (`aria-hidden`), con líneas `stroke-border` y puntos de `SAGA_ACCENT[accent]` (usa `cssVar` en `fill`/`stroke`);
- a la derecha, el título «Explora el mapa de lectura», el subtítulo «Por qué este orden: ventanas, tándems y alternativas» y «Abrir →».

**Claves en `saga`:** `"atlasTitle"`, `"atlasSubtitle"`, `"atlasOpen": "Abrir"`.

- [ ] **Paso 1: tests de `miniMapPoints`.** Casos:
  - se descartan los nodos que no son `item`;
  - la normalización deja el x mínimo en 8 y el máximo en 152;
  - con todos en la misma y, quedan en cy=40;
  - el recorte a `max` es por `orderNo`;
  - una línea con un extremo descartado desaparece;
  - `dashed` en una arista `opcional`.
- [ ] **Paso 2: test del componente.** Pinta el enlace con `href` y un SVG `aria-hidden` con N círculos.
- [ ] **Pasos 3–5:** comprueba que fallan, implementa y comprueba que pasan. Después, eslint, tsc y commit `feat(sagas): acceso al mapa con vista previa`.

---

### Tarea 5: montaje en la ficha y nota media en «La terminaste»

**Ficheros:**
- Modificar: `src/components/saga/ficha/next-up-card.tsx` (+ test)
- Crear: `src/components/saga/ficha/your-average.tsx`
- Modificar: `src/app/saga/[id]/page.tsx`, `src/app/saga/[id]/loading.tsx` (solo si hace falta para no saltar)
- Modificar: `messages/es.json`

**Interfaces:**
- `NextUpCard` gana una prop opcional `finishedExtra?: ReactNode`, que se pinta bajo el texto de «La terminaste» solo en el modo `finished`.
- `<YourAverage passage={Promise<Passage | null>} />` es asíncrono. Pinta `<p>` con «Tu nota media: {formatDots(average)}» (clave `"nextUpYourAverage": "Tu nota media: {rating}"`) y devuelve `null` si la promesa da `null` o `average === null`.

**Página:**

```tsx
// Tras `const shelf = deriveShelf(...)`:
// Orden de la balda en formato `tipo:id` para «Tu paso». El id de nodo de la
// balda es `i:<tipo>:<uuid>` (derive-map.ts, itemKey); parseItemKey lo
// deshace. Los extras (opcionales sin número) también cuentan.
const order = shelf.groups.flatMap((g) => [...g.slots.flatMap((s) => (s.kind === "tandem" ? s.works : [s.work])), ...g.extras])
  .flatMap((w) => {
    const ref = parseItemKey(w.key);
    return ref ? [{ key: `${ref.itemType}:${ref.itemId}`, title: w.title, href: w.href, optional: w.optional, skipped: w.skipped }] : [];
  });
// Sin await: la promesa la consumen dos islas en <Suspense> y el hero y la
// balda no esperan a esta lectura (regla #437: depende de la sesión).
const passage = getSagaPassage(supabase, detail, order);
const doors = deriveSubsagaDoors(detail.groups);
```

Orden de los bloques bajo la balda (spec §1):

```tsx
<div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
  <NextUpCard
    shelf={shelf}
    finishedExtra={<Suspense fallback={null}><YourAverage passage={passage} /></Suspense>}
  />
  {/* Columna derecha reservada a «Entre amigos» (fase 3, #1540). */}
</div>
<SagaAbout detail={detail} canConfigure={canCurate} />
<Suspense fallback={<YourPassageSkeleton />}>
  <YourPassage passage={passage} sagaName={detail.saga.name} />
</Suspense>
<SubsagaDoors doors={doors} authenticated={detail.isAuthenticated} />
{detail.graph && <AtlasTeaser href={`${sagaHref(detail.saga.id)}/mapa`} map={miniMapPoints(detail.graph)} />}
<section><SagaAllWorks groups={detail.groups} windows={detail.windows} /></section>
```

**Ojo:** sin sesión, `getSagaPassage` devuelve `null` sin consultar nada, así que el `<Suspense>` no pinta ni el esqueleto mucho rato. Si el esqueleto parpadea sin sesión, pasa `fallback={detail.isAuthenticated ? <YourPassageSkeleton /> : null}`.

**Una promesa rechazada no puede tumbar la página.** Envuelve la llamada así:

```ts
const passage = getSagaPassage(…).catch((e) => { console.error("getSagaPassage", e); return null; });
```

y comenta por qué: «Tu paso» es accesorio; si falla, la ficha sigue.

- [ ] **Paso 1: test de `NextUpCard`.** `finishedExtra` se pinta en `finished` y no en `next`.
- [ ] **Paso 2: test de `YourAverage`.** Con una promesa que resuelve `{ average: 8 }`, pinta la clave; con `null`, no pinta nada.
- [ ] **Paso 3: implementa y monta.** Después, eslint, tsc y `npx vitest run src/lib/sagas src/components/saga`.
- [ ] **Paso 4: comprobación en vivo.** Con `next dev --webpack` en el 3000, haz `curl` de «[QA Sagas v2] Universo» (sácala de `curl /sagas`). Comprueba que hay `data-testid="subsaga-doors"` y `data-testid="atlas-teaser"` si su mapa está encendido. Sin sesión no debe haber `your-passage`. Para el servidor al acabar.
- [ ] **Paso 5: commit.** `feat(sagas): Tu paso, Subsagas y acceso al mapa en la ficha (fase 2)`

---

### Tarea 6: e2e y cierre documental

**Ficheros:**
- Modificar: `e2e/sagas-ficha-lector.spec.ts`
- Modificar: `docs/requirements/decisiones.md` (entrada nueva al final), `docs/requirements/backlog.md`, `docs/architecture/graph.json` (según `docs/architecture/README.md`), la spec (estado) y crear `docs/testing/2026-10-28-sagas-ficha-lector-f2.md`

- [ ] **Paso 1: e2e.** Con el seed y el login que ya usa el spec, añade:
  1. **Con sesión** en «[QA Sagas v2] Universo» (u otra saga sembrada con pases del usuario de pruebas): `your-passage` es visible y su «Terminadas» coincide con el número de obras con pase terminado, leído por REST como hace `sagas-colocacion-opcionalidad`.
  2. `subsaga-doors` tiene una tarjeta por subsaga con miembros, cada una con un enlace a `/saga/<id>`.
  3. Si la saga tiene el mapa encendido, `atlas-teaser` enlaza a `/saga/<id>/mapa`. Si no, no está.
  4. **Sin sesión:** no existe `your-passage` y `subsaga-doors` muestra recuentos.

  Ejecuta los e2e contra un build de producción: este spec, `sagas-v2.spec.ts` y `sagas-itinerarios.spec.ts`.
- [ ] **Paso 2: docs.**
  - `decisiones.md`: las 6 decisiones de este plan, al final.
  - Backlog: marca la fase 2.
  - Spec: estado «fase 2 implementada».
  - Evidencia: comandos, resultados y lo que no se verificó.
  - `graph.json`: los nodos nuevos del flujo de la ficha.
- [ ] **Paso 3: commit.** `docs(sagas): cierre de la fase 2 de la ficha de saga`. La PR llevará `Closes #1539` y `Closes #761`, y explicará en el cuerpo cómo se cubre #761 (decisión 6).
