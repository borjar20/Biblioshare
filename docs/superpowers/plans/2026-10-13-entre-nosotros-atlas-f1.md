# Entre nosotros · atlas · F1 (base y lente Quién) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Un implementador cada vez** en este árbol: dos en paralelo cruzan el index de git.

**Goal:** Sustituir la sección Obras de «Entre nosotros» por un atlas en `<canvas>` a pantalla completa y oscuro, con cámara, caras, la lente Quién, LOD de puntos y portadas planas, tooltip, hoja inferior y navegación a la ficha. Gustos sigue viva provisionalmente.

**Architecture:** Funciones puras en `src/lib/comparisons/atlas/` (modelo, cámara, maquetación, resumen, hit test), con Vitest. Un motor de dibujo sin React (`atlas-engine.ts`) lo envuelve un componente fino (`atlas-canvas.tsx`). `atlas-view.tsx` deriva todo del `Snapshot` (caras, resumen, dock, tooltip, hoja) y `explorer.tsx` conserva sesión, carga y grupos. La ruta pasa a ser a sangre (`isFullscreenRoute`) y su raíz lleva la clase `dark`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, next-intl, CSS Modules, Canvas 2D, Vitest (+ jsdom por fichero) y Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-13-entre-nosotros-atlas-design.md`](../specs/2026-10-13-entre-nosotros-atlas-design.md) · Prototipo: [`../specs/assets/entre-nosotros-atlas-prototipo.html`](../specs/assets/entre-nosotros-atlas-prototipo.html)

## Global Constraints

- Sin tablas, columnas, RLS ni migraciones. Si algo parece exigirlas, para y pregunta.
- Todo deriva de `passes` y `episode_watches` (vía `normalize`), nunca de `library_entries`.
- Sin `use cache` en nada de esta feature: los datos dependen de la sesión (regla #437).
- Strings de UI en `messages/es.json`, bajo `comparisons` (las nuevas en `comparisons.atlas.*`). Docs, copy y commits en español.
- El atlas es **siempre oscuro**: la raíz de la ruta lleva la clase `dark` y los tokens `--atlas-*`.
- Umbrales del prototipo: portadas con `k > 1.1`, títulos con `k > 3.2`, zoom entre 0.08 y 16, `devicePixelRatio` con tope de 2, umbral de 5 px entre toque y arrastre, interpolación 0.11 (obras), 0.14 (opacidad) y 0.16 (cámara).
- Polos a radio 900. La espiral usa paso 12, ángulo áureo y `r = 12·√(i+0.5)`; el radio de grupo es `12·√n + 8`. El centroide va × 0.92 si hay varios dueños.
- En F1 **no** se cargan imágenes de portada (portada = bloque del color del tipo). Las imágenes van en F4.
- Node 22. En PowerShell, cada comando de test empieza por `fnm env | Out-String | Invoke-Expression; fnm use 22;` en la MISMA línea. Comprueba `node --version` = v22.
- Copia `.env.local` del repo padre al worktree antes de cualquier e2e. Sin él, los specs se saltan en silencio.
- Commits con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` al final.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/comparisons/types.ts` (mod) | `PersonWork.date` |
| `src/lib/comparisons/normalize.ts` (mod) | Rellenar `date` desde el pase que da la nota |
| `src/lib/comparisons/atlas/types.ts` | Tipos del atlas (personas, obras, cámara) |
| `src/lib/comparisons/atlas/model.ts` | `Snapshot` → personas y obras del atlas, paleta |
| `src/lib/comparisons/atlas/camera.ts` | `toScreen`, `toWorld`, `zoomAt`, `panBy`, `fit`, `stepCamera`, `approach` |
| `src/lib/comparisons/atlas/hit.ts` | `nearest` (hit test genérico) |
| `src/lib/comparisons/atlas/layout.ts` | `layoutQuien`, `workState`, `clusterState`, `spiral`, `polePositions` |
| `src/lib/comparisons/atlas/summary.ts` | `summarizeQuien` |
| `src/components/comparisons/atlas/atlas-engine.ts` | Bucle rAF, dibujo, gestos y sonda para e2e (sin React) |
| `src/components/comparisons/atlas/atlas-canvas.tsx` | Envoltura React del motor |
| `src/components/comparisons/atlas/atlas-view.tsx` | Caras, resumen, dock, zoom, tooltip y hoja |
| `src/components/comparisons/atlas/atlas.module.css` | Estilos del atlas |
| `src/components/comparisons/group-sheet.tsx` | Chip de grupo y hoja con selector y acciones |
| `src/components/comparisons/explorer.tsx` (mod) | Marco inmersivo; Obras → `AtlasView` |
| `src/components/comparisons/explorer.module.css` (mod) | Marco inmersivo y tokens `--atlas-*` |
| `src/app/comunidad/entre-nosotros/page.tsx` (mod) | Sin envoltorio ni enlace propio |
| `src/components/nav/fullscreen-routes.ts` (mod) | Ruta a sangre |
| `messages/es.json` (mod) | `comparisons.atlas.*` |
| `e2e/entre-nosotros-atlas.spec.ts` | E2E nuevo, escritorio y móvil |
| `e2e/entre-nosotros.spec.ts` (mod), `e2e/entre-nosotros-motion.spec.ts` (borrar), `playwright.comparisons.config.ts` (mod) | Adaptar la suite existente |

---

### Task 1: `date` en `PersonWork`

**Files:**
- Modify: `src/lib/comparisons/types.ts` (tipo `PersonWork`)
- Modify: `src/lib/comparisons/normalize.ts` (dos `works.push`)
- Test: `src/lib/comparisons/normalize.test.ts`
- Modify (solo literales): todo fichero que construya un `PersonWork` y que señale `tsc`

**Interfaces:**
- Produces: `PersonWork = { userId; key; rating: number | null; date: string | null; orderUnknown; progress }`

- [ ] **Step 1: Write the failing tests** (añadir al final del `describe('normalize', …)` de `normalize.test.ts`)

```ts
  describe('fecha del registro (atlas)', () => {
    it('libro: finished_on del mismo pase que da la nota', () => {
      const facts = normalize([
        pass({ id: 'old', rating: 8, finished_on: '2024-03-01' }),
        pass({ id: 'new', rating: 6, finished_on: '2025-05-02' }),
      ], [], []);
      expect(facts.works[0]).toMatchObject({ rating: 6, date: '2025-05-02' });
    });
    it('libro terminado sin fecha deja date nula', () => {
      expect(normalize([pass({ finished_on: null })], [], []).works[0].date).toBeNull();
    });
    it('serie en curso: último watched_on', () => {
      const facts = normalize([
        pass({ id: 'p', item_type: 'series', item_id: 's', status: 'in_progress', finished_on: null }),
      ], [
        watch({ id: 'w1', episode_number: 1, watched_on: '2026-01-03' }),
        watch({ id: 'w2', episode_number: 2, watched_on: '2026-02-10' }),
      ], []);
      expect(facts.works[0].date).toBe('2026-02-10');
    });
    it('serie cerrada: finished_on del pase, o último watched_on si falta', () => {
      const closed = normalize([
        pass({ id: 'p', item_type: 'series', item_id: 's', status: 'completed', is_active: false, finished_on: '2025-12-24' }),
      ], [watch({ watched_on: '2025-12-01' })], []);
      expect(closed.works[0].date).toBe('2025-12-24');
      const undated = normalize([
        pass({ id: 'p', item_type: 'series', item_id: 's', status: 'dropped', is_active: false, finished_on: null }),
      ], [watch({ watched_on: '2025-11-30' })], []);
      expect(undated.works[0].date).toBe('2025-11-30');
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/normalize.test.ts`
Expected: FAIL. Las cuatro pruebas nuevas reciben `date: undefined`.

- [ ] **Step 3: Implement**

En `types.ts`:

```ts
export type PersonWork = { userId: string; key: WorkKey; rating: number | null;
  /** ISO date of the record that gives `rating` (see atlas spec §2.2). */
  date: string | null;
  orderUnknown: boolean; progress: SeriesProgress | null };
```

En `normalize.ts`, en la rama de libros y películas:

```ts
      works.push({ userId, key, rating: completed[0].rating, date: completed[0].finished_on,
        orderUnknown: completed.length > 1 && completed.some((row) => row.finished_on === null),
        progress: null });
```

En la rama de series, justo antes de su `works.push`:

```ts
    const lastWatched = seen.reduce((latest, row) => row.watched_on > latest ? row.watched_on : latest, seen[0].watched_on);
    const date = activeInProgress ? lastWatched : general?.finished_on ?? lastWatched;
```

Y en el `push`:

```ts
    works.push({ userId, key, rating: general?.rating ?? null, date,
```

- [ ] **Step 4: Arreglar literales.** Ejecuta `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit`. En cada error «Property 'date' is missing» de un literal de `PersonWork`, añade `date: null` junto a `orderUnknown`. Los ficheros esperables son `canvas.test.tsx`, `explorer.test.tsx`, `geometry.test.ts`, `state.test.ts`, `tastes.test.tsx`, `work-detail.test.tsx` y `derive.test.ts`. Repite hasta que `tsc` salga limpio.

- [ ] **Step 5: Run tests**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons src/components/comparisons`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comparisons src/components/comparisons
git commit -m "feat(entre-nosotros): fecha del registro en PersonWork para el atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Modelo del atlas

**Files:**
- Create: `src/lib/comparisons/atlas/types.ts`
- Create: `src/lib/comparisons/atlas/model.ts`
- Test: `src/lib/comparisons/atlas/model.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `PersonWork.date` (Task 1).
- Produces:
  - `AtlasPerson`, `AtlasOwner`, `AtlasWork`, `Point`, `Camera`, `Viewport` y `Extent` (abajo).
  - `PERSON_COLORS: readonly string[]` (10 colores).
  - `atlasModel(snapshot: Snapshot, viewerId: string, youLabel: string): { people: AtlasPerson[]; works: AtlasWork[] }`.

- [ ] **Step 1: Create `types.ts`**

```ts
import type { CatalogWork, Media, WorkKey } from '../types';

export type AtlasPerson = { id: string; name: string; avatarUrl: string | null; color: string; isMe: boolean };
export type AtlasOwner = { userId: string; rating: number | null; date: string | null };
export type AtlasWork = { key: WorkKey; itemType: Media; itemId: string; title: string; metadataMissing: boolean;
  coverUrl: string | null; genres: string[]; creators: CatalogWork['creators']; owners: AtlasOwner[] };
export type Point = { x: number; y: number };
export type Camera = { x: number; y: number; k: number };
export type Viewport = { width: number; height: number };
export type Extent = { minX: number; minY: number; maxX: number; maxY: number };
```

- [ ] **Step 2: Write the failing test** (`model.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '../types';
import { PERSON_COLORS, atlasModel } from './model';

const member = (id: string, name: string, available = true) => ({ slotId: id, userId: available ? id : null, name: available ? name : null, avatarUrl: null, available });
const work = (userId: string, key: WorkKey, rating: number | null = null, date: string | null = null) => ({ userId, key, rating, date, orderUnknown: false, progress: null });
const snapshot: Snapshot = {
  group: { id: 'g', name: 'G', revision: 1, members: [member('b', 'Bea'), member('me', 'Yo'), member('x', 'Gone', false), member('c', 'Carla')] },
  format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [
    { key: 'movie:2', title: 'Peli', coverUrl: null, genres: ['Drama'], creators: [] },
    { key: 'book:9', title: 'Libro', coverUrl: '/c.jpg', genres: [], creators: [] },
  ],
  works: [work('b', 'movie:2', 7, '2024-01-01'), work('me', 'movie:2', 9, null), work('c', 'book:9'), work('me', 'book:1')],
};

describe('atlasModel', () => {
  it('pone primero a quien mira, como «Tú», y salta los no disponibles', () => {
    const { people } = atlasModel(snapshot, 'me', 'Tú');
    expect(people.map(p => [p.id, p.name, p.isMe])).toEqual([['me', 'Tú', true], ['b', 'Bea', false], ['c', 'Carla', false]]);
    expect(people.map(p => p.color)).toEqual(PERSON_COLORS.slice(0, 3));
  });
  it('agrupa por obra, ordena por tipo e id y conserva nota y fecha por dueño', () => {
    const { works } = atlasModel(snapshot, 'me', 'Tú');
    expect(works.map(w => w.key)).toEqual(['book:1', 'book:9', 'movie:2']);
    expect(works[2]).toMatchObject({ itemType: 'movie', itemId: '2', title: 'Peli', genres: ['Drama'],
      owners: [{ userId: 'me', rating: 9, date: null }, { userId: 'b', rating: 7, date: '2024-01-01' }] });
  });
  it('marca sin metadatos la obra que no está en catálogo', () => {
    const { works } = atlasModel(snapshot, 'me', 'Tú');
    expect(works[0]).toMatchObject({ key: 'book:1', title: '', metadataMissing: true, coverUrl: null });
  });
  it('sin quien mira en el grupo, conserva el orden de slots', () => {
    const { people } = atlasModel(snapshot, 'zzz', 'Tú');
    expect(people.map(p => p.id)).toEqual(['b', 'me', 'c']);
    expect(people.every(p => !p.isMe)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/model.test.ts`
Expected: FAIL («Cannot find module './model'»).

- [ ] **Step 4: Implement `model.ts`**

```ts
import type { Media, Snapshot, WorkKey } from '../types';
import type { AtlasOwner, AtlasPerson, AtlasWork } from './types';

/** Fixed palette on the always-dark atlas ground, assigned in people order («Tú» first). */
export const PERSON_COLORS = ['#e08a5a', '#5aa7a6', '#b48ac0', '#7fa2d6', '#d6b45a',
  '#8fcf7a', '#e07a9a', '#6fc3d6', '#c9a07a', '#a0a8e0'] as const;

export function atlasModel(snapshot: Snapshot, viewerId: string, youLabel: string): { people: AtlasPerson[]; works: AtlasWork[] } {
  const members = snapshot.group.members.filter(member => member.available && member.userId !== null);
  const ordered = [...members.filter(member => member.userId === viewerId), ...members.filter(member => member.userId !== viewerId)];
  const people: AtlasPerson[] = ordered.map((member, index) => ({ id: member.userId!,
    name: member.userId === viewerId ? youLabel : member.name ?? '', avatarUrl: member.avatarUrl,
    color: PERSON_COLORS[index % PERSON_COLORS.length], isMe: member.userId === viewerId }));
  const order = new Map(people.map((person, index) => [person.id, index]));
  const catalog = new Map(snapshot.catalog.map(item => [item.key, item]));
  const owners = new Map<WorkKey, AtlasOwner[]>();
  for (const work of snapshot.works) {
    if (!order.has(work.userId)) continue;
    const list = owners.get(work.key) ?? [];
    if (list.some(owner => owner.userId === work.userId)) continue;
    list.push({ userId: work.userId, rating: work.rating, date: work.date });
    owners.set(work.key, list);
  }
  const works = [...owners].map(([key, list]): AtlasWork => {
    const [itemType, itemId] = key.split(':') as [Media, string];
    const meta = catalog.get(key);
    return { key, itemType, itemId, title: meta?.title ?? '', metadataMissing: !meta || !!meta.metadataMissing,
      coverUrl: meta?.coverUrl ?? null, genres: meta?.genres ?? [], creators: meta?.creators ?? [],
      owners: list.toSorted((a, b) => order.get(a.userId)! - order.get(b.userId)!) };
  });
  // Stable spiral order: itemType + itemId (the key is exactly `${type}:${id}`).
  return { people, works: works.toSorted((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
}
```

- [ ] **Step 5: Run test** (mismo comando que el Step 3). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comparisons/atlas
git commit -m "feat(entre-nosotros): modelo puro del atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cámara y hit test

**Files:**
- Create: `src/lib/comparisons/atlas/camera.ts`, `src/lib/comparisons/atlas/hit.ts`
- Test: `src/lib/comparisons/atlas/camera.test.ts`

**Interfaces:**
- Consumes: `Camera`, `Viewport`, `Point` y `Extent` (Task 2).
- Produces:
  - Constantes `MIN_ZOOM`, `MAX_ZOOM` y `clamp(v, min, max)`.
  - `toScreen(cam, vp, p): Point` y `toWorld(cam, vp, s): Point`.
  - `zoomAt(cam, vp, s: Point, factor): Camera` y `panBy(cam, dx, dy): Camera`.
  - `fit(extent, vp, pad: Point, maxK = 4): Camera`.
  - `zoomToward(cam, vp, s: Point, factor, maxK = 14): Camera`.
  - `stepCamera(cam, target, f): { camera: Camera; done: boolean }`.
  - `approach(value, target, factor, epsilon): { value: number; settled: boolean }`.
  - `nearest<T extends Point>(items: Iterable<T>, p: Point, radius: number): T | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { approach, fit, MAX_ZOOM, MIN_ZOOM, panBy, stepCamera, toScreen, toWorld, zoomAt, zoomToward } from './camera';
import { nearest } from './hit';

const vp = { width: 800, height: 600 };
const cam = { x: 120, y: -40, k: 0.7 };

describe('cámara', () => {
  it('toWorld deshace toScreen', () => {
    const p = { x: 333, y: -77 };
    const back = toWorld(cam, vp, toScreen(cam, vp, p));
    expect(back.x).toBeCloseTo(p.x); expect(back.y).toBeCloseTo(p.y);
  });
  it('zoomAt deja fijo el punto bajo el cursor y respeta los límites', () => {
    const s = { x: 610, y: 120 };
    const before = toWorld(cam, vp, s); const next = zoomAt(cam, vp, s, 2.5);
    const after = toWorld(next, vp, s);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(cam, vp, s, 1e6).k).toBe(MAX_ZOOM); expect(zoomAt(cam, vp, s, 1e-6).k).toBe(MIN_ZOOM);
  });
  it('panBy mueve la cámara en sentido contrario al arrastre, en unidades de mundo', () => {
    expect(panBy(cam, 70, -14)).toEqual({ x: 20, y: -20, k: 0.7 });
  });
  it('fit centra la extensión y la hace caber con el margen', () => {
    const extent = { minX: -1000, minY: -500, maxX: 1000, maxY: 700 };
    const c = fit(extent, vp, { x: 0, y: 150 });
    expect(c.x).toBe(0); expect(c.y).toBe(100);
    expect(c.k).toBeCloseTo(Math.min(800 / 2000, 450 / 1200));
    const tl = toScreen(c, vp, { x: extent.minX, y: extent.minY });
    expect(tl.x).toBeGreaterThanOrEqual(-0.001);
  });
  it('zoomToward centra el punto tocado y multiplica el zoom con tope', () => {
    const next = zoomToward(cam, vp, { x: 400, y: 300 }, 2.6);
    expect(next).toEqual({ x: 120, y: -40, k: 0.7 * 2.6 });
    expect(zoomToward({ ...cam, k: 10 }, vp, { x: 400, y: 300 }, 2.6).k).toBe(14);
  });
  it('stepCamera converge y termina exactamente en el objetivo', () => {
    let current = cam; const target = { x: 0, y: 0, k: 2 }; let done = false; let steps = 0;
    while (!done && steps < 500) { ({ camera: current, done } = stepCamera(current, target, 0.16)); steps++; }
    expect(done).toBe(true); expect(current).toEqual(target);
    expect(stepCamera(cam, target, 1)).toEqual({ camera: target, done: true });
  });
  it('approach interpola y se asienta en el objetivo', () => {
    expect(approach(0, 10, 0.1, 0.3)).toEqual({ value: 1, settled: false });
    expect(approach(9.8, 10, 0.1, 0.3)).toEqual({ value: 10, settled: true });
  });
});

describe('nearest', () => {
  it('devuelve el más cercano dentro del radio, o null', () => {
    const items = [{ x: 0, y: 0, id: 'a' }, { x: 5, y: 0, id: 'b' }];
    expect(nearest(items, { x: 4, y: 0 }, 3)?.id).toBe('b');
    expect(nearest(items, { x: 40, y: 0 }, 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/camera.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implement `camera.ts`**

```ts
import type { Camera, Extent, Point, Viewport } from './types';

export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 16;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function toScreen(cam: Camera, vp: Viewport, p: Point): Point {
  return { x: (p.x - cam.x) * cam.k + vp.width / 2, y: (p.y - cam.y) * cam.k + vp.height / 2 };
}
export function toWorld(cam: Camera, vp: Viewport, s: Point): Point {
  return { x: (s.x - vp.width / 2) / cam.k + cam.x, y: (s.y - vp.height / 2) / cam.k + cam.y };
}
/** Zoom keeping the world point under `s` fixed on screen. */
export function zoomAt(cam: Camera, vp: Viewport, s: Point, factor: number): Camera {
  const k = clamp(cam.k * factor, MIN_ZOOM, MAX_ZOOM);
  const w = toWorld(cam, vp, s);
  return { k, x: w.x - (s.x - vp.width / 2) / k, y: w.y - (s.y - vp.height / 2) / k };
}
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { k: cam.k, x: cam.x - dx / cam.k, y: cam.y - dy / cam.k };
}
/** Centre `s` and multiply the zoom (double click / double tap). */
export function zoomToward(cam: Camera, vp: Viewport, s: Point, factor: number, maxK = 14): Camera {
  const w = toWorld(cam, vp, s);
  return { x: w.x, y: w.y, k: Math.min(maxK, cam.k * factor) };
}
export function fit(extent: Extent, vp: Viewport, pad: Point, maxK = 4): Camera {
  const k = Math.min((vp.width - pad.x) / (extent.maxX - extent.minX), (vp.height - pad.y) / (extent.maxY - extent.minY));
  return { x: (extent.minX + extent.maxX) / 2, y: (extent.minY + extent.maxY) / 2, k: clamp(k, MIN_ZOOM, maxK) };
}
export function stepCamera(cam: Camera, target: Camera, f: number): { camera: Camera; done: boolean } {
  const k = cam.k * Math.pow(target.k / cam.k, f);
  const x = cam.x + (target.x - cam.x) * f, y = cam.y + (target.y - cam.y) * f;
  if (Math.abs(target.k / k - 1) < 0.002 && Math.hypot(target.x - x, target.y - y) < 0.5) return { camera: { ...target }, done: true };
  return { camera: { x, y, k }, done: false };
}
export function approach(value: number, target: number, factor: number, epsilon: number): { value: number; settled: boolean } {
  if (Math.abs(target - value) <= epsilon) return { value: target, settled: true };
  return { value: value + (target - value) * factor, settled: false };
}
```

- [ ] **Step 4: Implement `hit.ts`**

```ts
import type { Point } from './types';

export function nearest<T extends Point>(items: Iterable<T>, p: Point, radius: number): T | null {
  let best: T | null = null; let distance = radius;
  for (const item of items) {
    const d = Math.hypot(item.x - p.x, item.y - p.y);
    if (d <= distance) { distance = d; best = item; }
  }
  return best;
}
```

- [ ] **Step 5: Run test** (mismo comando que el Step 2). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comparisons/atlas
git commit -m "feat(entre-nosotros): cámara y hit test puros del atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lente Quién y resumen

**Files:**
- Create: `src/lib/comparisons/atlas/layout.ts`, `src/lib/comparisons/atlas/summary.ts`
- Test: `src/lib/comparisons/atlas/layout.test.ts`

**Interfaces:**
- Consumes: `AtlasPerson`, `AtlasWork`, `Point` y `Extent` (Task 2); `regions` de `src/lib/comparisons/derive.ts` (solo en el test).
- Produces:
  - `POLE_RADIUS = 900`, `SPIRAL_STEP = 12` y `spiral(i, step): Point`.
  - `polePositions(ids: string[]): (Point & { userId: string })[]`.
  - `type Pole = Point & { userId: string; count: number }`.
  - `type Cluster = Point & { id: string; owners: string[]; r: number; keys: WorkKey[] }`.
  - `type QuienLayout = { poles: Pole[]; clusters: Cluster[]; positions: Map<WorkKey, Point>; extent: Extent }`.
  - `layoutQuien(people, works): QuienLayout`.
  - `workState(work, active): { alpha: number; glow: boolean; shared: boolean }`.
  - `clusterState(cluster, active): { on: boolean; common: boolean; labelled: boolean }`.
  - `type AtlasSummary = { kind: 'solo'; count: number; name: string } | { kind: 'common'; count: number; names: string[] }`.
  - `summarizeQuien(people, works, active): AtlasSummary`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '../types';
import { regions } from '../derive';
import { atlasModel } from './model';
import { clusterState, layoutQuien, polePositions, POLE_RADIUS, workState } from './layout';
import { summarizeQuien } from './summary';

const member = (id: string) => ({ slotId: id, userId: id, name: id.toUpperCase(), avatarUrl: null, available: true });
const owned: Record<string, string[]> = {
  a: ['book:1', 'book:2', 'book:3', 'book:4', 'movie:1', 'series:1'],
  b: ['book:1', 'book:2', 'book:3', 'book:5', 'movie:1'],
  c: ['book:1', 'book:2', 'book:6', 'series:1'],
};
const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b', 'c'].map(member) }, format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [], works: Object.entries(owned).flatMap(([userId, keys]) => keys.map(key => ({ userId, key: key as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');

describe('layoutQuien', () => {
  it('cada grupo tiene las mismas obras que la región exacta del Venn', () => {
    const layout = layoutQuien(people, works);
    for (const region of regions(snapshot, ['a', 'b', 'c'])) {
      const cluster = layout.clusters.find(c => [...c.owners].sort().join() === [...region.people].sort().join());
      if (region.keys.length === 0) { expect(cluster).toBeUndefined(); continue; }
      expect(cluster?.keys.toSorted()).toEqual(region.keys.toSorted());
    }
  });
  it('coloca polos en el círculo y grupos en el centroide (×0,92 si son varios)', () => {
    const layout = layoutQuien(people, works);
    for (const pole of layout.poles) expect(Math.hypot(pole.x, pole.y)).toBeCloseTo(POLE_RADIUS);
    const ab = layout.clusters.find(c => c.id === 'a,b')!;
    const [pa, pb] = ['a', 'b'].map(id => layout.poles.find(p => p.userId === id)!);
    expect(ab.x).toBeCloseTo((pa.x + pb.x) / 2 * 0.92); expect(ab.y).toBeCloseTo((pa.y + pb.y) / 2 * 0.92);
    expect(layout.poles.map(p => p.count)).toEqual([6, 5, 4]);
  });
  it('con dos personas, polos en horizontal', () => {
    const [left, right] = polePositions(['x', 'y']);
    expect(left.y).toBeCloseTo(0); expect(right.y).toBeCloseTo(0); expect(left.x).toBeLessThan(right.x);
  });
  it('es determinista y da una posición a cada obra', () => {
    const first = layoutQuien(people, works), second = layoutQuien(people, works);
    expect([...first.positions]).toEqual([...second.positions]);
    expect(first.positions.size).toBe(works.length);
  });
  it('la extensión contiene polos y grupos con margen', () => {
    const { extent, poles } = layoutQuien(people, works);
    for (const p of poles) { expect(p.x).toBeGreaterThan(extent.minX); expect(p.x).toBeLessThan(extent.maxX); expect(p.y).toBeLessThan(extent.maxY - 100); }
  });
});

describe('estado por caras', () => {
  const key = (k: string) => works.find(w => w.key === k)!;
  it('brilla lo común a todas las activas y se atenúa lo que no toca a ninguna', () => {
    expect(workState(key('book:1'), ['a', 'b', 'c'])).toEqual({ alpha: 1, glow: true, shared: true });
    expect(workState(key('book:3'), ['a', 'b', 'c']).glow).toBe(false);
    expect(workState(key('book:6'), ['a', 'b']).alpha).toBe(0.06);
    expect(workState(key('book:4'), ['a']).glow).toBe(false);
  });
  it('grupo encendido si todos sus dueños están activos; con cifra solo si es compartido y tiene ≥3', () => {
    const layout = layoutQuien(people, works);
    const ab = layout.clusters.find(c => c.id === 'a,b')!; const abc = layout.clusters.find(c => c.id === 'a,b,c')!;
    expect(clusterState(ab, ['a', 'b'])).toEqual({ on: true, common: true, labelled: false });
    expect(clusterState(abc, ['a', 'b'])).toEqual({ on: false, common: true, labelled: false });
    expect(clusterState(layout.clusters.find(c => c.id === 'a')!, ['a']).labelled).toBe(false);
  });
});

describe('summarizeQuien', () => {
  it('cuenta lo común a todas las activas', () => {
    expect(summarizeQuien(people, works, ['a', 'b', 'c'])).toEqual({ kind: 'common', count: 2, names: ['Tú', 'B', 'C'] });
    expect(summarizeQuien(people, works, ['a', 'b'])).toEqual({ kind: 'common', count: 4, names: ['Tú', 'B'] });
  });
  it('con una sola cara cuenta sus obras', () => {
    expect(summarizeQuien(people, works, ['c'])).toEqual({ kind: 'solo', count: 4, name: 'C' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/layout.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implement `layout.ts`**

```ts
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const POLE_RADIUS = 900;
export const SPIRAL_STEP = 12;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Shared groups with fewer works draw no count nor thread (6–10 people would saturate the centre). */
const LABEL_MIN = 3;

export type Pole = Point & { userId: string; count: number };
export type Cluster = Point & { id: string; owners: string[]; r: number; keys: WorkKey[] };
export type QuienLayout = { poles: Pole[]; clusters: Cluster[]; positions: Map<WorkKey, Point>; extent: Extent };

export function spiral(i: number, step: number): Point {
  const r = step * Math.sqrt(i + 0.5), t = i * GOLDEN;
  return { x: Math.cos(t) * r, y: Math.sin(t) * r };
}

export function polePositions(ids: string[]): (Point & { userId: string })[] {
  if (ids.length === 1) return [{ userId: ids[0], x: 0, y: 0 }];
  return ids.map((userId, i) => {
    const angle = ids.length === 2 ? Math.PI * (1 - i) : -Math.PI / 2 + i * 2 * Math.PI / ids.length;
    return { userId, x: Math.cos(angle) * POLE_RADIUS, y: Math.sin(angle) * POLE_RADIUS };
  });
}

export function layoutQuien(people: AtlasPerson[], works: AtlasWork[]): QuienLayout {
  const base = polePositions(people.map(person => person.id));
  const at = new Map(base.map(pole => [pole.userId, pole]));
  const poles: Pole[] = base.map(pole => ({ ...pole, count: works.filter(work => work.owners.some(owner => owner.userId === pole.userId)).length }));
  const groups = new Map<string, { owners: string[]; keys: WorkKey[] }>();
  for (const work of works) {
    const owners = work.owners.map(owner => owner.userId); const id = owners.join(',');
    const group = groups.get(id) ?? { owners, keys: [] };
    group.keys.push(work.key); groups.set(id, group);
  }
  const positions = new Map<WorkKey, Point>();
  const clusters: Cluster[] = [...groups].map(([id, { owners, keys }]) => {
    const f = owners.length > 1 ? 0.92 : 1;
    const x = owners.reduce((sum, owner) => sum + at.get(owner)!.x, 0) / owners.length * f;
    const y = owners.reduce((sum, owner) => sum + at.get(owner)!.y, 0) / owners.length * f;
    keys.forEach((key, i) => { const offset = spiral(i, SPIRAL_STEP); positions.set(key, { x: x + offset.x, y: y + offset.y }); });
    return { id, owners, keys, x, y, r: SPIRAL_STEP * Math.sqrt(keys.length) + 8 };
  });
  const xs = [...poles.map(p => p.x), ...clusters.flatMap(c => [c.x - c.r, c.x + c.r])];
  const ys = [...poles.map(p => p.y), ...clusters.flatMap(c => [c.y - c.r, c.y + c.r])];
  // Room for pole avatars and their name/count labels below.
  const extent = { minX: Math.min(...xs) - 180, maxX: Math.max(...xs) + 180, minY: Math.min(...ys) - 150, maxY: Math.max(...ys) + 170 };
  return { poles, clusters, positions, extent };
}

export function workState(work: AtlasWork, active: string[]): { alpha: number; glow: boolean; shared: boolean } {
  const touches = work.owners.some(owner => active.includes(owner.userId));
  const glow = active.length > 1 && active.every(id => work.owners.some(owner => owner.userId === id));
  return { alpha: touches ? 1 : 0.06, glow, shared: work.owners.length > 1 };
}

export function clusterState(cluster: Cluster, active: string[]): { on: boolean; common: boolean; labelled: boolean } {
  return { on: cluster.owners.every(owner => active.includes(owner)),
    common: active.length > 1 && active.every(id => cluster.owners.includes(id)),
    labelled: cluster.owners.length > 1 && cluster.keys.length >= LABEL_MIN };
}
```

- [ ] **Step 4: Implement `summary.ts`**

```ts
import { workState } from './layout';
import type { AtlasPerson, AtlasWork } from './types';

export type AtlasSummary = { kind: 'solo'; count: number; name: string } | { kind: 'common'; count: number; names: string[] };

/** Counts exactly what the Quién lens highlights. */
export function summarizeQuien(people: AtlasPerson[], works: AtlasWork[], active: string[]): AtlasSummary {
  const names = people.filter(person => active.includes(person.id)).map(person => person.name);
  if (active.length < 2) return { kind: 'solo', name: names[0] ?? '',
    count: works.filter(work => work.owners.some(owner => owner.userId === active[0])).length };
  return { kind: 'common', names, count: works.filter(work => workState(work, active).glow).length };
}
```

- [ ] **Step 5: Run test** (mismo comando que el Step 2). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comparisons/atlas
git commit -m "feat(entre-nosotros): lente Quién y resumen puros del atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Motor de dibujo y componente canvas

**Files:**
- Create: `src/components/comparisons/atlas/atlas-engine.ts`
- Create: `src/components/comparisons/atlas/atlas-canvas.tsx`
- Create: `src/components/comparisons/atlas/atlas.module.css`
- Test: `src/components/comparisons/atlas/atlas-canvas.test.tsx`

**Interfaces:**
- Consumes: todo lo de las Tasks 2–4; `initials` de `src/components/comparisons/presentation.ts`.
- Produces:
  - `COVER_ZOOM = 1.1` y `TITLE_ZOOM = 3.2`.
  - `type AtlasHit = { key: WorkKey; x: number; y: number }` (coordenadas de pantalla relativas al canvas).
  - `type AtlasCanvasHandle = { zoomBy(factor: number): void; fit(): void }`.
  - Props de `AtlasCanvas`: `{ people; works; active; layout: QuienLayout; label: string; countLabel(count: number): string; onTogglePerson(id): void; onHover(hit: AtlasHit | null): void; onActivate(hit: AtlasHit | null, pointerType: string): void; ref?: Ref<AtlasCanvasHandle> }`.
  - El host `div` expone `data-atlas-moving="true|false"`, `data-atlas-zoom` y `data-atlas-probe`. La sonda es un JSON `[{key,x,y}]` con hasta 60 obras visibles con `alpha ≥ 0.5`, ordenadas por clave, y se publica cuando la escena se asienta.

- [ ] **Step 1: Create `atlas.module.css`**

```css
.canvasWrap { position: absolute; inset: 0; overflow: hidden; }
.canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.canvas[data-dragging='true'] { cursor: grabbing; }
.overlayTop { position: absolute; left: 16px; right: 16px; top: 12px; display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-start; justify-content: space-between; pointer-events: none; z-index: 2; }
.overlayTop > * { pointer-events: auto; }
.summary { font-size: 14px; color: var(--atlas-muted); max-width: 46ch; line-height: 1.4; margin: 0; }
.summary b { color: var(--atlas-glow); font-weight: 700; font-variant-numeric: tabular-nums; }
.faces { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.face { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 12px 5px 5px; border-radius: 999px; background: color-mix(in srgb, var(--atlas-panel) 85%, transparent); backdrop-filter: blur(8px); font-size: 13px; font-weight: 600; color: var(--atlas-fg); transition: opacity .2s, box-shadow .2s; }
.face[aria-pressed='false'] { opacity: .42; }
.face[aria-pressed='true'] { box-shadow: 0 0 0 2px var(--person); }
.face:disabled { opacity: .3; box-shadow: none; }
.faceDot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; background: color-mix(in srgb, var(--person) 70%, #000); }
.dock { position: absolute; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 2; }
.lens { pointer-events: auto; display: flex; gap: 4px; padding: 5px; border-radius: 999px; background: color-mix(in srgb, var(--atlas-panel) 90%, transparent); backdrop-filter: blur(8px); box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.lens button { display: flex; align-items: center; gap: 7px; padding: 9px 16px; min-height: 40px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--atlas-muted); background: transparent; }
.lens button[aria-pressed='true'] { background: var(--atlas-fg); color: var(--atlas-ground); }
.lens svg { width: 16px; height: 16px; flex: none; }
.caption { font-size: 12.5px; color: var(--atlas-faint); text-align: center; max-width: 56ch; line-height: 1.4; text-wrap: balance; margin: 0; }
.zoom { position: absolute; right: 16px; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 6px; z-index: 2; }
.zoom button { width: 40px; height: 40px; border-radius: 12px; background: var(--atlas-panel); display: grid; place-items: center; color: var(--atlas-fg); font-size: 18px; font-weight: 600; }
.tip { position: absolute; z-index: 3; pointer-events: none; display: flex; gap: 10px; align-items: center; padding: 8px 12px 8px 8px; border-radius: 12px; background: var(--atlas-panel); box-shadow: 0 12px 30px rgba(0,0,0,.5); font-size: 13px; max-width: 280px; color: var(--atlas-fg); }
.cover { width: 38px; height: 56px; border-radius: 4px; flex: none; }
.workTitle { display: block; font-size: 14px; font-weight: 700; line-height: 1.15; margin-bottom: 5px; }
.owners { display: grid; grid-template-columns: auto 1fr; gap: 3px 6px; align-items: center; color: var(--atlas-muted); font-size: 12px; margin: 0; padding: 0; list-style: none; }
.owners li { display: contents; }
.ownerDot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.sheet { position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 4; display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 18px; background: var(--atlas-panel); box-shadow: 0 -8px 30px rgba(0,0,0,.5); color: var(--atlas-fg); }
.sheetBody { flex: 1; min-width: 0; display: grid; gap: 10px; }
.sheetActions { display: flex; gap: 8px; }
.open { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--atlas-glow); color: var(--atlas-ground); font-weight: 700; font-size: 14px; }
.close { min-height: 44px; padding: 0 14px; border-radius: 999px; background: transparent; color: var(--atlas-muted); font-size: 14px; }
.face:focus-visible, .lens button:focus-visible, .zoom button:focus-visible, .open:focus-visible, .close:focus-visible { outline: 2px solid var(--atlas-glow); outline-offset: 2px; }
@media (max-width: 640px) {
  .lens button span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .lens button { padding: 10px 14px; }
  .zoom { display: none; }
  .faces { flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; width: 100%; scrollbar-width: none; }
  .face { flex: none; }
}
@media (prefers-reduced-motion: reduce) { .face { transition: none; } }
```

- [ ] **Step 2: Implement `atlas-engine.ts`**

```ts
import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork, Camera, Point, Viewport } from '@/lib/comparisons/atlas/types';
import { clusterState, workState, type QuienLayout } from '@/lib/comparisons/atlas/layout';
import { approach, clamp, fit, panBy, stepCamera, toScreen, toWorld, zoomAt, zoomToward, MAX_ZOOM, MIN_ZOOM } from '@/lib/comparisons/atlas/camera';
import { nearest } from '@/lib/comparisons/atlas/hit';
import { initials } from '../presentation';

export const COVER_ZOOM = 1.1;
export const TITLE_ZOOM = 3.2;
export type AtlasHit = { key: WorkKey; x: number; y: number };
export type EngineProps = { people: AtlasPerson[]; works: AtlasWork[]; active: string[]; layout: QuienLayout;
  countLabel: (count: number) => string; onTogglePerson: (id: string) => void;
  onHover: (hit: AtlasHit | null) => void; onActivate: (hit: AtlasHit | null, pointerType: string) => void };
type Sprite = { x: number; y: number; tx: number; ty: number; a: number; ta: number; hl: number; thl: number };
type Palette = { fg: string; muted: string; line: string; glow: string; cream: string; font: string;
  type: Record<AtlasWork['itemType'], string> };

function readPalette(host: Element): Palette {
  const css = getComputedStyle(host);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { fg: v('--atlas-fg', '#f1e7dd'), muted: v('--atlas-muted', '#b2a293'), line: v('--atlas-line', '#4a3d34'),
    glow: v('--atlas-glow', '#f2c27b'), cream: v('--atlas-cream', '#e9dccf'), font: css.fontFamily || 'system-ui, sans-serif',
    type: { book: v('--type-book', '#cf8a54'), movie: v('--type-movie', '#6bb0b4'), series: v('--type-series', '#b592bd') } };
}
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function createAtlasEngine(canvas: HTMLCanvasElement, host: HTMLElement, props: () => EngineProps) {
  const ctx = canvas.getContext('2d');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = readPalette(host);
  let vp: Viewport = { width: 0, height: 0 }; let dpr = 1;
  let cam: Camera = { x: 0, y: 0, k: 0.3 }; let target: Camera | null = null; let fitted = false;
  let extentKey = ''; let raf = 0; let disposed = false;
  const sprites = new Map<WorkKey, Sprite>();

  const fitCamera = () => fit(props().layout.extent, vp, { x: 32, y: 150 });
  function kick() { if (!raf && !disposed && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame); }
  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    vp = { width: host.clientWidth, height: host.clientHeight };
    canvas.width = Math.round(vp.width * dpr); canvas.height = Math.round(vp.height * dpr);
    palette = readPalette(host);
    if (!fitted && vp.width > 0 && vp.height > 0) { cam = fitCamera(); fitted = true; }
    kick();
  }
  function sync() {
    const { works, active, layout } = props(); const seen = new Set<WorkKey>();
    for (const work of works) {
      const p = layout.positions.get(work.key); if (!p) continue;
      const state = workState(work, active); seen.add(work.key);
      const sprite = sprites.get(work.key) ?? { x: p.x, y: p.y, tx: p.x, ty: p.y, a: state.alpha, ta: state.alpha, hl: state.glow ? 1 : 0, thl: 0 };
      sprite.tx = p.x; sprite.ty = p.y; sprite.ta = state.alpha; sprite.thl = state.glow ? 1 : 0;
      if (reduce) { sprite.x = p.x; sprite.y = p.y; sprite.a = sprite.ta; sprite.hl = sprite.thl; }
      sprites.set(work.key, sprite);
    }
    for (const key of [...sprites.keys()]) if (!seen.has(key)) sprites.delete(key);
    const nextExtent = JSON.stringify(layout.extent);
    if (nextExtent !== extentKey) { extentKey = nextExtent; if (fitted) target = fitCamera(); }
    kick();
  }
  function frame() {
    raf = 0; if (disposed) return; let moving = false;
    if (target) { const step = stepCamera(cam, target, reduce ? 1 : 0.16); cam = step.camera; if (step.done) target = null; else moving = true; }
    for (const s of sprites.values()) {
      const x = approach(s.x, s.tx, 0.11, 0.15), y = approach(s.y, s.ty, 0.11, 0.15);
      const a = approach(s.a, s.ta, 0.14, 0.01), h = approach(s.hl, s.thl, 0.14, 0.01);
      s.x = x.value; s.y = y.value; s.a = a.value; s.hl = h.value;
      if (!(x.settled && y.settled && a.settled && h.settled)) moving = true;
    }
    draw();
    host.dataset.atlasMoving = String(moving); host.dataset.atlasZoom = cam.k.toFixed(3);
    if (moving) kick(); else publishProbe();
  }
  function visible(p: Point) { return p.x >= -60 && p.y >= -80 && p.x <= vp.width + 60 && p.y <= vp.height + 80; }
  function publishProbe() {
    const probe: AtlasHit[] = [];
    for (const [key, s] of sprites) {
      if (s.a < 0.5) continue; const p = toScreen(cam, vp, s);
      if (p.x >= 0 && p.y >= 0 && p.x <= vp.width && p.y <= vp.height) probe.push({ key, x: Math.round(p.x), y: Math.round(p.y) });
    }
    host.dataset.atlasProbe = JSON.stringify(probe.toSorted((a, b) => a.key < b.key ? -1 : 1).slice(0, 60));
  }
  function text(value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
    ctx!.font = font; ctx!.fillStyle = color; ctx!.textAlign = align; ctx!.fillText(value, x, y); ctx!.textAlign = 'left';
  }
  function wrap(value: string, maxWidth: number): string[] {
    const lines: string[] = []; let line = '';
    for (const word of value.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx!.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line); return lines.slice(0, 3);
  }
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx!.beginPath(); ctx!.roundRect(x, y, w, h, r);
  }
  function draw() {
    if (!ctx) return;
    const { works, active, layout, people, countLabel } = props();
    const k = cam.k, covers = k > COVER_ZOOM, titles = k > TITLE_ZOOM;
    const color = new Map(people.map(person => [person.id, person.color]));
    const poles = new Map(layout.poles.map(pole => [pole.userId, pole]));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vp.width, vp.height);
    // Threads from each owner to each labelled shared group, and the common glow.
    for (const cluster of layout.clusters) {
      const state = clusterState(cluster, active); if (!state.labelled) continue;
      const c = toScreen(cam, vp, cluster);
      for (const owner of cluster.owners) {
        const p = toScreen(cam, vp, poles.get(owner)!);
        ctx.strokeStyle = state.on ? color.get(owner)! : palette.line; ctx.globalAlpha = state.on ? 0.5 : 0.22;
        ctx.lineWidth = Math.max(1, Math.sqrt(cluster.keys.length) * 0.9);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo((p.x + c.x) / 2 * 0.9 + vp.width / 2 * 0.1, (p.y + c.y) / 2 * 0.9 + vp.height / 2 * 0.1, c.x, c.y); ctx.stroke();
      }
      if (state.common) {
        const r = cluster.r * k + 34; const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, 'rgba(242,194,123,.22)'); g.addColorStop(1, 'rgba(242,194,123,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const byKey = new Map(works.map(work => [work.key, work]));
    for (const [key, s] of sprites) {
      if (s.a < 0.02) continue; const work = byKey.get(key); if (!work) continue;
      const p = toScreen(cam, vp, s); if (!visible(p)) continue;
      ctx.globalAlpha = s.a; const shared = work.owners.length > 1;
      if (!covers) {
        const r = Math.max(1.5, (shared ? 3.4 : 2.4) * k * 1.4) * (1 + s.hl * 0.45);
        ctx.fillStyle = s.hl > 0.5 ? palette.glow : shared ? palette.cream : color.get(work.owners[0].userId)!;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); continue;
      }
      const cw = 8.4 * k, ch = 12.2 * k, x = p.x - cw / 2, y = p.y - ch / 2;
      if (s.hl > 0.3) { ctx.fillStyle = palette.glow; roundRect(x - 2, y - 2, cw + 4, ch + 4, 3 + k * 0.3); ctx.fill(); }
      ctx.fillStyle = palette.type[work.itemType]; roundRect(x, y, cw, ch, 1 + k * 0.4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y + ch * 0.7, cw, ch * 0.3);
      work.owners.slice(0, 5).forEach((owner, i) => {
        ctx.fillStyle = color.get(owner.userId)!; ctx.beginPath();
        ctx.arc(x + cw - (1.6 + i * 1.9) * k, y + 1.6 * k, 0.8 * k, 0, Math.PI * 2); ctx.fill();
      });
      if (titles && work.title) {
        ctx.font = `600 ${1.5 * k}px ${palette.font}`; ctx.fillStyle = '#fff';
        const lines = wrap(work.title, cw - 1.6 * k);
        lines.forEach((line, i) => ctx.fillText(line, x + 0.8 * k, y + ch - 0.9 * k - (lines.length - 1 - i) * 1.7 * k));
      }
    }
    ctx.globalAlpha = 1;
    if (k > 0.12 && k < TITLE_ZOOM) for (const cluster of layout.clusters) {
      const state = clusterState(cluster, active); if (!state.labelled) continue;
      const c = toScreen(cam, vp, cluster); ctx.globalAlpha = state.on ? 1 : 0.35;
      text(String(cluster.keys.length), c.x, c.y - cluster.r * k - 10, `800 ${Math.min(30, 14 + Math.sqrt(cluster.keys.length))}px ${palette.font}`,
        state.common ? palette.glow : palette.fg, 'center');
    }
    for (const pole of layout.poles) {
      const person = people.find(item => item.id === pole.userId); if (!person) continue;
      const p = toScreen(cam, vp, pole); const on = active.includes(person.id);
      ctx.globalAlpha = on ? 1 : 0.4; ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = palette.fg; ctx.lineWidth = 3; ctx.stroke(); }
      text(initials(person.name), p.x, p.y + 5, `800 15px ${palette.font}`, '#fff', 'center');
      text(person.name, p.x, p.y + 44, `600 13px ${palette.font}`, palette.fg, 'center');
      text(countLabel(pole.count), p.x, p.y + 59, `500 12px ${palette.font}`, palette.muted, 'center');
    }
    ctx.globalAlpha = 1;
  }
  function hitWork(s: Point): AtlasHit | null {
    const world = toWorld(cam, vp, s); const radius = Math.max(6, 10 / cam.k);
    const candidates = [...sprites].filter(([, sprite]) => sprite.a >= 0.5).map(([key, sprite]) => ({ key, x: sprite.x, y: sprite.y }));
    const hit = nearest(candidates, world, radius);
    return hit && { key: hit.key, x: s.x, y: s.y };
  }
  const pointers = new Map<number, Point>(); let pinch: { d: number; k: number } | null = null;
  let down: Point | null = null; let lastTap: (Point & { t: number }) | null = null;
  const local = (e: { clientX: number; clientY: number }): Point => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function tap(p: Point, pointerType: string, time: number) {
    const { layout, onTogglePerson, onActivate } = props();
    const pole = layout.poles.find(item => dist(toScreen(cam, vp, item), p) < 30);
    if (pole) { onTogglePerson(pole.userId); return; }
    if (cam.k <= COVER_ZOOM) {
      const cluster = layout.clusters.find(item => dist(toScreen(cam, vp, item), p) < item.r * cam.k + 6);
      if (cluster) { target = { x: cluster.x, y: cluster.y, k: clamp(Math.min(vp.width, vp.height) * 0.42 / cluster.r, 1.6, 10) }; kick(); return; }
    }
    const hit = hitWork(p);
    if (hit) { lastTap = null; onActivate(hit, pointerType); return; }
    if (pointerType !== 'mouse' && lastTap && time - lastTap.t < 300 && dist(p, lastTap) < 24) { target = zoomToward(cam, vp, p, 2.6); lastTap = null; kick(); return; }
    lastTap = { ...p, t: time }; onActivate(null, pointerType);
  }
  function onDown(e: PointerEvent) {
    canvas.setPointerCapture?.(e.pointerId); const p = local(e); pointers.set(e.pointerId, p); target = null; down = p;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: dist(a, b), k: cam.k }; down = null; }
    canvas.dataset.dragging = 'true';
  }
  function onMove(e: PointerEvent) {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      const hit = hitWork(p); canvas.style.cursor = hit ? 'pointer' : ''; props().onHover(hit); return;
    }
    const prev = pointers.get(e.pointerId)!; pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      cam = zoomAt(cam, vp, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pinch.k * dist(a, b) / pinch.d / cam.k);
    } else cam = panBy(cam, p.x - prev.x, p.y - prev.y);
    props().onHover(null); kick();
  }
  function onUp(e: PointerEvent) {
    const p = local(e); pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!pointers.size) delete canvas.dataset.dragging;
    if (down && dist(p, down) < 5) tap(p, e.pointerType, e.timeStamp);
    down = null;
  }
  function onCancel(e: PointerEvent) { pointers.delete(e.pointerId); pinch = null; down = null; delete canvas.dataset.dragging; }
  function onLeave(e: PointerEvent) { if (e.pointerType === 'mouse') props().onHover(null); }
  function onWheel(e: WheelEvent) { e.preventDefault(); target = null; cam = zoomAt(cam, vp, local(e), Math.exp(-e.deltaY * 0.0018)); props().onHover(null); kick(); }
  function onDoubleClick(e: MouseEvent) { const p = local(e); if (!hitWork(p)) { target = zoomToward(cam, vp, p, 2.6); kick(); } }

  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(host); resize();
  document.fonts?.ready.then(kick).catch(() => {});

  return {
    sync,
    zoomBy(factor: number) { target = { ...(target ?? cam), k: clamp((target ?? cam).k * factor, MIN_ZOOM, MAX_ZOOM) }; kick(); },
    fitAll() { target = fitCamera(); kick(); },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    },
  };
}
export type AtlasEngine = ReturnType<typeof createAtlasEngine>;
```

- [ ] **Step 3: Implement `atlas-canvas.tsx`**

```tsx
'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { createAtlasEngine, type AtlasEngine, type EngineProps } from './atlas-engine';
import styles from './atlas.module.css';

export type AtlasCanvasHandle = { zoomBy(factor: number): void; fit(): void };
type Props = EngineProps & { label: string; ref?: Ref<AtlasCanvasHandle> };

export function AtlasCanvas({ ref, label, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); const engine = useRef<AtlasEngine | null>(null);
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => {
    const created = createAtlasEngine(canvas.current!, host.current!, () => latest.current);
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.sync(); }, [props.layout, props.active, props.works]);
  useImperativeHandle(ref, () => ({ zoomBy: factor => engine.current?.zoomBy(factor), fit: () => engine.current?.fitAll() }), []);
  return <div ref={host} className={styles.canvasWrap} data-atlas-moving="false">
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label={label}/>
  </div>;
}
```

- [ ] **Step 4: Write the test** (`atlas-canvas.test.tsx`; cubre montaje, sincronización, sonda y toque. El dibujo real se ve en e2e)

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { AtlasCanvas } from './atlas-canvas';

const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b'].map(id => ({ slotId: id, userId: id, name: id, avatarUrl: null, available: true })) },
  format: 'all', excludedSeriesWithoutEpisodes: 0, catalog: [],
  works: ['a', 'b'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');
const layout = layoutQuien(people, works);
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600);
  // Older jsdom lacks PointerEvent; without it fireEvent drops clientX/pointerType.
  if (!('PointerEvent' in window)) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? ''; }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = () => act(() => { for (let i = 0; i < 400 && frames.length; i++) frames.shift()!(performance.now()); });

describe('AtlasCanvas', () => {
  it('se asienta, publica la sonda y tocar un polo alterna esa cara', () => {
    const toggle = vi.fn();
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} layout={layout}
      countLabel={n => `${n} obras`} onTogglePerson={toggle} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(host.dataset.atlasMoving).toBe('false');
    expect(JSON.parse(host.dataset.atlasProbe!)).toEqual([expect.objectContaining({ key: 'book:1' })]);
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const k = Number(host.dataset.atlasZoom);
    // First pole («Tú») sits on the left with two people.
    const x = (layout.poles[0].x - (layout.extent.minX + layout.extent.maxX) / 2) * k + 400;
    const y = (layout.poles[0].y - (layout.extent.minY + layout.extent.maxY) / 2) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    expect(toggle).toHaveBeenCalledWith('a');
  });
});
```

> Nota: jsdom no implementa `setPointerCapture` (el motor lo llama con `?.`). El toque de polo no depende de `pointerType`.

- [ ] **Step 5: Run test**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/comparisons/atlas`
Expected: PASS. Si falla el cálculo de la posición del polo, comprueba que `fit` usa `{ x: 32, y: 150 }`: el centro de cámara es el centro de la extensión.

- [ ] **Step 6: Commit**

```bash
git add src/components/comparisons/atlas
git commit -m "feat(entre-nosotros): motor canvas del atlas con cámara, LOD y gestos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vista del atlas (caras, resumen, dock, tooltip y hoja)

**Files:**
- Create: `src/components/comparisons/atlas/atlas-view.tsx`
- Modify: `messages/es.json` (añadir `comparisons.atlas`)
- Test: `src/components/comparisons/atlas/atlas-view.test.tsx`

**Interfaces:**
- Consumes: `AtlasCanvas` y `AtlasCanvasHandle` (Task 5); `atlasModel`, `layoutQuien` y `summarizeQuien`; `itemHref` de `@/lib/catalog/item-href`.
- Produces: `AtlasView({ snapshot, viewerId }: { snapshot: Snapshot; viewerId: string })`. La raíz lleva `data-comparison-stage` para que las comprobaciones de «sin evidencia» de los e2e sigan valiendo.

- [ ] **Step 1: Add i18n keys.** En `messages/es.json`, dentro de `"comparisons"`, añade:

```json
    "atlas": {
      "canvasLabel": "Mapa de obras compartidas",
      "faces": "Personas del cruce",
      "lenses": "Lente",
      "lens": { "quien": "Quién" },
      "caption": { "quien": "Cada obra cae entre quienes la tienen. Acércate y los puntos se vuelven portadas." },
      "summary": {
        "solo": "<b>{count}</b> {count, plural, one {obra} other {obras}} de {name}. Suma a alguien para ver el cruce.",
        "common": "<b>{count}</b> {count, plural, one {obra} other {obras}} en común entre {names}"
      },
      "poleCount": "{count, plural, one {# obra} other {# obras}}",
      "zoomIn": "Acercar",
      "zoomOut": "Alejar",
      "zoomFit": "Ver todo",
      "openWork": "Abrir ficha",
      "closeWork": "Cerrar",
      "groupChip": "Grupo: {name}",
      "groups": "Grupos"
    },
```

- [ ] **Step 2: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/es.json';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
type CanvasProps = { onActivate: (hit: { key: WorkKey; x: number; y: number } | null, type: string) => void; onHover: (hit: { key: WorkKey; x: number; y: number } | null) => void; active: string[] };
let canvas: CanvasProps;
vi.mock('./atlas-canvas', () => ({ AtlasCanvas: (props: CanvasProps) => { canvas = props; return <div data-testid="canvas"/>; } }));
import { AtlasView } from './atlas-view';

const member = (id: string, name: string, available = true) => ({ slotId: id, userId: available ? id : null, name: available ? name : null, avatarUrl: null, available });
const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: [member('me', 'Tú'), member('b', 'Bea'), member('c', 'Carla'), member('x', '', false)] },
  format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [{ key: 'book:1', title: 'Proyecto Salvación', coverUrl: null, genres: [], creators: [] }],
  works: ['me', 'b', 'c'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))
    .concat([{ userId: 'b', key: 'book:2' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }]) };
const view = () => render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me"/></NextIntlClientProvider>);
afterEach(() => { cleanup(); push.mockReset(); });
const summary = () => screen.getByRole('status').textContent;

describe('AtlasView', () => {
  it('empieza con todas las caras activas y resume lo común', () => {
    view();
    const faces = screen.getByRole('group', { name: 'Personas del cruce' });
    expect([...faces.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-pressed'), b.disabled])).toEqual([
      ['TTú', 'true', false], ['BBea', 'true', false], ['CCarla', 'true', false], ['?Persona no disponible', null, true]]);
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
  });
  it('alternar caras cambia el resumen y nunca deja menos de una', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(summary()).toBe('2 obras de Bea. Suma a alguien para ver el cruce.');
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(screen.getByRole('button', { name: 'Bea' }).getAttribute('aria-pressed')).toBe('true');
    expect(canvas.active).toEqual(['b']);
  });
  it('ratón: hover muestra la mini-ficha y clic navega', () => {
    view();
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.getByText('Proyecto Salvación')).toBeTruthy();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'mouse'));
    expect(push).toHaveBeenCalledWith('/libro/1');
  });
  it('táctil: primer toque abre la hoja, segundo navega; tocar vacío la cierra', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    const sheet = screen.getByRole('dialog', { name: 'Proyecto Salvación' });
    expect(sheet.querySelector('a')?.getAttribute('href')).toBe('/libro/1');
    expect(push).not.toHaveBeenCalled();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(push).toHaveBeenCalledWith('/libro/1');
    act(() => canvas.onActivate(null, 'touch'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('una obra sin metadatos no ofrece ficha', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:2', x: 10, y: 10 }, 'touch'));
    const sheet = screen.getByRole('dialog', { name: 'Obra sin información de catálogo' });
    expect(sheet.querySelector('a')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/comparisons/atlas/atlas-view.test.tsx`
Expected: FAIL («Cannot find module './atlas-view'»).

- [ ] **Step 4: Implement `atlas-view.tsx`**

```tsx
'use client';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { itemHref } from '@/lib/catalog/item-href';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { summarizeQuien } from '@/lib/comparisons/atlas/summary';
import { initials } from '../presentation';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';
import type { AtlasHit } from './atlas-engine';
import styles from './atlas.module.css';

const TYPE_VAR = { book: 'var(--type-book)', movie: 'var(--type-movie)', series: 'var(--type-series)' } as const;

function WorkCard({ work, people, title }: { work: AtlasWork; people: AtlasPerson[]; title: string }) {
  const names = new Map(people.map(person => [person.id, person]));
  return <>
    <span className={styles.cover} style={{ background: TYPE_VAR[work.itemType] }} aria-hidden="true"/>
    <span><span className={styles.workTitle}>{title}</span>
      <ul className={styles.owners}>{work.owners.map(owner => names.get(owner.userId) && <li key={owner.userId}>
        <span className={styles.ownerDot} style={{ background: names.get(owner.userId)!.color }} aria-hidden="true"/>
        <span>{names.get(owner.userId)!.name}</span></li>)}</ul></span>
  </>;
}

export function AtlasView({ snapshot, viewerId }: { snapshot: Snapshot; viewerId: string }) {
  const t = useTranslations('comparisons'); const locale = useLocale(); const router = useRouter();
  const you = t('you');
  const { people, works } = useMemo(() => atlasModel(snapshot, viewerId, you), [snapshot, viewerId, you]);
  const layout = useMemo(() => layoutQuien(people, works), [people, works]);
  const byKey = useMemo(() => new Map(works.map(work => [work.key, work])), [works]);
  const [chosen, setChosen] = useState<string[]>(() => people.map(person => person.id));
  // People order, and only people that are still in the snapshot.
  const active = people.map(person => person.id).filter(id => chosen.includes(id));
  const [hover, setHover] = useState<AtlasHit | null>(null);
  const [picked, setPicked] = useState<WorkKey | null>(null);
  const camera = useRef<AtlasCanvasHandle>(null);
  const summary = summarizeQuien(people, works, active);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const bold = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const titleOf = (work: AtlasWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;

  function toggle(id: string) {
    setChosen(current => current.includes(id) ? (active.length > 1 ? current.filter(item => item !== id) : current) : [...current, id]);
  }
  function open(work: AtlasWork) { if (!work.metadataMissing) router.push(itemHref(work.itemType, work.itemId)); }
  function activate(hit: AtlasHit | null, pointerType: string) {
    if (!hit) { setPicked(null); return; }
    const work = byKey.get(hit.key); if (!work) return;
    if (pointerType === 'mouse' || picked === hit.key) { open(work); return; }
    setHover(null); setPicked(hit.key);
  }
  const hovered = hover && byKey.get(hover.key);
  const sheet = picked && byKey.get(picked);
  const unavailable = snapshot.group.members.filter(member => !member.available);

  return <div className={styles.canvasWrap} data-comparison-stage>
    <AtlasCanvas ref={camera} label={t('atlas.canvasLabel')} people={people} works={works} active={active} layout={layout}
      countLabel={count => t('atlas.poleCount', { count })} onTogglePerson={toggle} onHover={setHover} onActivate={activate}/>
    <div className={styles.overlayTop}>
      <p className={styles.summary} role="status" aria-live="polite">{summary.kind === 'solo'
        ? t.rich('atlas.summary.solo', { count: summary.count, name: summary.name, b: bold })
        : t.rich('atlas.summary.common', { count: summary.count, names: list.format(summary.names), b: bold })}</p>
      <div className={styles.faces} role="group" aria-label={t('atlas.faces')}>
        {people.map(person => <button key={person.id} type="button" className={styles.face} aria-pressed={active.includes(person.id)}
          aria-label={person.name} style={{ '--person': person.color } as CSSProperties} onClick={() => toggle(person.id)}>
          <span className={styles.faceDot} aria-hidden="true">{initials(person.name)}</span>{person.name}</button>)}
        {unavailable.map(member => <button key={member.slotId} type="button" className={styles.face} disabled
          style={{ '--person': 'var(--atlas-faint)' } as CSSProperties}>
          <span className={styles.faceDot} aria-hidden="true">?</span>{t('unavailablePerson')}</button>)}
      </div>
    </div>
    <div className={styles.zoom}>
      <button type="button" aria-label={t('atlas.zoomIn')} onClick={() => camera.current?.zoomBy(1.8)}>+</button>
      <button type="button" aria-label={t('atlas.zoomOut')} onClick={() => camera.current?.zoomBy(1 / 1.8)}>−</button>
      <button type="button" aria-label={t('atlas.zoomFit')} onClick={() => camera.current?.fit()}>⤢</button>
    </div>
    <div className={styles.dock}>
      <div className={styles.lens} role="group" aria-label={t('atlas.lenses')}>
        <button type="button" aria-pressed="true" aria-label={t('atlas.lens.quien')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="3" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M7 5 4 10M9 5l3 5M5 12h6"/></svg>
          <span>{t('atlas.lens.quien')}</span></button>
      </div>
      <p className={styles.caption}>{t('atlas.caption.quien')}</p>
    </div>
    {hovered && !sheet && <div className={styles.tip} aria-hidden="true"
      style={{ left: `min(${hover.x + 16}px, calc(100% - 290px))`, top: `min(${hover.y + 16}px, calc(100% - 110px))` }}>
      <WorkCard work={hovered} people={people} title={titleOf(hovered)}/></div>}
    {sheet && <div className={styles.sheet} role="dialog" aria-label={titleOf(sheet)}>
      <WorkCard work={sheet} people={people} title={titleOf(sheet)}/>
      <div className={styles.sheetBody}><div className={styles.sheetActions}>
        {!sheet.metadataMissing && <Link className={styles.open} href={itemHref(sheet.itemType, sheet.itemId)}>{t('atlas.openWork')}</Link>}
        <button type="button" className={styles.close} onClick={() => setPicked(null)}>{t('atlas.closeWork')}</button>
      </div></div>
    </div>}
  </div>;
}
```

> El `role="status"` del resumen es la región `aria-live` de la spec §7. `aria-label={person.name}` hace que el nombre accesible de cada cara sea solo el nombre, como piden los e2e (`getByRole('button', { name: 'Carla' })`).

- [ ] **Step 5: Run tests**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/comparisons/atlas`
Expected: PASS. Si el texto de las caras no coincide (`'TTú'`), ajusta la expectativa al `textContent` real (iniciales + nombre). No cambies el componente para eso.

- [ ] **Step 6: Commit**

```bash
git add src/components/comparisons/atlas messages/es.json
git commit -m "feat(entre-nosotros): vista del atlas con caras, resumen, tooltip y hoja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hoja de grupos

**Files:**
- Create: `src/components/comparisons/group-sheet.tsx`
- Test: `src/components/comparisons/group-sheet.test.tsx`

**Interfaces:**
- Consumes: `Group` y las claves i18n existentes (`group`, `chooseGroup`, `unsavedOption`, `editGroup`, `createGroup`, `saveAsGroup`, `refreshAccess`, `refreshAccessHint`, `privateSelection`, `privacyFooter`) y las nuevas `atlas.groupChip` y `atlas.groups`.
- Produces: `GroupSheet(props)` con estas props:

  ```ts
  {
    choices: Group[]; value: string | null; unsavedId: string | null; activeName: string | null;
    canEdit: boolean; canSaveUnsaved: boolean; showRefresh: boolean;
    onSelect(id: string): void; onEdit(): void; onCreate(): void; onSaveUnsaved(): void; onRefresh(): void;
    chipRef?: Ref<HTMLButtonElement>;
  }
  ```

  La hoja es un `<dialog>` nativo con nombre accesible «Grupos». Cada acción cierra la hoja antes de avisar al padre.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import { GroupSheet } from './group-sheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
const groups = [{ id: 'g1', name: 'Club', revision: 1, members: [] }, { id: 'g2', name: 'Casa', revision: 1, members: [] }];
function sheet(overrides = {}) {
  const props = { choices: groups, value: 'g1', unsavedId: null, activeName: 'Club', canEdit: true, canSaveUnsaved: false, showRefresh: true,
    onSelect: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn(), onSaveUnsaved: vi.fn(), onRefresh: vi.fn(), ...overrides };
  render(<NextIntlClientProvider locale="es" messages={messages}><GroupSheet {...props}/></NextIntlClientProvider>);
  return props;
}

describe('GroupSheet', () => {
  it('el chip nombra el grupo y abre la hoja', () => {
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
    expect(screen.getByRole('dialog', { name: 'Grupos' }).hasAttribute('open')).toBe(true);
  });
  it('elegir un grupo avisa y cierra', () => {
    const props = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Grupo' }), { target: { value: 'g2' } });
    expect(props.onSelect).toHaveBeenCalledWith('g2');
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
  });
  it('las acciones cierran la hoja y avisan', () => {
    const props = sheet();
    for (const [name, handler] of [['Editar grupo', 'onEdit'], ['Crear grupo', 'onCreate'], ['Actualizar', 'onRefresh']] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
      fireEvent.click(screen.getByRole('button', { name }));
      expect(props[handler]).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
    }
  });
  it('sin grupo activo, el chip invita a elegir', () => {
    sheet({ value: null, activeName: null, canEdit: false, showRefresh: false });
    expect(screen.getByRole('button', { name: 'Grupo: Elige un grupo' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/comparisons/group-sheet.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement `group-sheet.tsx`**

```tsx
'use client';
import { useRef, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { Group } from '@/lib/comparisons/types';
import styles from './explorer.module.css';

type Props = { choices: Group[]; value: string | null; unsavedId: string | null; activeName: string | null;
  canEdit: boolean; canSaveUnsaved: boolean; showRefresh: boolean;
  onSelect: (id: string) => void; onEdit: () => void; onCreate: () => void; onSaveUnsaved: () => void; onRefresh: () => void;
  chipRef?: Ref<HTMLButtonElement> };

/** Group chip + native <dialog> sheet: picking, creating, editing or refreshing all close it first. */
export function GroupSheet(props: Props) {
  const t = useTranslations('comparisons'); const dialog = useRef<HTMLDialogElement>(null);
  const then = (action: () => void) => () => { dialog.current?.close(); action(); };
  return <>
    <button ref={props.chipRef} type="button" className={styles.groupChip} onClick={() => dialog.current?.showModal()}
      aria-label={t('atlas.groupChip', { name: props.activeName ?? t('chooseGroup') })}>
      <span>{props.activeName ?? t('chooseGroup')}</span><span aria-hidden="true">▾</span>
    </button>
    <dialog ref={dialog} className={styles.groupSheet} aria-label={t('atlas.groups')}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.groupSheetBody}>
        <p className={styles.private}>{t('privateSelection')}</p>
        <label className={styles.groupField}><span>{t('group')}</span>
          <select className={styles.groupSelect} value={props.value ?? ''} onChange={event => { dialog.current?.close(); props.onSelect(event.target.value); }}>
            <option value="">{t('chooseGroup')}</option>
            {props.choices.map(group => <option key={group.id} value={group.id}>{group.id === props.unsavedId ? t('unsavedOption', { name: group.name }) : group.name}</option>)}
          </select></label>
        <div className={styles.groupActions}>
          {props.canEdit && <button type="button" onClick={then(props.onEdit)}>{t('editGroup')}</button>}
          {props.canSaveUnsaved && <button type="button" onClick={then(props.onSaveUnsaved)}>{t('saveAsGroup')}</button>}
          <button type="button" onClick={then(props.onCreate)}>{t('createGroup')}</button>
          {props.showRefresh && <button type="button" title={t('refreshAccessHint')} onClick={then(props.onRefresh)}>{t('refreshAccess')}</button>}
        </div>
        <p className={styles.sheetFooter}>{t('privacyFooter')}</p>
      </div>
    </dialog>
  </>;
}
```

- [ ] **Step 4: Run test** (mismo comando que el Step 2). Expected: PASS. Los estilos de `explorer.module.css` se añaden en la Task 8; CSS Modules devuelve `undefined` para clases inexistentes y el test no depende de ellas.

- [ ] **Step 5: Commit**

```bash
git add src/components/comparisons/group-sheet.tsx src/components/comparisons/group-sheet.test.tsx
git commit -m "feat(entre-nosotros): chip y hoja de grupos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Marco inmersivo e integración en el explorer

**Files:**
- Modify: `src/components/nav/fullscreen-routes.ts` + `fullscreen-routes.test.ts`
- Modify: `src/app/comunidad/entre-nosotros/page.tsx`
- Modify: `src/components/comparisons/explorer.tsx` (el `return` de `ExplorerSession`, `selectGroup` y el import de `ComparisonCanvas`)
- Modify: `src/components/comparisons/explorer.module.css`
- Test: `src/components/comparisons/explorer.test.tsx`

**Interfaces:**
- Consumes: `AtlasView` (Task 6) y `GroupSheet` (Task 7).
- Produces: la ruta `/comunidad/entre-nosotros` a sangre, con la raíz `.immersive` + clase `dark`. La sección `works` pinta `AtlasView` y `tastes` sigue pintando `Tastes` en un panel desplazable.

- [ ] **Step 1: Failing test de ruta.** En `fullscreen-routes.test.ts` añade:

```ts
  it("Entre nosotros es un atlas a pantalla completa, pero no el resto de Comunidad", () => {
    expect(isFullscreenRoute("/comunidad/entre-nosotros")).toBe(true);
    expect(isFullscreenRoute("/comunidad")).toBe(false);
    expect(isFullscreenRoute("/comunidad/entre-nosotros-x")).toBe(false);
  });
```

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/nav/fullscreen-routes.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.** En `fullscreen-routes.ts`, amplía el `return` y el comentario:

```ts
 * `/comunidad/entre-nosotros` es el atlas de Entre nosotros: un mapa a sangre
 * con su propio «← Comunidad».
 ...
  return pathname === "/partida" || pathname.startsWith("/partida/")
    || pathname === "/mascota" || pathname.startsWith("/mascota/")
    || pathname === "/comunidad/entre-nosotros";
```

Run el mismo test. Expected: PASS.

- [ ] **Step 3: `explorer.module.css`.** Al final del fichero añade (las reglas viejas de `.page`, `.heading`, etc. se quedan; F4 las limpia):

```css
.immersive { --atlas-ground:#1d1713; --atlas-panel:#2a221d; --atlas-line:#4a3d34; --atlas-fg:#f1e7dd; --atlas-muted:#b2a293; --atlas-faint:#7d6e62; --atlas-glow:#f2c27b; --atlas-clash:#e2735f; --atlas-agree:#8fcfb4; --atlas-cream:#e9dccf;
  position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--atlas-ground); color: var(--atlas-fg); overflow: hidden; font-family: var(--font-geist-sans), sans-serif; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 8px; z-index: 3; }
.bar h1 { font-size: clamp(20px, 2.4vw, 28px); font-weight: 800; letter-spacing: -.01em; margin: 0 8px 0 0; }
.back { color: var(--atlas-muted); font-size: 13px; min-height: 44px; display: inline-flex; align-items: center; }
.barSpacer { flex: 1; }
.groupChip { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 999px; background: var(--atlas-panel); color: var(--atlas-fg); font-size: 13px; font-weight: 700; max-width: 60vw; }
.groupChip span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.immersive .formats { margin: 0; }
.immersive .formats button { color: var(--atlas-muted); min-height: 36px; }
.immersive .formats button[aria-pressed=true] { background: var(--atlas-fg); color: var(--atlas-ground); }
.immersive .tabs { gap: 4px; align-self: auto; }
.immersive .tab { font-size: 13px; min-height: 36px; padding: 0 12px; border-radius: 999px; color: var(--atlas-muted); }
.immersive .tab[aria-pressed=true] { background: var(--atlas-panel); color: var(--atlas-fg); }
.immersive .tab[aria-pressed=true]::after { display: none; }
.stage { position: relative; flex: 1; min-height: 0; }
.stage > [role=status], .stage > [role=alert] { padding: 28px; }
.tastePanel { position: absolute; inset: 0; overflow: auto; padding: 8px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
.immersiveEmpty { padding: 24px 16px; overflow: auto; }
.groupSheet { margin: auto auto 0; width: min(520px, 100%); border: 0; border-radius: 20px 20px 0 0; background: var(--atlas-panel); color: var(--atlas-fg); padding: 0; }
.groupSheet::backdrop { background: rgba(0,0,0,.55); }
@media (min-width: 1024px) { .groupSheet { margin: auto; border-radius: 20px; } }
.groupSheetBody { display: grid; gap: 14px; padding: 20px 20px calc(20px + env(safe-area-inset-bottom, 0px)); }
.groupField { display: grid; gap: 6px; font-size: 12px; color: var(--atlas-muted); }
.groupActions { display: flex; flex-wrap: wrap; gap: 8px; }
.groupActions button { min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--atlas-ground); color: var(--atlas-fg); font-size: 13px; font-weight: 600; }
.sheetFooter { font-size: 12px; color: var(--atlas-faint); margin: 0; }
@media (max-width: 640px) { .bar h1 { font-size: 20px; } .immersive .formats { order: 5; width: 100%; } }
```

- [ ] **Step 4: `page.tsx`.** Sustituye `ComparisonPage` y `ComparisonContent` (borra los imports de `Link` y `styles`):

```tsx
export default function ComparisonPage() {
  return <Suspense fallback={<div className="dark fixed inset-0 bg-[#1d1713] p-6"><SkeletonLine className="h-8 w-48"/></div>}><ComparisonContent/></Suspense>;
}
async function ComparisonContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref('/comunidad/entre-nosotros'));
  const client = await createClient();
  const { groups: initialGroups, candidates } = await listEntry(client, user.id);
  return <Explorer initialGroups={initialGroups} candidates={candidates} viewerId={user.id}/>;
}
```

Borra también el import de `getTranslations`, que ya no se usa.

- [ ] **Step 5: `explorer.tsx`.**
  1. Imports: quita `ComparisonCanvas`. Añade `import { AtlasView } from './atlas/atlas-view';` e `import { GroupSheet } from './group-sheet';`.
  2. Sustituye `const groupSelector = useRef<HTMLSelectElement>(null);` por `const groupChip = useRef<HTMLButtonElement>(null);` y sustituye **todas** las apariciones de `groupSelector.current?.focus()` por `groupChip.current?.focus()`.
  3. El `{snapshot.excludedSeriesWithoutEpisodes > 0 && …}` de `workspaceControls` se queda para Gustos. En Obras se pinta encima del atlas (ver abajo).
  4. Sustituye **todo** el `return <div className={styles.explorer}>…</div>;` de `ExplorerSession` por:

```tsx
  return <div className={`dark ${styles.immersive}`}>
    <header className={styles.bar}>
      <Link href="/comunidad" className={styles.back}>← {t('backToCommunity')}</Link>
      <h1>{t('title')}</h1>
      <GroupSheet chipRef={groupChip} choices={choices} value={state.groupId} unsavedId={withGroup?.id ?? null} activeName={active?.name ?? null}
        canEdit={!!active && !activeIsUnsaved} canSaveUnsaved={activeIsUnsaved && !!withGroup} showRefresh={!!active}
        onSelect={id => selectGroup(selectOwnedGroup(id, choices))} onEdit={() => active && setEditor({ group: active })}
        onCreate={() => setEditor({ group: null })}
        onSaveUnsaved={() => withGroup && setEditor({ group: null, people: withGroup.members.flatMap(member => member.userId ? [member.userId] : []) })}
        onRefresh={refresh}/>
      <span className={styles.barSpacer}/>
      {active && <>
        <nav aria-label={t('sections')} className={styles.tabs}>{(['works', 'tastes'] as const).map(section => <button key={section} type="button" aria-pressed={state.section === section} onClick={() => selectSection(section)} className={styles.tab}>{t(section)}</button>)}</nav>
        <div className={styles.formats} role="group" aria-label={t('formatPills')}>{(['all', 'book', 'movie', 'series'] as const).map(next => <button key={next} type="button" aria-pressed={format === next} onClick={() => setFormat(next)}>{t(next === 'all' ? 'allFormatsShort' : `formats.${next}`)}</button>)}</div>
      </>}
    </header>
    {editor && <GroupEditor key={editor.group?.id ?? 'new'} group={editor.group} initialPeople={editor.people} candidates={candidates} viewerId={viewerId} onSaved={onSaved} onDeleted={id => { setGroups(current => current.filter(group => group.id !== id)); selectGroup(null); }} onCancel={() => { setEditor(null); groupChip.current?.focus(); }} onReload={() => { setEditor(null); groupChip.current?.focus(); refresh(); router.refresh(); }}/>}
    {!choices.length && !editor && <div className={styles.immersiveEmpty}>{candidates.some(person => person.userId !== viewerId)
      ? <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noGroups')} message={t('noGroupsMessage')} action={<Button onClick={() => setEditor({ group: null })}>{t('createFirstGroup')}</Button>}/>
      : <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noFollowsTitle')} message={t('noFollowsMessage')} action={<Link href="/comunidad?tab=personas" className={buttonVariants('primary')}>{t('findPeopleToFollow')}</Link>}/>}</div>}
    {active && <section aria-label={t('canvas')} aria-busy={state.snapshot.status === 'loading'} className={styles.stage}>
      <h2 className={styles.srOnly}>{active.name}</h2>
      {state.snapshot.status === 'loading' && <div className={styles.workspaceLoading}><ComparisonLoading label={t('loading')}/></div>}
      {state.snapshot.status === 'error' && <div role="alert"><p>{t(state.loadError === 'conflict' ? 'loadConflict' : `errors.${state.loadError ?? 'load-failed'}`)}</p><Button variant="secondary" onClick={() => { refresh(); if (state.loadError === 'unavailable' || state.loadError === 'unauthenticated') router.refresh(); }}>{t('reloadComparison')}</Button></div>}
      {snapshot && <div key={state.snapshot.seq} className={styles.canvasWrap} data-comparison-reveal data-comparison-slot={state.section} data-view={state.views[state.section].level}>
        {state.section === 'works' && <AtlasView snapshot={snapshot} viewerId={viewerId}/>}
        {state.section === 'tastes' && <div className={styles.tastePanel}>{workspaceControls}
          <Tastes snapshot={snapshot} people={state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people} view={state.views.tastes} onView={view => dispatch({ type: 'view', view })} controls={state.tasteControls} onControlsChange={controls => dispatch({ type: 'tasteControls', controls })} onOpenWork={(key, origin) => dispatch({ type: 'view', view: { level: 'work', people: state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people, key, origin } })}/></div>}
      </div>}
      {snapshot && state.revealSeq === state.snapshot.seq && completedHandoff !== state.snapshot.seq && <div key={`handoff-${state.snapshot.seq}`} aria-hidden="true" inert className={`${styles.workspaceLoading} ${styles.loadingExit}`} data-comparison-handoff onAnimationEnd={event => {
        if (event.target === event.currentTarget) setCompletedHandoff(state.snapshot.seq);
      }}><ComparisonLoading label={t('loading')}/></div>}
    </section>}
  </div>;
```

  Añade a `explorer.module.css` `.canvasWrap { position: absolute; inset: 0; }`. Comprueba que `.srOnly` ya existe (lo usaba la versión anterior); si no, añádela con el patrón visual-hidden estándar.
  5. Dentro de `workspaceControls`, la condición del fieldset `(state.section === 'tastes' || state.views.works.level !== 'group')` pasa a `state.section === 'tastes'`. Quita el `<Button … refreshAccess>` (ahora vive en la hoja de grupos) y el `<h2>` (ahora está en el stage).
  6. En `.loadingExit` y `.workspaceLoading`, cambia `background: var(--surface)` por `background: var(--atlas-ground)` dentro de `.immersive`, con la regla `.immersive .loadingExit { background: var(--atlas-ground); }`.

- [ ] **Step 6: Adaptar `explorer.test.tsx`.** Ejecuta `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/comparisons/explorer.test.tsx`. Aplica estas reglas a cada fallo:
  - Los tests montan `Explorer` en jsdom, así que añade al `beforeAll`/`beforeEach` del fichero el mismo stub de `<dialog>` de la Task 7 y `vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)`.
  - Donde un test pulsaba `Crear grupo`, `Editar grupo`, `Actualizar`, `Guardar como grupo` o cambiaba el combobox `Grupo`, antes abre la hoja con `fireEvent.click(screen.getByRole('button', { name: /^Grupo: / }))`.
  - **Borra** el test `synchronizes a map pair with the participant controls before adding a third person`: su objeto, el Venn, ya no existe.
  - Los tests que miran el foco en el selector tras elegir o cancelar pasan a esperarlo en el chip (`getByRole('button', { name: /^Grupo: / })`).
  - Los tests de Gustos, sesión, carga y handoff deben pasar sin más cambios: `data-comparison-slot`, `data-comparison-handoff` y `role="alert"` se conservan. Si alguno falla por otra razón, para y repórtalo: no lo ajustes a ciegas.

Expected tras los ajustes: PASS.

- [ ] **Step 7: Typecheck, lint y suite del área**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npm run lint; npx vitest run src/components/comparisons src/lib/comparisons src/components/nav`
Expected: los tres limpios / PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/nav src/app/comunidad/entre-nosotros src/components/comparisons
git commit -m "feat(entre-nosotros): atlas inmersivo y oscuro en lugar de Obras

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: E2E escritorio y móvil

**Files:**
- Create: `e2e/entre-nosotros-atlas.spec.ts`
- Modify: `playwright.comparisons.config.ts`
- Modify: `e2e/entre-nosotros.spec.ts`
- Delete: `e2e/entre-nosotros-motion.spec.ts`

**Interfaces:**
- Consumes: `withComparisonFixture`, `loginComparisonActor`, `chooseComparisonParticipants` y `shownName` de `e2e/support/comparison-fixtures.ts`. El fixture no integrado tiene 3 personas con los mismos 30 libros, así que todo es común.
- Consumes del DOM: `[data-atlas-moving]`, `[data-atlas-probe]`, las caras (`group` «Personas del cruce»), el resumen (`role=status` dentro de `[data-comparison-stage]`), el chip «Grupo: …» y la hoja «Grupos».

- [ ] **Step 1: Config.** Sustituye el `defineConfig` de `playwright.comparisons.config.ts` por:

```ts
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Deliberately no global QA seed/sweep or server launcher. The caller owns a
// freshly built production server and the exact guarded disposable fixtures.
export default defineConfig({
  ...base,
  testMatch: ['entre-nosotros.spec.ts', 'entre-nosotros-atlas.spec.ts'],
  // Discovery is owned here; neither present nor future general exclusions apply.
  testIgnore: [],
  globalSetup: undefined,
  webServer: undefined,
  timeout: 180_000,
  workers: 1,
  retries: 0,
  // Asset/action interception is the gate contract. Offline/SW behavior is outside it.
  use: { ...base.use, serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: ['entre-nosotros-atlas.spec.ts'], use: { ...devices['Pixel 7'] } },
  ],
});
```

- [ ] **Step 2: Write `e2e/entre-nosotros-atlas.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { chooseComparisonParticipants, loginComparisonActor, withComparisonFixture, type ComparisonFixture } from './support/comparison-fixtures';

async function settled(page: Page) {
  await expect(page.locator('[data-atlas-moving]')).toHaveAttribute('data-atlas-moving', 'false');
}
async function openAtlas(page: Page, fixture: ComparisonFixture) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  await page.getByRole('button', { name: 'Crear tu primer grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill('Atlas QA');
  await chooseComparisonParticipants(form, fixture.actors[0], fixture.actors);
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Grupo: Atlas QA', exact: true })).toBeVisible();
  await settled(page);
}
const summary = (page: Page) => page.locator('[data-comparison-stage]').getByRole('status');
async function probe(page: Page) {
  return JSON.parse(await page.locator('[data-atlas-probe]').getAttribute('data-atlas-probe') ?? '[]') as { key: string; x: number; y: number }[];
}
/** Zoom into the shared group (a tap on a group at map zoom flies to it), then return a work on screen. */
async function zoomToWork(page: Page, tap: (x: number, y: number) => Promise<void>) {
  const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
  const [first] = await probe(page);
  await tap(box.x + first.x, box.y + first.y); await settled(page);
  expect(Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-zoom'))).toBeGreaterThan(1.1);
  const [work] = await probe(page);
  return { box, work };
}

test('escritorio: caras, resumen y clic que abre la ficha', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await expect(summary(page)).toHaveText('30 obras en común entre Tú, Beatriz QA y Carlos QA');
    const faces = page.getByRole('group', { name: 'Personas del cruce', exact: true });
    await faces.getByRole('button', { name: 'Carlos QA', exact: true }).click();
    await expect(summary(page)).toHaveText('30 obras en común entre Tú y Beatriz QA');
    await faces.getByRole('button', { name: 'Tú', exact: true }).click();
    await expect(summary(page)).toHaveText('30 obras de Beatriz QA. Suma a alguien para ver el cruce.');
    await faces.getByRole('button', { name: 'Beatriz QA', exact: true }).click();
    await expect(faces.getByRole('button', { name: 'Beatriz QA', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await faces.getByRole('button', { name: 'Tú', exact: true }).click(); await settled(page);
    const { box, work } = await zoomToWork(page, (x, y) => page.mouse.click(x, y));
    await page.mouse.move(box.x + work.x, box.y + work.y);
    await expect(page.getByText(/^qa_comp_motion_\d{2}$/).first()).toBeVisible();
    await page.mouse.click(box.x + work.x, box.y + work.y);
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
    await page.goBack(); await settled(page);
    await expect(summary(page)).toBeVisible();
  });
});

test('móvil: un toque abre la hoja y «Abrir ficha» navega', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    // Ruta a sangre: sin la barra inferior de la app.
    await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toHaveCount(0);
    const { box, work } = await zoomToWork(page, (x, y) => page.touchscreen.tap(x, y));
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    const sheet = page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ });
    await expect(sheet).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(scroll, 'sin scroll horizontal').toBe(true);
    await sheet.getByRole('link', { name: 'Abrir ficha', exact: true }).tap();
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
  });
});
```

- [ ] **Step 3: Adaptar `e2e/entre-nosotros.spec.ts`.**
  1. **Borra** `e2e/entre-nosotros-motion.spec.ts` (todo su objeto era el lienzo antiguo).
  2. **Borra** estos tests completos de `entre-nosotros.spec.ts`, cuyo objeto es el Venn, el lienzo DOM antiguo o el detalle de obra que ya no existe en Obras:
     - el bucle `for (const width of [320, 768, 1280]) test(\`Gustos restores A/B after Works selects C…\``;
     - `final fixes: natural origin focus, 320px selector, all-person episode sample and exclusions`;
     - `final fixes: intermediate map DOM names, piles and summary stay disjoint`;
     - `final fix M3 bounded allow/block fixture-cover ownership diagnosis`.

     Borra también las funciones auxiliares que queden sin uso (`geometry`, `coverOwnership` si ya nadie la llama) para que `tsc` y lint pasen.
  3. Sustituye `settled` por la versión que vale para atlas y para Gustos:

```ts
async function settled(page: Page) {
  await expect(page.locator('[data-atlas-moving], [data-camera-moving]').first()).toBeAttached();
  await expect(page.locator('[data-atlas-moving="true"], [data-camera-moving="true"]')).toHaveCount(0);
}
async function groups(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Grupos', exact: true });
  if (!await sheet.isVisible()) await page.getByRole('button', { name: /^Grupo: / }).click();
  return sheet;
}
const faces = (page: Page) => page.getByRole('group', { name: 'Personas del cruce', exact: true }).getByRole('button');
const summary = (page: Page) => page.locator('[data-comparison-stage]').getByRole('status');
```

  4. En `createGroup`, la primera línea pasa a abrir la hoja si existe el chip; si no, usa el estado vacío:

```ts
  const firstGroup = page.getByRole('button', { name: 'Crear tu primer grupo', exact: true });
  if (await firstGroup.isVisible()) await firstGroup.click();
  else await (await groups(page)).getByRole('button', { name: 'Crear grupo', exact: true }).click();
```

     Su `await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();` pasa a `await expect(page.getByRole('button', { name: \`Grupo: ${name}\`, exact: true })).toBeVisible();`.
  5. En todos los tests que quedan, aplica estas sustituciones:

     | Antes | Después |
     |---|---|
     | `page.getByRole('button', { name: 'Editar grupo', exact: true })` (fuera del formulario) | `(await groups(page)).getByRole('button', { name: 'Editar grupo', exact: true })` |
     | `page.getByRole('button', { name: 'Actualizar', exact: true })` | `(await groups(page)).getByRole('button', { name: 'Actualizar', exact: true })` |
     | `page.getByRole('button', { name: 'Guardar como grupo', exact: true })` | `(await groups(page)).getByRole('button', { name: 'Guardar como grupo', exact: true })` |
     | `page.getByRole('combobox', { name: 'Grupo', exact: true })` | `(await groups(page)).getByRole('combobox', { name: 'Grupo', exact: true })` |
     | `page.getByRole('heading', { name: 'Mi grupo QA', exact: true })` | `page.getByRole('button', { name: 'Grupo: Mi grupo QA', exact: true })` |
     | `page.getByRole('checkbox')` y `getByRole('checkbox', { name: X })` en la sección Obras | `faces(page)` y `faces(page).filter({ hasText: X })` |

     Dentro de una función de flecha síncrona que pase a usar `await groups(page)`, conviértela en `async`. Las aserciones `toHaveCount` sobre caras cuentan también los chips de «Persona no disponible». Cuando el test original esperaba que una persona desapareciera, comprueba `faces(page).filter({ hasText: 'Beatriz QA' })` → `toHaveCount(0)`.
  6. Test `ten-person CRUD…`: renómbralo a `ten-person CRUD, owner-free group, atlas faces and formats, persistence and keyboard` y sustituye el bloque desde `await expect(page.getByRole('checkbox')).toHaveCount(10);` hasta `await expect(page.getByText('Sin valorar', { exact: true })).toBeVisible();` (inclusive), y la línea siguiente con `Escape`, por:

```ts
    await expect(faces(page)).toHaveCount(10);
    expect(journal.some(row => row.body?.includes('PRIVATE PASS QA MUST NOT LEAVE'))).toBe(false);
    // All ten share the first three books; the first three also share 27 more, the movie and the series.
    await expect(summary(page)).toContainText('3 obras en común entre Tú, Beatriz QA, Carlos QA');
    for (const actor of fixture.actors.slice(3)) await faces(page).filter({ hasText: actor.name }).click();
    await expect(summary(page)).toHaveText('32 obras en común entre Tú, Beatriz QA y Carlos QA');
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await settled(page);
    await expect(summary(page)).toHaveText('30 obras en común entre Tú, Beatriz QA y Carlos QA');
```

     El resto del test (reload, editar sin dueño, borrar con teclado) se queda con las sustituciones de la tabla. `await expect(page.getByRole('checkbox', { name: 'Tú', exact: true })).toHaveCount(0); await expect(page.getByRole('checkbox')).toHaveCount(2);` pasa a `await expect(faces(page).filter({ hasText: 'Tú' })).toHaveCount(0); await expect(faces(page)).toHaveCount(2);`.
  7. Test `two real tabs conflict…`: las líneas `await selectPeople(page, fixture, [0, 1]); await page.getByRole('button', { name: 'Gustos', exact: true }).click();` se quedan **en orden inverso** (primero Gustos, luego `selectPeople`), porque las casillas solo existen en Gustos.
  8. Test `profile «Comparar»…`: sustituye `await page.getByRole('button', { name: 'Tú, Beatriz QA 30 obras comunes', exact: true }).click(); await settled(page);` por `await expect(summary(page)).toHaveText('30 obras en común entre Tú y Beatriz QA');`. Las comprobaciones del combobox van con `groups(page)`. Cierra la hoja con `await page.keyboard.press('Escape')` antes de pulsar otra cosa fuera de ella.
  9. Test `LOCAL ONLY ten-person full HTTP snapshot…`: borra el bloque `const stage = …` / `const map = await stage.evaluate(…)` y las aserciones que usan `map`. Conserva las de respuesta HTTP, recuento de pases y ausencia de prosa privada. Si al borrar queda una variable sin uso, bórrala.
  10. Las aserciones `locator('[data-comparison-stage]')).toHaveCount(0)` se quedan tal cual: `AtlasView` conserva el atributo.

- [ ] **Step 4: Ejecutar.** Antes, aplica la higiene de entorno de AGENTS.md: libera el 3000 y copia `.env.local`. Los e2e van contra build de producción:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npm run build
```

Arranca `npm run start` en segundo plano (puerto 3000) y espera con `curl --retry 90 --retry-delay 2 --retry-all-errors -s -o /dev/null http://localhost:3000/`. Después, en tandas:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test -c playwright.comparisons.config.ts e2e/entre-nosotros-atlas.spec.ts
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test -c playwright.comparisons.config.ts e2e/entre-nosotros.spec.ts -g "CRUD|profile|transport"
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test -c playwright.comparisons.config.ts e2e/entre-nosotros.spec.ts -g "conflict|isolation"
```

Expected: todo PASS y **ningún** `skipped`. Muchos skipped significan que falta `.env.local`. El test `LOCAL ONLY` solo corre contra Supabase local; si apunta a dev, se salta legítimamente y hay que decirlo. Al acabar, mata el `next start`.

- [ ] **Step 5: Contrato de imports de e2e.** Ejecuta `npx tsx --test e2e/support/club-round-fixture.test.ts` (CI lo corre en `quality`). Expected: PASS. No hemos tocado `club-ronda.spec.ts`, pero lo confirma.

- [ ] **Step 6: Commit**

```bash
git add e2e playwright.comparisons.config.ts
git commit -m "test(entre-nosotros): e2e del atlas en escritorio y móvil; suite adaptada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Revisión visual de F1 (gate con el usuario)

**Files:**
- Create: `docs/testing/2026-10-13-entre-nosotros-atlas-f1.md` (evidencia)
- Create: capturas en `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f1/`

- [ ] **Step 1: Suite completa de unitarios y typecheck**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npm run lint; npx vitest run`
Expected: PASS. Anota el número de ficheros y pruebas.

- [ ] **Step 2: Capturas.** Con el build de la Task 9 en marcha, el fixture de 3 personas y un usuario con datos de dev, captura con el navegador integrado (`preview_start` con `url` o Playwright):
  - escritorio 1280×800: mapa encajado; zoom de portadas (k > 1.1); zoom de títulos (k > 3.2); tooltip;
  - móvil 390×844: mapa; fila de caras desplazable; hoja inferior abierta; hoja de grupos.

  Guárdalas en `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f1/` con nombres `desktop-map.png`, `desktop-covers.png`, `desktop-titles.png`, `desktop-tooltip.png`, `mobile-map.png`, `mobile-sheet.png` y `mobile-groups.png`.

- [ ] **Step 3: Evidencia.** Escribe `docs/testing/2026-10-13-entre-nosotros-atlas-f1.md` con:
  - cabecera `[Histórico · verificado 2026-10-13]`;
  - el build usado;
  - los comandos y resultados de las Tasks 8–10 (cifras de unitarios y e2e, sin skips);
  - las capturas enlazadas;
  - qué no se verificó: dispositivo real, fps con 1.000 obras y covers reales, que son de F4.

- [ ] **Step 4: Commit**

```bash
git add docs/testing
git commit -m "docs(entre-nosotros): evidencia y capturas de F1 del atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Parar.** Enseña las capturas al usuario y espera su visto bueno antes de F2. No toques `decisiones.md`, `graph.json` ni el backlog: es la fase de cierre.
