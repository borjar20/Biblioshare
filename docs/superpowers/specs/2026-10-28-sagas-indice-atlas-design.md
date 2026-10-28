---
title: Atlas de sagas y universos (rework de sagas, subproyecto 3)
date: 2026-10-28
status: diseño aprobado, pendiente de plan
area: sagas / ui
---

# Atlas de sagas y universos

> Maquetas de referencia (fragmentos del compañero visual, sin el marco):
> [`assets/sagas-indice-atlas-maquetas.html`](assets/sagas-indice-atlas-maquetas.html). Contiene las
> tres formas candidatas (entró **B, territorios**) y la composición final.
> Subproyecto 1, la ficha: [spec 2026-10-27](2026-10-27-sagas-ficha-lector-design.md).
> Subproyecto 2, el atlas de la saga: [spec 2026-10-28](2026-10-28-sagas-atlas-design.md), del que
> se reutilizan la cámara, el patrón de plano DOM + SVG, el zoom semántico y la mini-ficha.

## 1. Problema y alcance

`/sagas` es hoy una rejilla de tarjetas densas (spec 2026-07-29) con buscador, vistas
Todas / Sigo / Universos, filtros y «Cargar más». Responde a «qué hay», pero no a «por dónde voy»:
una saga empezada y una que nunca has abierto pesan lo mismo y están mezcladas en orden
alfabético.

Datos de producción (2026-10-28): 120 sagas, **107 raíces**, solo **4 universos** (raíces con
subsagas), un único nivel de anidamiento y una mediana de 3 obras por saga. La jerarquía no da
estructura suficiente para un mapa; la relación del lector con cada saga sí.

El atlas sustituye a la rejilla por **un plano a pantalla completa con cuatro territorios según tu
relación con cada saga**. Quien entra sin sesión ve los mismos territorios, pero por tipo de obra.

Fuera de alcance: el editor de curador, `/sagas/nueva` (solo cambia dónde está su enlace) y
cualquier migración. Si alguna resultara necesaria, se para y se consulta.

## 2. Decisiones (brainstorming 2026-10-28)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Qué organiza el mapa | Tu relación con cada saga; sin sesión, el tipo de obra | Tipo de obra para todos; lentes intercambiables (más trabajo del que piden 107 sagas) |
| La rejilla actual | El atlas la sustituye; los filtros pasan a atenuar; «Ver como lista» | Conmutador Mapa / Rejilla (dos interfaces); atlas sin filtros |
| Forma del mapa | **Territorios**: zonas con nombre y tamaño según contenido | Órbitas (el anillo exterior no significa nada con 100 sagas); camino (sugiere un orden entre sagas que no existe) |
| Tocar una saga | Mini-ficha, como en el atlas de la saga; un universo acerca la cámara a su isla | Navegar directo a la ficha |
| Zonas | Cuatro: En curso · Sigues · Terminadas · Por descubrir | Cinco, partiendo «En curso» en Leyendo ahora / Empezadas |
| Orden de «Por descubrir» | Comarcas por tipo (Libros · Películas · Series · Mixtas); dentro, más obras primero | Por tamaño sin comarcas; alfabético |
| Técnica | Plano DOM + SVG con la cámara compartida | Secciones con scroll horizontal (deja de ser atlas); canvas / WebGL |

## 3. Rutas y estado en la URL

`/sagas` sigue siendo la ruta. Pasa a pantalla completa: se añade a `fullscreen-routes.ts`
(sin barras de la app), igual que `/saga/[id]/mapa`.

| Parámetro | Efecto |
|---|---|
| `q` | Atenúa lo que no coincide y abre la lista de coincidencias del buscador |
| `tipo` (`libro,pelicula,serie`) | Atenúa las sagas sin obras de esos tipos |
| `itinerarios=1` | Atenúa las sagas sin itinerarios curados |
| `coleccion=1` | Atenúa las sagas sin obras en tu colección |
| `min5=1` | Atenúa las sagas con menos de 5 títulos |
| `vista=sigo` / `vista=universos` | Enlaces viejos: no filtran; llevan el encuadre inicial a la zona Sigues o a la primera isla de universo |
| `vista=todas`, `n` | Se ignoran (enlaces viejos) |

Los filtros se escriben con `window.history.replaceState` (sin viaje al servidor), sembrados desde
`useSearchParams`, como la lente del atlas de la saga. La cámara se guarda en `sessionStorage` bajo
`sagas-atlas`, con la orientación.

## 4. Datos

Se reutiliza `getSagaIndexData` (`src/lib/sagas/get-saga-index.ts`) y `buildSagaIndex`: ya traen en
consultas planas raíces, subsagas, desglose por tipo, número de obras, autor dominante, itinerarios,
avance (de `passes`), obras en colección y si la sigues.

Cambios en `SagaIndexCard`:

- `started: boolean`: alguna obra contada de la saga tiene un pase activo `in_progress` o
  `completed`. `planned` no cuenta.
- `lastTouchedAt: string | null`: el `updated_at` más reciente de esos pases, para ordenar «En
  curso». Exige añadir `updated_at` al `select` de `passes`, sin columna nueva.

El estado del lector sale **siempre de `passes`**, nunca de `library_entries`. Sin `use cache`:
`getSagaIndexData` depende de la sesión (regla #437).

`filter-saga-index.ts` deja de decidir qué tarjetas se ven y pasa a decidir **qué sagas coinciden**
con los filtros (`matchesSagaIndexFilters(card, params): boolean`); el plano usa el resultado para
atenuar.

«Te toca» por saga no se calcula en el índice: exigiría derivar el orden completo de cada una de
las 107. El atlas muestra el avance («7 de 24») y deja «Te toca» a la ficha, a un toque.

### 4.1 Modelo: `deriveIndexAtlas` (`src/lib/sagas/index-atlas/model.ts`)

Puro. Recibe las tarjetas y `authenticated`; devuelve zonas con sus sagas.

```ts
type IndexZoneKey = "en-curso" | "sigues" | "terminadas" | "por-descubrir"
  | "libros" | "peliculas" | "series" | "mixtas";
type IndexAtlasSaga = {
  id: string; name: string; href: string; coverUrl: string | null; accent: SagaAccentToken;
  zone: IndexZoneKey; comarca: "libros" | "peliculas" | "series" | "mixtas" | null;
  titleCount: number; typeBreakdown: { book: number; movie: number; series: number };
  creator: string | null; routeCount: number; ownedCount: number; isFollowed: boolean;
  progress: { completed: number; total: number } | null;
  children: Array<{ id: string; name: string; href: string; accent: SagaAccentToken; titleCount: number }>;
};
type IndexAtlasModel = {
  zones: Array<{ key: IndexZoneKey; count: number; sagas: IndexAtlasSaga[];
    comarcas: Array<{ key: string; sagas: IndexAtlasSaga[] }> | null }>;
  universeCount: number; followedCount: number;
};
```

Con sesión, cada saga va a **una sola zona**; gana la primera regla que cumpla:

1. **En curso**: `started` y sin terminar.
2. **Sigues**: la sigues y no está empezada.
3. **Terminadas**: todas sus obras contadas completadas (`progress.total > 0`).
4. **Por descubrir**: el resto, repartido en comarcas.

Una saga seguida y terminada va a Terminadas. Una saga sin obras contadas (solo opcionales) y sin
empezar va a Por descubrir.

**Comarca** (y zona sin sesión): el único tipo con obras; con más de uno, Mixtas.

Orden dentro de cada zona: En curso por `lastTouchedAt` descendente; Sigues y Terminadas
alfabético (`localeCompare(…, "es")`); cada comarca por `titleCount` descendente y, a igualdad,
alfabético. Una zona o comarca vacía no se devuelve.

### 4.2 Layout: `layoutIndexAtlas` (`src/lib/sagas/index-atlas/layout.ts`)

Puro. `(model, orientation: "h" | "v") → { zones: ZoneBox[]; sagas: SagaBox[]; bounds }`.

- Horizontal (escritorio): las zonas de izquierda a derecha, en el orden de 4.1; vertical
  (móvil): de arriba abajo.
- Dentro de una zona, las portadas se empaquetan en filas con un ancho máximo de zona; «Por
  descubrir» apila sus comarcas, cada una con su rótulo.
- Un universo ocupa una **isla**: su portada grande y las de sus subsagas en pequeño.
- El tamaño de cada zona sale de su contenido (no hay tamaño fijo).
- Invariante probada: ninguna portada se solapa con otra, ni en `h` ni en `v`.

## 5. Composición y componentes

Oscuro siempre e inmersivo, como el atlas de la saga.

- **Barra superior**: eyebrow «Atlas · N sagas», título «Sagas» y resumen de una línea
  (`aria-live="polite"`):
  - con sesión y algo en curso: «En curso: *Mundodisco* y 2 más · sigues 4»;
  - con sesión y nada en curso: «Sigues 4 · 94 por descubrir»;
  - sin sesión: «107 sagas · 4 universos».

  A la derecha: buscador, «Ver como lista» y «Nueva saga» (solo con rol `collaborator` o más).
- **Plano**: zonas como manchas con rótulo y número; dentro, portadas con nombre. Las islas de
  universo llevan contorno del acento de la saga.
- **Abajo**: dock de filtros (Libros, Películas, Series, Con itinerarios, En tu colección, ≥ 5) y,
  a la derecha, zoom (+, −, encajar).

Componentes en `src/components/sagas/atlas/`: `sagas-atlas.tsx` (orquesta), `index-plane.tsx`,
`index-zone.tsx`, `index-saga.tsx`, `index-sheet.tsx` (mini-ficha), `index-search.tsx`,
`index-list.tsx`, `index-filters.tsx` y `sagas-atlas.module.css`. Se reutilizan
`src/lib/atlas/camera.ts`, `use-atlas-camera.ts` (con `useViewport` y `useChromeInsets`),
`use-dismissable.ts` y los helpers de cámara visible del atlas de la saga; si alguno vive hoy en
`src/components/saga/atlas/`, se mueve a un sitio compartido en vez de copiarse.

### 5.1 Zoom semántico

Mismos umbrales que el atlas de la saga:

- `k < 0.5`: solo zonas, con nombre y número de sagas;
- `0.5 ≤ k ≤ 1.6`: portadas con nombre;
- `k > 1.6`: además tipo, número de obras y barra de avance.

Áreas táctiles de 44 px mediante `--k`, como en el atlas de la saga.

**Encuadre inicial**: centra «En curso» si existe; si no, encaja el mapa entero. Con
`?vista=sigo`, la zona Sigues; con `?vista=universos`, la primera isla.

### 5.2 Mini-ficha (`index-sheet.tsx`)

Hoja inferior por debajo de 640 px; tarjeta flotante junto a la saga a partir de 640 px. Contiene:
portada, eyebrow (Universo · N sagas, o tipo y número de obras), nombre, autor dominante, barra y
«Llevas X de N» si hay avance, y acciones:

- «Abrir ficha» (`/saga/[id]`), «Ver atlas» (`/saga/[id]/mapa`);
- «Seguir» / «Sigues», con la acción existente de `src/lib/sagas/follow-actions.ts`. Al seguir, la
  saga pasa a la zona Sigues sin recargar (actualización optimista; si la acción falla, vuelve a
  su zona y la mini-ficha muestra «No se pudo seguir; inténtalo de nuevo» junto al botón);
- sin sesión, en lugar de «Seguir», «Entra para seguirla» (enlace a `/login?next=%2Fsagas`);
- en un universo, sus subsagas como chips enlazados (`/saga/[id]`); tocar el chip en el plano
  acerca la cámara a esa subsaga.

Tocar una isla de universo primero acerca la cámara a la isla y abre la mini-ficha del universo.

### 5.3 Buscador (`index-search.tsx`)

Campo en la barra superior. Al escribir, lista de coincidencias por nombre, de sagas y subsagas
(sin distinguir mayúsculas ni tildes). Elegir una vuela la cámara a ella y abre su mini-ficha.
Escribe `?q=` para que el enlace se pueda compartir. Sin coincidencias: «Ninguna saga coincide», sin
mover la cámara.

### 5.4 Lista y teclado

«Ver como lista» muestra las mismas zonas como secciones con encabezado y una lista de enlaces a
cada ficha, en el orden de 4.1, con los filtros aplicados como en el plano (la que no coincide
queda marcada, no oculta). Es la vía accesible completa.

En el plano, Tab recorre las sagas en el orden de la lista; Enter abre la mini-ficha; Escape la
cierra y devuelve el foco a la saga.

## 6. Casos límite

- **Sin sagas**: el estado vacío actual, con «Nueva saga» para curadores.
- **Saga sin portada**: bloque del color de acento con las iniciales.
- **Un filtro lo atenúa todo**: el resumen dice «Ninguna saga cumple los filtros» y ofrece
  «Quitar filtros».
- **Universo con una subsaga vacía**: la subsaga aparece en la isla con su contador a 0.

## 7. Se retira

- `src/components/saga/saga-index-card.tsx`, `saga-index-filters.tsx`, `saga-load-more.tsx`, la
  rejilla y el fantasma de `src/app/sagas/page.tsx`, y el parámetro `n`.
- Las claves de `sagaIndex.*` que solo usaban esos componentes.
- `filterSagaIndex` como filtro de tarjetas (lo sustituye `matchesSagaIndexFilters`).

Lo que se mantiene: `getSagaIndexData`, `buildSagaIndex` y las e2e que crean sagas desde
`/sagas` → «Nueva saga» (`sagas-v2-curacion`). Esa e2e afirma
`a[href="/saga/<hijaId>"]` en `/sagas`: los chips de subsaga del plano y de la lista son enlaces
reales, así que sigue valiendo.

## 8. Pruebas

- **Unitarios**:
  - `deriveIndexAtlas`: cada regla de zona y su prioridad, comarcas (incluida Mixtas), universos,
    sin sesión, orden dentro de cada zona, zonas vacías fuera;
  - `layoutIndexAtlas`: sin solapes en `h` y `v`, islas con sus subsagas, encuadre de
    `vista=sigo`;
  - `matchesSagaIndexFilters`, el resumen y la lectura de la URL;
  - `buildSagaIndex`: `started` y `lastTouchedAt` (`planned` no cuenta como empezada).
- **Componentes (jsdom)**: mini-ficha (seguir optimista y su vuelta atrás, sin sesión), buscador,
  lista.
- **e2e contra build de producción** (`npm run build` + `next start`, `--retries=0`), en
  `e2e/sagas-indice-atlas.spec.ts`:
  - con un usuario sembrado: las cuatro zonas con las sagas esperadas;
  - sin sesión: zonas por tipo;
  - tocar una saga, abrir su mini-ficha y llegar a la ficha;
  - buscar y volar a la saga;
  - seguir una saga y verla en Sigues (y dejarla como estaba al acabar);
  - filtro por tipo atenúa;
  - «Ver como lista» y Tab / Enter / Escape;
  - `?vista=sigo` encuadra Sigues.

  Además se pasan `sagas-v2-curacion` e `ia-navegacion`, que usan `/sagas`.

## 9. Entrega

- Dos puntos de control visuales con el usuario: (1) zonas y zoom; (2) mini-ficha, buscador y
  filtros.
- `decisiones.md` (entrada «Atlas de sagas y universos»), casilla en `backlog.md`, `graph.json`
  regenerado, evidencia en `docs/testing/2026-10-28-sagas-indice-atlas.md`, issues para lo
  pendiente.
- PR contra `main` con la declaración de la regla #437 (sin `use cache` nuevo).
