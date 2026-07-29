# Rediseño del índice `/sagas` ("Explorar sagas")

Fecha: 2026-07-29
Estado: aprobado, pendiente de implementar

## Objetivo

Llevar `/sagas` (hoy: nombre, subsagas, contador de títulos, portada, seguir) al diseño
"Explorar sagas (A · Denso)" ya validado como mockup (`D:\Proyectos\Personal\Mockups\Explorar
sagas (A · Denso).html`, incluida su variante móvil), con datos reales de la app: desglose de
tipo de título, itinerarios, progreso de lectura, "en tu colección", grafo derivado, filtros,
orden, vista Universos, y paginación por "Cargar más".

No hay cambio de esquema: todo se deriva de tablas y columnas que ya existen (`sagas`,
`saga_items`, `passes`, `saga_routes`, `sagas.show_map`).

## Alcance por fases

1. **Datos** — ampliar `build-saga-index.ts` / `get-saga-index.ts` para calcular, en bulk y
   para todas las sagas visibles: desglose por tipo, progreso, itinerarios, colección, grafo.
2. **Tarjeta** — layout Denso con los campos nuevos, chips de subsaga colapsados.
3. **Toolbar** — buscador + vista (Todas/Sigo/Universos) + filtros (tipo/itinerarios/
   colección/≥5 títulos) + orden, todo vía querystring server-side.
4. **Paginación** — parámetro `n` (cuántas mostrar) + "Cargar más".
5. **Móvil** — sheet nativo de filtros (`<details>`, sin JS) + colapso de chips, extendiendo
   el mismo patrón ya validado en el mockup a los componentes reales.

## Fase 1 — Datos

### `SagaIndexCard` ampliado

```ts
type SagaIndexCard = {
  id: string;
  name: string;
  coverUrl: string | null;
  accent: SagaAccentToken;
  titleCount: number;
  children: { id: string; name: string; accent: SagaAccentToken }[];
  typeBreakdown: { book: number; movie: number; series: number };
  hasGraph: boolean;            // showMap && subárbol no vacío (mismo criterio que get-saga-detail.ts:707-715 y build-library-saga-cards.ts:341)
  routeCount: number;           // nº de saga_routes para esta saga
  progress: { completed: number; total: number; pct: number; readingLabel: string | null } | null; // null si no autenticado
  ownedCount: number;           // títulos del subárbol con pase activo del usuario; 0 si no autenticado
  isFollowed: boolean;          // ya existía vía followedIds, se incorpora al shape de la card
};
```

`isUniverse` NO es un campo persistido ni siquiera calculado: el índice YA solo genera tarjetas
para raíces (`build-saga-index.ts:55`, invariante existente, no algo que esta fase introduzca),
así que "Universo" es simplemente `children.length > 0` sobre una card que por construcción ya
es de una raíz — no hace falta un campo `isTopLevel` aparte, sería siempre `true` y por tanto
código muerto. No se añade columna `sagas.is_universe`: descartado explícitamente porque el
criterio derivado ya reproduce el mockup (Cosmere y Mundodisco son raíces con subsagas) y añadir
una columna exigiría migración + UI de curación para un criterio que hoy no diverge del
derivado.

### Queries nuevas (`get-saga-index.ts`)

Además de las dos ya existentes (`sagas`, `saga_items`), en paralelo:

- `saga_routes`: `select saga_id from saga_routes` → contar por `saga_id` en JS (mismo patrón
  de agregación en memoria que ya usa `buildSagaIndex`, evita aggregates de PostgREST).
- `passes` (solo si hay `user`): `select item_type, item_id, status, is_active from passes
  where user_id = ? and is_active = true`. De esta misma consulta salen tanto `ownedCount`
  (tamaño de la intersección con el subárbol de cada saga) como el progreso (`completed` =
  intersección con `status = 'completed'`, `total` = tamaño del subárbol contando por
  `item_type:item_id` igual que `progress.ts` `countedKeys()`, excluyendo `optional`/
  `optionalInParent`).
- `readingLabel`: solo la ruta adoptada por el usuario, igual que `get-followed-sagas.ts:235-263`
  — `saga_route_choices` (`user_id, saga_id, route_slug`) cruzado con `saga_routes` para el
  nombre, excluyendo los slugs sintéticos `lectura`/`publicacion` (no aportan, "vas por
  Publicación" no dice nada). Si no hay elección curada, `readingLabel: null` y la tarjeta
  muestra solo `completed/total` sin la segunda línea — **no** se usa el título de la obra en
  curso como fallback (eso es una decisión de `next.reading` en la ficha de saga, un campo
  distinto que este índice no necesita).

`hasGraph`: `sagas.show_map` ya viene en el `select` de `sagas` (falta añadir la columna al
`select` de `get-saga-index.ts:26`); el subárbol no vacío ya se conoce por construcción de
`buildSagaIndex` (si la saga tiene 0 títulos en su subárbol, `titleCount === 0`).

Todo esto se calcula para las ~85 sagas de producción en cada carga del índice — no hay
paginación a nivel de query (Fase 4 pagina en memoria, después de filtrar). El propio comentario
de `get-saga-index.ts` ya asume que el catálogo es pequeño; estas nuevas queries no cambian esa
premisa (siguen siendo O(1) roundtrips, no O(n) por saga).

## Fase 2 — Tarjeta (desktop)

Por tarjeta, siguiendo el mockup:

- Badge `Universo` si `children.length > 0`.
- Badge `◆ Grafo` si `hasGraph`.
- Badge `✦ N itinerarios` si `routeCount > 0` (singular si `routeCount === 1`).
- Línea de tipos con icono+color (`i-b`/`i-m`/`i-s`) desde `typeBreakdown`, omitiendo los tipos
  en 0.
- Chips de subsaga: se muestran las 2 primeras (orden alfabético, igual que `children` ya
  viene ordenado), el resto colapsa en un único chip `+N más` — mismo patrón que se validó en
  el mockup para Cosmere, aplicado aquí como regla general (no solo a Cosmere/Mundodisco): con
  ≤3 subsagas se muestran todas sin chip "más".
- Barra de progreso solo si `progress !== null` (usuario autenticado) y `progress.total > 0`;
  si `readingLabel` es `null` se omite la segunda línea (solo `completed/total`).
- Chip `◐ N en tu colección` solo si `ownedCount > 0` y usuario autenticado.
- Botón seguir: ya existe (`SagaFollowButton`), sin cambios de comportamiento.

## Fase 3 — Toolbar y filtros

Contrato de querystring (todo opcional, todo combinable por AND salvo donde se indica):

| Param | Valores | Efecto |
|---|---|---|
| `q` | texto | ya existe, búsqueda por nombre |
| `vista` | `todas` \| `sigo` \| `universos` | `sigo`: solo `isFollowed`. `universos`: solo `children.length>0`. Default `todas`. |
| `tipo` | csv de `libro,pelicula,serie` | OR entre valores marcados, AND con el resto de filtros — saga pasa si `typeBreakdown[tipo] > 0` para algún tipo marcado |
| `itinerarios` | `1` | solo `routeCount > 0` |
| `coleccion` | `1` | solo `ownedCount > 0`; el pill no se muestra si no hay usuario autenticado (mismo criterio que hoy oculta el botón seguir) |
| `min5` | `1` | solo `titleCount >= 5` (umbral fijo, igual que el mockup — no es un input numérico) |
| `orden` | `alfabetico` | único valor por ahora; whitelist de 1 para dejar sitio a futuros sin romper el contrato |

Whitelist y parsing en `page.tsx`, mismo patrón que `VALID_TYPES`/`VALID_STATUSES` de
`/coleccion` (`src/app/coleccion/page.tsx:36-43`). Filtro + orden + búsqueda se aplican en JS
sobre las cards ya enriquecidas (Fase 1), en una función pura nueva
`src/lib/sagas/filter-saga-index.ts` (recibe `SagaIndexCard[]` + params parseados, devuelve
`SagaIndexCard[]` filtradas/ordenadas) — mantiene `build-saga-index.ts` enfocado en construir el
catálogo, no en filtrarlo.

**Mecanismo del panel de filtros (revisado tras mapear el código real, sustituye la idea
original de `<details>`+CSS calcada del mockup estático):** se reutiliza
`FiltersDropdown` (`src/components/library/filters-dropdown.tsx`), el mismo componente cliente
que ya usa `/coleccion` vía `LibraryFilters` — panel flotante con badge de contador de
activos, cierre por click-fuera/Escape ya resuelto. Los pills de tipo/itinerarios/colección/
mínimo-títulos son el `children` del dropdown, igual que hace `LibraryFilters` con sus grupos
Tipo/Estado/Orden. Se descarta el sheet deslizante-desde-abajo del mockup: introduciría un
segundo mecanismo de filtros en la app (hoy solo hay uno) por un efecto visual que no compensa
la divergencia — decisión tomada explícitamente, no un olvido.

El segmentado Todas/Sigo/Universos son enlaces `<Link>` que preservan el resto de params
(igual que `library-filters.tsx`), sin JS de estado cliente — el único componente cliente de
esta página sigue siendo `FiltersDropdown` (ya existente) y `SagaFollowButton` (ya existente).

## Fase 4 — Paginación

Parámetro `n` (cuántas tarjetas mostrar), default `PAGE_SIZE = 12`. El pipeline es: construir
→ filtrar/ordenar → `total = resultado.length` → `slice(0, n)`. El pie de página muestra
"Mostrando `min(n,total)` de `total` sagas con los filtros activos" y el botón "Cargar más"
es un `<Link>` a los mismos params con `n = n + PAGE_SIZE`, oculto si `n >= total`. No hay
cursor ni offset real: es siempre "las primeras N tras filtrar/ordenar", suficiente para un
catálogo de ~85 filas y consistente con el resto de la página (todo servidor, sin JS de estado).

## Fase 5 — Móvil

`FiltersDropdown` (Fase 3) ya es responsive por sí solo (`w-[min(280px,92vw)]`): no hace falta
mecanismo aparte para el panel de filtros en móvil, solo ajustar el layout del toolbar que lo
contiene:

- Toolbar en columna a `max-width:720px` (mismo breakpoint que ya usa la página hoy): buscador
  ancho completo, segmentado Todas/Sigo/Universos ancho completo, fila con `FiltersDropdown`
  (`label="Filtros"`, badge de activos) + control de orden.
- Chips de subsaga: mismo colapso a 2 + "+N más" que en desktop (Fase 2), no hace falta
  tratamiento aparte — ya es responsive por construcción (no se duplica markup por breakpoint,
  al contrario que el mockup estático).

Con esto la Fase 5 deja de ser un componente nuevo y pasa a ser CSS de layout sobre componentes
que Fase 3 ya deja funcionando (`FiltersDropdown` + `Link`s de vista/segmento).

## Fuera de alcance (decisiones explícitas, no huecos)

- **`sagas.is_universe` como columna real**: descartado, ver Fase 1.
- **Paginación con cursor/offset real de base de datos**: descartado mientras el catálogo sea
  de ~85 filas (ver Fase 4). Si el catálogo crece a un punto donde traer todas las sagas en
  cada carga sea un problema medido (no antes), revisar.
- **Colecciones curadas por el usuario** (`collections`/`collection_items`, carpetas privadas):
  es un concepto distinto a "está en tu biblioteca" (`passes`), no se toca ni se mezcla aquí.
- **Orden distinto de alfabético** (por progreso, por añadido reciente, etc.): el mockup solo
  muestra "Alfabético"; el contrato de `orden` deja hueco para añadir valores después sin
  romper nada, pero no se implementan ahora.

## i18n

Todo el copy nuevo (badges, labels de filtro, "Cargar más", etc.) va en `messages/*.json` vía
`useTranslations`, siguiendo la convención ya usada en `sagaIndex`/`saga`. Se delega al agente
`i18n-keeper` revisar consistencia de claves tras la implementación de cada fase.
