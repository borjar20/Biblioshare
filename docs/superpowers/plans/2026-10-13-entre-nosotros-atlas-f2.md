# Entre nosotros · atlas · F2 (lente Opinión) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Un implementador cada vez** en este árbol.

**Goal:** Añadir al atlas la lente **Opinión** (spec §4.2) y el cambio de lente con vuelo de obras. En el eje X va la nota de la referencia y en el Y la media del resto de caras activas. Lleva banda de acuerdo, esquinas con nombre, color de dorado a coral y una mini-ficha con los avatares sobre una escala de 1 a 10.

**Architecture:** La maquetación de Opinión y su resumen son funciones puras en `src/lib/comparisons/atlas/opinion.ts`. Una «escena» pura (`scene.ts`) traduce lente + maquetaciones a objetivos por obra, de modo que el motor ya no conoce lentes concretas salvo para elegir pintor. El fondo y el frente de cada lente se pintan en módulos aparte (`paint-quien.ts`, `paint-opinion.ts`). La lente vive en el explorer, igual que las caras, para sobrevivir al cambio de formato, que remonta la vista.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, CSS Modules, Canvas 2D, Vitest (+ jsdom por fichero) y Playwright.

**Spec:** [`../specs/2026-10-13-entre-nosotros-atlas-design.md`](../specs/2026-10-13-entre-nosotros-atlas-design.md) §4.2 · Plan anterior: [`2026-10-13-entre-nosotros-atlas-f1.md`](2026-10-13-entre-nosotros-atlas-f1.md) · Prototipo: `../specs/assets/entre-nosotros-atlas-prototipo.html` (`opXY`, `drawOpinionBg`, `dotCol`).

## Global Constraints

- Sin tablas, columnas, RLS ni migraciones. Sin `use cache` (regla #437).
- Strings en `messages/es.json` bajo `comparisons.atlas.*`. Copy en español.
- Opinión entra solo con obras que tienen nota de la **referencia** («Tú» si está activa; si no, la primera cara activa en el orden de personas) y de al menos otra cara activa. El eje X es la nota de la referencia y el Y la media del resto de caras activas con nota, ambos en escala 1–10 y a `170` unidades de mundo por punto, centrados en 5,5.
- Coincidir es `|dif| ≤ 1` y chocar es `|dif| ≥ 3` (umbrales de «Notas parecidas» y «Diferencia de opinión»). El color va de dorado (`|dif| ≤ 1`) a coral (`|dif| ≥ 4`) de forma lineal.
- Esquinas: «Os encantó» (arriba dcha.), «Ni fu ni fa» (abajo izda.), «Tú sí, ellos no» (abajo dcha.) y «Ellos sí, tú no» (arriba izda.). Si la referencia no es Tú, se nombra a la referencia.
- La Quién de F1 no cambia de comportamiento. Los umbrales del motor siguen igual: portadas `k > 1.1`, títulos `k > 3.2`, interpolación 0.11/0.14/0.16, `prefers-reduced-motion` sin vuelos.
- Siempre oscuro (tokens `--atlas-*`; `--atlas-clash` ya existe en `explorer.module.css`).
- Node 22: cada comando de PowerShell empieza por `fnm env | Out-String | Invoke-Expression; fnm use 22;` en la misma línea. Commits con `-m "…" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Sin `git stash` a secas. Sin BOM.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/comparisons/atlas/color.ts` (nuevo) | `mixHex` |
| `src/lib/comparisons/atlas/opinion.ts` (nuevo) | `opinionReference`, `jitter`, `ratingX`, `layoutOpinion`, `diffMix`, `summarizeOpinion` |
| `src/lib/comparisons/atlas/scene.ts` (nuevo) | `Lens`, `SceneTarget`, `Scene`, `buildScene` |
| `src/components/comparisons/atlas/atlas-palette.ts` (nuevo) | `Palette`, `readPalette`, `PaintView` |
| `src/components/comparisons/atlas/paint-quien.ts` (nuevo) | Fondo y frente de Quién, movidos del motor tal cual |
| `src/components/comparisons/atlas/paint-opinion.ts` (nuevo) | Fondo de Opinión |
| `src/components/comparisons/atlas/atlas-engine.ts` (mod) | Escena en vez de `layout`; pintor por lente; colores por diferencia |
| `src/components/comparisons/atlas/atlas-canvas.tsx` (mod) | Dependencias de `sync` |
| `src/components/comparisons/atlas/rating-scale.tsx` (nuevo) | Avatares sobre la escala 1–10 |
| `src/components/comparisons/atlas/atlas-view.tsx` (mod) | Lente controlada, dock con dos lentes, resúmenes y mini-ficha por lente |
| `src/components/comparisons/explorer.tsx` (mod) | Estado de lente |
| `messages/es.json` (mod) | `comparisons.atlas.lens.opinion`, `caption.opinion` y `opinion.*` |

---

### Task 1: Maquetación y resumen de Opinión (puros)

**Files:**
- Create: `src/lib/comparisons/atlas/color.ts`, `src/lib/comparisons/atlas/opinion.ts`
- Test: `src/lib/comparisons/atlas/opinion.test.ts`

**Interfaces:**
- Consumes: `AtlasPerson`, `AtlasWork`, `Point` y `Extent` (`types.ts`).
- Produces:
  - `mixHex(a, b, t): string`.
  - `RATING_STEP = 170`, `AGREE_MAX = 1`, `CLASH_MIN = 3` y `OPINION_EXTENT`.
  - `type OpinionPoint = Point & { ref: number; others: number; diff: number }`.
  - `type OpinionLayout = { reference: string | null; positions: Map<WorkKey, OpinionPoint>; extent: Extent }`.
  - `opinionReference(people, active): string | null`.
  - `jitter(key, axis: 0 | 1): number` y `ratingX(rating): number`.
  - `layoutOpinion(people, works, active): OpinionLayout`.
  - `diffMix(diff): number` (0 = color de acuerdo, 1 = color de choque).
  - `type OpinionSummary = { kind: 'needsTwo' } | { kind: 'empty'; ref: string; isMe: boolean } | { kind: 'counts'; agree: number; clash: number; total: number; ref: string; isMe: boolean }`.
  - `summarizeOpinion(people, layout): OpinionSummary`.

- [ ] **Step 1: Write the failing test** (`opinion.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { mixHex } from './color';
import { diffMix, jitter, layoutOpinion, opinionReference, OPINION_EXTENT, ratingX, summarizeOpinion } from './opinion';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const works = [
  work('book:1', { me: 9, b: 9, c: 8 }),     // mean 8.5 → diff 0.5 → agree
  work('book:2', { me: 9, b: 4, c: 4 }),     // diff 5 → clash
  work('book:3', { me: 7, b: 5 }),           // diff 2 → neither
  work('book:4', { me: null, b: 6, c: 6 }),  // no reference rating → out
  work('book:5', { me: 6, b: null }),        // nobody else rated → out
  work('book:6', { b: 3, c: 9 }),            // reference does not own it → out
];

describe('opinionReference', () => {
  it('Tú si está activa; si no, la primera activa; nadie con menos de dos caras', () => {
    expect(opinionReference(people, ['me', 'b'])).toBe('me');
    expect(opinionReference(people, ['c', 'b'])).toBe('b');
    expect(opinionReference(people, ['b'])).toBeNull();
  });
});

describe('layoutOpinion', () => {
  it('solo obras con nota de la referencia y de otra cara activa', () => {
    const layout = layoutOpinion(people, works, ['me', 'b', 'c']);
    expect([...layout.positions.keys()].toSorted()).toEqual(['book:1', 'book:2', 'book:3']);
    expect(layout.extent).toEqual(OPINION_EXTENT);
  });
  it('X = nota de la referencia; Y = −media del resto activo; con jitter determinista acotado', () => {
    const p = layoutOpinion(people, works, ['me', 'b', 'c']).positions.get('book:2' as WorkKey)!;
    expect(p).toMatchObject({ ref: 9, others: 4, diff: 5 });
    expect(p.x).toBeCloseTo(ratingX(9) + jitter('book:2', 0));
    expect(p.y).toBeCloseTo(-ratingX(4) + jitter('book:2', 1));
    expect(Math.abs(jitter('book:2', 0))).toBeLessThanOrEqual(13);
    expect(jitter('book:2', 0)).toBe(jitter('book:2', 0));
    expect(jitter('book:2', 0)).not.toBe(jitter('book:2', 1));
  });
  it('la media solo cuenta caras activas', () => {
    expect(layoutOpinion(people, works, ['me', 'c']).positions.get('book:2' as WorkKey)).toMatchObject({ others: 4, diff: 5 });
    expect(layoutOpinion(people, works, ['me', 'c']).positions.has('book:3' as WorkKey)).toBe(false);
  });
  it('sin referencia, vacía', () => {
    expect(layoutOpinion(people, works, ['b']).positions.size).toBe(0);
  });
});

describe('colores y resumen', () => {
  it('diffMix: 0 hasta 1 punto, 1 desde 4, lineal entre medias', () => {
    expect([0, 1, 2.5, 4, 7].map(diffMix)).toEqual([0, 0, 0.5, 1, 1]);
  });
  it('mixHex mezcla #rrggbb y devuelve el primero si no entiende el formato', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mixHex('var(--x)', '#ffffff', 0.5)).toBe('var(--x)');
  });
  it('cuenta coincidencias y choques sobre lo dibujado', () => {
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['me', 'b', 'c'])))
      .toEqual({ kind: 'counts', agree: 1, clash: 1, total: 3, ref: 'Tú', isMe: true });
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['b', 'c'])))
      .toEqual({ kind: 'counts', agree: 3, clash: 1, total: 4, ref: 'B', isMe: false });
  });
  it('con menos de dos caras pide otra; sin obras comparables lo dice', () => {
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['me']))).toEqual({ kind: 'needsTwo' });
    expect(summarizeOpinion(people, layoutOpinion(people, [works[3]], ['me', 'b']))).toEqual({ kind: 'empty', ref: 'Tú', isMe: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/opinion.test.ts`. Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implement `color.ts`**

```ts
/** Linear mix of two `#rrggbb` colours (t in [0, 1]). Anything else returns `a` unchanged. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (c: string) => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null;
  const from = parse(a), to = parse(b);
  if (!from || !to) return a;
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',')})`;
}
```

- [ ] **Step 4: Implement `opinion.ts`**

```ts
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const RATING_STEP = 170;
/** Same thresholds as «Notas parecidas» (≤1) and «Diferencia de opinión» (≥3). */
export const AGREE_MAX = 1;
export const CLASH_MIN = 3;
const JITTER = 26;
export const OPINION_EXTENT: Extent = { minX: -900, minY: -900, maxX: 900, maxY: 900 };

export type OpinionPoint = Point & { ref: number; others: number; diff: number };
export type OpinionLayout = { reference: string | null; positions: Map<WorkKey, OpinionPoint>; extent: Extent };
export type OpinionSummary = { kind: 'needsTwo' } | { kind: 'empty'; ref: string; isMe: boolean }
  | { kind: 'counts'; agree: number; clash: number; total: number; ref: string; isMe: boolean };

/** «Tú» when active, otherwise the first active face in people order; none below two faces. */
export function opinionReference(people: AtlasPerson[], active: string[]): string | null {
  if (active.length < 2) return null;
  return people.find(person => person.isMe && active.includes(person.id))?.id
    ?? people.find(person => active.includes(person.id))?.id ?? null;
}

/** Deterministic spread in [−13, 13] per key and axis (FNV-1a), so equal integer notes don't stack. */
export function jitter(key: string, axis: 0 | 1): number {
  let hash = 2166136261 ^ axis;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 1000 / 1000 - 0.5) * JITTER;
}

export const ratingX = (rating: number) => (rating - 5.5) * RATING_STEP;

export function layoutOpinion(people: AtlasPerson[], works: AtlasWork[], active: string[]): OpinionLayout {
  const reference = opinionReference(people, active);
  const positions = new Map<WorkKey, OpinionPoint>();
  if (reference) for (const work of works) {
    const own = work.owners.find(owner => owner.userId === reference)?.rating;
    if (own === null || own === undefined) continue;
    const others = work.owners.filter(owner => owner.userId !== reference && active.includes(owner.userId) && owner.rating !== null)
      .map(owner => owner.rating as number);
    if (!others.length) continue;
    const mean = others.reduce((sum, value) => sum + value, 0) / others.length;
    positions.set(work.key, { x: ratingX(own) + jitter(work.key, 0), y: -ratingX(mean) + jitter(work.key, 1),
      ref: own, others: mean, diff: Math.abs(own - mean) });
  }
  return { reference, positions, extent: OPINION_EXTENT };
}

/** 0 = agreement colour (|dif| ≤ 1), 1 = clash colour (|dif| ≥ 4), linear in between. */
export function diffMix(diff: number): number { return Math.min(1, Math.max(0, (diff - 1) / 3)); }

/** Counts exactly what the Opinión lens draws. */
export function summarizeOpinion(people: AtlasPerson[], layout: OpinionLayout): OpinionSummary {
  const reference = people.find(person => person.id === layout.reference);
  if (!reference) return { kind: 'needsTwo' };
  const diffs = [...layout.positions.values()].map(point => point.diff);
  if (!diffs.length) return { kind: 'empty', ref: reference.name, isMe: reference.isMe };
  return { kind: 'counts', ref: reference.name, isMe: reference.isMe, total: diffs.length,
    agree: diffs.filter(diff => diff <= AGREE_MAX).length, clash: diffs.filter(diff => diff >= CLASH_MIN).length };
}
```

- [ ] **Step 5: Run test** (mismo comando que el Step 2). Expected: PASS. Si `jitter('book:2', 0) === jitter('book:2', 1)` por casualidad, cambia la siembra del eje (`2166136261 ^ (axis * 0x9e3779b9)`) y documenta el cambio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comparisons/atlas
git commit -m "feat(entre-nosotros): maquetación y resumen puros de la lente Opinión" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Escena por lente y pintores (refactor sin cambio de comportamiento)

**Files:**
- Create: `src/lib/comparisons/atlas/scene.ts`, `src/lib/comparisons/atlas/scene.test.ts`
- Create: `src/components/comparisons/atlas/atlas-palette.ts`, `src/components/comparisons/atlas/paint-quien.ts`
- Modify: `src/components/comparisons/atlas/atlas-engine.ts`, `atlas-canvas.tsx`, `atlas-view.tsx`, `atlas-canvas.test.tsx`

**Interfaces:**
- Consumes: `QuienLayout` y `workState` (`layout.ts`), `OpinionLayout` (Task 1).
- Produces:
  - `type Lens = 'quien' | 'opinion'`.
  - `type SceneTarget = Point & { alpha: number; glow: boolean; diff: number | null }`.
  - `type Scene = { lens: Lens; extent: Extent; targets: Map<WorkKey, SceneTarget> }`.
  - `buildScene(lens, works, active, quien, opinion): Scene`.
  - `Palette` y `readPalette` (con `faint` y `clash` añadidos).
  - `type PaintView = { ctx; cam; vp; palette; text(value, x, y, font, color, align?) }`.
  - `paintQuienBack(view, data)` y `paintQuienFront(view, data)`, con `data = { layout: QuienLayout; active: string[]; people: AtlasPerson[]; countLabel(n): string }`.
  - `EngineProps` cambia: `layout: QuienLayout` pasa a `scene: Scene; quien: QuienLayout`. El resto de props no cambia.

- [ ] **Step 1: Failing test de escena** (`scene.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { layoutQuien } from './layout';
import { layoutOpinion, OPINION_EXTENT } from './opinion';
import { buildScene } from './scene';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: id, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const works = [work('book:1', { me: 8, b: 8 }), work('book:2', { me: null, b: 5 }), work('book:3', { b: 2 })];
const quien = layoutQuien(people, works);
const opinion = layoutOpinion(people, works, ['me', 'b']);

describe('buildScene', () => {
  it('Quién: posiciones y estado de F1, sin diferencia', () => {
    const scene = buildScene('quien', works, ['me', 'b'], quien, opinion);
    expect(scene.extent).toEqual(quien.extent);
    expect(scene.targets.get('book:1' as WorkKey)).toEqual({ ...quien.positions.get('book:1' as WorkKey)!, alpha: 1, glow: true, diff: null });
    expect(scene.targets.get('book:3' as WorkKey)).toMatchObject({ alpha: 1, glow: false, diff: null });
  });
  it('Opinión: lo comparable a su sitio con su diferencia; el resto se desvanece en su sitio de Quién', () => {
    const scene = buildScene('opinion', works, ['me', 'b'], quien, opinion);
    expect(scene.extent).toEqual(OPINION_EXTENT);
    expect(scene.targets.get('book:1' as WorkKey)).toMatchObject({ alpha: 1, glow: false, diff: 0 });
    expect(scene.targets.get('book:2' as WorkKey)).toEqual({ ...quien.positions.get('book:2' as WorkKey)!, alpha: 0, glow: false, diff: null });
    expect(scene.targets.size).toBe(3);
  });
});
```

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/scene.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `scene.ts`**

```ts
import type { WorkKey } from '../types';
import { workState, type QuienLayout } from './layout';
import type { OpinionLayout } from './opinion';
import type { AtlasWork, Extent, Point } from './types';

export type Lens = 'quien' | 'opinion';
export type SceneTarget = Point & { alpha: number; glow: boolean; diff: number | null };
export type Scene = { lens: Lens; extent: Extent; targets: Map<WorkKey, SceneTarget> };

/** Where each work goes under a lens. Works a lens leaves out fade at their Quién place instead of vanishing. */
export function buildScene(lens: Lens, works: AtlasWork[], active: string[], quien: QuienLayout, opinion: OpinionLayout): Scene {
  const targets = new Map<WorkKey, SceneTarget>();
  for (const work of works) {
    const home = quien.positions.get(work.key);
    if (lens === 'quien') {
      if (!home) continue;
      const state = workState(work, active);
      targets.set(work.key, { x: home.x, y: home.y, alpha: state.alpha, glow: state.glow, diff: null });
      continue;
    }
    const point = opinion.positions.get(work.key);
    if (point) targets.set(work.key, { x: point.x, y: point.y, alpha: 1, glow: false, diff: point.diff });
    else if (home) targets.set(work.key, { x: home.x, y: home.y, alpha: 0, glow: false, diff: null });
  }
  return { lens, extent: lens === 'quien' ? quien.extent : opinion.extent, targets };
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: `atlas-palette.ts`.** Mueve `Palette` y `readPalette` del motor a este fichero (exportados) y añade dos campos: `faint: v('--atlas-faint', '#7d6e62')` y `clash: v('--atlas-clash', '#e2735f')`. Añade:

```ts
export type PaintView = {
  ctx: CanvasRenderingContext2D; cam: Camera; vp: Viewport; palette: Palette;
  text: (value: string, x: number, y: number, font: string, color: string, align?: CanvasTextAlign) => void;
};
```

(con `import type { Camera, Viewport } from '@/lib/comparisons/atlas/types';`).

- [ ] **Step 4: `paint-quien.ts`.** Crea dos funciones moviendo el código del `draw()` del motor **tal cual**:
  - `export function paintQuienBack({ ctx, cam, vp, palette }: PaintView, { layout, active, people }: QuienPaint)`. Es el bloque «Threads from each owner to each labelled shared group, and the common glow», desde `const color = new Map(people…)` y `const poles = …` hasta el `ctx.globalAlpha = 1;` que lo cierra.
  - `export function paintQuienFront({ ctx, cam, vp, palette, text }: PaintView, { layout, active, people, countLabel }: QuienPaint)`. Es el bloque de cifras de grupo (`if (k > 0.12 && k < TITLE_ZOOM) …`) y el de polos (`for (const pole of layout.poles) …`) hasta su `ctx.globalAlpha = 1;`.
  - `type QuienPaint = { layout: QuienLayout; active: string[]; people: AtlasPerson[]; countLabel: (count: number) => string }`. `const k = cam.k`.
  - Importa `TITLE_ZOOM` desde el motor. Para evitar un ciclo de imports, mueve antes `COVER_ZOOM` y `TITLE_ZOOM` a `atlas-palette.ts` y reexpórtalos desde el motor (`export { COVER_ZOOM, TITLE_ZOOM } from './atlas-palette'`), así no cambian los imports de quien ya los usa.

- [ ] **Step 5: Motor.** En `atlas-engine.ts`:
  1. `EngineProps`: sustituye `layout: QuienLayout` por `scene: Scene; quien: QuienLayout`.
  2. `fitCamera` usa `props().scene.extent`.
  3. `Sprite` gana `diff: number | null`. `sync()` recorre `props().scene.targets` en lugar de `layout.positions` + `workState`:

```ts
    const { scene } = props(); const seen = new Set<WorkKey>();
    for (const [key, t] of scene.targets) {
      seen.add(key);
      const glow = t.glow ? 1 : 0;
      const sprite = sprites.get(key) ?? { x: t.x, y: t.y, tx: t.x, ty: t.y, a: t.alpha, ta: t.alpha, hl: glow, thl: 0, diff: t.diff };
      sprite.tx = t.x; sprite.ty = t.y; sprite.ta = t.alpha; sprite.thl = glow; sprite.diff = t.diff;
      if (reduce) { sprite.x = t.x; sprite.y = t.y; sprite.a = sprite.ta; sprite.hl = sprite.thl; }
      sprites.set(key, sprite);
    }
```

     El resto de `sync()` (borrado de sprites que sobran, `extentKey` con `scene.extent` e `insetsKey`) se queda igual.
  4. `draw()`: construye `const view: PaintView = { ctx, cam, vp, palette, text }` y sustituye los bloques movidos por `paintQuienBack(view, { layout: quien, active, people, countLabel })` antes de las obras y `paintQuienFront(view, { … })` después. Solo se llaman cuando `scene.lens === 'quien'` (en esta tarea siempre lo es).
  5. `hitPole` y `hitCluster` usan `props().quien` y devuelven `undefined` si `props().scene.lens !== 'quien'`. El vuelo a grupo de `tap` usa `props().quien` igual.
  6. Borra los imports que ya no se usen (`workState`, `clusterState`, `initials` pasan a `paint-quien.ts`).
- [ ] **Step 6: Canvas y vista.** En `atlas-canvas.tsx`, las dependencias del efecto de `sync` pasan de `props.layout` a `props.scene`. En `atlas-view.tsx`, calcula `const opinion = useMemo(() => layoutOpinion(people, works, active), [people, works, active]);` y `const scene = useMemo(() => buildScene('quien', works, active, layout, opinion), [works, active, layout, opinion]);`, y pasa `scene={scene} quien={layout}` en vez de `layout={layout}`. La lente sigue fija en `'quien'` hasta la Task 4.
- [ ] **Step 7: Tests.** `atlas-canvas.test.tsx` construye ahora `scene` con `buildScene('quien', works, active, layout, layoutOpinion(people, works, active))` y pasa `scene` + `quien`. Las aserciones existentes no cambian. Ejecuta `npx vitest run src/components/comparisons src/lib/comparisons`, `npx tsc --noEmit` y `npx eslint src/components/comparisons/atlas src/lib/comparisons/atlas`. Expected: todo en verde con **los mismos tests que antes** más los de escena. Es un refactor: si un test existente cambia de resultado, para y repórtalo.
- [ ] **Step 8: Commit** `refactor(entre-nosotros): escena por lente y pintores de Quién fuera del motor`.

---

### Task 3: Pintar Opinión en el motor

**Files:**
- Create: `src/components/comparisons/atlas/paint-opinion.ts`
- Modify: `src/components/comparisons/atlas/atlas-engine.ts`
- Test: `src/components/comparisons/atlas/atlas-canvas.test.tsx`

**Interfaces:**
- Consumes: `PaintView` (Task 2); `ratingX`, `RATING_STEP`, `AGREE_MAX` y `diffMix` (Task 1); `mixHex`.
- Produces:
  - `type OpinionLabels = { axisRef: string; axisOthers: string; loved: string; meh: string; refYes: string; othersYes: string }`.
  - `paintOpinionBack(view, labels)`.
  - `EngineProps` gana `opinionLabels: OpinionLabels`.

- [ ] **Step 1: Failing test** (añadir a `atlas-canvas.test.tsx`). Con la escena de Opinión, tocar donde estaría el polo de Quién no alterna la cara; sin `getContext` real, el motor se asienta y publica en la sonda solo las obras comparables:

```tsx
  it('en Opinión no hay polos que tocar y la sonda solo trae lo comparable', () => {
    const rated: Snapshot = { ...snapshot, works: snapshot.works.map(w => ({ ...w, rating: 8 })) };
    const model = atlasModel(rated, 'a', 'Tú'); const quien = layoutQuien(model.people, model.works);
    const opinion = layoutOpinion(model.people, model.works, ['a', 'b']);
    const scene = buildScene('opinion', model.works, ['a', 'b'], quien, opinion);
    const toggle = vi.fn();
    const labels = { axisRef: 'x', axisOthers: 'y', loved: 'l', meh: 'm', refYes: 'r', othersYes: 'o' };
    const { container } = render(<AtlasCanvas label="Mapa" people={model.people} works={model.works} active={['a', 'b']} scene={scene} quien={quien}
      opinionLabels={labels} countLabel={n => `${n}`} onTogglePerson={toggle} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(JSON.parse(host.dataset.atlasProbe!).map((p: { key: string }) => p.key)).toEqual(['book:1']);
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const k = Number(host.dataset.atlasZoom);
    const x = (quien.poles[0].x - 0) * k + 400, y = (quien.poles[0].y - 0) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
    expect(toggle).not.toHaveBeenCalled();
  });
```

  Añade los imports `layoutOpinion` y `buildScene`. Ejecuta y comprueba que falla: `opinionLabels` no existe en los tipos y, sin el gating de Opinión, el polo alterna.

- [ ] **Step 2: Implement `paint-opinion.ts`**

```ts
import { toScreen } from '@/lib/comparisons/atlas/camera';
import { AGREE_MAX, RATING_STEP, ratingX } from '@/lib/comparisons/atlas/opinion';
import type { PaintView } from './atlas-palette';

export type OpinionLabels = { axisRef: string; axisOthers: string; loved: string; meh: string; refYes: string; othersYes: string };

/** Frame, agreement band (±1 point) around the diagonal, ticks 1/5/10, axis titles and named corners (prototype `drawOpinionBg`). */
export function paintOpinionBack({ ctx, cam, vp, palette, text }: PaintView, labels: OpinionLabels) {
  const k = cam.k;
  const lo = toScreen(cam, vp, { x: ratingX(1), y: -ratingX(1) }), hi = toScreen(cam, vp, { x: ratingX(10), y: -ratingX(10) });
  const band = RATING_STEP * AGREE_MAX * k;
  ctx.fillStyle = 'rgba(242,194,123,.07)'; ctx.beginPath();
  ctx.moveTo(lo.x, lo.y - band); ctx.lineTo(lo.x, lo.y); ctx.lineTo(lo.x + band, lo.y);
  ctx.lineTo(hi.x, hi.y + band); ctx.lineTo(hi.x, hi.y); ctx.lineTo(hi.x - band, hi.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.strokeRect(lo.x, hi.y, hi.x - lo.x, lo.y - hi.y);
  ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(242,194,123,.35)';
  ctx.beginPath(); ctx.moveTo(lo.x, lo.y); ctx.lineTo(hi.x, hi.y); ctx.stroke(); ctx.setLineDash([]);
  const small = `500 12px ${palette.font}`;
  for (const value of [1, 5, 10]) {
    text(String(value), toScreen(cam, vp, { x: ratingX(value), y: 0 }).x, lo.y + 18, small, palette.faint, 'center');
    text(String(value), lo.x - 12, toScreen(cam, vp, { x: 0, y: -ratingX(value) }).y + 4, small, palette.faint, 'right');
  }
  const axis = `600 13px ${palette.font}`;
  text(labels.axisRef, hi.x, lo.y + 38, axis, palette.muted, 'right');
  ctx.save(); ctx.translate(lo.x - 36, hi.y); ctx.rotate(-Math.PI / 2); text(labels.axisOthers, 0, 0, axis, palette.muted, 'right'); ctx.restore();
  const big = `800 ${Math.min(30, Math.max(13, 16 * k * 2.4))}px ${palette.font}`;
  ctx.globalAlpha = 0.55;
  text(labels.loved, hi.x - 12, hi.y + 28, big, palette.glow, 'right');
  text(labels.meh, lo.x + 12, lo.y - 14, big, palette.fg, 'left');
  text(labels.refYes, hi.x - 12, lo.y - 14, big, palette.clash, 'right');
  text(labels.othersYes, lo.x + 12, hi.y + 28, big, palette.clash, 'left');
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 3: Motor.**
  1. `EngineProps` gana `opinionLabels: OpinionLabels`.
  2. En `draw()`: si `scene.lens === 'opinion'`, se llama a `paintOpinionBack(view, props().opinionLabels)` antes de las obras; si es Quién, se llaman los pintores de Quién como hasta ahora.
  3. Color por diferencia: `const tint = (s: Sprite) => s.diff === null ? null : mixHex(palette.glow, palette.clash, diffMix(s.diff));`.
     - En modo puntos, si `tint(s)` existe, el `fillStyle` es ese color y el radio es `Math.max(3, 4.2 * k * 1.4)`.
     - En modo portada con `tint(s)`, la portada mide `cw = 10 * k`, `ch = 14.5 * k` y el aro (`roundRect(x - 2, y - 2, cw + 4, ch + 4, …)`) se pinta siempre con ese color en vez del dorado de `hl`.
     - Sin `diff`, todo sigue como en F1.
  4. Los umbrales de portada y título no cambian.
- [ ] **Step 4: Run.** `npx vitest run src/components/comparisons/atlas`, `npx tsc --noEmit`, eslint de la carpeta. Expected: PASS (con el test nuevo).
- [ ] **Step 5: Commit** `feat(entre-nosotros): el motor del atlas pinta la lente Opinión`.

---

### Task 4: Lente en la vista, dock de dos lentes y mini-ficha con escala

**Files:**
- Create: `src/components/comparisons/atlas/rating-scale.tsx`
- Modify: `src/components/comparisons/atlas/atlas-view.tsx`, `atlas.module.css`, `src/components/comparisons/explorer.tsx`, `messages/es.json`
- Test: `src/components/comparisons/atlas/atlas-view.test.tsx`, `src/components/comparisons/explorer.test.tsx`

**Interfaces:**
- Consumes: `Lens` y `buildScene` (Task 2); `layoutOpinion` y `summarizeOpinion` (Task 1); `OpinionLabels` (Task 3).
- Produces:
  - `AtlasView` gana las props controladas `lens: Lens` y `onLensChange(lens: Lens): void`.
  - `RatingScale({ owners, people })`.

- [ ] **Step 1: i18n.** En `messages/es.json`, dentro de `comparisons.atlas`:
  - añade `"opinion": "Opinión"` a `lens`;
  - añade a `caption`: `"opinion": "Solo lo que compartís con nota. A la derecha, lo que le gustó a la referencia; arriba, lo que gustó al resto. En la diagonal coincidís; lejos de ella, chocáis."`;
  - añade este bloque:

```json
      "opinion": {
        "needsTwo": "Elige al menos a dos personas para comparar notas.",
        "empty": "{isMe, select, true {Aún no hay obras con tu nota y la de alguien más.} other {Aún no hay obras con nota de {ref} y de alguien más.}}",
        "counts": "Coincidís en <b>{agree}</b> y chocáis en <b>{clash}</b> de <b>{total}</b> {total, plural, one {obra compartida} other {obras compartidas}}",
        "countsWithRef": "Coincidís en <b>{agree}</b> y chocáis en <b>{clash}</b> de <b>{total}</b> {total, plural, one {obra compartida} other {obras compartidas}}, con {ref} como referencia",
        "axisRef": "{isMe, select, true {Tu nota} other {Nota de {ref}}} →",
        "axisOthers": "← Media del resto",
        "loved": "Os encantó",
        "meh": "Ni fu ni fa",
        "refYes": "{isMe, select, true {Tú sí, ellos no} other {{ref} sí, el resto no}}",
        "othersYes": "{isMe, select, true {Ellos sí, tú no} other {El resto sí, {ref} no}}",
        "ratings": "Notas: {list}",
        "noRating": "sin nota"
      },
```

- [ ] **Step 2: Failing tests de vista** (`atlas-view.test.tsx`). El `Harness` guarda también `lens` (`useState<Lens>('quien')`) y lo pasa con `onLensChange`. Usa un snapshot con notas (`rating`):

```tsx
  it('Opinión: el dock la activa, el resumen cuenta coincidencias y la mini-ficha pone a cada cual en su nota', () => {
    // me 9, Bea 9, Carla 4 → mean of others 6.5, diff 2.5 → neither agree nor clash
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    expect(summary()).toBe('Coincidís en 0 y chocáis en 0 de 1 obra compartida');
    expect(canvas.label).toContain('Opinión');
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.getByRole('img', { name: 'Notas: Tú 9, Bea 9, Carla 4' })).toBeTruthy();
  });
  it('Opinión con una sola cara pide otra', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bea' })); fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    expect(summary()).toBe('Elige al menos a dos personas para comparar notas.');
  });
  it('Opinión sin Tú usa la primera cara como referencia y lo dice', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(summary()).toBe('Coincidís en 0 y chocáis en 1 de 1 obra compartida, con Bea como referencia');
  });
```

  `viewRated(ratings)` monta el `Harness` con `snapshot` en el que `book:1` lleva esas notas por persona. Añádelo junto a `view()`. En `explorer.test.tsx`, añade: en Obras, pulsar «Opinión», cambiar la píldora de formato a «Libros» y comprobar que «Opinión» sigue con `aria-pressed="true"`.

  Ejecuta y comprueba que fallan.

- [ ] **Step 3: `rating-scale.tsx`**

```tsx
'use client';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { AtlasOwner, AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import styles from './atlas.module.css';

const at = (rating: number) => `${(rating - 1) / 9 * 100}%`;

/** Each person's avatar on one 1–10 scale (Cinema Circle), not an average. */
export function RatingScale({ owners, people }: { owners: AtlasOwner[]; people: AtlasPerson[] }) {
  const t = useTranslations('comparisons');
  const byId = new Map(people.map(person => [person.id, person]));
  const known = owners.filter(owner => byId.has(owner.userId));
  const rated = known.filter((owner): owner is AtlasOwner & { rating: number } => owner.rating !== null);
  const unrated = known.filter(owner => owner.rating === null);
  const list = known.map(owner => `${byId.get(owner.userId)!.name} ${owner.rating ?? t('atlas.opinion.noRating')}`).join(', ');
  const level = new Map<number, number>();
  return <div className={styles.scale} role="img" aria-label={t('atlas.opinion.ratings', { list })}>
    <div className={styles.scaleTrack} aria-hidden="true">
      {rated.map(owner => {
        const stack = level.get(owner.rating) ?? 0; level.set(owner.rating, stack + 1);
        const person = byId.get(owner.userId)!;
        return <span key={owner.userId} className={styles.scaleDot}
          style={{ left: at(owner.rating), bottom: `${stack * 14}px`, background: person.color } as CSSProperties}>{initials(person.name)}</span>;
      })}
    </div>
    <div className={styles.scaleTicks} aria-hidden="true">{[1, 5, 10].map(value => <span key={value} style={{ left: at(value) }}>{value}</span>)}</div>
    {unrated.length > 0 && <p className={styles.scaleNone} aria-hidden="true">
      {unrated.map(owner => byId.get(owner.userId)!.name).join(', ')}: {t('atlas.opinion.noRating')}</p>}
  </div>;
}
```

  Exporta `AtlasOwner` desde `types.ts` si aún no lo está (ya lo está desde F1). En `atlas.module.css` añade:

```css
.scale { display: grid; gap: 4px; min-width: 180px; margin-top: 6px; }
.scaleTrack { position: relative; height: 40px; margin: 0 10px; border-bottom: 1px solid var(--atlas-line); }
.scaleDot { position: absolute; transform: translateX(-50%); width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; font-weight: 800; color: #fff; box-shadow: 0 0 0 2px var(--atlas-panel); }
.scaleTicks { position: relative; height: 14px; margin: 0 10px; font-size: 11px; color: var(--atlas-faint); }
.scaleTicks span { position: absolute; transform: translateX(-50%); }
.scaleNone { margin: 0; font-size: 11px; color: var(--atlas-faint); }
```

- [ ] **Step 4: `atlas-view.tsx`.**
  1. Props: `lens: Lens; onLensChange: (lens: Lens) => void`.
  2. `scene = buildScene(lens, …)`, memoizado con `lens` en las dependencias.
  3. `opinionLabels`: `useMemo` con `isMe`/`ref` de la referencia actual (`people.find(p => p.id === opinion.reference)`; sin referencia, `isMe: 'true'`, `ref: ''`):

```ts
  const reference = people.find(person => person.id === opinion.reference);
  const who = { isMe: String(reference?.isMe ?? true), ref: reference?.name ?? '' };
  const opinionLabels = useMemo(() => ({ axisRef: t('atlas.opinion.axisRef', who), axisOthers: t('atlas.opinion.axisOthers'),
    loved: t('atlas.opinion.loved'), meh: t('atlas.opinion.meh'), refYes: t('atlas.opinion.refYes', who), othersYes: t('atlas.opinion.othersYes', who) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `who` is derived from these two values
    [t, who.isMe, who.ref]);
```

     Si el lint del repo no acepta el `eslint-disable`, memoiza `who` con `useMemo` sobre `reference` y usa `[t, who]`.
  4. Resumen por lente. Si `lens === 'opinion'`, el par `{ summaryKey, summaryValues }` sale de `summarizeOpinion(people, opinion)`:
     - `needsTwo` → `'atlas.opinion.needsTwo'`, `{}`;
     - `empty` → `'atlas.opinion.empty'`, `{ isMe: String(isMe), ref }`;
     - `counts` → `isMe ? 'atlas.opinion.counts' : 'atlas.opinion.countsWithRef'`, `{ agree, clash, total, ref }`.

     Si es Quién, todo sigue como ahora. El `canvasLabel` usa `t(\`atlas.lens.${lens}\`)`.
  5. Dock: dos botones con `aria-pressed={lens === 'quien'|'opinion'}`, `aria-label` y `onClick={() => onLensChange(…)}`. El icono de Opinión es el del prototipo: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 14 14 2"/><path d="M2 2v12h12"/><circle cx="10" cy="5" r="1.2" fill="currentColor"/><circle cx="5" cy="10" r="1.2" fill="currentColor"/></svg>`. La leyenda es `t(\`atlas.caption.${lens}\`)`.
  6. `WorkCard` gana `lens`. En Opinión pinta `<RatingScale owners={work.owners} people={people}/>` en lugar de la lista de dueños, tanto en el tooltip como en la hoja.
  7. `AtlasCanvas` recibe `opinionLabels`.
- [ ] **Step 5: `explorer.tsx`.** Junto a `atlasFaces`, añade `const [atlasLens, setAtlasLens] = useState<Lens>('quien');` (con el comentario «la lente sobrevive al cambio de formato, que remonta la vista») y pásalo como `lens={atlasLens} onLensChange={setAtlasLens}`.
- [ ] **Step 6: Run.** `npx vitest run src/components/comparisons src/lib/comparisons`, `npx tsc --noEmit`, `npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(entre-nosotros): lente Opinión en el atlas con escala de notas por persona`.

---

### Task 5: E2E, capturas y evidencia (gate con el usuario)

**Files:**
- Modify: `e2e/entre-nosotros-atlas.spec.ts`
- Create: `docs/testing/2026-10-13-entre-nosotros-atlas-f2.md` + `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f2/*.png`

**Interfaces:**
- Consumes: el fixture no integrado (3 personas, 30 libros en común, todos con nota 9). En Opinión: 30 comparables, 30 coincidencias, 0 choques.

- [ ] **Step 1: E2E.** Añade a `e2e/entre-nosotros-atlas.spec.ts`:

```ts
test('escritorio: Opinión resume, la mini-ficha pone las notas y sobrevive al cambio de formato', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const lenses = page.getByRole('group', { name: 'Lente', exact: true });
    await lenses.getByRole('button', { name: 'Opinión', exact: true }).click(); await settled(page);
    await expect(summary(page)).toHaveText('Coincidís en 30 y chocáis en 0 de 30 obras compartidas');
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.mouse.move(box.x + work.x, box.y + work.y);
    await expect(page.getByRole('img', { name: 'Notas: Tú 9, Beatriz QA 9, Carlos QA 9' })).toBeAttached();
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await settled(page);
    await expect(lenses.getByRole('button', { name: 'Opinión', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toHaveText('Coincidís en 30 y chocáis en 0 de 30 obras compartidas');
  });
});

test('móvil: Opinión desde el icono y la hoja con la escala de notas', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Opinión', exact: true }).tap(); await settled(page);
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    const sheet = page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ });
    await expect(sheet.getByRole('img', { name: 'Notas: Tú 9, Beatriz QA 9, Carlos QA 9' })).toBeVisible();
  });
});
```

  Si el tooltip del primer test no aparece porque las 30 obras caen casi en el mismo punto (todas con nota 9), pasa el ratón por la posición exacta de la sonda: el hit test elige la más cercana. No cambies la aserción.

- [ ] **Step 2: Ejecutar** contra build de producción (puerto 3000 libre, `npm run build`, `npm run start` en segundo plano, espera con `curl`):
  - `e2e/entre-nosotros-atlas.spec.ts` en ambos proyectos;
  - `e2e/entre-nosotros.spec.ts -g "CRUD|profile"`;
  - `e2e/entre-nosotros.spec.ts -g "transport|conflict"`;
  - `e2e/entre-nosotros.spec.ts -g "isolation"`.

  `LOCAL ONLY` queda fuera (#1520). Expected: todo PASS.
- [ ] **Step 3: Capturas.** Usa un spec temporal `e2e/zz-atlas-shots.spec.ts`, añadido temporalmente al `testMatch`; bórralo y revierte la config antes del commit. Monta `withComparisonFixture(…)` (no integrado: 3 personas) y, **antes de abrir el atlas**, reparte las notas del fixture para que haya acuerdo y choque. Para cada libro `i` (índice en `fixture.books`), haz `PATCH` sobre los pases de Beatriz y Carlos:

```ts
for (const [i, book] of fixture.books.entries()) {
  await comparisonRest(`passes?user_id=eq.${fixture.actors[1].id}&item_id=eq.${book.id}`, { method: 'PATCH', body: JSON.stringify({ rating: (i * 7) % 10 + 1 }) });
  await comparisonRest(`passes?user_id=eq.${fixture.actors[2].id}&item_id=eq.${book.id}`, { method: 'PATCH', body: JSON.stringify({ rating: (i * 3) % 10 + 1 }) });
}
```

  Captura:
  - escritorio 1280×800: `desktop-opinion.png` (encajado), `desktop-opinion-covers.png` (zoom > 1,1), `desktop-opinion-tooltip.png` (ratón sobre una obra) y `desktop-opinion-ref.png` (Tú desactivada: la referencia es Beatriz);
  - móvil Pixel 7: `mobile-opinion.png` y `mobile-opinion-sheet.png`.

  Mira cada PNG y anota con honestidad lo que se vea mal: solapes, texto cortado, contraste, scroll horizontal.
- [ ] **Step 4: Evidencia.** Escribe `docs/testing/2026-10-13-entre-nosotros-atlas-f2.md` con cabecera `[Histórico · verificado 2026-10-13]`. Incluye el build y el SHA, las cifras de unitarios, tsc, lint y e2e por tanda, las capturas enlazadas, las observaciones visuales y lo no verificado (dispositivo real, fps con 1.000 obras, portadas reales: F4).
- [ ] **Step 5: Parar.** Para el servidor del 3000 y no dejes nada corriendo. Haz commit (`docs(entre-nosotros): evidencia y capturas de F2 del atlas`). Enseña las capturas al usuario y espera su visto bueno antes de F3.
