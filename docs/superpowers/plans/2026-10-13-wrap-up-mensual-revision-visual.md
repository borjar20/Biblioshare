# Wrap-up mensual: revisión visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer las stories Terminado, En marcha, Ritmo y En compañía del wrap-up según
`docs/superpowers/specs/2026-10-13-wrap-up-mensual-revision-visual-design.md`.

**Architecture:** Los cargadores (`src/lib/wrap-ups/load/*`) producen hechos nuevos; `select-stories`
los mete en un payload `v: 2`; `view-models` los convierte en `PosterModel` con texto ya escrito
(y ramas de compatibilidad `v: 1`); `poster.tsx` + bloques nuevos los pintan. Los compañeros se
guardan como ids y se resuelven al pintar con el cliente de la petición.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (PostgREST), next-intl, Vitest +
Testing Library, CSS Modules.

## Global Constraints

- Copy y comentarios en español. Claves nuevas en `messages/es.json` bajo `wrapUps.stories.*`.
- Sin `use cache` en nada que toque compañeros o el wrap-up propio (regla #437, `AGENTS.md`).
- El cron corre con service role: **toda** consulta nueva de los cargadores filtra por el usuario
  dueño (`user_id` / `author_id`).
- `ShareSummary` (resumen público, feed, imagen) **no cambia**.
- Payloads `v: 1` ya guardados deben seguir pintándose sin error.
- Franjas horarias en hora de `Europe/Madrid`.
- Sin migración de esquema.
- Tests: antes de cada `vitest`, Node 22. En PowerShell, en el MISMO comando:
  `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run <ruta>`
  (si `node --version` ya es v22, basta `npx vitest run <ruta>`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Fichero | Responsabilidad | Cambio |
|---|---|---|
| `src/lib/stats/get-habits.ts` | Hábitos: franja y día; ahora distribuciones en hora de Madrid | Modificar |
| `src/lib/wrap-ups/types.ts` | Tipos de payload `v: 2` | Modificar |
| `src/lib/wrap-ups/select-stories.ts` | Topes y campos nuevos por story | Modificar |
| `src/lib/wrap-ups/build.ts` | Escribe `v: 2` | Modificar |
| `src/lib/wrap-ups/load/core.ts` | En marcha «abierto al cierre», % de series, distribuciones | Modificar |
| `src/lib/wrap-ups/load/moments.ts` | Visionados con obra y compañeros; clubes con nombre | Modificar |
| `src/lib/wrap-ups/view-models.ts` | Modelos de los 4 layouts + duración por story | Modificar |
| `src/lib/wrap-ups/narrator-copy.ts` | Cifra de En marcha = `openTotal` | Modificar |
| `src/lib/wrap-ups/companions.ts` | Resolver ids de compañeros (bloqueos incluidos) | Crear |
| `src/components/wrap-ups/poster-blocks.tsx` | `CoverGrid`, `ProgressList`, `RhythmCharts`, `TogetherBlock` | Crear |
| `src/components/wrap-ups/poster.tsx` | Despacha los layouts nuevos; prop `paused` | Modificar |
| `src/components/wrap-ups/poster.module.css` | Estilos de los bloques | Modificar |
| `src/components/wrap-ups/story-player.tsx` | Duración por story; pasa `paused` | Modificar |
| `src/app/wrap/[kind]/page.tsx`, `src/components/wrap-ups/wrap-up-entry.tsx` | Resuelven compañeros y los pasan a `posterFor` | Modificar |
| `messages/es.json` | Copy nuevo | Modificar |

---

### Task 1: Hábitos con distribución y hora de Madrid (cierra #1512)

**Files:**
- Modify: `src/lib/stats/get-habits.ts:8-88`
- Test: `src/lib/stats/habits-pace.test.ts`

**Interfaces:**
- Produces: `Habits` gana `byWeekday: number[]` (7, lunes = 0) y `byBand: number[]` (12, franja
  i = horas 2i–2i+2 en Madrid). `export function madridHour(iso: string): number | null`.

- [ ] **Step 1: Write the failing tests**

En `habits-pace.test.ts`, dentro de `describe("computeHabits")`, actualiza el primer caso y añade
tres:

```ts
  it("sin datos, todo null", () => {
    expect(computeHabits([])).toEqual({
      favoriteBand: null,
      favoriteWeekday: null,
      averageMinutes: null,
      sessions: 0,
      activeDays: 0,
      byWeekday: [0, 0, 0, 0, 0, 0, 0],
      byBand: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("la franja usa la hora de Madrid, no la UTC (#1512): verano +2", () => {
    // 23:30Z del 5 sep = 01:30 en Madrid → franja 00-02, no 22-24.
    const h = computeHabits([{ session_date: "2026-09-06", duration_minutes: null, started_at: "2026-09-05T23:30:00Z" }]);
    expect(h.favoriteBand).toEqual({ startHour: 0 });
    expect(h.byBand[0]).toBe(1);
    expect(h.byBand[11]).toBe(0);
  });

  it("la franja usa la hora de Madrid: invierno +1", () => {
    // 01:30Z del 5 dic = 02:30 en Madrid → franja 02-04.
    const h = computeHabits([{ session_date: "2026-12-05", duration_minutes: null, started_at: "2026-12-05T01:30:00Z" }]);
    expect(h.favoriteBand).toEqual({ startHour: 2 });
  });

  it("byWeekday cuenta filas por día de la semana (lunes = 0)", () => {
    const h = computeHabits([
      { session_date: "2026-09-05", duration_minutes: null, started_at: null }, // sábado
      { session_date: "2026-09-05", duration_minutes: null, started_at: null },
      { session_date: "2026-09-07", duration_minutes: null, started_at: null }, // lunes
    ]);
    expect(h.byWeekday).toEqual([1, 0, 0, 0, 0, 2, 0]);
    expect(h.favoriteWeekday).toBe(5);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stats/habits-pace.test.ts`
Expected: FAIL (falta `byWeekday`/`byBand`; la franja de verano sale `startHour: 22`).

- [ ] **Step 3: Implement**

En `get-habits.ts`, añade a `Habits` (después de `activeDays`):

```ts
  // Distribuciones completas (gráficas del wrap-up). byWeekday: lunes = 0.
  // byBand: franja i = [2i, 2i+2) en hora de Madrid.
  byWeekday: number[];
  byBand: number[];
```

Encima de `computeHabits`:

```ts
const MADRID_HOUR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" });

/** Hora (0-23) de un instante en Madrid; null si no es una fecha válida. */
export function madridHour(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Number(MADRID_HOUR.format(d));
}
```

En `computeHabits`, sustituye el bucle de franjas:

```ts
  for (const row of rows) {
    if (!row.started_at) continue;
    const hour = madridHour(row.started_at);
    if (hour === null) continue;
    bands[Math.floor(hour / 2)]++;
  }
```

y en el `return` añade `byWeekday: weekdays, byBand: bands,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stats/`
Expected: PASS (todo el directorio: `/estadisticas` consume la misma función).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/get-habits.ts src/lib/stats/habits-pace.test.ts
git commit -m "fix(estadisticas): la franja horaria usa la hora de Madrid y expone distribuciones (#1512)"
```

---

### Task 2: Payload `v: 2` — tipos, selección y build

**Files:**
- Modify: `src/lib/wrap-ups/types.ts`
- Modify: `src/lib/wrap-ups/select-stories.ts:59-104`
- Modify: `src/lib/wrap-ups/build.ts:26`
- Modify: `src/lib/wrap-ups/__fixtures__/inputs.ts` (sin cambios de forma si compila; ver step 3)
- Test: `src/lib/wrap-ups/select-stories.test.ts`

**Interfaces:**
- Produces (en `types.ts`):

```ts
export type InProgressItem = ItemRef & { percent: number | null; touched?: boolean };
export type JointViewingFact = { item: ItemRef; watchedOn: string; companionIds: string[] };
export type ClubFact = { clubId: string; name: string; days: number };
export type TogetherFacts = { jointViewings: number; clubDays: number; viewings?: JointViewingFact[]; clubs?: ClubFact[] };
```

  Stories: `in_progress: { items: InProgressItem[]; openTotal?: number; touchedTotal?: number }`,
  `rhythm` + `byWeekday?: number[]; byBand?: number[]`, `together: TogetherFacts`,
  `finished` sin cambio de forma. `WrapUpPayload.v: 1 | 2`.
  `WrapUpInputs`: `inProgress: InProgressItem[]`, `openTotal?: number`, `byWeekday?: number[]`,
  `byBand?: number[]`, `together: TogetherFacts`.

- [ ] **Step 1: Write the failing tests**

Añade al final de `select-stories.test.ts`:

```ts
describe("payload v2 del mes", () => {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03"];
  const open = (id: string, touched: boolean) => ({ ...book(id), percent: null, touched });

  it("Terminado guarda hasta 30 portadas y el total real", () => {
    const finished = Array.from({ length: 40 }, (_, i) => book(`b${i}`));
    const s = selectStories(MONTH, emptyInputs({ finished, activeDays: days }))
      .find((x) => x.id === "finished") as Extract<ReturnType<typeof selectStories>[number], { id: "finished" }>;
    expect(s.items).toHaveLength(30);
    expect(s.total).toBe(40);
  });

  it("En marcha guarda 12 items, openTotal y touchedTotal", () => {
    const inProgress = [
      ...Array.from({ length: 13 }, (_, i) => open(`t${i}`, true)),
      open("x", false),
    ];
    const s = selectStories(MONTH, emptyInputs({ inProgress, openTotal: 14, activeDays: days }))
      .find((x) => x.id === "in_progress") as Extract<ReturnType<typeof selectStories>[number], { id: "in_progress" }>;
    expect(s.items).toHaveLength(12);
    expect(s.openTotal).toBe(14);
    expect(s.touchedTotal).toBe(13);
  });

  it("Ritmo lleva las distribuciones", () => {
    const byWeekday = [1, 0, 0, 0, 0, 2, 0];
    const byBand = [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    const s = selectStories(MONTH, emptyInputs({ activeDays: days, byWeekday, byBand }))
      .find((x) => x.id === "rhythm") as Extract<ReturnType<typeof selectStories>[number], { id: "rhythm" }>;
    expect(s.byWeekday).toEqual(byWeekday);
    expect(s.byBand).toEqual(byBand);
  });

  it("En compañía lleva visionados y clubes", () => {
    const together = {
      jointViewings: 1, clubDays: 2,
      viewings: [{ item: book("m1"), watchedOn: "2026-09-10", companionIds: ["u2"] }],
      clubs: [{ clubId: "c1", name: "Club", days: 2 }],
    };
    const s = selectStories(MONTH, emptyInputs({ together, activeDays: days }))
      .find((x) => x.id === "together");
    expect(s).toEqual({ id: "together", ...together });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wrap-ups/select-stories.test.ts`
Expected: FAIL (tipos y topes antiguos: 8 portadas, sin `openTotal`).

- [ ] **Step 3: Implement**

`types.ts`: añade los cuatro tipos de **Interfaces** tras `MinutesByType`. Cambia las ramas de
`Story`:

```ts
  | { id: "in_progress"; items: InProgressItem[]; openTotal?: number; touchedTotal?: number }
  | { id: "rhythm"; days: { date: string; active: boolean }[]; activeDays: number; bestStreak: number;
      favoriteWeekday: number | null; favoriteBandStartHour: number | null;
      byWeekday?: number[]; byBand?: number[] }
  | ({ id: "together" } & TogetherFacts)
```

En `WrapUpPayload`: `v: 1 | 2;`. En `WrapUpInputs`:

```ts
  inProgress: InProgressItem[];   // abiertas al cierre de la ventana (tocadas primero)
  openTotal?: number;              // total de abiertas al cierre
  byWeekday?: number[];            // filas de hábito por día (lunes = 0)
  byBand?: number[];               // filas de hábito por franja de 2 h en Madrid
  ...
  together: TogetherFacts;
```

`select-stories.ts`, en `selectStories`:

```ts
  const rhythm: Story | null = i.activeDays.length >= 3 ? {
    id: "rhythm",
    days: daysOf(w).map((date) => ({ date, active: i.activeDays.includes(date) })),
    activeDays: i.activeDays.length, bestStreak: i.bestStreak,
    favoriteWeekday: i.favoriteWeekday, favoriteBandStartHour: i.favoriteBandStartHour,
    ...(i.byWeekday ? { byWeekday: i.byWeekday } : {}),
    ...(i.byBand ? { byBand: i.byBand } : {}),
  } : null;
  const finished: Story | null = i.finished.length > 0
    ? { id: "finished", items: i.finished.slice(0, 30), total: i.finished.length } : null;
```

y en la rama `month`:

```ts
    if (i.inProgress.length > 0) out.push({
      id: "in_progress", items: i.inProgress.slice(0, 12),
      openTotal: i.openTotal ?? i.inProgress.length,
      touchedTotal: i.inProgress.filter((x) => x.touched !== false).length,
    });
```

`build.ts:26`: `v: 2 as const,`.

`__fixtures__/inputs.ts`: no hace falta tocarlo (los campos nuevos son opcionales); si
`together` da error de tipo, déjalo como `{ jointViewings: 0, clubDays: 0 }`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/wrap-ups/`
Expected: PASS. Si algún test existente compara `v: 1` del build, cámbialo a `v: 2`.
Después: `npx tsc --noEmit` → sin errores nuevos (las ramas `v: 1` se cubren en Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrap-ups/types.ts src/lib/wrap-ups/select-stories.ts src/lib/wrap-ups/build.ts src/lib/wrap-ups/select-stories.test.ts src/lib/wrap-ups/__fixtures__/inputs.ts
git commit -m "feat(wrap-ups): payload v2 con topes y campos nuevos por story"
```

---

### Task 3: Cargador de En marcha y Ritmo (`load/core.ts`)

**Files:**
- Modify: `src/lib/wrap-ups/load/core.ts`
- Test: `src/lib/wrap-ups/load/core.test.ts`

**Interfaces:**
- Consumes: `Habits.byWeekday/byBand` (Task 1), `InProgressItem` (Task 2).
- Produces: `export async function loadMeta(...)` (ahora exportada; `FullMeta.totalEpisodes`),
  `export function openAtClose(rows: OpenPassRow[], endExclusive: string): OpenPassRow[]`,
  `export function seriesPercent(watched: { season_number: number; episode_number: number }[], total: number | null, stillOpen: boolean): number | null`,
  `CoreFacts` incluye `openTotal`, `byWeekday`, `byBand`.

- [ ] **Step 1: Write the failing tests**

En `core.test.ts`, importa `openAtClose, seriesPercent` y añade:

```ts
describe("openAtClose", () => {
  const row = (over: Partial<OpenPassRow>): OpenPassRow => ({
    id: "p", item_type: "book", item_id: "b", position: null, status: "in_progress",
    started_on: "2026-08-13", finished_on: null, ...over,
  });
  const END = "2026-10-01";
  it("abierto hoy y empezado antes del cierre: entra", () => expect(openAtClose([row({})], END)).toHaveLength(1));
  it("empezado después del cierre: no entra", () => expect(openAtClose([row({ started_on: "2026-10-03" })], END)).toHaveLength(0));
  it("sin fecha de inicio: entra", () => expect(openAtClose([row({ started_on: null })], END)).toHaveLength(1));
  it("terminado después del cierre: seguía abierto, entra", () =>
    expect(openAtClose([row({ status: "completed", finished_on: "2026-10-03" })], END)).toHaveLength(1));
  it("terminado dentro de la ventana: no entra", () =>
    expect(openAtClose([row({ status: "completed", finished_on: "2026-09-20" })], END)).toHaveLength(0));
  it("abandonado: no entra (sin fecha de abandono)", () =>
    expect(openAtClose([row({ status: "dropped" })], END)).toHaveLength(0));
});

describe("seriesPercent", () => {
  const ep = (s: number, e: number) => ({ season_number: s, episode_number: e });
  it("episodios distintos entre el total", () => expect(seriesPercent([ep(1, 1), ep(1, 1), ep(1, 2)], 8, true)).toBe(25));
  it("sin total, null", () => expect(seriesPercent([ep(1, 1)], null, true)).toBeNull());
  it("abierto no llega al 100", () => expect(seriesPercent([ep(1, 1), ep(1, 2)], 2, true)).toBe(99));
});

describe("loadCore · En marcha al cierre (caso @maxteryo)", () => {
  it("3 abiertas, 1 tocada: tocada primero, todas presentes, openTotal 3", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      passes: [
        { id: "ps", user_id: "u1", item_type: "series", item_id: "s1", position: null, status: "in_progress", started_on: "2026-08-25", finished_on: null },
        { id: "pm", user_id: "u1", item_type: "movie", item_id: "m1", position: null, status: "in_progress", started_on: "2026-08-14", finished_on: null },
        { id: "pb", user_id: "u1", item_type: "book", item_id: "b1", position: { page: 100 }, status: "in_progress", started_on: "2026-08-13", finished_on: null },
      ],
      episode_watches: [
        { user_id: "u1", series_id: "s1", pass_id: "ps", season_number: 1, episode_number: 1, watched_on: "2026-09-05", created_at: "2026-09-05T21:49:00Z" },
      ],
      series: [{ id: "s1", title: "Reacher", cover_url: null, genres: null, episode_runtime_minutes: 50, total_episodes: 8 }],
      movies: [{ id: "m1", title: "Peli", cover_url: null, genres: null, duration_minutes: 100 }],
      books: [{ id: "b1", title: "Elantris", cover_url: null, genres: null, total_pages: 400 }],
    };
    const facts = await loadCore(filteringClient(tables) as never, "u1", wrapUpWindow("month", new Date("2026-10-01T07:00:00Z")));
    expect(facts.openTotal).toBe(3);
    expect(facts.inProgress.map((i) => [i.title, i.touched, i.percent])).toEqual([
      ["Reacher", true, 13],
      ["Peli", false, null],
      ["Elantris", false, 25],
    ]);
  });
});
```

Y el cliente falso que aplica filtros (añádelo junto a `recordingClient`):

```ts
/** Cliente falso que aplica eq/gte/lt/in sobre filas en memoria. */
function filteringClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from: (table: string) => {
      const preds: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "not", "is", "limit"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => { preds.push((r) => r[c] === undefined || r[c] === v); return q; };
      q.gte = (c: string, v: string) => { preds.push((r) => r[c] === undefined || (r[c] != null && String(r[c]) >= v)); return q; };
      q.lt = (c: string, v: string) => { preds.push((r) => r[c] === undefined || (r[c] != null && String(r[c]) < v)); return q; };
      q.lte = (c: string, v: string) => { preds.push((r) => r[c] === undefined || (r[c] != null && String(r[c]) <= v)); return q; };
      q.in = (c: string, vs: unknown[]) => { preds.push((r) => r[c] === undefined || vs.includes(r[c])); return q; };
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: (tables[table] ?? []).filter((r) => preds.every((p) => p(r))), error: null }).then(res);
      return q;
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
  };
}
```

(`r[c] === undefined` deja pasar columnas que la fila de prueba no trae, como los `select`
embebidos.) Importa `type OpenPassRow` desde `./core`.

Actualiza también el test existente «lista una serie abierta…»: la fila de `passes` gana
`started_on: "2026-09-01", finished_on: null`, y lo esperado pasa a
`{ type: "series", id: "s1", title: "Serie", coverUrl: null, times: 1, percent: null, touched: true }`.
En «un libro abierto a una página del final…», añade `started_on: "2026-09-01", finished_on: null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wrap-ups/load/core.test.ts`
Expected: FAIL (`openAtClose` no existe; `inProgress` solo trae Reacher).

- [ ] **Step 3: Implement**

En `core.ts`:

1. Tipos y meta:

```ts
export type CoreFacts = Pick<WrapUpInputs, "time" | "activeDays" | "finished" | "inProgress" | "bestStreak"
  | "favoriteWeekday" | "favoriteBandStartHour" | "genres" | "seriesProgress" | "openTotal" | "byWeekday" | "byBand">;
type FullMeta = Meta & { runtime: number | null; duration: number | null; totalPages: number | null; totalEpisodes: number | null };
export type OpenPassRow = {
  id: string; item_type: ItemType; item_id: string; position: unknown;
  status: string; started_on: string | null; finished_on: string | null;
};
```

   `loadMeta` pasa a `export async function loadMeta`, la columna de series pasa a
   `"id,title,cover_url,genres,episode_runtime_minutes,total_episodes"` y el objeto gana
   `totalEpisodes: (r.total_episodes as number | null) ?? null,`.

2. Funciones puras (antes de `loadCore`):

```ts
/** Abierto el último día de la ventana: sigue abierto, o se terminó después del cierre. Los abandonados no
 *  guardan fecha de abandono: no se puede saber si seguían abiertos, así que no entran. */
export function openAtClose(rows: OpenPassRow[], endExclusive: string): OpenPassRow[] {
  return rows.filter((r) => (r.started_on == null || r.started_on < endExclusive)
    && (r.status === "in_progress" || (r.status === "completed" && r.finished_on != null && r.finished_on >= endExclusive)));
}

/** % de una serie: episodios distintos vistos entre el total; abierto, tope 99 (como passPercent). */
export function seriesPercent(
  watched: { season_number: number; episode_number: number }[], total: number | null, stillOpen: boolean,
): number | null {
  if (!total) return null;
  const distinct = new Set(watched.map((w) => `${w.season_number}:${w.episode_number}`)).size;
  const pct = Math.min(100, Math.round((distinct * 100) / total));
  return stillOpen ? Math.min(99, pct) : pct;
}
```

3. En `loadCore`, sustituye la consulta `openQ` por dos (el `Promise.all` pasa a cinco elementos):

```ts
    client.from("passes").select("id, item_type, item_id, position, status, started_on, finished_on")
      .eq("user_id", userId).eq("status", "in_progress"),
    // Terminados DESPUÉS del cierre: el último día de la ventana seguían abiertos.
    client.from("passes").select("id, item_type, item_id, position, status, started_on, finished_on")
      .eq("user_id", userId).eq("status", "completed").gte("finished_on", w.endExclusive),
```

   con `if (openQ.error) throw openQ.error; if (laterQ.error) throw laterQ.error;`.

4. Sustituye el bloque desde «En marcha = …» hasta `const inProgress = …;` por:

```ts
  // En marcha = abierto al cierre (spec 2026-10-13 §2). `touched`: avanzó en la ventana
  // (sesión del pase, o episodio de esa serie).
  const lastTouch = new Map<string, string>();
  for (const s of cur.sessions) if (s.session_date > (lastTouch.get(s.pass_id) ?? "")) lastTouch.set(s.pass_id, s.session_date);
  const seriesTouch = new Map<string, string>();
  for (const x of cur.watches) if (x.watched_on > (seriesTouch.get(x.series_id) ?? "")) seriesTouch.set(x.series_id, x.watched_on);
  const touchOf = (r: OpenPassRow) => lastTouch.get(r.id) ?? (r.item_type === "series" ? seriesTouch.get(r.item_id) : undefined) ?? null;

  const openRows = openAtClose([
    ...((openQ.data ?? []) as OpenPassRow[]),
    ...((laterQ.data ?? []) as OpenPassRow[]),
  ], w.endExclusive);

  const seriesPassIds = openRows.filter((r) => r.item_type === "series").map((r) => r.id);
  const seriesWatches = seriesPassIds.length === 0 ? [] : await readAllRows<{ pass_id: string; season_number: number; episode_number: number }>(
    (from, to) => client.from("episode_watches").select("pass_id, season_number, episode_number")
      .eq("user_id", userId).in("pass_id", seriesPassIds).lt("watched_on", w.endExclusive)
      .order("id").range(from, to));
```

   (deja la llamada a `loadMeta` como está; ya incluye `openRows`) y después:

```ts
  const ordered = openRows.flatMap((r) => {
    const m = meta.get(key(r.item_type, r.item_id));
    if (!m) return [];
    const stillOpen = r.status === "in_progress";
    let percent: number | null = null;
    if (r.item_type === "book" && stillOpen) {
      // Solo con el pase aún abierto: la posición guardada es la de HOY, no la del cierre.
      const pos = parsePosition("book", r.position);
      const page = pos && "page" in pos && pos.page !== undefined ? pos.page : null;
      // passPercent: el 100 solo con la última página leída (668/669 redondeaba a 100 en un pase abierto).
      percent = page != null && m.totalPages ? passPercent(page, m.totalPages) : null;
    } else if (r.item_type === "series") {
      percent = seriesPercent(seriesWatches.filter((x) => x.pass_id === r.id), m.totalEpisodes, stillOpen);
    }
    const touch = touchOf(r);
    return [{
      item: { type: r.item_type, id: r.item_id, title: m.title, coverUrl: m.coverUrl, times: 1, percent, touched: touch !== null },
      sortKey: touch ?? r.started_on ?? "",
    }];
  }).sort((a, b) => Number(b.item.touched) - Number(a.item.touched) || b.sortKey.localeCompare(a.sortKey));
  const inProgress = ordered.map((x) => x.item);
```

5. En el `return` añade `openTotal: inProgress.length, byWeekday: habits.byWeekday, byBand: habits.byBand,`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/wrap-ups/load/`
Expected: PASS (incluido «toda consulta por usuario filtra por user_id»).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrap-ups/load/core.ts src/lib/wrap-ups/load/core.test.ts
git commit -m "feat(wrap-ups): En marcha cuenta lo abierto al cierre, con % de series y tocadas primero"
```

---

### Task 4: Cargador de En compañía (`load/moments.ts`)

**Files:**
- Modify: `src/lib/wrap-ups/load/moments.ts`
- Test: `src/lib/wrap-ups/load/moments.test.ts`

**Interfaces:**
- Consumes: `loadMeta` (Task 3), `JointViewingFact`, `ClubFact` (Task 2).
- Produces: `export function jointViewingRefs(rows: JointRow[], userId: string): { type: ItemType; id: string; watchedOn: string; companionIds: string[] }[]`,
  `export function clubFacts(rows: ClubPostRow[]): ClubFact[]`, `export type JointRow`, `export type ClubPostRow`.

- [ ] **Step 1: Write the failing tests**

En `moments.test.ts` (importa `jointViewingRefs, clubFacts`):

```ts
describe("jointViewingRefs", () => {
  it("obra, fecha y compañeros aceptados sin el propio usuario; más reciente primero", () => {
    const rows = [
      { viewing_id: "v1", joint_viewings: { watched_on: "2026-09-02", item_type: "movie", item_id: "m1",
        joint_viewing_members: [
          { user_id: "u1", status: "accepted" }, { user_id: "u2", status: "accepted" },
          { user_id: "u3", status: "pending" }, { user_id: "u2", status: "accepted" },
        ] } },
      { viewing_id: "v2", joint_viewings: [{ watched_on: "2026-09-20", item_type: "series", item_id: "s1", joint_viewing_members: [] }] },
    ] as JointRow[];
    expect(jointViewingRefs(rows, "u1")).toEqual([
      { type: "series", id: "s1", watchedOn: "2026-09-20", companionIds: [] },
      { type: "movie", id: "m1", watchedOn: "2026-09-02", companionIds: ["u2"] },
    ]);
  });
});

describe("clubFacts", () => {
  it("días distintos en Madrid por club, desc por días", () => {
    const rows = [
      { created_at: "2026-09-01T10:00:00Z", club_id: "a", clubs: { name: "Club A" } },
      { created_at: "2026-09-01T12:00:00Z", club_id: "a", clubs: { name: "Club A" } },
      { created_at: "2026-09-02T22:30:00Z", club_id: "a", clubs: { name: "Club A" } }, // 00:30 del 3 en Madrid
      { created_at: "2026-09-05T10:00:00Z", club_id: "b", clubs: [{ name: "Club B" }] },
    ] as ClubPostRow[];
    expect(clubFacts(rows)).toEqual([
      { clubId: "a", name: "Club A", days: 2 },
      { clubId: "b", name: "Club B", days: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wrap-ups/load/moments.test.ts`
Expected: FAIL (funciones inexistentes).

- [ ] **Step 3: Implement**

En `moments.ts`:

```ts
import type { ClubFact, ItemRef, JointViewingFact, WrapUpInputs } from "../types";
import { loadMeta, type WrapUpClient } from "./core";

type Member = { user_id: string; status: string };
type Viewing = { watched_on: string; item_type: ItemType; item_id: string; joint_viewing_members?: Member[] | null };
export type JointRow = { viewing_id: string; joint_viewings: Viewing | Viewing[] };
export type ClubPostRow = { created_at: string; club_id: string; clubs: { name: string } | { name: string }[] | null };

const many = <X,>(x: X | X[] | null | undefined): X[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Un visionado por id: su obra, su fecha y los demás miembros aceptados. Más reciente primero. */
export function jointViewingRefs(rows: JointRow[], userId: string) {
  const byId = new Map<string, { type: ItemType; id: string; watchedOn: string; companionIds: string[] }>();
  for (const r of rows) {
    for (const v of many(r.joint_viewings)) {
      const companionIds = [...new Set(many(v.joint_viewing_members)
        .filter((m) => m.status === "accepted" && m.user_id !== userId).map((m) => m.user_id))];
      byId.set(r.viewing_id, { type: v.item_type, id: v.item_id, watchedOn: v.watched_on, companionIds });
    }
  }
  return [...byId.values()].sort((a, b) => b.watchedOn.localeCompare(a.watchedOn));
}

/** Días distintos (Madrid) con algún post por club. */
export function clubFacts(rows: ClubPostRow[]): ClubFact[] {
  const by = new Map<string, { name: string; days: Set<string> }>();
  for (const r of rows) {
    const name = many(r.clubs)[0]?.name;
    if (!name) continue;
    const cur = by.get(r.club_id) ?? { name, days: new Set<string>() };
    cur.days.add(madridToday(new Date(r.created_at)));
    by.set(r.club_id, cur);
  }
  return [...by].map(([clubId, c]) => ({ clubId, name: c.name, days: c.days.size }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "es"));
}
```

Borra el `type JointRow` antiguo. En `loadMeta` hay que importar desde `./core` (ya importa el tipo
`WrapUpClient` de ahí; no crea ciclo porque `core.ts` no importa `moments.ts`).

En `loadMoments`, cambia las dos consultas:

```ts
    readAllRows<JointRow>((from, to) => client.from("joint_viewing_members")
      .select("viewing_id, joint_viewings!inner(watched_on, item_type, item_id, joint_viewing_members(user_id, status))")
      .eq("user_id", userId).eq("status", "accepted")
      .gte("joint_viewings.watched_on", w.start).lt("joint_viewings.watched_on", w.endExclusive)
      .order("viewing_id").range(from, to) as unknown as PromiseLike<{ data: JointRow[] | null; error?: unknown }>),
    readAllRows<ClubPostRow>((from, to) => client.from("club_posts").select("created_at, club_id, clubs(name)")
      .eq("author_id", userId)
      .gte("created_at", w.start).lt("created_at", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: ClubPostRow[] | null; error?: unknown }>),
```

Tras `const xp = …`, sustituye el cálculo de `clubDays`/`socialDays` y el `together` del return:

```ts
  const clubs = clubFacts(clubPosts);
  const clubDays = new Set(clubPosts.map((p) => madridToday(new Date(p.created_at))));
  const socialDays = new Set(clubDays);
  for (const joint of joints) {
    for (const viewing of many(joint.joint_viewings)) if (viewing?.watched_on) socialDays.add(viewing.watched_on);
  }
  const refs = jointViewingRefs(joints, userId);
  const meta = refs.length ? await loadMeta(client, refs) : new Map();
  const viewings: JointViewingFact[] = refs.flatMap((r) => {
    const m = meta.get(`${r.type}:${r.id}`);
    return m ? [{ item: { type: r.type, id: r.id, title: m.title, coverUrl: m.coverUrl, times: 1 }, watchedOn: r.watchedOn, companionIds: r.companionIds }] : [];
  });
```

y en el return: `together: { jointViewings: joints.length, clubDays: clubDays.size, viewings, clubs },`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/wrap-ups/`
Expected: PASS. Si un test de `loadMoments` usa un cliente falso sin `books/movies/series`,
`loadMeta` devuelve un mapa vacío y `viewings` queda `[]`: ajusta lo esperado a
`together: { jointViewings, clubDays, viewings: [], clubs: [...] }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrap-ups/load/moments.ts src/lib/wrap-ups/load/moments.test.ts
git commit -m "feat(wrap-ups): En compañía guarda qué se vio, con quién y en qué clubes"
```

---

### Task 5: Modelos de póster (`view-models.ts`) y copy

**Files:**
- Modify: `src/lib/wrap-ups/view-models.ts`
- Modify: `src/lib/wrap-ups/narrator-copy.ts:18`
- Modify: `messages/es.json` (bloques `wrapUps.stories.in_progress`, `.rhythm`, `.together`)
- Test: `src/lib/wrap-ups/view-models.test.ts`

**Interfaces:**
- Consumes: tipos de Task 2.
- Produces (exportado desde `view-models.ts`):

```ts
export type Companion = { userId: string; username: string; displayName: string | null; avatarUrl: string | null };
export type People = Record<string, Companion>;
export type HeatCell = { label: string; level: 0 | 1 | 2 | 3; peak: boolean };
export type PosterModel = {
  layout: "hero" | "figure" | "covers" | "strip" | "ranking" | "quote" | "closing" | "progress" | "calendar" | "together";
  eyebrow: string;
  figure?: { value: string; unit: string };
  lines: string[];
  covers?: ItemRef[];
  coverGrid?: "static" | "scroll";
  reducedMoreLine?: string;
  strip?: { label: string; value: string; active: boolean }[];
  stripValues?: boolean;
  ranking?: { label: string; value: string }[];
  quote?: { body: string; attribution: string | null };
  progress?: { item: ItemRef; percent: number | null; touched: boolean; label: string }[];
  calendar?: { offset: number; days: { day: number; active: boolean }[]; summary: string };
  heatmaps?: { title: string; cells: HeatCell[]; summary: string }[];
  together?: {
    viewingsTitle: string; clubsTitle: string;
    viewings: { item: ItemRef; companions: Companion[]; extra: number }[];
    clubs: { name: string; value: string }[];
  };
  narratorLine: string;
};
export const STEP_MS = 6000;
export function storyDurationMs(m: PosterModel): number;
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3;
export function posterFor(story: Story, payload: WrapUpPayload, t: T, people?: People): PosterModel;
```

- [ ] **Step 1: Write the failing tests**

En `view-models.test.ts` añade (usa el `t` falso y `base` del fichero):

```ts
const month = { ...base, v: 2, kind: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" } as WrapUpPayload;
const ref = (id: string): ItemRef => ({ type: "book", id, title: id, coverUrl: null, times: 1 });

describe("posterFor finished (rejilla)", () => {
  it("≤ 9 portadas: rejilla quieta con todas", () => {
    const m = posterFor({ id: "finished", items: [ref("a"), ref("b")], total: 2 }, month, t);
    expect(m.coverGrid).toBe("static");
    expect(m.covers).toHaveLength(2);
    expect(m.lines).toEqual([]);
  });
  it("> 9: scroll, línea de movimiento reducido y «más» si el payload no trae todas", () => {
    const items = Array.from({ length: 30 }, (_, i) => ref(`b${i}`));
    const m = posterFor({ id: "finished", items, total: 34 }, month, t);
    expect(m.coverGrid).toBe("scroll");
    expect(m.lines).toEqual(['wrapUps.stories.finished.more|{"count":4}']);
    expect(m.reducedMoreLine).toBe('wrapUps.stories.finished.more|{"count":25}');
  });
});

describe("storyDurationMs", () => {
  it("6 s por defecto; scroll suma 1 s por fila extra con tope 15 s", () => {
    expect(storyDurationMs({ layout: "figure", eyebrow: "", lines: [], narratorLine: "" })).toBe(6000);
    const covers = (n: number) => Array.from({ length: n }, (_, i) => ref(`c${i}`));
    expect(storyDurationMs({ layout: "covers", eyebrow: "", lines: [], narratorLine: "", coverGrid: "scroll", covers: covers(15) })).toBe(8000);
    expect(storyDurationMs({ layout: "covers", eyebrow: "", lines: [], narratorLine: "", coverGrid: "scroll", covers: covers(60) })).toBe(15000);
  });
});

describe("posterFor in_progress", () => {
  it("v2: cifra openTotal, línea de tocadas, filas con touched", () => {
    const m = posterFor({ id: "in_progress", openTotal: 3, touchedTotal: 1, items: [
      { ...ref("Reacher"), percent: 13, touched: true },
      { ...ref("Elantris"), percent: null, touched: false },
    ] }, month, t);
    expect(m.layout).toBe("progress");
    expect(m.figure).toEqual({ value: "3", unit: 'wrapUps.stories.in_progress.unit|{"count":3}' });
    expect(m.lines).toEqual(['wrapUps.stories.in_progress.touched|{"count":1}']);
    expect(m.progress!.map((p) => [p.item.title, p.percent, p.touched])).toEqual([["Reacher", 13, true], ["Elantris", null, false]]);
  });
  it("v1 (sin openTotal): cifra = items, sin línea de tocadas", () => {
    const m = posterFor({ id: "in_progress", items: [{ ...ref("A"), percent: null }] }, month, t);
    expect(m.figure!.value).toBe("1");
    expect(m.lines).toEqual([]);
    expect(m.progress![0].touched).toBe(true);
  });
  it("más de 6: muestra 6 y «y N más» sobre openTotal", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ ...ref(`x${i}`), percent: null, touched: true }));
    const m = posterFor({ id: "in_progress", openTotal: 15, touchedTotal: 15, items }, month, t);
    expect(m.progress).toHaveLength(6);
    expect(m.lines).toContain('wrapUps.stories.in_progress.more|{"count":9}');
  });
});

describe("heatLevel", () => {
  it("4 niveles relativos al máximo", () => {
    expect([0, 1, 2, 3, 6].map((v) => heatLevel(v, 6))).toEqual([0, 1, 1, 2, 3]);
    expect(heatLevel(0, 0)).toBe(0);
  });
});

describe("posterFor rhythm (calendario)", () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, active: i === 0 || i === 4 }));
  const r = { id: "rhythm", days, activeDays: 2, bestStreak: 1, favoriteWeekday: 5, favoriteBandStartHour: 0 } as const;
  it("v2: calendario con desfase del 1 (martes = 1), dos mapas y solo la racha como línea", () => {
    const m = posterFor({ ...r, bestStreak: 3, byWeekday: [0, 1, 0, 0, 0, 3, 0], byBand: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }, month, t);
    expect(m.layout).toBe("calendar");
    expect(m.calendar!.offset).toBe(1);
    expect(m.calendar!.days.filter((d) => d.active).map((d) => d.day)).toEqual([1, 5]);
    expect(m.heatmaps).toHaveLength(2);
    expect(m.heatmaps![0].cells.map((c) => c.label).join("")).toBe("LMXJVSD");
    expect(m.heatmaps![0].cells[5]).toEqual({ label: "S", level: 3, peak: true });
    expect(m.heatmaps![1].cells[0].label).toBe("00");
    expect(m.lines).toEqual(['wrapUps.stories.rhythm.streak|{"count":3}']);
  });
  it("v1: calendario sin mapas y las líneas de día y franja de siempre", () => {
    const m = posterFor(r, month, t);
    expect(m.heatmaps).toEqual([]);
    expect(m.lines.some((l) => l.startsWith("wrapUps.stories.rhythm.favoriteDay"))).toBe(true);
    expect(m.lines.some((l) => l.startsWith("wrapUps.stories.rhythm.favoriteBand"))).toBe(true);
  });
});

describe("posterFor together", () => {
  const people: People = { u2: { userId: "u2", username: "ana", displayName: null, avatarUrl: null } };
  it("v2: sin cifra sumada; visionados con compañeros resueltos y clubes", () => {
    const m = posterFor({ id: "together", jointViewings: 1, clubDays: 2,
      viewings: [{ item: ref("Logan"), watchedOn: "2026-09-10", companionIds: ["u2", "u-bloqueado"] }],
      clubs: [{ clubId: "c", name: "Jueves", days: 2 }] }, month, t, people);
    expect(m.layout).toBe("together");
    expect(m.figure).toBeUndefined();
    expect(m.together!.viewings[0].companions.map((c) => c.username)).toEqual(["ana"]);
    expect(m.together!.clubs).toEqual([{ name: "Jueves", value: 'wrapUps.stories.together.clubDaysValue|{"count":2}' }]);
  });
  it("v1: sin cifra sumada, solo las líneas", () => {
    const m = posterFor({ id: "together", jointViewings: 2, clubDays: 2 }, month, t);
    expect(m.figure).toBeUndefined();
    expect(m.lines).toHaveLength(2);
  });
});
```

Importa `heatLevel, storyDurationMs, type People` y `ItemRef`. Borra o adapta los tests
existentes de `posterFor rhythm` que esperan `layout: "strip"` y `strip` para el ritmo (ahora
`"calendar"`; la tira solo queda para `months`), y los de `in_progress`/`together` que esperan
el layout o la cifra antiguos.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wrap-ups/view-models.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

En `view-models.ts`, sustituye `PosterModel` por el de **Interfaces**, añade `Companion`,
`People`, `HeatCell` y, tras `const sum = …`:

```ts
export const STEP_MS = 6000;
const COLS = 3, STATIC_MAX = 9, PROGRESS_MAX = 6;

/** Duración de una story en el reproductor: la rejilla con scroll necesita tiempo para pasar entera. */
export function storyDurationMs(m: PosterModel): number {
  if (m.coverGrid !== "scroll" || !m.covers) return STEP_MS;
  const rows = Math.ceil(m.covers.length / COLS);
  return Math.min(15000, STEP_MS + Math.max(0, rows - 3) * 1000);
}

export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  return r <= 1 / 3 ? 1 : r <= 2 / 3 ? 2 : 3;
}

const pad2 = (h: number) => String(h % 24).padStart(2, "0");

function heatmap(values: number[] | undefined, labels: string[], title: string, summaryOf: (peak: number) => string) {
  if (!values || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const peak = values.indexOf(max);
  return {
    title,
    cells: values.map((v, i) => ({ label: labels[i], level: heatLevel(v, max), peak: i === peak })),
    summary: summaryOf(peak),
  };
}
```

Cambia la firma: `export function posterFor(story: Story, payload: WrapUpPayload, t: T, people: People = {}): PosterModel {`.

Sustituye los `case` de `finished`, `in_progress`, `rhythm` y `together`:

```ts
    case "finished": {
      const covers = story.items;
      const scroll = covers.length > STATIC_MAX;
      const more = (n: number) => t(`${K}.finished.more`, { count: n });
      return make("finished", {
        layout: "covers",
        figure: { value: String(story.total), unit: t(`${K}.finished.unit`, { count: story.total }) },
        covers,
        coverGrid: scroll ? "scroll" : "static",
        lines: story.total > covers.length ? [more(story.total - covers.length)] : [],
        // Con movimiento reducido la rejilla se queda en las 9 primeras: el resto se cuenta.
        reducedMoreLine: scroll ? more(story.total - STATIC_MAX) : undefined,
      });
    }

    case "in_progress": {
      const open = story.openTotal ?? story.items.length;
      const shown = story.items.slice(0, PROGRESS_MAX);
      return make("in_progress", {
        layout: "progress",
        figure: { value: String(open), unit: t(`${K}.in_progress.unit`, { count: open }) },
        progress: shown.map((i) => ({
          item: i,
          percent: i.percent == null ? null : Math.round(i.percent),
          touched: i.touched !== false,
          label: i.percent == null
            ? t(`${K}.in_progress.item`, { title: i.title })
            : t(`${K}.in_progress.itemPercent`, { title: i.title, percent: Math.round(i.percent) }),
        })),
        lines: [
          ...(story.touchedTotal != null ? [t(`${K}.in_progress.touched`, { count: story.touchedTotal })] : []),
          ...(open > shown.length ? [t(`${K}.in_progress.more`, { count: open - shown.length })] : []),
        ],
      });
    }

    case "rhythm": {
      const weekdayName = (i: number) => t(`${K}.rhythm.weekday.${i}`);
      const week = heatmap(story.byWeekday, [..."LMXJVSD"], t(`${K}.rhythm.weekTitle`),
        (p) => t(`${K}.rhythm.weekPeak`, { day: weekdayName(p) }));
      const hours = heatmap(story.byBand, Array.from({ length: 12 }, (_, i) => pad2(i * 2)), t(`${K}.rhythm.hoursTitle`),
        (p) => t(`${K}.rhythm.hoursPeak`, { from: pad2(p * 2), to: pad2(p * 2 + 2) }));
      const lines: string[] = [];
      if (story.bestStreak >= 2) lines.push(t(`${K}.rhythm.streak`, { count: story.bestStreak }));
      // Sin mapa (payload v1 o sin datos), el favorito vuelve como línea.
      if (!week && story.favoriteWeekday != null) lines.push(t(`${K}.rhythm.favoriteDay`, { day: weekdayName(story.favoriteWeekday) }));
      if (!hours && story.favoriteBandStartHour != null) {
        lines.push(t(`${K}.rhythm.favoriteBand`, { from: pad2(story.favoriteBandStartHour), to: pad2(story.favoriteBandStartHour + 2) }));
      }
      const active = story.days.filter((d) => d.active).map((d) => day(d.date));
      return make("rhythm", {
        layout: "calendar",
        figure: { value: String(story.activeDays), unit: t(`${K}.rhythm.unit`, { count: story.activeDays }) },
        // El anual no trae días: sin calendario, solo los mapas.
        calendar: story.days.length === 0 ? undefined : {
          offset: (utc(story.days[0].date).getUTCDay() + 6) % 7,
          days: story.days.map((d) => ({ day: day(d.date), active: d.active })),
          summary: t(`${K}.rhythm.calendarLabel`, { days: active.join(", ") }),
        },
        heatmaps: [week, hours].filter((h): h is NonNullable<typeof h> => h !== null),
        lines,
      });
    }

    case "together": {
      const lines: string[] = [];
      if (!story.viewings && !story.clubs) {
        // Payload v1: solo las líneas, sin la cifra sumada (mezclaba unidades).
        if (story.jointViewings > 0) lines.push(t(`${K}.together.jointViewings`, { count: story.jointViewings }));
        if (story.clubDays > 0) lines.push(t(`${K}.together.clubDays`, { count: story.clubDays }));
        return make("together", { layout: "figure", lines });
      }
      const viewings = story.viewings ?? [];
      if (viewings.length > 4) lines.push(t(`${K}.together.more`, { count: viewings.length - 4 }));
      return make("together", {
        layout: "together",
        together: {
          viewingsTitle: t(`${K}.together.viewingsTitle`),
          clubsTitle: t(`${K}.together.clubsTitle`),
          viewings: viewings.slice(0, 4).map((v) => {
            // Los ids sin resolver (bloqueados, cuentas borradas) no se pintan.
            const resolved = v.companionIds.map((id) => people[id]).filter((c): c is Companion => !!c);
            return { item: v.item, companions: resolved.slice(0, 3), extra: Math.max(0, resolved.length - 3) };
          }),
          clubs: (story.clubs ?? []).slice(0, 3).map((c) => ({ name: c.name, value: t(`${K}.together.clubDaysValue`, { count: c.days }) })),
        },
        lines,
      });
    }
```

`narrator-copy.ts:18`: `case "in_progress": return { count: story.openTotal ?? story.items.length };`

`messages/es.json`, sustituye los tres bloques:

```json
      "in_progress": {
        "title": "En marcha",
        "unit": "{count, plural, one {obra a medias} other {obras a medias}}",
        "item": "{title}",
        "itemPercent": "{title} · {percent} %",
        "touched": "{count, plural, =0 {Ninguna avanzó este mes} one {# avanzó este mes} other {# avanzaron este mes}}",
        "idle": "Sin avances este mes",
        "more": "y {count} más"
      },
```

En `rhythm`, conserva las claves existentes y añade:

```json
        "calendarLabel": "Días con actividad: {days}",
        "weekTitle": "Por día de la semana",
        "weekPeak": "Más activo el {day}",
        "hoursTitle": "Por hora",
        "hoursPeak": "Más activo de {from}:00 a {to}:00",
```

En `together`, conserva `title`, `jointViewings`, `clubDays`; borra `unit` y añade:

```json
        "viewingsTitle": "Visto en compañía",
        "clubsTitle": "En tus clubes",
        "clubDaysValue": "{count, plural, one {# día} other {# días}}",
        "withPeople": "con {names}",
        "more": "y {count} más"
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/wrap-ups/ src/components/wrap-ups/`
Expected: los de `src/lib/wrap-ups/` en PASS. Los de `src/components/wrap-ups/` que fallen por el
layout del ritmo o por `together.unit` se arreglan en Task 6 (anótalos). Después: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrap-ups/view-models.ts src/lib/wrap-ups/view-models.test.ts src/lib/wrap-ups/narrator-copy.ts messages/es.json
git commit -m "feat(wrap-ups): modelos de Terminado, En marcha, Ritmo y En compañía con compatibilidad v1"
```

---

### Task 6: Bloques del póster (UI)

**Files:**
- Create: `src/components/wrap-ups/poster-blocks.tsx`
- Modify: `src/components/wrap-ups/poster.tsx`
- Modify: `src/components/wrap-ups/poster.module.css`
- Test: `src/components/wrap-ups/poster.test.tsx`

**Interfaces:**
- Consumes: `PosterModel`, `storyDurationMs` (Task 5); `UserAvatar` (`src/components/social/user-avatar.tsx`, props `name`, `avatarUrl`, `size`).
- Produces: `Poster` acepta `paused?: boolean`. `poster-blocks.tsx` exporta
  `CoverGrid({ model })`, `ProgressList({ rows })`, `RhythmCharts({ model })`, `TogetherBlock({ data })`.

- [ ] **Step 1: Write the failing tests**

En `poster.test.tsx` (usa `renderPoster`; añade un parámetro opcional `paused` que pasa a `Poster`):

```tsx
const ref = (id: string) => ({ type: "book" as const, id, title: `Libro ${id}`, coverUrl: null, times: 1 });
const month = { ...payload, kind: "month" as const, periodStart: "2026-09-01", periodEnd: "2026-09-30" };

describe("bloques v2", () => {
  it("Terminado con scroll: todos los títulos en la lista, copia decorativa oculta y pausa", () => {
    const items = Array.from({ length: 12 }, (_, i) => ref(String(i)));
    const m = posterFor({ id: "finished", items, total: 12 }, month, t);
    const { container } = renderPoster(m, false, true);
    const lists = container.querySelectorAll("ul[data-grid]");
    expect(lists[0].getAttribute("data-grid")).toBe("scroll");
    expect(within(lists[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(12);
    // La segunda copia (bucle) no se lee.
    expect(lists[1].getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("article")!.getAttribute("data-paused")).toBe("true");
  });

  it("En marcha: una fila por obra con barra y etiqueta de sin avances", () => {
    const m = posterFor({ id: "in_progress", openTotal: 2, touchedTotal: 1, items: [
      { ...ref("a"), percent: 40, touched: true }, { ...ref("b"), percent: null, touched: false },
    ] }, month, t);
    renderPoster(m);
    expect(screen.getByRole("progressbar", { name: /Libro a/ }).getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Sin avances este mes")).toBeTruthy();
  });

  it("Ritmo: calendario y mapas con resumen accesible", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, active: i < 3 }));
    const m = posterFor({ id: "rhythm", days, activeDays: 3, bestStreak: 3, favoriteWeekday: 5, favoriteBandStartHour: 0,
      byWeekday: [0, 1, 0, 0, 0, 3, 0], byBand: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }, month, t);
    renderPoster(m);
    expect(screen.getByRole("img", { name: "Días con actividad: 1, 2, 3" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Más activo el sábado" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Más activo de 00:00 a 02:00" })).toBeTruthy();
  });

  it("En compañía: título de la obra, compañeros y clubes", () => {
    const m = posterFor({ id: "together", jointViewings: 1, clubDays: 2,
      viewings: [{ item: ref("L"), watchedOn: "2026-09-10", companionIds: ["u2"] }],
      clubs: [{ clubId: "c", name: "Club de los jueves", days: 2 }] }, month, t,
      { u2: { userId: "u2", username: "ana", displayName: "Ana", avatarUrl: null } });
    renderPoster(m);
    expect(screen.getByText("Libro L")).toBeTruthy();
    expect(screen.getByText("con Ana")).toBeTruthy();
    expect(screen.getByText("Club de los jueves")).toBeTruthy();
    expect(screen.getByText("2 días")).toBeTruthy();
  });
});
```

Firma del helper: `function renderPoster(model: PosterModel, showPet = false, paused = false)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/wrap-ups/poster.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `poster-blocks.tsx`**

```tsx
// Bloques de los layouts del wrap-up v2 (spec 2026-10-13 §3). Sin estado: el texto
// llega escrito en el PosterModel. Lo decorativo (copia del bucle, casillas) va
// fuera del árbol accesible; cada gráfica se lee por su resumen.
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import { storyDurationMs } from "@/lib/wrap-ups/view-models";
import { PosterCover } from "./poster-cover";
import styles from "./poster.module.css";

export function CoverGrid({ model }: { model: PosterModel }) {
  const covers = model.covers ?? [];
  const mode = model.coverGrid ?? "static";
  const big = covers.length <= 4;
  const list = (hidden: boolean) => (
    <ul data-grid={mode} aria-hidden={hidden || undefined} className={styles.coverGrid} data-big={big}>
      {covers.map((c) => <PosterCover key={`${c.type}-${c.id}`} item={c} />)}
    </ul>
  );
  if (mode === "static") return list(false);
  return (
    <div className={styles.coverScroller} style={{ "--scroll-ms": `${storyDurationMs(model)}ms` } as CSSProperties}>
      <div className={styles.coverTrack}>
        {list(false)}
        {list(true)}
      </div>
      {model.reducedMoreLine && <p className={`${styles.plate} ${styles.reducedOnly}`}>{model.reducedMoreLine}</p>}
    </div>
  );
}

export function ProgressList({ rows }: { rows: NonNullable<PosterModel["progress"]> }) {
  const t = useTranslations("wrapUps.stories.in_progress");
  return (
    <ul className={`${styles.plate} ${styles.progressList}`} data-big={rows.length <= 2}>
      {rows.map((r) => (
        <li key={`${r.item.type}-${r.item.id}`} className={styles.progressRow} data-touched={r.touched}>
          <ul className={styles.progressCover} aria-hidden="true"><PosterCover item={r.item} /></ul>
          <div className={styles.progressText}>
            <p className={styles.progressTitle}>{r.label}</p>
            {r.percent != null && (
              <div role="progressbar" aria-label={r.item.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent}
                className={styles.progressBar}>
                <span style={{ width: `${r.percent}%` }} />
              </div>
            )}
            {!r.touched && <p className={styles.progressIdle}>{t("idle")}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RhythmCharts({ model }: { model: PosterModel }) {
  const { calendar, heatmaps = [] } = model;
  return (
    <>
      {calendar && (
        <div role="img" aria-label={calendar.summary} className={`${styles.plate} ${styles.calendar}`}>
          {[..."LMXJVSD"].map((d, i) => <span key={`h${i}`} className={styles.calendarHead} aria-hidden="true">{d}</span>)}
          {Array.from({ length: calendar.offset }, (_, i) => <span key={`e${i}`} aria-hidden="true" />)}
          {calendar.days.map((d) => (
            <span key={d.day} className={styles.calendarDay} data-active={d.active} aria-hidden="true">{d.day}</span>
          ))}
        </div>
      )}
      {heatmaps.map((h) => (
        <div key={h.title} className={`${styles.plate} ${styles.heatmap}`}>
          <p className={styles.heatTitle} aria-hidden="true">{h.title}</p>
          <div role="img" aria-label={h.summary} className={styles.heatRow} style={{ "--cells": h.cells.length } as CSSProperties}>
            {h.cells.map((c, i) => (
              <span key={i} className={styles.heatCell} data-level={c.level} data-peak={c.peak} aria-hidden="true">
                <span className={styles.heatMark} />
                <span className={styles.heatLabel}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function TogetherBlock({ data }: { data: NonNullable<PosterModel["together"]> }) {
  const t = useTranslations("wrapUps.stories.together");
  const single = data.viewings.length === 0 || data.clubs.length === 0;
  return (
    <div className={styles.together} data-single={single}>
      {data.viewings.length > 0 && (
        <section className={`${styles.plate} ${styles.togetherSection}`}>
          <h3 className={styles.togetherTitle}>{data.viewingsTitle}</h3>
          <ul className={styles.togetherList}>
            {data.viewings.map((v) => (
              <li key={`${v.item.type}-${v.item.id}`} className={styles.togetherRow}>
                <ul className={styles.progressCover} aria-hidden="true"><PosterCover item={v.item} /></ul>
                <div className={styles.progressText}>
                  <p className={styles.progressTitle}>{v.item.title}</p>
                  {v.companions.length > 0 && (
                    <div className={styles.togetherPeople}>
                      <span className={styles.avatars} aria-hidden="true">
                        {v.companions.map((c) => <UserAvatar key={c.userId} name={c.displayName ?? c.username} avatarUrl={c.avatarUrl} size={28} />)}
                        {v.extra > 0 && <span className={styles.avatarMore}>+{v.extra}</span>}
                      </span>
                      <p>{t("withPeople", { names: v.companions.map((c) => c.displayName ?? c.username).join(", ") })}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.clubs.length > 0 && (
        <section className={`${styles.plate} ${styles.togetherSection}`}>
          <h3 className={styles.togetherTitle}>{data.clubsTitle}</h3>
          <ul className={styles.togetherList}>
            {data.clubs.map((c) => (
              <li key={c.name} className={styles.clubRow}>
                <span className={styles.clubName}>{c.name}</span>
                <span className={styles.clubValue}>{c.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

Nota: `PosterCover` renderiza un `<li>`; por eso va envuelto en un `<ul aria-hidden>` en las filas.

- [ ] **Step 4: Wire `poster.tsx`**

- Import: `import { CoverGrid, ProgressList, RhythmCharts, TogetherBlock } from "./poster-blocks";`
- `PosterProps` gana `paused?: boolean`; el `<article>` gana `data-paused={paused ? "true" : undefined}`.
- En `LayoutBody`, `case "covers":` pasa a:

```tsx
    case "covers":
      return (
        <>
          {figure && <Figure figure={figure} />}
          {model.coverGrid
            ? <CoverGrid model={model} />
            : covers && covers.length > 0 && <Covers covers={covers} />}
        </>
      );
    case "closing":
      return (
        <>
          {figure && <Figure figure={figure} />}
          {covers && covers.length > 0 && <Covers covers={covers} />}
        </>
      );
    case "progress":
      return (
        <>
          {figure && <Figure figure={figure} />}
          {model.progress && model.progress.length > 0 && <ProgressList rows={model.progress} />}
        </>
      );
    case "calendar":
      return (
        <>
          {figure && <Figure figure={figure} />}
          <RhythmCharts model={model} />
        </>
      );
    case "together":
      return model.together ? <TogetherBlock data={model.together} /> : null;
```

- [ ] **Step 5: CSS**

Añade a `poster.module.css` antes de «Ardilla propia»:

```css
/* ---- Rejilla de portadas (Terminado) ---- */
.coverGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 12px;
  margin: 0;
  padding: 6px 8px 12px 2px;
  list-style: none;
}
.coverGrid[data-big="true"] { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 12%; }
.coverGrid .coverCard { flex: none; width: 100%; }
/* El scroller ocupa el alto libre; el fundido es una máscara, no un degradado de color
   (el campo cambia por paleta). */
.coverScroller {
  position: relative;
  flex: 1 1 0;
  min-height: 240px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 86%, transparent 100%);
}
.coverTrack { animation: coverLoop var(--scroll-ms) linear infinite; }
.poster[data-paused="true"] .coverTrack { animation-play-state: paused; }
@keyframes coverLoop {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}
.reducedOnly { display: none; }

/* ---- En marcha ---- */
.progressList { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 12px 14px; list-style: none; }
.progressRow { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 12px; }
.progressRow[data-touched="false"] { opacity: 0.6; }
.progressList[data-big="true"] .progressRow { grid-template-columns: 1fr; justify-items: center; text-align: center; }
.progressList[data-big="true"] .progressCover { width: 50%; }
.progressCover { margin: 0; padding: 0; list-style: none; }
.progressCover .coverCard { width: 100%; transform: none; }
.progressText { display: flex; min-width: 0; width: 100%; flex-direction: column; gap: 6px; }
.progressTitle { margin: 0; font-size: 1rem; font-weight: 700; line-height: 1.25; overflow-wrap: break-word; }
.progressIdle { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.progressBar { height: 10px; border: 2px solid var(--ink); background: var(--paper); }
.progressBar > span { display: block; height: 100%; background: var(--ink); }

/* ---- Ritmo: calendario y mapas ---- */
.calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  padding: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}
.calendarHead { font-family: var(--font-pixel), ui-monospace, monospace; font-weight: 400; font-synthesis: none; }
.calendarDay {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid var(--ink);
}
.calendarDay[data-active="true"] { background: var(--ink); color: var(--paper); }
.heatmap { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
.heatTitle { margin: 0; font-size: 0.8125rem; font-weight: 700; }
.heatRow { display: grid; grid-template-columns: repeat(var(--cells), minmax(0, 1fr)); gap: 4px; }
.heatCell { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 0.6875rem; font-weight: 700; }
.heatMark { width: 100%; aspect-ratio: 1; border: 2px solid var(--ink); }
.heatCell[data-level="1"] .heatMark { background: rgb(28 23 20 / 0.25); }
.heatCell[data-level="2"] .heatMark { background: rgb(28 23 20 / 0.55); }
.heatCell[data-level="3"] .heatMark { background: var(--ink); }
/* El máximo no depende solo del tono: lleva la etiqueta resaltada. */
.heatCell[data-peak="true"] .heatLabel { background: var(--ink); color: var(--paper); padding: 0 3px; }

/* ---- En compañía ---- */
.together { display: flex; flex-direction: column; gap: 18px; }
.togetherSection { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
.togetherTitle { margin: 0; font-family: var(--font-pixel), ui-monospace, monospace; font-size: 1rem; font-weight: 400; font-synthesis: none; }
.togetherList { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.togetherRow { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 12px; }
.together[data-single="true"] .togetherRow { grid-template-columns: 76px 1fr; }
.togetherPeople { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; font-weight: 600; }
.togetherPeople p { margin: 0; }
.avatars { display: flex; }
.avatars > * + * { margin-left: -8px; }
.avatarMore { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 999px; background: var(--ink); color: var(--paper); font-size: 0.6875rem; font-weight: 700; }
.clubRow { display: flex; justify-content: space-between; gap: 12px; font-weight: 700; }
.clubName { overflow-wrap: break-word; min-width: 0; }
.clubValue { flex: none; font-weight: 500; }
```

Y dentro del `@media (prefers-reduced-motion: reduce)` existente:

```css
  .coverTrack { animation: none; }
  .coverTrack > [aria-hidden="true"] { display: none; }
  .coverTrack .coverCard:nth-child(n + 10) { display: none; }
  .coverScroller { mask-image: none; }
  .reducedOnly { display: block; }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/wrap-ups/`
Expected: PASS. Adapta los tests existentes del póster que esperaban la tira del ritmo o
«planes compartidos» (ya no existen).

- [ ] **Step 7: Commit**

```bash
git add src/components/wrap-ups/poster-blocks.tsx src/components/wrap-ups/poster.tsx src/components/wrap-ups/poster.module.css src/components/wrap-ups/poster.test.tsx
git commit -m "feat(wrap-ups): rejilla con scroll, lista de En marcha, calendario y mapas de calor, bloque de compañía"
```

---

### Task 7: Compañeros resueltos al pintar

**Files:**
- Create: `src/lib/wrap-ups/companions.ts`
- Test: `src/lib/wrap-ups/companions.test.ts`
- Modify: `src/app/wrap/[kind]/page.tsx:41-43`
- Modify: `src/components/wrap-ups/wrap-up-entry.tsx:93-95`

**Interfaces:**
- Consumes: `People`, `Companion`, `posterFor(..., people)` (Task 5); `filterUnblockedUserIds(supabase, ids)` (`src/lib/social/block-state.ts`).
- Produces: `export function companionIdsOf(payloads: WrapUpPayload[]): string[]`,
  `export async function resolveCompanionsWith(supabase, ids: string[]): Promise<People>`,
  `export async function resolveCompanions(payloads: WrapUpPayload[]): Promise<People>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/wrap-ups/companions.test.ts
import { describe, expect, it } from "vitest";
import { companionIdsOf, resolveCompanionsWith } from "./companions";
import type { WrapUpPayload } from "./types";

const payload = (stories: unknown[]) => ({ stories } as unknown as WrapUpPayload);

describe("companionIdsOf", () => {
  it("ids únicos de los visionados de todas las crónicas", () => {
    const p = payload([{ id: "together", jointViewings: 2, clubDays: 0, viewings: [
      { item: {}, watchedOn: "x", companionIds: ["a", "b"] }, { item: {}, watchedOn: "y", companionIds: ["b"] },
    ] }]);
    expect(companionIdsOf([p, payload([{ id: "cover" }])])).toEqual(["a", "b"]);
  });
});

describe("resolveCompanionsWith", () => {
  it("descarta los bloqueados y mapea identidad", async () => {
    const supabase = {
      rpc: () => Promise.resolve({ data: ["a"], error: null }),
      from: () => ({ select: () => ({ in: () => Promise.resolve({
        data: [{ user_id: "a", username: "ana", display_name: "Ana", avatar_url: null }], error: null }) }) }),
    };
    expect(await resolveCompanionsWith(supabase as never, ["a", "b"])).toEqual({
      a: { userId: "a", username: "ana", displayName: "Ana", avatarUrl: null },
    });
  });
  it("sin ids no consulta", async () => {
    expect(await resolveCompanionsWith({} as never, [])).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/lib/wrap-ups/companions.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```ts
// src/lib/wrap-ups/companions.ts
// Compañeros de «En compañía» (spec 2026-10-13 §5). El payload solo guarda ids;
// nombre y avatar se resuelven al pintar con el cliente DE LA PETICIÓN, quitando
// a quien tenga un bloqueo con el que mira. Sin `use cache`: depende de quién
// mira (regla #437).
import { createClient } from "@/lib/supabase/server";
import { filterUnblockedUserIds } from "@/lib/social/block-state";
import type { WrapUpPayload } from "./types";
import type { People } from "./view-models";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function companionIdsOf(payloads: WrapUpPayload[]): string[] {
  const ids = new Set<string>();
  for (const p of payloads) {
    for (const s of p.stories ?? []) {
      if (s.id !== "together") continue;
      for (const v of s.viewings ?? []) for (const id of v.companionIds) ids.add(id);
    }
  }
  return [...ids];
}

export async function resolveCompanionsWith(supabase: Supabase, ids: string[]): Promise<People> {
  if (ids.length === 0) return {};
  const allowed = await filterUnblockedUserIds(supabase, ids);
  if (allowed.length === 0) return {};
  const { data, error } = await supabase.from("profile_identities")
    .select("user_id, username, display_name, avatar_url").in("user_id", allowed);
  if (error) throw error;
  const out: People = {};
  for (const r of (data ?? []) as { user_id: string; username: string; display_name: string | null; avatar_url: string | null }[]) {
    out[r.user_id] = { userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url };
  }
  return out;
}

/** Lo que piden las dos entradas (home y /wrap): un fallo aquí no tumba la crónica, solo quita caras. */
export async function resolveCompanions(payloads: WrapUpPayload[]): Promise<People> {
  try {
    return await resolveCompanionsWith(await createClient(), companionIdsOf(payloads));
  } catch (e) {
    console.error("resolveCompanions", e instanceof Error ? e.message : "error");
    return {};
  }
}
```

`src/app/wrap/[kind]/page.tsx`, en `WrapContent`:

```ts
  const people = await resolveCompanions([wrapUp.payload]);
  const models = wrapUp.payload.stories.map((s) => posterFor(s, wrapUp.payload, t as unknown as T, people));
```

(import `resolveCompanions` de `@/lib/wrap-ups/companions`).

`wrap-up-entry.tsx`, antes de `const available = …`:

```ts
  const people = await resolveCompanions(all.map((w) => w.payload));
```

y en el `map`: `posterFor(story, entry.payload, strings as unknown as T, people)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/wrap-ups/companions.test.ts src/components/wrap-ups/`
Expected: PASS. Si `home-wrap-up.test.tsx` o `wrap-up-entry` mockean `@/lib/supabase/server`,
añade `vi.mock("@/lib/wrap-ups/companions", () => ({ resolveCompanions: async () => ({}) }))`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrap-ups/companions.ts src/lib/wrap-ups/companions.test.ts "src/app/wrap/[kind]/page.tsx" src/components/wrap-ups/wrap-up-entry.tsx
git commit -m "feat(wrap-ups): compañeros de En compañía resueltos al pintar, sin bloqueados"
```

---

### Task 8: Duración por story en el reproductor

**Files:**
- Modify: `src/components/wrap-ups/story-player.tsx:16,32,52,121,127-130`
- Test: `src/components/wrap-ups/story-player.test.tsx`

**Interfaces:**
- Consumes: `storyDurationMs`, `STEP_MS` (Task 5); `Poster` `paused` (Task 6).

- [ ] **Step 1: Write the failing test**

Mira cómo monta el reproductor el test existente de la línea ~45 (`vi.advanceTimersByTime(6000)`) y
añade un caso con el mismo montaje, sustituyendo el segundo modelo por uno de Terminado con scroll:

```tsx
  it("Terminado con scroll dura más de 6 s (1 s por fila extra)", () => {
    const covers = Array.from({ length: 15 }, (_, i) => ({ type: "book" as const, id: `c${i}`, title: `c${i}`, coverUrl: null, times: 1 }));
    const long: PosterModel = { layout: "covers", eyebrow: "x", lines: [], narratorLine: "", covers, coverGrid: "scroll" };
    const ms = [models[0], long, models[models.length - 1]];
    mountPlayer(ms); // usa el helper de montaje del fichero (o el render inline existente con `models: ms`)
    act(() => { vi.advanceTimersByTime(6000); });  // pasa la primera (6 s)
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText("2/3")).toBeTruthy();   // aún en la larga (8 s)
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("3/3")).toBeTruthy();
  });
```

Si el fichero no tiene `mountPlayer`, extrae el render del test existente a esa función en el
mismo paso (recibe `models` y devuelve el resultado de `render`), y úsala en ambos tests. El
`wrapUp.payload.stories` del montaje debe tener tantas stories como modelos: usa
`stories: ms.map(() => ({ id: "cover" }))` salvo el último, `{ id: "closing" }`.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/components/wrap-ups/story-player.test.tsx` → FAIL (avanza a los 6 s).

- [ ] **Step 3: Implement**

En `story-player.tsx`:

```ts
import { STEP_MS, storyDurationMs, type PosterModel } from "@/lib/wrap-ups/view-models";
```

(borra `const STEP_MS = 6000;` y el import de tipo duplicado). Tras `const model = models[index];`:

```ts
  const stepMs = model ? storyDurationMs(model) : STEP_MS;
```

- `const remaining = useRef(STEP_MS);` se queda (valor inicial).
- `useEffect(() => { remaining.current = stepMs; }, [index, stepMs]);` y su comentario pasa a
  «Story nueva → su duración completa».
- En la barra: `animationDuration: \`${stepMs}ms\`` solo para el segmento `running`.
- En `<Poster …>` añade `paused={paused}`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/wrap-ups/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wrap-ups/story-player.tsx src/components/wrap-ups/story-player.test.tsx
git commit -m "feat(wrap-ups): cada story marca su duración; la rejilla con scroll dura lo que tarda en pasar"
```

---

### Task 9: Verificación, docs y cierre

**Files:**
- Modify: `docs/requirements/decisiones.md` (entrada nueva al final)
- Modify: `docs/requirements/backlog.md` (si tiene la línea de wrap-ups, añade la revisión)

- [ ] **Step 1: Suite completa y tipos**

Run: `npx tsc --noEmit; npx vitest run`
Expected: 0 errores de tipos; todos los tests en PASS (pega el resumen en la PR).

- [ ] **Step 2: Verificación en navegador (375 px)**

Arranca `npm run dev` a mano (desde un worktree, `.claude/launch.json` lanza el `dev.cmd` del
repo padre; ver memoria del proyecto) con `.env.local` copiado al worktree. Con una cuenta de
dev con actividad en septiembre 2026, genera el wrap-up mensual con «Actualizar» en la crónica
y abre `/wrap/month`. Comprueba a 375×812, con `prefers-reduced-motion` normal y reducido:

| Story | Qué mirar |
|---|---|
| Terminado | Con > 9 obras sube en bucle con fundido; pulsación larga lo pausa; con reduced motion, 9 quietas y «y N más» |
| En marcha | Cifra = todas las abiertas; tocadas primero; las no tocadas atenuadas con «Sin avances este mes»; % de serie |
| Ritmo | Calendario empieza en el día correcto (1 sep 2026 = martes); dos mapas; máximo etiquetado |
| En compañía | Portada + título + avatares; clubes con días; sin cifra sumada |

Abre también un wrap-up `v: 1` (cualquiera generado antes de este cambio, o edita a mano el
`payload` de una fila de dev quitando `openTotal`/`byWeekday`/`viewings`) y confirma que se pinta.
Captura las cuatro pantallas para la PR. Para el servidor al terminar.

- [ ] **Step 3: Decisión**

Añade al final de `docs/requirements/decisiones.md` (sigue el formato de las entradas previas):

> **2026-10-13 · Wrap-up: «En marcha» es lo abierto al cierre, y los compañeros se resuelven al
> pintar.** «En marcha» pasa de «pases abiertos tocados en la ventana» a «abiertos el último día
> de la ventana» (incluye los terminados después del cierre; excluye los abandonados, que no
> guardan fecha), con las tocadas destacadas. Motivo: un usuario con 3 obras a medias veía 1 y
> lo leyó como fallo. En «En compañía» el payload guarda solo ids de compañeros; nombre y avatar
> se resuelven con el cliente de la petición filtrando bloqueos, sin `use cache` (#437), para no
> congelar datos de terceros. Spec: `docs/superpowers/specs/2026-10-13-wrap-up-mensual-revision-visual-design.md`.

- [ ] **Step 4: Commit y PR**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs: decisión de En marcha al cierre y compañeros resueltos al pintar"
```

PR contra `main` con: resumen por story, capturas, resultado de tests, la respuesta escrita a la
regla #437 para `resolveCompanions` (no hay `use cache`: depende de quién mira) y `Closes #1512`.
