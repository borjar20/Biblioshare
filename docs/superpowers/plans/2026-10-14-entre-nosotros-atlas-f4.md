# Entre nosotros · atlas · F4 (portadas, lista accesible, teclado, estado y cierre) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Un implementador cada vez** en este árbol.

**Goal:** Cerrar el atlas para poder mezclarlo:
- portadas reales con caché LRU;
- **«Ver como lista»** como vía de teclado y lector de pantalla;
- atajos de teclado;
- lente y modo de Islas en la URL, y caras y cámara recordadas al volver de una ficha;
- pulido de rendimiento y gestos;
- retirada del código muerto (lienzo antiguo, detalle de obra y reducer de secciones);
- docs canónicos al día.

**Architecture:**
- La caché de imágenes es un módulo puro con creador de imagen inyectable (`image-cache.ts`). El motor pide portadas solo en modo portada y para obras visibles.
- La lista sale de una función pura por lente (`list.ts`) y se pinta como DOM navegable con enlaces.
- El estado de UI del atlas (lente, modo, caras, lista) se agrupa en un objeto del explorer. La lente y el modo se sincronizan con la URL; caras y cámara van a `sessionStorage` por grupo, para no poner ids de personas en la URL.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, CSS Modules, Canvas 2D, Vitest y Playwright.

**Spec:** [`../specs/2026-10-13-entre-nosotros-atlas-design.md`](../specs/2026-10-13-entre-nosotros-atlas-design.md) §5.2, §5.3, §7 y §10 (F4 y cierre). Pendientes de fases anteriores: `.superpowers/sdd/progress.md` (no versionado). Lo relevante va en cada tarea.

## Global Constraints

- Sin tablas, columnas, RLS ni migraciones. Sin `use cache` (regla #437). Strings en `messages/es.json` bajo `comparisons`.
- **Portadas** (spec §5.2):
  - Se cargan **solo** con zoom de portada (`k > 1.1`) y obra visible.
  - Caché LRU de **300** `HTMLImageElement`.
  - URL del loader propio `src/lib/images/cdn-loader.ts` con ancho **96**, nunca `/_next/image`.
  - Mientras cargan o si fallan, bloque del color del tipo.
  - Objetivo de rendimiento: 60 fps con 1.000 obras en un Android de gama media.
- **Lista** (spec §7):
  - Botón «Ver como lista» que muestra enlaces a la ficha, con el mismo filtro de caras, formato y lente.
  - Orden por lente: Quién por grupo de dueños, Opinión por |dif| descendente, Tiempo por fecha, Islas por isla.
  - Es la vía de teclado y lector de pantalla.
- **Teclado** (spec §5.3): `+`/`-` zoom, `0`/`F` encajar, flechas mover, `1`–`4` lentes. Solo con el foco dentro del atlas y sin modificadores. Nunca intercepta campos de texto.
- **Estado:**
  - Lente y modo de Islas en la URL (`?lente=quien|opinion|tiempo|islas&islas=tipo|genero|autor`), con `router.replace`, conservando `group`/`con`.
  - **Caras y cámara en `sessionStorage` por grupo**: los ids de persona no van en la URL. Es una decisión que va a `decisiones.md`.
  - Si `sessionStorage` falla, se encaja.
- `prefers-reduced-motion` sin vuelos. Umbrales del motor sin cambios.
- Al retirar código muerto, el explorer conserva `SessionBoundary`, la máquina de carga y los grupos. Ninguna aserción de sesión, carga, conflicto o privacidad se debilita.
- Node 22: cada comando de PowerShell empieza por `fnm env | Out-String | Invoke-Expression; fnm use 22;` en la misma línea. Commits con `-m "…" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Sin `git stash` a secas ni `git checkout -- <fichero>` sobre ficheros con cambios propios. Sin BOM.

---

### Task 1: Portadas reales con caché LRU

**Files:**
- Create: `src/lib/comparisons/atlas/image-cache.ts` (+ `image-cache.test.ts`)
- Modify: `src/components/comparisons/atlas/atlas-engine.ts` (+ `atlas-canvas.test.tsx`)

**Interfaces:**
- Produces:
  - `type ImageLike = { src: string; onload: (() => void) | null; onerror: (() => void) | null }`.
  - `createImageCache({ capacity?, create?, resolve?, onReady })` → `{ get(src): ImageLike | null; request(src): void; size(): number }`. `get` devuelve la imagen solo si ya cargó y la marca como reciente. `request` es idempotente y desaloja la menos reciente por encima de `capacity`, quitando sus manejadores y vaciando su `src`.

- [ ] **Step 1: Failing test** (`image-cache.test.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';
import { createImageCache, type ImageLike } from './image-cache';

function fakes() {
  const made: ImageLike[] = [];
  return { made, create: () => { const img: ImageLike = { src: '', onload: null, onerror: null }; made.push(img); return img; } };
}

describe('createImageCache', () => {
  it('pide con el loader a 96 px, una sola vez por portada, y solo devuelve las cargadas', () => {
    const { made, create } = fakes(); const onReady = vi.fn();
    const cache = createImageCache({ create, resolve: src => `${src}?w=96`, onReady });
    cache.request('a'); cache.request('a');
    expect(made).toHaveLength(1); expect(made[0].src).toBe('a?w=96');
    expect(cache.get('a')).toBeNull();
    made[0].onload!(); expect(onReady).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBe(made[0]);
  });
  it('una portada que falla no se devuelve ni se repide', () => {
    const { made, create } = fakes();
    const cache = createImageCache({ create, resolve: s => s, onReady: () => {} });
    cache.request('x'); made[0].onerror!(); cache.request('x');
    expect(made).toHaveLength(1); expect(cache.get('x')).toBeNull();
  });
  it('LRU: por encima de la capacidad desaloja la menos usada y la desengancha', () => {
    const { made, create } = fakes();
    const cache = createImageCache({ capacity: 2, create, resolve: s => s, onReady: () => {} });
    cache.request('a'); cache.request('b'); made[0].onload!(); made[1].onload!();
    cache.get('a');                 // a is now the most recent
    cache.request('c');             // evicts b
    expect(cache.size()).toBe(2);
    expect(cache.get('b')).toBeNull(); expect(cache.get('a')).toBe(made[0]);
    expect(made[1]).toMatchObject({ src: '', onload: null, onerror: null });
  });
});
```

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/comparisons/atlas/image-cache.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `image-cache.ts`**

```ts
export type ImageLike = { src: string; onload: (() => void) | null; onerror: (() => void) | null };
type Entry = { img: ImageLike; state: 'loading' | 'ready' | 'error' };

/** LRU of cover images for the atlas canvas (spec §5.2): only ever asked for visible covers at cover zoom. */
export function createImageCache({ capacity = 300, create, resolve, onReady }: {
  capacity?: number; create: () => ImageLike; resolve: (src: string) => string; onReady: () => void;
}) {
  const entries = new Map<string, Entry>();
  const touch = (src: string, entry: Entry) => { entries.delete(src); entries.set(src, entry); };
  return {
    get(src: string): ImageLike | null {
      const entry = entries.get(src); if (!entry) return null;
      touch(src, entry); return entry.state === 'ready' ? entry.img : null;
    },
    request(src: string) {
      const existing = entries.get(src); if (existing) { touch(src, existing); return; }
      const img = create(); const entry: Entry = { img, state: 'loading' };
      img.onload = () => { entry.state = 'ready'; onReady(); };
      img.onerror = () => { entry.state = 'error'; };
      entries.set(src, entry); img.src = resolve(src);
      while (entries.size > capacity) {
        const [oldest, old] = entries.entries().next().value as [string, Entry];
        old.img.onload = null; old.img.onerror = null; old.img.src = ''; entries.delete(oldest);
      }
    },
    size: () => entries.size,
  };
}
```

Run. Expected: PASS.

- [ ] **Step 3: Motor.**
  1. Crea la caché al arrancar:

```ts
const covers = createImageCache({ create: () => { const img = new Image(); img.decoding = 'async'; return img as unknown as ImageLike; },
  resolve: src => cdnLoader({ src, width: 96 }), onReady: () => kick() });
```

     con `import cdnLoader from '@/lib/images/cdn-loader'`. En tests, `Image` existe en jsdom.
  2. En el bloque de portadas de `draw()`, si `work.coverUrl`:
     - pide `covers.request(work.coverUrl)`, con un máximo de **24 peticiones nuevas por frame** (contador local reiniciado en cada `draw`);
     - si `covers.get(work.coverUrl)` devuelve imagen, dibújala recortada al `roundRect` de la portada con `ctx.save(); roundRect(...); ctx.clip(); ctx.drawImage(img as HTMLImageElement, x, y, cw, ch); ctx.restore();` **en lugar** del bloque de color plano y la banda oscura;
     - si no, deja el bloque de color como hasta ahora.

     Los puntitos de dueño, el aro y el título se pintan encima igual.
  3. **No** se piden portadas en modo puntos (`k ≤ 1.1`) ni para obras fuera de pantalla (ya filtradas por `visible`).
  4. Publica `host.dataset.atlasCovers = String(covers.size())` en cada frame, para el e2e.
  5. Test en `atlas-canvas.test.tsx`: con un `Image` espiado (`vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null; decoding = '' })`), tras asentarse en el encaje (modo puntos) `data-atlas-covers` es `'0'`. Necesitas un `getContext` falso con los métodos que use `draw()` para que se ejecute el bloque de portadas; reutiliza o crea un fake mínimo. Tras `zoomBy` hasta `k > 1.1` y `flush`, es mayor que 0. Escríbelo primero y comprueba que falla.
- [ ] **Step 4: Run** la suite del área, `npx tsc --noEmit` y `npx eslint src/components/comparisons/atlas src/lib/comparisons/atlas`. **Commit** `feat(entre-nosotros): portadas reales en el atlas con caché LRU`.

---

### Task 2: Rendimiento y gestos

**Files:** Modify `src/components/comparisons/atlas/atlas-engine.ts`, `paint-links.ts` (+ tests). Create `src/components/comparisons/atlas/atlas-engine.perf.test.ts`.

Pendientes de las revisiones de F1–F3, todos en el motor:

- [ ] **Step 1: Presupuesto (test primero).** `atlas-engine.perf.test.ts` (jsdom; se salta si `process.env.CI`):
  - monta el motor con 1.000 obras de 10 dueños en Tiempo (≈10.000 apariciones y 1.000 hilos) y un `ctx` falso con métodos no-op;
  - mide la mediana de 20 llamadas a un frame (`requestAnimationFrame` capturado);
  - aserción: **< 12 ms** de mediana y **< 120 ms** para el `sync()` inicial.

  Anota en el report la medición antes y después.
- [ ] **Step 2: Asignaciones por frame.**
  - `approach` sin objetos en el bucle de sprites: interpola en línea con un helper que mute el sprite.
  - `toScreen` en línea para el bucle de dibujo.
  - `byKey` y el mapa de colores, construidos en `sync()` y no en cada `draw()`.
  - `hitWork` sin arrays intermedios: recorre los sprites y guarda el mejor.
- [ ] **Step 3: Hilos.**
  - `paintLinks` descarta los hilos cuya caja de pantalla queda entera fuera (margen de 80 px).
  - Agrupa los hilos no dorados en **un solo** `beginPath`/`stroke` con alpha constante 0.18, sin multiplicar por el alpha mínimo cuando todas sus apariciones están asentadas (`a ≥ 0.98`). Los que están en transición siguen con su propio stroke.
  - Ajusta `paint-links.test.ts`.
- [ ] **Step 4: Gestos.**
  - La rueda respeta `deltaMode`: línea ×16 px, página ×altura del viewport.
  - Un toque exige que el recorrido **máximo** desde el `pointerdown` sea < 5 px, no solo los extremos.
  - Durante el pellizco, el punto medio también desplaza: pan por el delta del punto medio.
  - `onDown` llama a `kick()`.
  - Las interpolaciones de obras **siguen** aunque haya un dedo quieto: el frame se re-agenda si hay sprites en movimiento, haya o no punteros.
  - Cambiar `people` o `countLabel` redibuja: añade `props.people` a las dependencias del efecto de sync en `atlas-canvas.tsx` y haz `kick()` en `sync()`.

  Cada punto con su test en `atlas-canvas.test.tsx` usando el stub de `PointerEvent` existente.
- [ ] **Step 5: Run** la suite del área, tsc y eslint. El test de presupuesto debe pasar en local. **Commit** `perf(entre-nosotros): motor del atlas sin asignaciones por frame, hilos recortados y gestos finos`.

---

### Task 3: «Ver como lista»

**Files:**
- Create: `src/lib/comparisons/atlas/list.ts` (+ `list.test.ts`) y `src/components/comparisons/atlas/atlas-list.tsx` (+ `atlas-list.test.tsx`)
- Modify: `atlas-view.tsx`, `atlas.module.css`, `messages/es.json`

**Interfaces:**
- Consumes: el `Scene` (para saber qué se dibuja: `alpha === 1`) y las maquetaciones `quien`, `opinion`, `tiempo` e `islas`.
- Produces:
  - `type ListSection = { id: string; heading: { kind: 'owners'; ids: string[] } | { kind: 'island'; islandId: string } | { kind: 'plain' }; keys: WorkKey[] }`.
  - `listSections(lens, works, active, layouts): ListSection[]`.
  - `AtlasList` (componente).

- [ ] **Step 1: Failing test** (`list.test.ts`). Con un `people`/`works` pequeño, como el de `scene.test.ts`:
  - **Quién:** una sección por conjunto exacto de dueños que toque a alguna cara activa. Primero la común a todas las activas, luego por número de dueños activos descendente y después por tamaño descendente. Las claves van en el orden de la espiral.
  - **Opinión:** una sección `plain` con las claves comparables ordenadas por `diff` descendente y desempate por clave.
  - **Tiempo:** una sección `plain` con las obras que tienen alguna aparición, ordenadas por su **primera** fecha activa ascendente. Las que no tienen fecha **no** entran.
  - **Islas:** una sección por isla en el orden de la maquetación. Una obra que está en dos islas aparece en las dos.
  - Lo que no toca a ninguna cara activa no aparece en ninguna lente.
- [ ] **Step 2: Implement `list.ts`.** Es una función pura que lee las maquetaciones ya calculadas y no recalcula nada:
  - Quién: `quien.clusters` filtrado y reordenado;
  - Opinión: `opinion.positions`;
  - Tiempo: `tiempo.instances` agrupadas por `key` con el mínimo `year`;
  - Islas: `islas.islands`.
- [ ] **Step 3: i18n.** En `comparisons.atlas.list` añade:
  - `"show": "Ver como lista"`;
  - `"hide": "Ver como mapa"`;
  - `"label": "Lista de obras"`;
  - `"empty": "No hay obras que mostrar con estas caras."`;
  - `"diff": "{ref} · media del resto {others}"`;
  - `"other": "Otros"`.
- [ ] **Step 4: `atlas-list.tsx`.**
  - Una `<section aria-label={t('atlas.list.label')}>`, con un `<h3>` por sección:
    - `owners`: nombres unidos con `Intl.ListFormat`;
    - `island`: el mismo `islandText.title`;
    - `plain`: sin encabezado.
  - Un `<ul>` de `<li><a href={itemHref(...)}>`. Cada enlace lleva:
    - `<img src={cdnLoader({ src: coverUrl, width: 96 })} alt="" loading="lazy" width={48} height={70}/>`, o un bloque del color del tipo si no hay portada;
    - el título, o `missingMetadata`;
    - un detalle por lente: Opinión → `t('atlas.list.diff', { ref: n.ref, others: n.others.toFixed(1) })`; Tiempo → el año de la primera aparición; Quién e Islas → los dueños.
  - Las obras sin metadatos no llevan enlace: un `<span>` con el mismo contenido.
  - Debe ser navegable con Tab y desplazable dentro del escenario: `position: absolute; inset: 0; overflow: auto; padding` con las mismas insets que el canvas, y el resumen y las caras visibles encima.
- [ ] **Step 5: `atlas-view.tsx`.**
  - Botón conmutador `aria-pressed` («Ver como lista» / «Ver como mapa»). Va junto a los botones de zoom y también es visible en móvil: en móvil los zoom están ocultos, así que el botón va en el dock, encima de las lentes.
  - Con la lista activa se pinta `AtlasList` en lugar de `AtlasCanvas`. El resumen, las caras, las lentes y el modo de Islas siguen y filtran la lista.
  - El estado de lista vive en el explorer (Task 4), con prop controlada `list: boolean; onListChange`. En esta tarea añade la prop y su `useState` en el explorer junto a los demás.
- [ ] **Step 6: Tests** (`atlas-list.test.tsx` y `atlas-view.test.tsx`):
  - al pulsar «Ver como lista» aparece la región «Lista de obras» con enlaces `/libro/…`;
  - apagar una cara quita sus obras;
  - en Opinión el orden es por diferencia;
  - el botón alterna `aria-pressed`;
  - una obra sin metadatos no tiene enlace.

  Ejecuta, comprueba que FALLAN y después que pasan. Corre también tsc y lint. **Commit** `feat(entre-nosotros): «Ver como lista», la vía accesible del atlas`.

---

### Task 4: Teclado, URL y memoria por grupo

**Files:**
- Create: `src/components/comparisons/atlas/atlas-keys.ts` (+ test) y `src/components/comparisons/atlas-ui-state.ts` (+ test)
- Modify: `atlas-view.tsx`, `atlas-canvas.tsx`, `atlas-engine.ts`, `src/components/comparisons/explorer.tsx` (+ tests)

**Interfaces:**
- Produces:
  - `atlasKeyAction(key: string, mods: { ctrl: boolean; meta: boolean; alt: boolean }, targetTag: string): { kind: 'zoom'; factor: number } | { kind: 'fit' } | { kind: 'pan'; dx: number; dy: number } | { kind: 'lens'; lens: Lens } | null`.
  - `AtlasCanvasHandle` gana `panBy(dx, dy)` y `camera(): { lens: Lens; x: number; y: number; k: number }`.
  - El canvas acepta `initialCamera?: Camera`, que se usa en lugar del encaje inicial si se da.
  - `atlas-ui-state.ts`:
    - `parseAtlasQuery(search): { lens: Lens; islandMode: IslandMode }`;
    - `atlasQuery(base: URLSearchParams, lens, mode): string`;
    - `readGroupMemory(storage, groupId): { faces: string[] | null; camera: { lens: Lens; x: number; y: number; k: number } | null }`;
    - `writeGroupMemory(storage, groupId, patch)`.

    Las funciones de memoria toleran que `storage` lance o devuelva basura.

- [ ] **Step 1: Tests primero.**
  - `atlasKeyAction`:
    - `+`/`=` → zoom 1.4; `-`/`_` → zoom 1/1.4; `0`/`f`/`F` → fit;
    - flechas → pan ±80;
    - `1`–`4` → `quien`/`opinion`/`tiempo`/`islas`;
    - con ctrl, meta o alt → `null`; con `targetTag` `INPUT`/`TEXTAREA`/`SELECT` → `null`.
  - URL:
    - `?lente=tiempo&islas=genero` → `{ lens: 'tiempo', islandMode: 'genre' }`; los valores desconocidos dan los valores por defecto;
    - `atlasQuery` conserva `group`/`con` y omite los valores por defecto (`quien`, `tipo`).
  - Memoria: ida y vuelta por grupo; un `storage` que lanza devuelve `{ faces: null, camera: null }` sin lanzar; un JSON corrupto también.
- [ ] **Step 2: Implementar.**
  - **Teclado:** el contenedor del escenario (`data-comparison-stage`) lleva `onKeyDown`. Llama a `atlasKeyAction(e.key, …, (e.target as HTMLElement).tagName)` y, si devuelve acción, hace `preventDefault()` y la aplica: zoom/fit/pan vía el handle, lente vía `onLensChange`. El canvas lleva `tabIndex={0}` y `aria-keyshortcuts="+ - 0 F ArrowUp ArrowDown ArrowLeft ArrowRight 1 2 3 4"`.
  - **Motor:**
    - `panBy` desplaza `target ?? cam` y marca `touched`;
    - `camera()` devuelve la cámara actual con la lente;
    - con `initialCamera`, al primer `resize` válido usa esa cámara (`touched = true`, sin `snapFit`).
  - **Explorer:**
    - agrupa el estado de UI del atlas en `const [atlasUi, setAtlasUi] = useState<AtlasUi>(…)`, con `{ groupId, faces, lens, islandMode, list }`;
    - lente y modo se inicializan con `parseAtlasQuery(search)`;
    - al cambiarlos, `router.replace(\`/comunidad/entre-nosotros?${atlasQuery(…)}\`, { scroll: false })`;
    - las caras se inicializan con `readGroupMemory(sessionStorage, groupId).faces` al elegir grupo, y se escriben al cambiar;
    - mantiene la regla de que otro grupo empieza con todas.
  - **Cámara:**
    - la vista guarda `writeGroupMemory(…, { camera })` cuando la escena se asienta, con un callback `onSettled` del motor que se llama al publicar la sonda;
    - al montar, pasa `initialCamera` si la cámara guardada es de la misma lente.
- [ ] **Step 3: Tests de integración** (`explorer.test.tsx` y `atlas-view.test.tsx`):
  - montar con `?lente=islas&islas=genero` muestra Islas/Género pulsados;
  - cambiar de lente llama a `router.replace` con `lente=`;
  - las caras se recuerdan al remontar el explorer con el mismo grupo, con un `sessionStorage` falso;
  - una tecla `2` con el foco en el canvas pasa a Opinión y en un input no hace nada.
- [ ] **Step 4: Run** la suite del área, tsc y lint. **Commit** `feat(entre-nosotros): atajos de teclado, lente en la URL y caras y cámara por grupo`.

---

### Task 5: Retirar el código muerto

**Files:**
- Delete:
  - `src/components/comparisons/canvas.tsx`, `canvas.module.css`, `canvas.test.tsx`;
  - `geometry.ts` (+ test), `morph.ts` (+ test), `motion.ts` (+ test), `use-camera.ts`;
  - `work-detail.tsx` (+ test).
- Modify:
  - `src/components/comparisons/state.ts` (+ test) y `explorer.tsx` (+ test);
  - `src/lib/comparisons/actions.ts` (+ test), `load.ts` (+ test), `normalize.ts` (+ test), `derive.ts` (+ test) y `types.ts`;
  - `explorer.module.css` y `messages/es.json`.

- [ ] **Step 1: Reducer.** `ExplorerState` queda en `{ viewerId, groupId, format: Format, snapshot, loadError, source, revealSeq }`. Desaparecen `section`, `formats` por sección, `tasteControls`, `selection`, `views`, `detail`, `View`, `Section`, `WorkOrigin`, `TasteControls`, `changeSelection`, `setView`, `reconcileView` y `reconcileParticipants`. Las acciones quedan en `group`, `format`, `refresh`, `loading` y `response`.
  - `deriveFormat` usa `state.format`.
  - `data-comparison-slot="works"` y `data-view` se mantienen **solo** si algún e2e los lee. Compruébalo con grep: `data-comparison-slot` sí. `data-view` se quita si nadie lo usa.
  - Adapta `state.test.ts` y `explorer.test.tsx`: se borran los tests de vistas, regiones y facetas; los de carga, sesión, formato y conflicto se mantienen con las mismas aserciones.
- [ ] **Step 2: Detalle de obra.** Al irse `work-detail.tsx`, quedan sin uso la server action `loadComparisonWork` (`actions.ts`), `loadDetail` (`load.ts`), `commonEpisodes` (`normalize.ts`, si solo la usaba `loadDetail`) y el tipo `WorkDetail`. Bórralos con sus tests, comprobando antes cada uno con grep.
  - Es una superficie de servidor menos: la action y su validación de `people`.
  - Esto cierra [#1519](https://github.com/borjar20/Biblioshare/issues/1519) (Task 7).
  - `derive.ts`: borra `findings` y `facets` (y `Finding`, `Facet`, `FacetKind` si quedan sin uso). **Mantén `regions`**, porque `layout.test.ts` compara contra ella la lente Quién, con un comentario de que es la implementación de referencia de ese test. Mantén `forFormat`.
- [ ] **Step 3: Mensajes y CSS.**
  - Borra de `messages/es.json` las claves de `comparisons` sin uso. La regla es la de F3: grep en `src` y `e2e`, y cuidado con las claves dinámicas `t(\`…${x}\`)`.
  - Borra de `explorer.module.css` las clases sin uso, como `.page`, `.heading`, `.toolbar`, `.workspace*`, `.footer`, `.iconButton`, `.groupControls`, `.groupPicker`, `.explorer`, `.title`, `.intro` y `.workspaceContent`, comprobando cada una con grep de `styles.<clase>`.
  - Quita las variantes de `Icon` sin uso en `explorer.tsx`.
- [ ] **Step 4: Run.** Corre `npx vitest run`, la suite **completa**, porque se tocan `lib/comparisons`, más `npx tsc --noEmit`, `npm run lint` y `npx tsx --test e2e/support/club-round-fixture.test.ts`. En el report, lista cada fichero, export, clave y clase borrados. **Commit** `refactor(entre-nosotros): retirar el lienzo antiguo, el detalle de obra y el reducer de secciones`.

---

### Task 6: E2E, capturas y evidencia (gate con el usuario)

**Files:** Modify `e2e/entre-nosotros-atlas.spec.ts` (y `e2e/entre-nosotros.spec.ts` solo si el Step 1 de la Task 5 cambió algún atributo que lea). Create `docs/testing/2026-10-14-entre-nosotros-atlas-f4.md` + capturas.

- [ ] **Step 1: E2E nuevos** en `e2e/entre-nosotros-atlas.spec.ts`:
  - **Escritorio, portadas:**
    1. Antes de hacer zoom no hay peticiones a `comparison-fixture.invalid` (las portadas del fixture). Regístralas con `page.on('request')` desde el login.
    2. Tras `zoomToWork` hay al menos una y `data-atlas-covers` es mayor que `0` y como mucho `300`.
  - **Escritorio, lista:** «Ver como lista» → región «Lista de obras» con 30 enlaces `/libro/…`. Tab llega a un enlace. Desactivar «Carlos QA» y después «Beatriz QA» sigue mostrando 30, porque son obras de Tú. «Ver como mapa» vuelve al canvas.
  - **Escritorio, teclado:**
    1. Foco en el canvas; `+` sube `data-atlas-zoom`.
    2. `2` → Opinión pulsada; `4` → Islas pulsada.
    3. La URL contiene `lente=islas`.
    4. `page.reload()` mantiene Islas pulsada.
  - **Escritorio, volver de la ficha:**
    1. `zoomToWork` y guardar `data-atlas-zoom`.
    2. Desactivar la cara «Carlos QA».
    3. Clic en una obra (navega a la ficha) y `page.goBack()`.
    4. Comprobar que el zoom es el mismo (±0,01) y que Carlos sigue `aria-pressed="false"`.
  - **Móvil, lista:** el botón «Ver como lista» del dock es visible y abre la lista; un tap en un enlace navega a `/libro/…`.
- [ ] **Step 2: Ejecutar** contra build de producción:
  - el atlas en ambos proyectos;
  - `entre-nosotros.spec.ts -g "CRUD|profile"`;
  - `-g "transport|conflict"`;
  - `-g "isolation"`.

  `LOCAL ONLY` queda fuera (#1520). Expected: todo PASS. Para el servidor.
- [ ] **Step 3: Capturas.** Usa el spec temporal `e2e/zz-atlas-shots.spec.ts` con la línea temporal en `testMatch`, que se quita editando el fichero, y el fixture integrado. Captura:
  - `desktop-covers.png` (portadas reales con zoom > 1,1);
  - `desktop-list-quien.png`, `desktop-list-opinion.png` y `mobile-list.png`;
  - `desktop-keyboard-focus.png` (anillo de foco en el canvas).

  Si las portadas del fixture son todas la misma imagen, dilo. Mira cada PNG y anota lo que se vea mal.
- [ ] **Step 4: Evidencia** en `docs/testing/2026-10-14-entre-nosotros-atlas-f4.md`. Incluye:
  - cabecera `[Histórico · verificado 2026-10-14]` y el SHA;
  - las cifras de unitarios, tsc, lint y e2e;
  - la medición del test de presupuesto antes y después (Task 2);
  - las capturas;
  - lo no verificado: dispositivo Android real y fps reales con 1.000 obras, salvo que se pruebe en el emulador o la APK.

  Commit.

---

### Task 7: Cierre documental e issues

**Files:** Modify:
- `docs/architecture/graph.json` (nodos `c-comparisons`, `a-comparisons`, `d-comparisons`, `m-comparisons` si nombran ficheros borrados, y el flujo `flow-comparison`);
- `docs/requirements/decisiones.md` (append);
- `docs/requirements/backlog.md` (línea de Entre nosotros);
- la cabecera de la spec `docs/superpowers/specs/2026-10-13-entre-nosotros-atlas-design.md`.

- [ ] **Step 1: `graph.json`.**
  - Sustituye en `c-comparisons` la lista de ficheros por los actuales: `explorer.tsx`, `group-sheet.tsx`, `group-editor.tsx`, `loading.tsx`, `presentation.ts`, `state.ts` y la carpeta `atlas/*` relevante.
  - Reescribe su `summary`: atlas en canvas, cuatro lentes, lista accesible, siempre oscuro y a sangre.
  - Añade al nodo de dominio los módulos puros de `src/lib/comparisons/atlas/`.
  - Actualiza los pasos de `flow-comparison`: el paso del lienzo pasa a `atlas-view.tsx`/`atlas-engine.ts`, sale el paso de Gustos y entra «Ver como lista» como paso accesible.
  - Quita la mención a `loadComparisonWork` si aparece. Sigue `docs/architecture/README.md` para regenerar o validar, si hay script.
- [ ] **Step 2: `decisiones.md`.** Añade al final una entrada con el formato de las anteriores (`## 2026-10-14 — Entre nosotros: el atlas sustituye a Obras y Gustos`). Debe recoger:
  - el lienzo a sangre y siempre oscuro;
  - las cuatro lentes, con Islas cubriendo lo que daba Gustos;
  - «en común» = todas las caras activas;
  - lente y modo en la URL, caras y cámara en `sessionStorage` (sin ids de persona en la URL);
  - la retirada de la action de detalle de obra;
  - «Ver como lista» como vía accesible;
  - el no mezclar hasta tener la lista;
  - la evidencia de F1–F4.
- [ ] **Step 3: Backlog y spec.**
  - En la línea de Entre nosotros del backlog, añade el rediseño en atlas con enlaces a la spec y a las evidencias de F1–F4, y la PR cuando exista. No apiles banners.
  - Cambia la cabecera de la spec a `[Histórico · implementado 2026-10-14]` y enlaza las evidencias.
- [ ] **Step 4: Issues.**
  - Cierra [#1519](https://github.com/borjar20/Biblioshare/issues/1519) con un comentario: la action `loadComparisonWork` y el detalle de Gustos se retiraron en F4, así que no queda respuesta que cubrir.
  - Abre issues (lee antes `docs/agents/issue-tracker.md`) para lo que quede de los ledgers y no se haya hecho. Candidatos:
    - medición de fps en Android real (`area:social,tipo:cobertura,P2`);
    - ejes de Opinión fijos al borde con zoom de portadas (`area:ui,tipo:feature,P3`);
    - avatares de persona con foto en polos y caras (`area:ui,tipo:feature,P3`), si no se hizo.

  Pon cada uno con contexto suficiente para leerlo dentro de seis meses.
- [ ] **Step 5: Commit** `docs(entre-nosotros): cierre del atlas en graph, decisiones, backlog y spec`.
