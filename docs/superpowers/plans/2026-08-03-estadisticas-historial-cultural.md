# Estadísticas como historial cultural multi-tipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorientar el panel de estadísticas hacia `passes` (la historia real del usuario) en vez de `progress_sessions`, arreglar el crecimiento inventado de "la pila", degradar con elegancia las tarjetas de sesión vacías, y añadir tarjetas nuevas (completadas por año, año-vs-año, mejor valoradas).

**Architecture:** Cada estadística es un getter fino sobre el cliente Supabase del usuario (RLS) que delega la lógica en una función pura testeable, más una tarjeta server-component que la pinta. Se reutiliza un helper de hidratación de títulos entre "la pila" y "mejor valoradas". No se toca el esquema.

**Tech Stack:** Next.js (App Router, server components async), next-intl, Supabase JS, Vitest (unit de las funciones puras), Playwright (e2e).

## Global Constraints

- **Sin cambios de esquema.** Todo sale de tablas existentes: `passes`, `books`, `movies`, `series`, `progress_sessions`.
- **i18n en dos idiomas:** cada clave nueva se añade a `messages/es.json` **y** `messages/en.json` bajo `"stats"`. Tras tocar copy, correr el chequeo del agente i18n-keeper si está disponible.
- **Vitest corre en Node 22:** el shell arranca en 20.9; activar fnm antes (`fnm use` / la versión de `.nvmrc`) o los tests no arrancan. Ver memoria [[node-y-vitest]].
- **Patrón de la casa:** getter fino (DB) + función pura (`compute*`/`pick*`) testeable, como `computeHabits`/`computePagesPerDay`. La lógica se testea en la función pura; el getter se cubre por e2e.
- **ItemType** = `"book" | "movie" | "series"` (`@/lib/catalog/types`).
- **Tipos de obra** en las cards se pintan con los colores `var(--type-book|movie|series)` y las etiquetas `typeBooks|typeMovies|typeSeries` (ya existen).
- Rama de trabajo: `feat/estadisticas-historial` (ya creada, con la spec commiteada).

---

### Task 1: Helper de hidratación de títulos

Helper compartido por "la pila" (Task 2) y "mejor valoradas" (Task 6): dado un
conjunto de ids por tipo, devuelve un mapa `"tipo:id" → título`. Evita duplicar
el switch libros/películas/series en dos getters.

**Files:**
- Create: `src/lib/stats/get-item-titles.ts`
- Test: `src/lib/stats/get-item-titles.test.ts`

**Interfaces:**
- Produces:
  - `type TitleMap = Map<string, string>` con claves `"${ItemType}:${id}"`.
  - `keyFor(type: ItemType, id: string): string`
  - `async getItemTitles(supabase, ids: Record<ItemType, Set<string>>): Promise<TitleMap>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stats/get-item-titles.test.ts
import { describe, it, expect } from "vitest";
import { keyFor } from "./get-item-titles";

describe("keyFor", () => {
  it("compone la clave tipo:id", () => {
    expect(keyFor("movie", "abc")).toBe("movie:abc");
    expect(keyFor("book", "x")).toBe("book:x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats/get-item-titles.test.ts`
Expected: FAIL — `keyFor` no existe / módulo no encontrado.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/stats/get-item-titles.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TitleMap = Map<string, string>;

export function keyFor(type: ItemType, id: string): string {
  return `${type}:${id}`;
}

// Hidrata títulos de obras de cualquier tipo en una sola pasada (una query por
// tabla no vacía). Devuelve un mapa "tipo:id" → título; los ids sin fila se
// omiten. Reutilizado por la pila y "mejor valoradas".
export async function getItemTitles(
  supabase: SupabaseServerClient,
  ids: Record<ItemType, Set<string>>,
): Promise<TitleMap> {
  const map: TitleMap = new Map();

  const tables: { type: ItemType; table: "books" | "movies" | "series" }[] = [
    { type: "book", table: "books" },
    { type: "movie", table: "movies" },
    { type: "series", table: "series" },
  ];

  await Promise.all(
    tables.map(async ({ type, table }) => {
      const set = ids[type];
      if (!set || set.size === 0) return;
      const { data, error } = await supabase
        .from(table)
        .select("id, title")
        .in("id", [...set]);
      if (error) throw error;
      for (const row of (data ?? []) as { id: string; title: string | null }[]) {
        if (row.title) map.set(keyFor(type, row.id), row.title);
      }
    }),
  );

  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stats/get-item-titles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/get-item-titles.ts src/lib/stats/get-item-titles.test.ts
git commit -m "feat(stats): helper getItemTitles para hidratar títulos multi-tipo"
```

---

### Task 2: La pila = foto del momento (A1)

Sustituir el flujo mensual inventado por una foto: pendientes ahora, desglose
por tipo y la obra más antigua en la pila. Se reemplaza `getTbrTrend`/`TbrTrend`
por `getTbrSnapshot`/`TbrSnapshot` y se reescribe `TbrCard`.

**Files:**
- Create: `src/lib/stats/get-tbr-snapshot.ts`
- Create: `src/lib/stats/get-tbr-snapshot.test.ts`
- Delete: `src/lib/stats/get-tbr-trend.ts`
- Modify: `src/components/stats/tbr-card.tsx` (reescritura completa)
- Modify: `src/app/estadisticas/page.tsx` (import y uso)
- Modify: `src/app/u/[username]/_tabs/stats-tab.tsx` (import y uso)

**Interfaces:**
- Consumes: `keyFor`, `getItemTitles`, `TitleMap` (Task 1).
- Produces:
  - `type TbrSnapshot = { pending: number; byType: Record<ItemType, number>; oldest: { title: string; type: ItemType; monthsWaiting: number } | null }`
  - `computeTbrSnapshot(rows: { item_type: ItemType; item_id: string; created_at: string }[], now: Date): { byType: Record<ItemType, number>; pending: number; oldestId: { type: ItemType; id: string; monthsWaiting: number } | null }`
  - `async getTbrSnapshot(supabase, userId): Promise<TbrSnapshot>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stats/get-tbr-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { computeTbrSnapshot } from "./get-tbr-snapshot";

const NOW = new Date("2026-08-03T00:00:00Z");

describe("computeTbrSnapshot", () => {
  it("cuenta por tipo y señala la obra más antigua", () => {
    const r = computeTbrSnapshot(
      [
        { item_type: "movie", item_id: "m1", created_at: "2026-06-01T00:00:00Z" },
        { item_type: "movie", item_id: "m2", created_at: "2026-05-01T00:00:00Z" },
        { item_type: "book", item_id: "b1", created_at: "2026-02-01T00:00:00Z" },
      ],
      NOW,
    );
    expect(r.pending).toBe(3);
    expect(r.byType).toEqual({ book: 1, movie: 2, series: 0 });
    expect(r.oldestId).toEqual({ type: "book", id: "b1", monthsWaiting: 6 });
  });

  it("pila vacía → sin obra más antigua", () => {
    const r = computeTbrSnapshot([], NOW);
    expect(r.pending).toBe(0);
    expect(r.oldestId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats/get-tbr-snapshot.test.ts`
Expected: FAIL — `computeTbrSnapshot` no existe.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/stats/get-tbr-snapshot.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getItemTitles, keyFor } from "./get-item-titles";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TbrSnapshot = {
  pending: number;
  byType: Record<ItemType, number>;
  oldest: { title: string; type: ItemType; monthsWaiting: number } | null;
};

type Row = { item_type: ItemType; item_id: string; created_at: string };

// Meses naturales completos entre dos instantes (>= 0).
function monthsBetween(from: Date, to: Date): number {
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, m);
}

// Lógica pura: cuenta pendientes por tipo y localiza el más antiguo (por
// created_at). No hidrata el título — eso lo hace el getter.
export function computeTbrSnapshot(rows: Row[], now: Date) {
  const byType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  let oldest: { type: ItemType; id: string; created: string } | null = null;

  for (const row of rows) {
    byType[row.item_type] += 1;
    if (!oldest || row.created_at < oldest.created) {
      oldest = { type: row.item_type, id: row.item_id, created: row.created_at };
    }
  }

  const pending = byType.book + byType.movie + byType.series;
  const oldestId = oldest
    ? {
        type: oldest.type,
        id: oldest.id,
        monthsWaiting: monthsBetween(new Date(oldest.created), now),
      }
    : null;

  return { byType, pending, oldestId };
}

// "La pila" (docs/REQUIREMENTS.md §7.14): foto del momento — pendientes ahora,
// desglose por tipo y la obra que lleva más tiempo esperando. Todo desde
// `passes` activos en estado 'planned'. Sustituye al antiguo flujo mensual, que
// contaba como "añadido" cualquier pase creado (bug: el historial importado
// inflaba el crecimiento). Ver spec 2026-08-03.
export async function getTbrSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<TbrSnapshot> {
  const { data, error } = await supabase
    .from("passes")
    .select("item_type, item_id, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");

  if (error) throw error;

  const { byType, pending, oldestId } = computeTbrSnapshot(
    (data ?? []) as Row[],
    new Date(),
  );

  let oldest: TbrSnapshot["oldest"] = null;
  if (oldestId) {
    const ids: Record<ItemType, Set<string>> = {
      book: new Set(),
      movie: new Set(),
      series: new Set(),
    };
    ids[oldestId.type].add(oldestId.id);
    const titles = await getItemTitles(supabase, ids);
    const title = titles.get(keyFor(oldestId.type, oldestId.id));
    if (title) {
      oldest = { title, type: oldestId.type, monthsWaiting: oldestId.monthsWaiting };
    }
  }

  return { pending, byType, oldest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stats/get-tbr-snapshot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewrite `TbrCard`**

```tsx
// src/components/stats/tbr-card.tsx
import { getTranslations } from "next-intl/server";
import type { TbrSnapshot } from "@/lib/stats/get-tbr-snapshot";

// La pila (frames B/G): foto del momento — pendientes ahora, desglose por tipo
// y lo más antiguo. Sin gráfico de flujo (ver spec 2026-08-03). El wrapper card
// lo pone la pestaña/página.
export async function TbrCard({ snapshot }: { snapshot: TbrSnapshot }) {
  const t = await getTranslations("stats");

  if (snapshot.pending === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("tbrTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("tbrEmpty")}</p>
      </div>
    );
  }

  const types = [
    { label: t("typeBooks"), color: "var(--type-book)", count: snapshot.byType.book },
    { label: t("typeMovies"), color: "var(--type-movie)", count: snapshot.byType.movie },
    { label: t("typeSeries"), color: "var(--type-series)", count: snapshot.byType.series },
  ].filter((x) => x.count > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("tbrTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("tbrPendingCount", { count: snapshot.pending })}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {types.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
            {x.label}
            <span className="font-medium text-foreground">{x.count}</span>
          </span>
        ))}
      </div>

      {snapshot.oldest && (
        <p className="text-[11px] text-muted-foreground">
          {t("tbrOldest")}:{" "}
          <span className="font-medium text-foreground">{snapshot.oldest.title}</span>{" "}
          {t("tbrWaitingMonths", { count: snapshot.oldest.monthsWaiting })}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update callers and delete the old getter**

En `src/app/estadisticas/page.tsx`: cambiar el import `getTbrTrend` →
`getTbrSnapshot`, la variable del `Promise.all` (`tbr`), y el uso
`<TbrCard trend={tbr} />` → `<TbrCard snapshot={tbr} />`.

En `src/app/u/[username]/_tabs/stats-tab.tsx`: idéntico cambio (import, llamada
en el `Promise.all`, y `<TbrCard snapshot={tbr} />`).

Borrar `src/lib/stats/get-tbr-trend.ts`.

- [ ] **Step 7: Add i18n keys**

En `messages/es.json` dentro de `"stats"`, quitar las obsoletas `tbrPending`,
`tbrNet`, `tbrAdded`, `tbrFinished` y añadir:

```json
"tbrPendingCount": "{count, plural, one {# pendiente} other {# pendientes}}",
"tbrOldest": "Lo más antiguo",
"tbrWaitingMonths": "{count, plural, =0 {añadido este mes} one {hace # mes} other {hace # meses}}",
"tbrEmpty": "Tu pila está vacía."
```

En `messages/en.json` (bloque `"stats"`), las equivalentes:

```json
"tbrPendingCount": "{count, plural, one {# pending} other {# pending}}",
"tbrOldest": "Oldest",
"tbrWaitingMonths": "{count, plural, =0 {added this month} one {# month ago} other {# months ago}}",
"tbrEmpty": "Your pile is empty."
```

- [ ] **Step 8: Verify build/lint and full unit suite**

Run: `npx vitest run src/lib/stats && npx tsc --noEmit`
Expected: tests PASS, sin errores de tipos (referencias a `getTbrTrend`/`trend`
prop ya eliminadas).

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats/get-tbr-snapshot.ts src/lib/stats/get-tbr-snapshot.test.ts \
  src/components/stats/tbr-card.tsx src/app/estadisticas/page.tsx \
  src/app/u/[username]/_tabs/stats-tab.tsx messages/es.json messages/en.json
git rm src/lib/stats/get-tbr-trend.ts
git commit -m "feat(stats): la pila como foto del momento; elimina el flujo inventado"
```

---

### Task 3: Empty states en hábitos y ritmo (A2)

`HoursByMonthCard` ya degrada (tiene `hoursEmpty`). Faltan `HabitsCard` (franja
siempre nula sin `started_at`) y `PaceCard` (bignum "—"). Que muestren "Aún sin
sesiones de lectura" cuando no hay ningún dato.

**Files:**
- Modify: `src/components/stats/habits-card.tsx`
- Modify: `src/components/stats/pace-card.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `Habits` (`favoriteBand|favoriteWeekday|averageMinutes` todos `null` ⇒ sin sesiones).

- [ ] **Step 1: Add i18n key**

`messages/es.json` → `"sessionEmpty": "Aún sin sesiones de lectura"`.
`messages/en.json` → `"sessionEmpty": "No reading sessions yet"`.

- [ ] **Step 2: HabitsCard empty state**

Insertar, tras `const dash = t("recordEmpty");`, el corte por vacío:

```tsx
  const noData =
    habits.favoriteBand === null &&
    habits.favoriteWeekday === null &&
    habits.averageMinutes === null;

  if (noData) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("habitsTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("sessionEmpty")}</p>
      </div>
    );
  }
```

- [ ] **Step 3: PaceCard empty state**

Reescribir el cuerpo para cortar cuando `pagesPerDay === null`:

```tsx
export async function PaceCard({ pagesPerDay }: { pagesPerDay: number | null }) {
  const t = await getTranslations("stats");

  if (pagesPerDay === null) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("paceTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("sessionEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("paceTitle")}
      </h3>
      <span className="font-serif text-4xl leading-none font-semibold text-foreground">
        {pagesPerDay}
      </span>
      <span className="text-sm text-muted-foreground">{t("pacePerDay")}</span>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/habits-card.tsx src/components/stats/pace-card.tsx \
  messages/es.json messages/en.json
git commit -m "feat(stats): empty states honestos en hábitos y ritmo sin sesiones"
```

---

### Task 4: Tira semanal cuenta cualquier actividad (A3)

Hoy `getWeeklyActivity` solo suma minutos de lectura de libros, así que una
noche de cine no marca el día. Ampliar `active` a "día con actividad de
cualquier tipo" (sesión de cualquier tipo **o** pase terminado ese día), igual
que `getStreaks`. `minutes` sigue siendo solo de lectura (para el objetivo
diario).

**Files:**
- Modify: `src/lib/stats/get-weekly-activity.ts`

**Interfaces:**
- Produces: mismo `DayActivity[]`; cambia la semántica de `active`.

- [ ] **Step 1: Rewrite the query/merge**

Reemplazar el bloque de la única query por dos: minutos de lectura (como ahora,
solo libros) y días con final de cualquier tipo. Marcar `active` con ambos.

```ts
  // Minutos de lectura (solo libros) para el objetivo diario, y finales de
  // cualquier tipo para "día activo" (una peli no tiene sesión pero sí final).
  const [reading, finished] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("session_date, duration_minutes, passes!inner(item_type)")
      .eq("user_id", userId)
      .eq("passes.item_type", "book")
      .gte("session_date", rangeStart)
      .lte("session_date", todayISO()),
    supabase
      .from("passes")
      .select("finished_on")
      .eq("user_id", userId)
      .not("finished_on", "is", null)
      .gte("finished_on", rangeStart)
      .lte("finished_on", todayISO()),
  ]);

  if (reading.error) throw reading.error;
  if (finished.error) throw finished.error;

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const row of reading.data ?? []) {
    const bucket = byDate.get(row.session_date);
    if (!bucket) continue;
    bucket.active = true;
    bucket.minutes += row.duration_minutes ?? 0;
  }
  for (const row of finished.data ?? []) {
    const bucket = byDate.get(row.finished_on as string);
    if (bucket) bucket.active = true;
  }

  return days;
```

(Actualizar el comentario de cabecera: `active` ya no es solo lectura.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stats/get-weekly-activity.ts
git commit -m "feat(stats): la tira semanal marca activo cualquier tipo, no solo lectura"
```

---

### Task 5: Completadas por año + año-vs-año (B1, B2)

Nueva tarjeta titular de `/estadisticas`: histograma multi-año apilado por tipo,
con un contador "este año vs el anterior" derivado de los mismos datos.

**Files:**
- Create: `src/lib/stats/get-completed-by-year.ts`
- Create: `src/lib/stats/get-completed-by-year.test.ts`
- Create: `src/components/stats/completed-by-year-card.tsx`
- Modify: `src/app/estadisticas/page.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Produces:
  - `type YearCompleted = { year: number; book: number; movie: number; series: number; total: number }`
  - `computeCompletedByYear(rows: { finished_on: string; item_type: ItemType }[], currentYear: number): YearCompleted[]`
  - `async getCompletedByYear(supabase, userId): Promise<YearCompleted[]>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stats/get-completed-by-year.test.ts
import { describe, it, expect } from "vitest";
import { computeCompletedByYear } from "./get-completed-by-year";

describe("computeCompletedByYear", () => {
  it("agrupa por año y tipo, rellenando años vacíos hasta el actual", () => {
    const out = computeCompletedByYear(
      [
        { finished_on: "2023-05-01", item_type: "movie" },
        { finished_on: "2023-06-01", item_type: "book" },
        { finished_on: "2026-01-01", item_type: "movie" },
      ],
      2026,
    );
    expect(out.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(out[0]).toEqual({ year: 2023, book: 1, movie: 1, series: 0, total: 2 });
    expect(out[1].total).toBe(0); // 2024 vacío pero presente
    expect(out[3]).toEqual({ year: 2026, book: 0, movie: 1, series: 0, total: 1 });
  });

  it("sin datos → lista vacía", () => {
    expect(computeCompletedByYear([], 2026)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats/get-completed-by-year.test.ts`
Expected: FAIL — módulo/función no existe.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/stats/get-completed-by-year.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type YearCompleted = {
  year: number;
  book: number;
  movie: number;
  series: number;
  total: number;
};

type Row = { finished_on: string; item_type: ItemType };

// Lógica pura: obras terminadas por año y tipo, del primer año con datos al
// actual, rellenando los años intermedios sin datos con ceros (para que el eje
// no tenga huecos). Sin filas → lista vacía.
export function computeCompletedByYear(rows: Row[], currentYear: number): YearCompleted[] {
  if (rows.length === 0) return [];

  const byYear = new Map<number, YearCompleted>();
  let minYear = currentYear;
  for (const row of rows) {
    const year = Number(row.finished_on.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    minYear = Math.min(minYear, year);
    const bucket =
      byYear.get(year) ?? { year, book: 0, movie: 0, series: 0, total: 0 };
    bucket[row.item_type] += 1;
    bucket.total += 1;
    byYear.set(year, bucket);
  }

  const out: YearCompleted[] = [];
  for (let y = minYear; y <= currentYear; y++) {
    out.push(byYear.get(y) ?? { year: y, book: 0, movie: 0, series: 0, total: 0 });
  }
  return out;
}

// Completadas por año (spec 2026-08-03): el dato más rico de un historial largo.
// Todo desde `passes` con `finished_on`, sin período (siempre toda la historia).
export async function getCompletedByYear(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<YearCompleted[]> {
  const { data, error } = await supabase
    .from("passes")
    .select("finished_on, item_type")
    .eq("user_id", userId)
    .not("finished_on", "is", null);

  if (error) throw error;

  return computeCompletedByYear(
    (data ?? []) as Row[],
    new Date().getFullYear(),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stats/get-completed-by-year.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the card**

Barras apiladas por tipo, con leyenda y la franja año-vs-año (B2) derivada de la
propia serie.

```tsx
// src/components/stats/completed-by-year-card.tsx
import { getTranslations } from "next-intl/server";
import type { YearCompleted } from "@/lib/stats/get-completed-by-year";

// Completadas por año (spec 2026-08-03): histograma multi-año apilado por tipo,
// más el contador "este año vs el anterior". El wrapper card lo pone la página.
export async function CompletedByYearCard({ years }: { years: YearCompleted[] }) {
  const t = await getTranslations("stats");

  if (years.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("completedByYearTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("typeEmpty")}</p>
      </div>
    );
  }

  const max = Math.max(1, ...years.map((y) => y.total));
  const current = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  const delta = prev ? current.total - prev.total : null;

  const legend = [
    { label: t("typeBooks"), color: "var(--type-book)" },
    { label: t("typeMovies"), color: "var(--type-movie)" },
    { label: t("typeSeries"), color: "var(--type-series)" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("completedByYearTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("completedThisYear", { count: current.total })}
          {delta !== null && (
            <> · {t("completedDelta", { sign: delta >= 0 ? "+" : "−", count: Math.abs(delta), year: prev!.year })}</>
          )}
        </span>
      </div>

      <div className="flex h-24 items-end justify-between gap-1">
        {years.map((y) => (
          <div key={y.year} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full max-w-4 flex-1 flex-col-reverse justify-start">
              {(["book", "movie", "series"] as const).map((type) =>
                y[type] > 0 ? (
                  <div
                    key={type}
                    style={{
                      height: `${(y[type] / max) * 100}%`,
                      background: `var(--type-${type})`,
                    }}
                    className="w-full first:rounded-t-sm"
                  />
                ) : null,
              )}
            </div>
            <span className="font-mono text-[8.5px] text-foreground-faint">
              {String(y.year).slice(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add i18n keys**

`messages/es.json` (`"stats"`):

```json
"completedByYearTitle": "Completadas por año",
"completedThisYear": "{count} este año",
"completedDelta": "{sign}{count} vs {year}"
```

`messages/en.json` (`"stats"`):

```json
"completedByYearTitle": "Completed by year",
"completedThisYear": "{count} this year",
"completedDelta": "{sign}{count} vs {year}"
```

- [ ] **Step 7: Wire into `/estadisticas`**

En `src/app/estadisticas/page.tsx`:
- Importar `getCompletedByYear` y `CompletedByYearCard`.
- Añadir `getCompletedByYear(supabase, user.id)` al `Promise.all` (variable `byYear`).
- Insertar la tarjeta **al principio** del array `cards` (antes de `rating`):

```tsx
    <Card key="byYear">
      <CompletedByYearCard years={byYear} />
    </Card>,
```

- [ ] **Step 8: Typecheck + unit**

Run: `npx vitest run src/lib/stats && npx tsc --noEmit`
Expected: PASS, sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats/get-completed-by-year.ts src/lib/stats/get-completed-by-year.test.ts \
  src/components/stats/completed-by-year-card.tsx src/app/estadisticas/page.tsx \
  messages/es.json messages/en.json
git commit -m "feat(stats): tarjeta completadas por año con año-vs-año"
```

---

### Task 6: Mejor valoradas (B3)

Tarjeta con las obras mejor valoradas del período: título, tipo y estrellas.
Respeta el selector de período de la página completa.

**Files:**
- Create: `src/lib/stats/get-top-rated.ts`
- Create: `src/lib/stats/get-top-rated.test.ts`
- Create: `src/components/stats/top-rated-card.tsx`
- Modify: `src/app/estadisticas/page.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `keyFor`, `getItemTitles` (Task 1); `StatsPeriod`, `yearBounds` (`./period`).
- Produces:
  - `type TopRatedItem = { title: string; type: ItemType; rating: number }`
  - `type RatedRow = { item_type: ItemType; item_id: string; rating: number }`
  - `pickTopRated(rows: RatedRow[], limit: number): RatedRow[]`
  - `async getTopRated(supabase, userId, period, limit?): Promise<TopRatedItem[]>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stats/get-top-rated.test.ts
import { describe, it, expect } from "vitest";
import { pickTopRated } from "./get-top-rated";

const rows = [
  { item_type: "movie" as const, item_id: "a", rating: 5 },
  { item_type: "book" as const, item_id: "b", rating: 3 },
  { item_type: "movie" as const, item_id: "c", rating: 4 },
  { item_type: "movie" as const, item_id: "d", rating: 5 },
];

describe("pickTopRated", () => {
  it("ordena por nota desc y corta a limit", () => {
    const out = pickTopRated(rows, 2);
    expect(out.map((r) => r.rating)).toEqual([5, 5]);
  });

  it("con menos filas que el límite, las devuelve todas ordenadas", () => {
    const out = pickTopRated(rows, 10);
    expect(out.map((r) => r.rating)).toEqual([5, 5, 4, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats/get-top-rated.test.ts`
Expected: FAIL — `pickTopRated` no existe.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/stats/get-top-rated.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getItemTitles, keyFor } from "./get-item-titles";
import { type StatsPeriod, yearBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TopRatedItem = { title: string; type: ItemType; rating: number };
export type RatedRow = { item_type: ItemType; item_id: string; rating: number };

// Lógica pura: mejores notas primero, cortadas a `limit`. Ordenación estable
// suficiente para la tarjeta (empates por nota se dejan en el orden de entrada).
export function pickTopRated(rows: RatedRow[], limit: number): RatedRow[] {
  return [...rows].sort((a, b) => b.rating - a.rating).slice(0, limit);
}

// Mejor valoradas del período (spec 2026-08-03): obras terminadas con nota, de
// mayor a menor, hidratando el título por tipo. Cuenta el pase con más nota de
// cada obra no hace falta afinar: una relectura mejor valorada solo sube.
export async function getTopRated(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  limit = 6,
): Promise<TopRatedItem[]> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, rating, finished_on")
    .eq("user_id", userId)
    .not("rating", "is", null);

  if (period !== "all") {
    const { start, endExclusive } = yearBounds(period);
    query = query.gte("finished_on", start).lt("finished_on", endExclusive);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as (RatedRow & { finished_on: string | null })[]).map(
    ({ item_type, item_id, rating }) => ({ item_type, item_id, rating }),
  );
  const top = pickTopRated(rows, limit);
  if (top.length === 0) return [];

  const ids: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of top) ids[r.item_type].add(r.item_id);
  const titles = await getItemTitles(supabase, ids);

  const out: TopRatedItem[] = [];
  for (const r of top) {
    const title = titles.get(keyFor(r.item_type, r.item_id));
    if (title) out.push({ title, type: r.item_type, rating: r.rating });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stats/get-top-rated.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the card**

```tsx
// src/components/stats/top-rated-card.tsx
import { getTranslations } from "next-intl/server";
import type { TopRatedItem } from "@/lib/stats/get-top-rated";

const TYPE_LABEL_KEY: Record<TopRatedItem["type"], string> = {
  book: "typeBooks",
  movie: "typeMovies",
  series: "typeSeries",
};

// Mejor valoradas (spec 2026-08-03): lista compacta título · tipo · estrellas.
// El wrapper card lo pone la página.
export async function TopRatedCard({ items }: { items: TopRatedItem[] }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("topRatedTitle")}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ratingEmpty")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it, i) => (
            <li
              key={`${it.type}:${it.title}:${i}`}
              className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {it.title}
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {t(TYPE_LABEL_KEY[it.type])}
                </span>
              </span>
              <span aria-label={`${it.rating}/5`} className="shrink-0 text-sm text-accent">
                {"★".repeat(it.rating)}
                <span className="text-foreground-faint">{"★".repeat(5 - it.rating)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add i18n keys**

`messages/es.json`: `"topRatedTitle": "Mejor valoradas"`.
`messages/en.json`: `"topRatedTitle": "Top rated"`.

- [ ] **Step 7: Wire into `/estadisticas`**

En `src/app/estadisticas/page.tsx`:
- Importar `getTopRated` y `TopRatedCard`.
- Añadir `getTopRated(supabase, user.id, period)` al `Promise.all` (variable `topRated`).
- Añadir la tarjeta al array `cards`, tras `rating`:

```tsx
    <Card key="topRated">
      <TopRatedCard items={topRated} />
    </Card>,
```

- [ ] **Step 8: Typecheck + unit**

Run: `npx vitest run src/lib/stats && npx tsc --noEmit`
Expected: PASS, sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats/get-top-rated.ts src/lib/stats/get-top-rated.test.ts \
  src/components/stats/top-rated-card.tsx src/app/estadisticas/page.tsx \
  messages/es.json messages/en.json
git commit -m "feat(stats): tarjeta mejor valoradas por período"
```

---

### Task 7: E2E, verificación en navegador y cierre documental

Extender el e2e y verificar la página con datos reales, luego sincronizar la doc
canónica (regla de "hecho" de AGENTS.md) y abrir la issue de seguimiento.

**Files:**
- Modify: `e2e/estadisticas.spec.ts`
- Modify: `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`

- [ ] **Step 1: Extend the e2e**

Añadir al final de `e2e/estadisticas.spec.ts` (tras el login existente, o en un
test nuevo que reutilice el patrón de login) una comprobación de que la nueva
tarjeta titular aparece:

```ts
test("la página muestra completadas por año", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/estadisticas");
  await expect(page.getByText(/completadas por año/i)).toBeVisible();
  await expect(page.getByText(/la pila/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e (reutiliza el dev server que ya haya)**

Run: `npm run test:e2e -- estadisticas`
Expected: PASS (los tests con `test.skip` se saltan si faltan `TEST_USER_*`).

- [ ] **Step 3: Verificación en navegador (qa-verifier o manual)**

Con sesión iniciada, abrir `/estadisticas` y confirmar con los datos reales del
dueño (110 completadas, 6 pendientes, 4 sesiones):
- "Completadas por año" pinta ~2015→2026, mayoría cine.
- "La pila" muestra "6 pendientes" y desglose por tipo, **sin** crecimiento inventado.
- "Cuándo lees" y "Ritmo" muestran "Aún sin sesiones de lectura" (0 sesiones con hora).
- "Mejor valoradas" lista obras con estrellas.

- [ ] **Step 4: Sincronizar doc canónica**

- `docs/requirements/backlog.md`: marcar la mejora del panel de estadísticas.
- `docs/requirements/decisiones.md`: **append** de la Decisión 1 (la pila = foto
  del momento; por qué el flujo no es fiable con datos importados).
- **No** se toca `data-model.md` (sin cambios de esquema).

- [ ] **Step 5: Abrir la issue de seguimiento**

Abrir issue en el repo: "Columnas hito `planned_on`/`started_on` en `passes` +
flujo real de la pila". Contexto: valor transversal (ordenar pila por antigüedad,
"empezado el X" en pase-hub, arreglar `fastestBook` que usa `created_at` como
falso inicio); solo captura datos a futuro; habilitaría una vista de flujo cuando
haya histórico. Referenciar la spec `2026-08-03-estadisticas-historial-cultural`.

- [ ] **Step 6: Commit**

```bash
git add e2e/estadisticas.spec.ts docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "test(stats): e2e de completadas por año; cierre documental"
```

---

## Notas de implementación

- **Orden final de tarjetas en `/estadisticas`** tras todas las tareas:
  `byYear` (titular) → `rating` → `topRated` → `type` → `status` → `hours` →
  `genres` → `authors` → `decades` → `habits` → `records` → `tbr`. Las de
  sesión (`hours`, `habits`) quedan por debajo de las passes-driven.
- **El muro del perfil** (`StatsTab`) solo cambia por el swap de `TbrCard`
  (Task 2) y los empty states heredados (Tasks 3–4); no se reordena su layout de
  dos árboles.
- **Paridad i18n:** si `messages/en.json` no tiene aún el bloque `"stats"`
  completo, replicar solo las claves nuevas; no inventar traducciones de claves
  ajenas a esta tanda.
