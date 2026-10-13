# Entre nosotros · atlas · F3 (Tiempo, Islas y retirada de Gustos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Un implementador cada vez** en este árbol.

**Goal:** Añadir las lentes **Tiempo** (spec §4.3) e **Islas** (spec §4.4, con el selector Tipo · Género · Autor/Director). Las dos necesitan que una misma obra aparezca varias veces, unidas por un hilo. Al final, retirar **Gustos** de la interfaz y su componente.

**Architecture:** Las maquetaciones son puras, `tiempo.ts` e `islands.ts`. La escena (`scene.ts`) pasa a tener **sprites por aparición**: el id es la clave de la obra para la primera aparición y `clave@persona` o `clave#isla` para las demás. También declara los **hilos** que las unen. El motor crea las apariciones extra desde la posición de la principal y, al salir de la lente, las devuelve a ella mientras se desvanecen. Cada lente tiene su pintor (`paint-tiempo.ts`, `paint-islas.ts`) y los hilos se pintan con un módulo común (`paint-links.ts`). La lente y el modo de Islas viven en el explorer, como las caras.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, CSS Modules, Canvas 2D, Vitest y Playwright.

**Spec:** [`../specs/2026-10-13-entre-nosotros-atlas-design.md`](../specs/2026-10-13-entre-nosotros-atlas-design.md) §4.3, §4.4 y §10. Prototipo: `../specs/assets/entre-nosotros-atlas-prototipo.html` (`laneY`, `yearX`, `timeExt`, el bloque `lens==='tipo'` y `drawTiempoBg`/`drawTipoBg`). Planes anteriores: F1 y F2 en esta carpeta.

## Global Constraints

- Sin tablas, columnas, RLS ni migraciones. Sin `use cache` (regla #437). Strings en `messages/es.json` bajo `comparisons`.
- **Tiempo:**
  - Una vía horizontal por cara activa, separadas 230 unidades de mundo. Eje X en años, a 270 unidades por año.
  - El rango se ajusta a las fechas dibujadas y se redondea a años completos.
  - Cada obra aparece una vez por dueño activo con fecha, en su vía y en su fecha, dispersa ±75 en vertical de forma determinista. Las apariciones se unen con un hilo bézier.
  - Lo que no tiene fecha no se dibuja. Resumen: «Llegaste tú primero a {x} de {n}…», contando solo compartidas con fecha en todos sus dueños activos, más «({k} sin fecha)» si las hay. Sin Tú activa: «Las vías de {nombres}».
- **Islas:**
  - El modo **Tipo** tiene tres islas (libros, películas, series) en ese orden, solo las que no están vacías.
  - Los modos **Género** y **Autor/Director** dibujan las **10** categorías con más obras en común (desempate: compartidas por varias, luego total, luego nombre) y el resto en «Otros».
  - En Autor/Director, los libros cuentan por autor y las películas por director; las series van a «Otros».
  - Una obra con varias categorías dibujadas aparece en cada una, unidas por un hilo. Una obra sin ninguna categoría dibujada va a «Otros».
  - Orden en espiral (paso 11): primero lo común a todas las activas, luego lo compartido por varias activas y después el resto. Un aro dorado discontinuo rodea el núcleo común.
  - Sobre cada isla van el título, «{n} en común» y una tira con la **media** de cada cara activa con **3 o más** obras con nota en esa isla (regla de Gustos).
  - Si el formato no es «Todos», el modo Tipo no se ofrece y la lente pasa a Género.
  - Resumen: «Donde más os parecéis: {categoría}, con {n} en común».
  - **«En común» significa siempre «de todas las caras activas»**, igual que en Quién.
- Solo entran en Tiempo e Islas las obras que tocan a alguna cara activa. El resto se desvanece en su sitio de Quién, como en Opinión.
- Quién y Opinión no cambian de comportamiento. Los umbrales del motor siguen igual: portadas `k > 1.1`, títulos `k > 3.2`, interpolación 0.11/0.14/0.16, `prefers-reduced-motion` sin vuelos.
- Al retirar Gustos, el explorer conserva `SessionBoundary`, la máquina de carga y los grupos. El reducer (`state.ts`) **no** se limpia aquí: es de F4.
- Node 22: cada comando de PowerShell empieza por `fnm env | Out-String | Invoke-Expression; fnm use 22;` en la misma línea. Commits con `-m "…" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Sin `git stash` a secas. Sin BOM.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/comparisons/atlas/tiempo.ts` (nuevo) | `yearOf`, `laneY`, `layoutTiempo`, `summarizeTiempo` |
| `src/lib/comparisons/atlas/islands.ts` (nuevo) | `categoriesOf`, `layoutIslands`, `summarizeIslands` |
| `src/lib/comparisons/atlas/scene.ts` (mod) | Sprites por aparición, `links`, lentes `tiempo` e `islas` |
| `src/components/comparisons/atlas/atlas-engine.ts` (mod) | Apariciones extra, hilos, pintores nuevos, sonda por obra |
| `src/components/comparisons/atlas/paint-links.ts` (nuevo) | Hilos entre apariciones |
| `src/components/comparisons/atlas/paint-tiempo.ts` (nuevo) | Rejilla de años, vías y avatares |
| `src/components/comparisons/atlas/paint-islas.ts` (nuevo) | Discos, títulos, núcleo común y tira de medias |
| `src/components/comparisons/atlas/atlas-view.tsx` (+ `atlas-summary-message.ts`) (mod) | Cuatro lentes, modo de Islas, resúmenes y mini-ficha con años |
| `src/components/comparisons/explorer.tsx` (mod) | Estado `islandMode`; sin Gustos |
| `src/components/comparisons/tastes.*` (borrar) | Gustos |
| `messages/es.json` (mod) | Claves nuevas; fuera las que solo usaba Gustos |
| `e2e/entre-nosotros-atlas.spec.ts`, `e2e/entre-nosotros.spec.ts` (mod) | E2E de las lentes nuevas; adaptar lo que usaba Gustos |

---

### Task 1: Tiempo puro

**Files:** Create `src/lib/comparisons/atlas/tiempo.ts`; Test `src/lib/comparisons/atlas/tiempo.test.ts`

**Interfaces:**
- Consumes: `AtlasPerson`, `AtlasWork`, `Point` y `Extent`; `jitter` (`opinion.ts`).
- Produces:
  - `LANE_GAP = 230` y `YEAR_STEP = 270`.
  - `yearOf(date: string): number` (año + fracción a mitad del día).
  - `laneY(index, count): number`.
  - `type TiempoInstance = Point & { key: WorkKey; userId: string; year: number }`.
  - `type TiempoLayout = { lanes: { userId: string; y: number }[]; instances: TiempoInstance[]; startYear: number; endYear: number; extent: Extent }`.
  - `layoutTiempo(people, works, active): TiempoLayout`.
  - `type TiempoSummary = { kind: 'first'; first: number; total: number; undated: number } | { kind: 'lanes'; names: string[] }`.
  - `summarizeTiempo(people, works, active): TiempoSummary`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { LANE_GAP, YEAR_STEP, laneY, layoutTiempo, summarizeTiempo, yearOf } from './tiempo';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
const work = (key: string, dates: Record<string, string | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(dates).map(([userId, date]) => ({ userId, rating: null, date })) });
const works = [
  work('book:1', { me: '2021-03-01', b: '2023-06-01' }),   // me first
  work('book:2', { me: '2024-01-10', b: '2022-12-31' }),   // b first
  work('book:3', { me: '2022-05-05', b: null }),           // shared, undated for b
  work('book:4', { c: '2019-07-07' }),                     // only c
  work('book:5', { me: null }),                            // no date at all
];

describe('yearOf / laneY', () => {
  it('fracción de año a mitad del día', () => {
    expect(yearOf('2024-01-01')).toBeCloseTo(2024 + 0.5 / 366, 6);
    expect(Math.floor(yearOf('2023-12-31'))).toBe(2023);
  });
  it('vías centradas', () => {
    expect([0, 1, 2].map(i => laneY(i, 3))).toEqual([-LANE_GAP, 0, LANE_GAP]);
    expect(laneY(0, 1)).toBe(0);
  });
});

describe('layoutTiempo', () => {
  it('una aparición por dueño activo con fecha, en su vía', () => {
    const layout = layoutTiempo(people, works, ['me', 'b']);
    expect(layout.lanes).toEqual([{ userId: 'me', y: -LANE_GAP / 2 }, { userId: 'b', y: LANE_GAP / 2 }]);
    expect(layout.instances.map(i => `${i.key}@${i.userId}`).toSorted())
      .toEqual(['book:1@b', 'book:1@me', 'book:2@b', 'book:2@me', 'book:3@me']);
    for (const instance of layout.instances) {
      const lane = layout.lanes.find(l => l.userId === instance.userId)!.y;
      expect(Math.abs(instance.y - lane)).toBeLessThanOrEqual(75);
    }
  });
  it('rango redondeado a años completos y X lineal en el año', () => {
    const layout = layoutTiempo(people, works, ['me', 'b']);
    expect([layout.startYear, layout.endYear]).toEqual([2021, 2025]);
    const mid = (2021 + 2025) / 2;
    const one = layout.instances.find(i => i.key === 'book:1' && i.userId === 'me')!;
    expect(one.x).toBeCloseTo((yearOf('2021-03-01') - mid) * YEAR_STEP);
    expect(layout.extent.minX).toBeCloseTo((2021 - mid) * YEAR_STEP - 260);
    expect(layout.extent.maxX).toBeCloseTo((2025 - mid) * YEAR_STEP + 60);
  });
  it('sin fechas, un año por defecto y sin apariciones', () => {
    const layout = layoutTiempo(people, [works[4]], ['me', 'b']);
    expect(layout.instances).toEqual([]);
    expect(layout.endYear - layout.startYear).toBe(1);
  });
});

describe('summarizeTiempo', () => {
  it('cuenta primeras llegadas solo entre compartidas con fecha en todos sus dueños activos', () => {
    expect(summarizeTiempo(people, works, ['me', 'b'])).toEqual({ kind: 'first', first: 1, total: 2, undated: 1 });
  });
  it('sin Tú activa, las vías', () => {
    expect(summarizeTiempo(people, works, ['b', 'c'])).toEqual({ kind: 'lanes', names: ['B', 'C'] });
  });
});
```

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/tiempo.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `tiempo.ts`**

```ts
import type { WorkKey } from '../types';
import { jitter } from './opinion';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const LANE_GAP = 230;
export const YEAR_STEP = 270;
const LANE_SPREAD = 75;

export type TiempoInstance = Point & { key: WorkKey; userId: string; year: number };
export type TiempoLayout = { lanes: { userId: string; y: number }[]; instances: TiempoInstance[]; startYear: number; endYear: number; extent: Extent };
export type TiempoSummary = { kind: 'first'; first: number; total: number; undated: number } | { kind: 'lanes'; names: string[] };

/** `YYYY-MM-DD` as a fractional year, taken at the middle of the day. */
export function yearOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (Date.UTC(y, m - 1, d) - start + 43_200_000) / (end - start);
}

export const laneY = (index: number, count: number) => (index - (count - 1) / 2) * LANE_GAP;

export function layoutTiempo(people: AtlasPerson[], works: AtlasWork[], active: string[]): TiempoLayout {
  const activePeople = people.filter(person => active.includes(person.id));
  const lanes = activePeople.map((person, index) => ({ userId: person.id, y: laneY(index, activePeople.length) }));
  const laneOf = new Map(lanes.map(lane => [lane.userId, lane.y]));
  const dated = works.flatMap(work => work.owners.flatMap(owner => laneOf.has(owner.userId) && owner.date
    ? [{ key: work.key, userId: owner.userId, year: yearOf(owner.date) }] : []));
  let low = Infinity, high = -Infinity;
  for (const item of dated) { low = Math.min(low, item.year); high = Math.max(high, item.year); }
  const startYear = dated.length ? Math.floor(low) : new Date().getUTCFullYear();
  const endYear = dated.length ? Math.max(Math.ceil(high), startYear + 1) : startYear + 1;
  const mid = (startYear + endYear) / 2;
  const instances = dated.map(item => ({ ...item, x: (item.year - mid) * YEAR_STEP,
    y: laneOf.get(item.userId)! + jitter(`${item.key}@${item.userId}`, 1) / 13 * LANE_SPREAD }));
  const half = (Math.max(1, lanes.length) - 1) / 2 * LANE_GAP;
  return { lanes, instances, startYear, endYear,
    extent: { minX: (startYear - mid) * YEAR_STEP - 260, maxX: (endYear - mid) * YEAR_STEP + 60, minY: -half - 150, maxY: half + 150 } };
}

/** Counts exactly what the Tiempo lens can compare: shared works dated for every active owner. */
export function summarizeTiempo(people: AtlasPerson[], works: AtlasWork[], active: string[]): TiempoSummary {
  const me = people.find(person => person.isMe && active.includes(person.id));
  if (!me || active.length < 2) return { kind: 'lanes', names: people.filter(person => active.includes(person.id)).map(person => person.name) };
  let first = 0, total = 0, undated = 0;
  for (const work of works) {
    const owners = work.owners.filter(owner => active.includes(owner.userId));
    if (owners.length < 2 || !owners.some(owner => owner.userId === me.id)) continue;
    if (owners.some(owner => !owner.date)) { undated++; continue; }
    total++;
    const mine = owners.find(owner => owner.userId === me.id)!.date!;
    if (owners.every(owner => mine <= owner.date!)) first++;
  }
  return { kind: 'first', first, total, undated };
}
```

- [ ] **Step 3: Run** (mismo comando). Expected: PASS. **Commit** `feat(entre-nosotros): maquetación y resumen puros de la lente Tiempo`.

---

### Task 2: Islas puras

**Files:** Create `src/lib/comparisons/atlas/islands.ts`; Test `src/lib/comparisons/atlas/islands.test.ts`

**Interfaces:**
- Consumes: `spiral` (`layout.ts`), `workState` (`layout.ts`) y los tipos del atlas.
- Produces:
  - `type IslandMode = 'type' | 'genre' | 'creator'`, `ISLAND_LIMIT = 10`, `ISLAND_STEP = 11` y `OTHER_ISLAND = 'other'`.
  - `categoriesOf(work, mode): { id: string; label: string | null }[]`. Un `label` nulo significa que la vista pone el nombre: los tipos y «Otros».
  - `type Island = Point & { id: string; label: string | null; r: number; core: number; keys: WorkKey[]; common: number; shared: number; means: { userId: string; mean: number }[] }`.
  - `type IslandInstance = Point & { key: WorkKey; island: string }`.
  - `type IslandsLayout = { mode: IslandMode; islands: Island[]; instances: IslandInstance[]; extent: Extent }`.
  - `layoutIslands(people, works, active, mode): IslandsLayout`.
  - `type IslandsSummary = { kind: 'solo'; name: string } | { kind: 'none' } | { kind: 'best'; island: Island; count: number }`.
  - `summarizeIslands(people, layout, active): IslandsSummary`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { categoriesOf, ISLAND_LIMIT, layoutIslands, OTHER_ISLAND, summarizeIslands } from './islands';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
type Opt = { type?: AtlasWork['itemType']; genres?: string[]; creators?: AtlasWork['creators']; ratings?: Record<string, number | null> };
const work = (id: string, owners: string[], opt: Opt = {}): AtlasWork => ({ key: `${opt.type ?? 'book'}:${id}` as WorkKey, itemType: opt.type ?? 'book', itemId: id,
  title: id, metadataMissing: false, coverUrl: null, genres: opt.genres ?? [], creators: opt.creators ?? [],
  owners: owners.map(userId => ({ userId, rating: opt.ratings?.[userId] ?? null, date: null })) });

describe('categoriesOf', () => {
  it('tipo, géneros únicos y autor/director según el tipo; las series no tienen creador', () => {
    const author = { id: 'a1', name: 'Le Guin', role: 'author' as const }, director = { id: 'd1', name: 'Varda', role: 'director' as const };
    expect(categoriesOf(work('1', ['me']), 'type')).toEqual([{ id: 'book', label: null }]);
    expect(categoriesOf(work('1', ['me'], { genres: ['Drama', 'Drama', 'SF'] }), 'genre')).toEqual([{ id: 'g:Drama', label: 'Drama' }, { id: 'g:SF', label: 'SF' }]);
    expect(categoriesOf(work('1', ['me'], { creators: [author, director] }), 'creator')).toEqual([{ id: 'c:a1', label: 'Le Guin' }]);
    expect(categoriesOf(work('2', ['me'], { type: 'movie', creators: [author, director] }), 'creator')).toEqual([{ id: 'c:d1', label: 'Varda' }]);
    expect(categoriesOf(work('3', ['me'], { type: 'series', creators: [director] }), 'creator')).toEqual([]);
  });
});

describe('layoutIslands', () => {
  const works = [
    work('1', ['me', 'b', 'c'], { genres: ['Drama', 'SF'] }),
    work('2', ['me', 'b'], { genres: ['Drama'] }),
    work('3', ['c'], { genres: ['Poesía'] }),
    work('4', ['me'], {}),
    work('5', ['x'], { genres: ['Drama'] }),                        // nobody active owns it
    work('6', ['me', 'b', 'c'], { type: 'movie', genres: ['SF'] }),
  ];
  it('Tipo: islas por tipo no vacías, en orden fijo', () => {
    expect(layoutIslands(people, works, ['me', 'b', 'c'], 'type').islands.map(i => i.id)).toEqual(['book', 'movie']);
  });
  it('Género: una obra en cada isla de sus géneros; sin género va a Otros; lo que no toca a nadie activo no entra', () => {
    const layout = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    const byId = new Map(layout.islands.map(i => [i.id, i]));
    expect(byId.get('g:Drama')!.keys.toSorted()).toEqual(['book:1', 'book:2']);
    expect(byId.get('g:SF')!.keys.toSorted()).toEqual(['book:1', 'movie:6']);
    expect(byId.get(OTHER_ISLAND)!.keys).toEqual(['book:4']);
    expect(layout.instances.filter(i => i.key === 'book:1').map(i => i.island).toSorted()).toEqual(['g:Drama', 'g:SF']);
    expect(layout.instances.some(i => i.key === ('book:5' as WorkKey))).toBe(false);
  });
  it('orden por común a todas, luego compartida, luego el resto; núcleo y recuentos', () => {
    const drama = layoutIslands(people, works, ['me', 'b', 'c'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.keys).toEqual(['book:1', 'book:2']);
    expect([drama.common, drama.shared]).toEqual([1, 2]);
    expect(drama.core).toBeGreaterThan(0);
  });
  it('como mucho ISLAND_LIMIT categorías; el resto a Otros', () => {
    const many = Array.from({ length: 12 }, (_, i) => work(`m${i}`, ['me', 'b'], { genres: [`G${String(i).padStart(2, '0')}`] }));
    const layout = layoutIslands(people, many, ['me', 'b'], 'genre');
    expect(layout.islands.filter(i => i.id !== OTHER_ISLAND)).toHaveLength(ISLAND_LIMIT);
    expect(layout.islands.find(i => i.id === OTHER_ISLAND)!.keys).toHaveLength(2);
  });
  it('medias solo con 3 o más obras con nota de esa persona en la isla', () => {
    const rated = [1, 2, 3].map(i => work(`r${i}`, ['me', 'b'], { genres: ['Drama'], ratings: { me: 6 + i, b: i === 1 ? 5 : null } }));
    const drama = layoutIslands(people, rated, ['me', 'b'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.means).toEqual([{ userId: 'me', mean: 8 }]);
  });
  it('las islas no se solapan', () => {
    const { islands } = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    for (const a of islands) for (const b of islands) if (a !== b)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
  });
});

describe('summarizeIslands', () => {
  it('la isla con más en común; con una cara, las islas de esa persona; sin nada en común, lo dice', () => {
    const works = [work('1', ['me', 'b'], { genres: ['Drama'] }), work('2', ['me', 'b'], { genres: ['Drama'] }), work('3', ['me', 'b'], { genres: ['SF'] })];
    const layout = layoutIslands(people, works, ['me', 'b'], 'genre');
    expect(summarizeIslands(people, layout, ['me', 'b'])).toMatchObject({ kind: 'best', count: 2, island: { id: 'g:Drama' } });
    expect(summarizeIslands(people, layoutIslands(people, works, ['b'], 'genre'), ['b'])).toEqual({ kind: 'solo', name: 'B' });
    expect(summarizeIslands(people, layoutIslands(people, [work('9', ['me'])], ['me', 'b'], 'genre'), ['me', 'b'])).toEqual({ kind: 'none' });
  });
});
```

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/islands.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `islands.ts`**

```ts
import type { WorkKey } from '../types';
import { spiral, workState } from './layout';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export type IslandMode = 'type' | 'genre' | 'creator';
export const ISLAND_LIMIT = 10;
export const ISLAND_STEP = 11;
export const OTHER_ISLAND = 'other';
const TYPE_ORDER = ['book', 'movie', 'series'] as const;
const GAP = 160;          // between island discs
const LABEL_ROOM = 110;   // title + «n en común» + means strip above each disc

export type Island = Point & { id: string; label: string | null; r: number; core: number; keys: WorkKey[]; common: number; shared: number; means: { userId: string; mean: number }[] };
export type IslandInstance = Point & { key: WorkKey; island: string };
export type IslandsLayout = { mode: IslandMode; islands: Island[]; instances: IslandInstance[]; extent: Extent };
export type IslandsSummary = { kind: 'solo'; name: string } | { kind: 'none' } | { kind: 'best'; island: Island; count: number };

export function categoriesOf(work: AtlasWork, mode: IslandMode): { id: string; label: string | null }[] {
  if (mode === 'type') return [{ id: work.itemType, label: null }];
  if (mode === 'genre') return [...new Set(work.genres.filter(Boolean))].map(genre => ({ id: `g:${genre}`, label: genre }));
  const role = work.itemType === 'book' ? 'author' : work.itemType === 'movie' ? 'director' : null;
  return role ? work.creators.filter(creator => creator.role === role && creator.id && creator.name)
    .map(creator => ({ id: `c:${creator.id}`, label: creator.name })) : [];
}

export function layoutIslands(people: AtlasPerson[], works: AtlasWork[], active: string[], mode: IslandMode): IslandsLayout {
  const touching = works.filter(work => work.owners.some(owner => active.includes(owner.userId)));
  const rank = (work: AtlasWork) => workState(work, active).glow ? 0 : work.owners.filter(owner => active.includes(owner.userId)).length > 1 ? 1 : 2;
  const buckets = new Map<string, { label: string | null; works: AtlasWork[] }>();
  for (const work of touching) for (const category of categoriesOf(work, mode)) {
    const bucket = buckets.get(category.id) ?? { label: category.label, works: [] };
    bucket.works.push(work); buckets.set(category.id, bucket);
  }
  const count = (list: AtlasWork[], r: number) => list.filter(work => rank(work) <= r).length;
  let chosen: string[];
  if (mode === 'type') chosen = TYPE_ORDER.filter(type => buckets.has(type));
  else chosen = [...buckets].toSorted(([aId, a], [bId, b]) => count(b.works, 0) - count(a.works, 0) || count(b.works, 1) - count(a.works, 1)
    || b.works.length - a.works.length || (a.label ?? aId).localeCompare(b.label ?? bId) || aId.localeCompare(bId))
    .slice(0, ISLAND_LIMIT).map(([id]) => id);
  const drawn = new Set(chosen);
  const groups: { id: string; label: string | null; works: AtlasWork[] }[] = chosen.map(id => ({ id, label: buckets.get(id)!.label, works: buckets.get(id)!.works }));
  const rest = touching.filter(work => !categoriesOf(work, mode).some(category => drawn.has(category.id)));
  if (rest.length) groups.push({ id: OTHER_ISLAND, label: null, works: rest });

  const sized = groups.map(group => {
    const keys = group.works.toSorted((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(work => work.key);
    const common = count(group.works, 0), shared = count(group.works, 1);
    const means = people.filter(person => active.includes(person.id)).flatMap(person => {
      const notes = group.works.flatMap(work => { const r = work.owners.find(owner => owner.userId === person.id)?.rating; return r === null || r === undefined ? [] : [r]; });
      return notes.length >= 3 ? [{ userId: person.id, mean: notes.reduce((sum, value) => sum + value, 0) / notes.length }] : [];
    });
    return { id: group.id, label: group.label, keys, common, shared, means,
      r: ISLAND_STEP * Math.sqrt(keys.length) + 18, core: common ? ISLAND_STEP * Math.sqrt(common) + 14 : 0 };
  });

  // Shelf packing: rows of ⌈√n⌉ discs, each row centred; rows stacked downwards, whole layout centred on 0.
  const perRow = Math.max(1, Math.ceil(Math.sqrt(sized.length)));
  const rows: (typeof sized)[] = [];
  for (let i = 0; i < sized.length; i += perRow) rows.push(sized.slice(i, i + perRow));
  const islands: Island[] = []; let y = 0;
  for (const row of rows) {
    const height = Math.max(...row.map(item => item.r)) ;
    const width = row.reduce((sum, item) => sum + item.r * 2, 0) + GAP * (row.length - 1);
    let x = -width / 2; y += LABEL_ROOM + height;
    for (const item of row) { islands.push({ ...item, x: x + item.r, y }); x += item.r * 2 + GAP; }
    y += height + GAP / 2;
  }
  const shift = islands.length ? (Math.min(...islands.map(i => i.y - i.r - LABEL_ROOM)) + Math.max(...islands.map(i => i.y + i.r))) / 2 : 0;
  for (const island of islands) island.y -= shift;

  const instances: IslandInstance[] = islands.flatMap(island => island.keys.map((key, index) => {
    const offset = spiral(index, ISLAND_STEP);
    return { key, island: island.id, x: island.x + offset.x, y: island.y + offset.y };
  }));
  const extent = islands.length
    ? { minX: Math.min(...islands.map(i => i.x - i.r)) - 60, maxX: Math.max(...islands.map(i => i.x + i.r)) + 60,
        minY: Math.min(...islands.map(i => i.y - i.r - LABEL_ROOM)) - 20, maxY: Math.max(...islands.map(i => i.y + i.r)) + 60 }
    : { minX: -300, maxX: 300, minY: -300, maxY: 300 };
  return { mode, islands, instances, extent };
}

export function summarizeIslands(people: AtlasPerson[], layout: IslandsLayout, active: string[]): IslandsSummary {
  if (active.length < 2) return { kind: 'solo', name: people.find(person => active.includes(person.id))?.name ?? '' };
  const best = layout.islands.filter(island => island.id !== OTHER_ISLAND && island.common > 0)
    .toSorted((a, b) => b.common - a.common || b.shared - a.shared || (a.label ?? a.id).localeCompare(b.label ?? b.id))[0];
  return best ? { kind: 'best', island: best, count: best.common } : { kind: 'none' };
}
```

- [ ] **Step 3: Run** (mismo comando). Expected: PASS. Si el test de no solape falla por la colocación en filas, ajusta `GAP` o `LABEL_ROOM` sin tocar la aserción y documenta el valor. **Commit** `feat(entre-nosotros): maquetación y resumen puros de la lente Islas`.

---

### Task 3: Escena con apariciones e hilos, y motor que las anima

**Files:**
- Modify: `src/lib/comparisons/atlas/scene.ts` (+ `scene.test.ts`), `src/components/comparisons/atlas/atlas-engine.ts` (+ `atlas-canvas.test.tsx`)
- Create: `src/components/comparisons/atlas/paint-links.ts`

**Interfaces:**
- Consumes: `TiempoLayout` (Task 1) e `IslandsLayout` (Task 2).
- Produces:
  - `type Lens = 'quien' | 'opinion' | 'tiempo' | 'islas'`.
  - `type SceneTarget = Point & { key: WorkKey; alpha: number; glow: boolean; diff: number | null }`.
  - `type Scene = { lens: Lens; extent: Extent; targets: Map<string, SceneTarget>; links: string[][] }`. El id de sprite es la clave de la obra para la aparición principal y `${key}@${userId}` / `${key}#${islandId}` para las extra.
  - `buildScene(lens, works, active, layouts: { quien; opinion; tiempo; islas }): Scene`.
  - `paintLinks(view, links, positionOf, glowOf)`.

- [ ] **Step 1: Escena (TDD).** En `scene.test.ts`, adapta las llamadas a la firma nueva, `buildScene(lens, works, active, { quien, opinion, tiempo, islas })`, y añade:

```ts
  it('Tiempo: la primera aparición usa la clave; las demás clave@persona; un hilo las une; lo que no tiene fecha se desvanece en casa', () => {
    // works here: book:1 owned by me and b with dates; book:2 owned by b only, no date
    const scene = buildScene('tiempo', datedWorks, ['me', 'b'], layoutsFor(datedWorks, ['me', 'b']));
    expect([...scene.targets.keys()].toSorted()).toEqual(['book:1', 'book:1@b', 'book:2']);
    expect(scene.targets.get('book:2')).toMatchObject({ key: 'book:2', alpha: 0 });
    expect(scene.links).toEqual([['book:1', 'book:1@b']]);
  });
  it('Islas: una aparición por isla dibujada, unidas por un hilo', () => {
    const scene = buildScene('islas', genreWorks, ['me', 'b'], layoutsFor(genreWorks, ['me', 'b'], 'genre'));
    expect(scene.links).toEqual([['book:1', 'book:1#g:SF']]);   // book:1 is Drama + SF; Drama island comes first
    expect(scene.targets.get('book:1#g:SF')).toMatchObject({ key: 'book:1', alpha: 1 });
  });
  it('Quién y Opinión siguen igual con la clave como id y sin hilos', () => {
    const scene = buildScene('quien', datedWorks, ['me', 'b'], layoutsFor(datedWorks, ['me', 'b']));
    expect(scene.links).toEqual([]);
    expect(scene.targets.get('book:1')).toMatchObject({ key: 'book:1' });
  });
```

`datedWorks`, `genreWorks` y `layoutsFor(works, active, mode = 'type')` son ayudantes del test. El último construye `quien`, `opinion`, `tiempo` e `islas` con las funciones puras. Escribe los ayudantes con datos que cumplan los comentarios, haz que la primera isla de `genreWorks` sea Drama (dos obras en Drama, una de ellas también en SF) y que `book:1` sea la primera obra de Drama. Ejecuta y comprueba que FALLA.

  Implementación de `buildScene`, con todo lo demás de F2 igual:

```ts
export type Lens = 'quien' | 'opinion' | 'tiempo' | 'islas';
export type SceneTarget = Point & { key: WorkKey; alpha: number; glow: boolean; diff: number | null };
export type Scene = { lens: Lens; extent: Extent; targets: Map<string, SceneTarget>; links: string[][] };
export type SceneLayouts = { quien: QuienLayout; opinion: OpinionLayout; tiempo: TiempoLayout; islas: IslandsLayout };

export function buildScene(lens: Lens, works: AtlasWork[], active: string[], layouts: SceneLayouts): Scene {
  const targets = new Map<string, SceneTarget>(); const links: string[][] = [];
  const multi = lens === 'tiempo' ? groupBy(layouts.tiempo.instances, i => i.key, i => `@${i.userId}`)
    : lens === 'islas' ? groupBy(layouts.islas.instances, i => i.key, i => `#${i.island}`) : null;
  for (const work of works) {
    const home = layouts.quien.positions.get(work.key);
    const state = workState(work, active);
    if (lens === 'quien') { if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: state.alpha, glow: state.glow, diff: null }); continue; }
    if (lens === 'opinion') {
      const point = layouts.opinion.positions.get(work.key);
      if (point) targets.set(work.key, { key: work.key, x: point.x, y: point.y, alpha: 1, glow: false, diff: point.diff });
      else if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: 0, glow: false, diff: null });
      continue;
    }
    const places = multi!.get(work.key) ?? [];
    if (!places.length) { if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: 0, glow: false, diff: null }); continue; }
    const ids = places.map((place, index) => index === 0 ? work.key : `${work.key}${place.suffix}`);
    places.forEach((place, index) => targets.set(ids[index], { key: work.key, x: place.x, y: place.y, alpha: 1, glow: state.glow, diff: null }));
    if (ids.length > 1) links.push(ids);
  }
  const extent = lens === 'quien' ? layouts.quien.extent : lens === 'opinion' ? layouts.opinion.extent : lens === 'tiempo' ? layouts.tiempo.extent : layouts.islas.extent;
  return { lens, extent, targets, links };
}

function groupBy<T extends Point>(items: T[], keyOf: (item: T) => WorkKey, suffixOf: (item: T) => string) {
  const map = new Map<WorkKey, (Point & { suffix: string })[]>();
  for (const item of items) { const list = map.get(keyOf(item)) ?? []; list.push({ x: item.x, y: item.y, suffix: suffixOf(item) }); map.set(keyOf(item), list); }
  return map;
}
```

  En Tiempo, el orden de las apariciones dentro de una obra es el de `layoutTiempo`, que sigue el orden de los dueños, que sigue el orden de las personas. Así que la principal es la del primer dueño activo con fecha. Ejecuta el test y comprueba que PASA.

- [ ] **Step 2: `paint-links.ts`**

```ts
import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { Point } from '@/lib/comparisons/atlas/types';
import type { PaintView } from './atlas-palette';

/** Bezier threads joining every appearance of the same work (Tiempo lanes, Islas categories). */
export function paintLinks({ ctx, cam, vp, palette }: PaintView, links: string[][], positionOf: (id: string) => (Point & { a: number }) | null, glowOf: (id: string) => boolean) {
  for (const ids of links) {
    const points = ids.map(positionOf).filter((p): p is Point & { a: number } => !!p && p.a > 0.02).map(p => ({ ...toScreen(cam, vp, p), a: p.a }));
    if (points.length < 2) continue;
    const glow = glowOf(ids[0]);
    ctx.strokeStyle = glow ? palette.glow : palette.cream; ctx.lineWidth = glow ? 1.6 : 1;
    ctx.globalAlpha = Math.min(...points.map(p => p.a)) * (glow ? 0.55 : 0.18);
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const q = points[i - 1], p = points[i], my = (q.y + p.y) / 2;
      ctx.bezierCurveTo(q.x, my, p.x, my, p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 3: Motor.**
  1. `EngineProps.scene` es la escena nueva. `Sprite` gana `key: WorkKey` y `dying: boolean`.
  2. `sync()`:
     - Para cada `[id, t]` de `scene.targets`: si el sprite no existe y existe el principal `sprites.get(t.key)` (cuando `id !== t.key`), nace en la posición actual del principal con `a = 0`. Si no hay principal, nace en `t` como hasta ahora. Asigna `key`, `tx`, `ty`, `ta`, `thl`, `diff` y `dying = false`.
     - Los sprites que **no** están en `targets`: si son extra (`id !== sprite.key`) y el principal sigue en la escena, se marcan `dying = true` con `tx/ty` = objetivo del principal y `ta = 0`. Si no, se borran como ahora.
     - En `frame()`, los sprites `dying` con `a < 0.02` se borran.
  3. Dibujo:
     - antes de las obras, el pintor de fondo de la lente;
     - después, `paintLinks(view, scene.links, id => sprites.get(id) ? { x, y, a } : null, id => (sprites.get(id)?.hl ?? 0) > 0.5)`;
     - después, las obras;
     - y al final el frente de la lente.

     Las lentes Tiempo e Islas usan el pintor de la Task 4. En esta tarea, deja un `switch` con `case 'tiempo'` y `case 'islas'` que todavía no pinta fondo.
  4. `hitWork` devuelve `{ key: sprite.key, … }`. La **sonda** publica una entrada por **obra**: la primera aparición visible de cada `key`, ordenada por clave.
  5. Test en `atlas-canvas.test.tsx`, primero en rojo: con una escena de Tiempo donde `book:1` tiene dos apariciones, tras asentarse la sonda trae `book:1` **una vez**; al pasar después a Quién y asentarse, el sprite extra ya no existe. Para comprobarlo, la sonda sigue con una sola entrada y no hay ids con `@` en `data-atlas-probe`.
- [ ] **Step 4: Vista mínima.** En `atlas-view.tsx`, calcula `tiempo = layoutTiempo(people, works, active)` y `islas = layoutIslands(people, works, active, 'type')` (memoizados) y pásalos a `buildScene` con la firma nueva. La UI de lentes no cambia todavía. Ejecuta `npx vitest run src/components/comparisons src/lib/comparisons`, `npx tsc --noEmit` y eslint de las carpetas del atlas. Expected: PASS, con todos los tests de F1 y F2 intactos.
- [ ] **Step 5: Commit** `feat(entre-nosotros): apariciones múltiples e hilos en la escena y el motor del atlas`.

---

### Task 4: Pintores de Tiempo e Islas

**Files:**
- Create: `src/components/comparisons/atlas/paint-tiempo.ts`, `src/components/comparisons/atlas/paint-islas.ts` (+ `paint-tiempo.test.ts` y `paint-islas.test.ts`)
- Modify: `src/components/comparisons/atlas/atlas-engine.ts`

**Interfaces:**
- Consumes: `PaintView`, `TiempoLayout`, `YEAR_STEP`, `IslandsLayout` e `initials`.
- Produces:
  - `paintTiempoBack(view, { layout, people })`.
  - `type IslandText = { title: (island: Island) => string; common: (count: number) => string }`.
  - `paintIslasBack(view, { layout, people, text })`.
  - `EngineProps` gana `tiempo: TiempoLayout`, `islas: IslandsLayout` e `islandText?: IslandText`.

- [ ] **Step 1: Tests de pintor** con un `ctx` falso que registre llamadas y un `text` espía, igual que `paint-opinion.test.ts`:
  - Tiempo: una línea vertical y una etiqueta por año entero de `startYear` a `endYear`, ambos incluidos. Por cada vía, un avatar con las iniciales y el nombre de su persona.
  - Islas: por isla, el título vía `text.title(island)` y `text.common(island.common)` encima del disco. El aro del núcleo solo se dibuja si `core > 0`. Por cada media, un punto con las iniciales de esa persona.

  Escríbelos primero y comprueba que fallan.
- [ ] **Step 2: `paint-tiempo.ts`**

```ts
import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { TiempoLayout } from '@/lib/comparisons/atlas/tiempo';
import { YEAR_STEP } from '@/lib/comparisons/atlas/tiempo';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

/** Year grid, one tinted lane per active person with its avatar on the left (prototype `drawTiempoBg`). */
export function paintTiempoBack({ ctx, cam, vp, palette, text }: PaintView, { layout, people }: { layout: TiempoLayout; people: AtlasPerson[] }) {
  const k = cam.k, mid = (layout.startYear + layout.endYear) / 2;
  const top = toScreen(cam, vp, { x: 0, y: layout.extent.minY }).y, bottom = toScreen(cam, vp, { x: 0, y: layout.extent.maxY }).y;
  for (let year = layout.startYear; year <= layout.endYear; year++) {
    const x = toScreen(cam, vp, { x: (year - mid) * YEAR_STEP, y: 0 }).x;
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    text(String(year), x + 6, top + 14, `600 12px ${palette.font}`, palette.faint, 'left');
  }
  const left = toScreen(cam, vp, { x: (layout.startYear - mid) * YEAR_STEP - 150, y: 0 }).x;
  const right = toScreen(cam, vp, { x: (layout.endYear - mid) * YEAR_STEP, y: 0 }).x;
  for (const lane of layout.lanes) {
    const person = people.find(item => item.id === lane.userId); if (!person) continue;
    const y = toScreen(cam, vp, { x: 0, y: lane.y }).y, band = 170 * k;
    ctx.globalAlpha = 0.06; ctx.fillStyle = person.color; ctx.fillRect(left + 40, y - band / 2, right - left - 40, band); ctx.globalAlpha = 1;
    const r = Math.max(14, Math.min(26, 44 * k));
    ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(left, y, r, 0, Math.PI * 2); ctx.fill();
    text(initials(person.name), left, y + r * 0.2, `800 ${Math.round(r * 0.58)}px ${palette.font}`, '#fff', 'center');
    text(person.name, left, y + r + 16, `600 12px ${palette.font}`, palette.fg, 'center');
  }
}
```

- [ ] **Step 3: `paint-islas.ts`**

```ts
import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

export type IslandText = { title: (island: Island) => string; common: (count: number) => string };
const TYPE_TINT = { book: 'book', movie: 'movie', series: 'series' } as const;

/** Island discs, gold dashed ring around the common core, title + «n en común», and a 1–10 strip with each active face's mean. */
export function paintIslasBack({ ctx, cam, vp, palette, text }: PaintView, { layout, people, text: words }: { layout: IslandsLayout; people: AtlasPerson[]; text?: IslandText }) {
  const k = cam.k;
  for (const island of layout.islands) {
    const c = toScreen(cam, vp, island), r = island.r * k;
    const tint = island.id in TYPE_TINT ? palette.type[island.id as keyof typeof TYPE_TINT] : palette.cream;
    ctx.globalAlpha = 0.1; ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (island.core > 0) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = palette.glow; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, island.core * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (!words) continue;
    text(words.title(island), c.x, c.y - r - 52, `800 ${Math.min(30, Math.max(14, 22 * k * 2.6))}px ${palette.font}`, palette.fg, 'center');
    text(words.common(island.common), c.x, c.y - r - 32, `600 13px ${palette.font}`, palette.glow, 'center');
    if (island.means.length) {
      const width = 120, x0 = c.x - width / 2, y = c.y - r - 14;
      ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + width, y); ctx.stroke();
      island.means.forEach(({ userId, mean }) => {
        const person = people.find(item => item.id === userId); if (!person) return;
        const x = x0 + (mean - 1) / 9 * width;
        ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        text(initials(person.name), x, y + 3, `800 7px ${palette.font}`, '#fff', 'center');
      });
    }
  }
}
```

- [ ] **Step 4: Motor.** Los `case 'tiempo'` y `case 'islas'` llaman a `paintTiempoBack(view, { layout: props().tiempo, people })` y `paintIslasBack(view, { layout: props().islas, people, text: props().islandText })`. Ejecuta los tests de pintor, la suite del área, tsc y eslint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(entre-nosotros): pintores de las lentes Tiempo e Islas`.

---

### Task 5: Cuatro lentes en la vista, modo de Islas y mini-ficha con años

**Files:**
- Modify: `src/components/comparisons/atlas/atlas-view.tsx`, `atlas-summary-message.ts` (+ tests), `atlas.module.css`, `src/components/comparisons/explorer.tsx` (+ `explorer.test.tsx`), `messages/es.json`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `AtlasView` gana las props controladas `islandMode: IslandMode` y `onIslandModeChange(mode)`, además de la `lens` ampliada. El explorer guarda `islandMode`.

- [ ] **Step 1: i18n.** En `comparisons.atlas`:
  - `lens`: añade `"tiempo": "Tiempo"` y `"islas": "Islas"`;
  - `caption`: añade `"tiempo": "Una vía por persona a lo largo de los años. Los hilos unen la misma obra: verás quién llegó primero."` e `"islas": "Una isla por tipo, género o autor. En el centro de cada isla, lo que tenéis en común; arriba, la nota media de cada cual."`;
  - añade:

```json
      "tiempo": {
        "first": "Llegaste tú primero a <b>{first}</b> de <b>{total}</b> {total, plural, one {obra compartida} other {obras compartidas}}",
        "firstUndated": "Llegaste tú primero a <b>{first}</b> de <b>{total}</b> {total, plural, one {obra compartida} other {obras compartidas}} ({undated} sin fecha)",
        "lanes": "Las vías de {names}"
      },
      "islas": {
        "modes": "Agrupar islas por",
        "mode": { "type": "Tipo", "genre": "Género", "creator": "Autor/Director" },
        "best": "Donde más os parecéis: <b>{label}</b>, con <b>{count}</b> en común",
        "none": "Aún no tenéis obras en común en ninguna isla",
        "solo": "Las islas de {name}. Suma a alguien para ver el cruce.",
        "other": "Otros",
        "common": "{count} en común"
      },
      "years": "{name}: {year}",
      "noDate": "{name}: sin fecha"
```

- [ ] **Step 2: Tests primero.**
  - `atlas-summary-message.test.ts`: casos de Tiempo (`first`, `firstUndated`, `lanes`) y de Islas (`best` con la etiqueta de tipo vía `formats.book` → «Libros», `best` con un género, `none` y `solo`).
  - `atlas-view.test.tsx`, con el `Harness` guardando `lens` e `islandMode`:
    1. El dock tiene 4 botones de lente.
    2. Al elegir Islas aparece el grupo «Agrupar islas por» con Tipo, Género y Autor/Director (`aria-pressed`), y al cambiar el modo cambia el resumen.
    3. Con `snapshot.format !== 'all'`, la opción Tipo no aparece y el modo efectivo es Género. Monta el Harness con `islandMode` en `'type'` y comprueba el resumen de Género.
    4. Tiempo: el tooltip de una obra lista `Tú: 2021` / `Bea: sin fecha` (usa `hidden: true` porque el tooltip es `aria-hidden`).
    5. El canvas recibe `islandText`. Comprueba que `title` devuelve «Otros» para la isla `other` y «Libros» para `book`.
  - `explorer.test.tsx`: el modo de Islas sobrevive al cambio de formato, igual que la lente.

  Ejecuta y comprueba que fallan.
- [ ] **Step 3: Implementación.**
  - `atlas-view.tsx`:
    - `effectiveMode = snapshot.format !== 'all' && islandMode === 'type' ? 'genre' : islandMode`;
    - `islas = layoutIslands(people, works, active, effectiveMode)`;
    - dock con cuatro botones e iconos del prototipo. Tiempo: `<path d="M1 4h14M1 12h14"/><path d="M5 4c0 4 3 4 3 8M11 4c0 3-2 5-2 8"/>`. Islas: `<circle cx="4" cy="9" r="3"/><circle cx="11" cy="6" r="4"/><circle cx="12.5" cy="13" r="1.8"/>`;
    - cuando la lente es Islas, un grupo de botones `role="group" aria-label={t('atlas.islas.modes')}` encima del dock, sin «Tipo» si el formato no es «Todos»;
    - el clic en lente o modo limpia `picked` y `hover`, como en F2;
    - `islandText` memoizado: `title`: `other` → `t('atlas.islas.other')`; `book`/`movie`/`series` → `t(\`formats.${id}\`)`; si no, `island.label`. `common` → `t('atlas.islas.common', { count })`;
    - `WorkCard`: en Tiempo, cada dueño en una fila con `t('atlas.years', { name, year })` o `t('atlas.noDate', { name })` (año = `date.slice(0, 4)`). En Quién e Islas, la lista de dueños como hasta ahora. En Opinión, la escala de F2.
  - `atlas-summary-message.ts`: añade los casos de Tiempo e Islas. El `label` de la mejor isla pasa por la misma función `title`, así que la función recibe un `islandTitle` como argumento para seguir siendo pura.
  - `explorer.tsx`: `const [atlasIslandMode, setAtlasIslandMode] = useState<IslandMode>('type')`, que se pasa a la vista.
  - CSS: `.modes` reutiliza el estilo de `.lens`, en tamaño menor y con un `gap` de 2px.
- [ ] **Step 4: Run** `npx vitest run src/components/comparisons src/lib/comparisons`, `npx tsc --noEmit` y `npm run lint`. Expected: PASS. **Commit** `feat(entre-nosotros): lentes Tiempo e Islas en la vista del atlas`.

---

### Task 6: Retirar Gustos

**Files:**
- Modify: `src/components/comparisons/explorer.tsx`, `explorer.module.css`, `explorer.test.tsx`, `messages/es.json`, `e2e/entre-nosotros.spec.ts`
- Delete: `src/components/comparisons/tastes.tsx`, `tastes.module.css`, `tastes.test.tsx`

- [ ] **Step 1: Explorer.**
  - Quita la `nav` de secciones (Obras/Gustos), la rama `state.section === 'tastes'` y `workspaceControls` con su fieldset de casillas.
  - La pantalla pinta siempre el atlas. El reducer no cambia: `state.section` se queda en `'works'` y `selectSection` desaparece de la UI.
  - `data-comparison-slot="works"` se mantiene, porque lo usan tests.
  - Borra `tastes.tsx`, `tastes.module.css` y `tastes.test.tsx`.
  - En `explorer.module.css`, quita `.tastePanel` y las reglas `.immersive .tabs`/`.tab` si ya no hay uso. Comprueba cada clase con grep.
- [ ] **Step 2: Mensajes.** Para cada clave de `comparisons` que solo usaba Gustos, como `consumptionTitle`, `preferenceTitle`, `tasteSignal*`, `facet*`, `personEvidence` o `works`/`tastes`/`sections`, búscala con `grep -rn "'<clave>'\|\"<clave>\"\|<clave>" src e2e`. Bórrala **solo** si no queda ningún uso. Deja `formats`, `media` y las de grupos y sesión.
- [ ] **Step 3: `explorer.test.tsx`.**
  - Borra los tests cuyo objeto es Gustos: categorías, señales, facetas y participantes de Gustos.
  - Los tests que usaban Gustos solo como **sonda de estado del reducer o de la sesión** pasan a usar el estado del atlas que vive en `ExplorerSession`: lente, modo de Islas y caras. Por ejemplo, «starts a fresh subtree…» pasa a Opinión antes del cambio de identidad y, tras el payload nuevo, espera Quién con `aria-pressed="true"`.
  - Ningún test de sesión, carga o conflicto puede perder aserciones. Si uno no tiene equivalente, para y repórtalo.
- [ ] **Step 4: `e2e/entre-nosotros.spec.ts`.**
  - En el test `two real tabs conflict…`, sustituye los pasos de Gustos (`selectPeople`, «Gustos», «Explorar Drama», casillas y `data-view="facet"`) por estado del atlas: pasa a la lente Opinión y desactiva la cara «Carlos QA». Tras `other.bringToFront(); page.bringToFront();`, comprueba que Opinión sigue `aria-pressed="true"` y que Carlos sigue `aria-pressed="false"`.
  - Borra `selectPeople` si deja de usarse.
  - Ninguna otra aserción cambia.
- [ ] **Step 5: Run** `npx vitest run src/components/comparisons src/lib/comparisons`, `npx tsc --noEmit` y `npm run lint`. Expected: PASS. **Commit** `refactor(entre-nosotros): retirar Gustos; el atlas cubre sus agrupaciones`.

---

### Task 7: E2E, capturas y evidencia (gate con el usuario)

**Files:**
- Modify: `e2e/entre-nosotros-atlas.spec.ts`
- Create: `docs/testing/2026-10-14-entre-nosotros-atlas-f3.md` + `docs/testing/assets/2026-10-14-entre-nosotros-atlas-f3/*.png`

**Interfaces:**
- Consumes: el fixture no integrado tiene 3 personas y 30 libros en común, todos con `finished_on: '2026-09-01'`, nota 9 y género `Drama`. El autor es texto libre, no está en `credits`, así que en Autor/Director todo cae en «Otros».

- [ ] **Step 1: E2E.** Añade a `e2e/entre-nosotros-atlas.spec.ts`:

```ts
test('escritorio: Tiempo e Islas resumen lo dibujado y el modo de Islas cambia las islas', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const lenses = page.getByRole('group', { name: 'Lente', exact: true });
    await lenses.getByRole('button', { name: 'Tiempo', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Llegaste tú primero a 30 de 30 obras compartidas');
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.mouse.move(box.x + work.x, box.y + work.y);
    await expect(page.getByText('Beatriz QA: 2026', { exact: true })).toBeAttached();
    await lenses.getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Donde más os parecéis: Libros, con 30 en común');
    const modes = page.getByRole('group', { name: 'Agrupar islas por', exact: true });
    await modes.getByRole('button', { name: 'Género', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Donde más os parecéis: Drama, con 30 en común');
    await modes.getByRole('button', { name: 'Autor/Director', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Aún no tenéis obras en común en ninguna isla');
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await lensSettled(page);
    await expect(modes.getByRole('button', { name: 'Tipo', exact: true })).toHaveCount(0);
  });
});

test('móvil: Tiempo desde el icono y la hoja con los años', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Tiempo', exact: true }).tap(); await lensSettled(page);
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    await expect(page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ }).getByText('Tú: 2026', { exact: true })).toBeVisible();
  });
});
```

  `lensSettled` ya existe desde F2. Si en Tiempo la sonda devuelve una obra cuyas apariciones se solapan con otras, porque las 90 llevan la misma fecha, el tap acierta igualmente alguna obra: la aserción solo exige el título con el patrón.
- [ ] **Step 2: Ejecutar** contra build de producción (puerto 3000 libre, `npm run build`, `npm run start` en segundo plano, espera con `curl`):
  - `e2e/entre-nosotros-atlas.spec.ts` en ambos proyectos;
  - `e2e/entre-nosotros.spec.ts -g "CRUD|profile"`;
  - `e2e/entre-nosotros.spec.ts -g "transport|conflict"`;
  - `e2e/entre-nosotros.spec.ts -g "isolation"`.

  `LOCAL ONLY` queda fuera (#1520). Expected: todo PASS. Para el servidor al acabar.
- [ ] **Step 3: Capturas.** Usa un spec temporal `e2e/zz-atlas-shots.spec.ts`, añadido temporalmente al `testMatch`; bórralo y revierte la config antes del commit. Monta `withComparisonFixture(…, { integrated: true })` (10 personas, película y serie) y, antes de abrir el atlas, varía las fechas para que Tiempo tenga recorrido. Para cada libro `i`, haz `PATCH` sobre los pases:
  - Tú: `finished_on = 2021-01-15` + `i` meses;
  - Beatriz: + `i + 3` meses;
  - Carlos: + `30 - i` meses.

  Formatea `YYYY-MM-DD` con día 15. Captura:
  - escritorio 1280×800: `desktop-tiempo.png`, `desktop-tiempo-tooltip.png`, `desktop-islas-tipo.png`, `desktop-islas-genero.png` y `desktop-islas-autor.png`;
  - móvil Pixel 7: `mobile-tiempo.png`, `mobile-islas.png` y `mobile-tiempo-sheet.png`.

  Mira cada PNG y anota con honestidad lo que se vea mal. Si ves un fallo pequeño y claro de maquetación en las lentes nuevas, arréglalo con un commit propio (y test si es posible) y repite la captura. Lo que sea mayor, repórtalo.
- [ ] **Step 4: Evidencia.** Escribe `docs/testing/2026-10-14-entre-nosotros-atlas-f3.md`. Cabecera `[Histórico · verificado 2026-10-14]`, SHA del build, cifras de unitarios, tsc, lint y e2e por tanda, capturas, observaciones y lo no verificado. Commit `docs(entre-nosotros): evidencia y capturas de F3 del atlas`.
- [ ] **Step 5: Parar.** No dejes nada corriendo. Enseña las capturas al usuario y espera su visto bueno antes de F4.
