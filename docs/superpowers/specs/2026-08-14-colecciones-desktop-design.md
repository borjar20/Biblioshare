# Mi Biblioteca en escritorio: rediseño de `Colecciones` y ancho de `Sagas`

> **[Histórico · congelado 2026-08-14]** Spec de la feature tal como se decidió y se
> construyó. Para el estado de hoy manda el código; para el ancho por pantalla,
> `src/lib/ui/layout.ts`.

## Problema

`/coleccion` repartía su ancho por pestaña en una línea (`page.tsx`): `todo` iba en
`SHELL_GRID` (hasta 1600px) y **las otras dos** —`colecciones` y `sagas`— caían en
`SHELL_READ` (max-w-4xl, 896px). En un monitor de 1440px eso dejaba dos tarjetas centradas
con ~270px de margen muerto a cada lado.

El comentario que justificaba esa elección decía que estirar esas tarjetas «a 1600px las
deja desangeladas». El diagnóstico era correcto y la conclusión no: de *no llegar a 1600* no
se sigue *quedarse en 896*.

En `Colecciones` había además un problema de navegación —con 8-10 colecciones no había
forma de encontrar una: ni búsqueda ni orden— y el abanico de portadas, que es lo que da
carácter a la tarjeta, medía 54×81px.

## Decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Ancho de `Colecciones` | ~~`SHELL_TILES` (para en 1280)~~ **→ `SHELL_GRID`, revertido el mismo día** (ver `decisiones.md` 2026-08-14) — solo queda `TILE_GRID_COLS` | Tres tarjetas de ~400px es lo que pedía el abanico a 1280px, pero un ancho propio hacía saltar el layout al cambiar de pestaña. Se prioriza que `Todo`/`Colecciones`/`Sagas` compartan contenedor; el abanico se ensancha algo más de lo justo a 2xl. |
| Rejilla de `Colecciones` | 2 móvil · 2 tablet · 3 escritorio | Se **mantienen** las dos columnas del móvil: la tarjeta es vertical y estrecha, y a una sola solo caben dos colecciones por pantalla. |
| Ancho de `Sagas` | `SHELL_GRID` + `CARD_GRID_COLS` | No se inventa un reparto nuevo: es el par que ya usa `/sagas`, cuyas tarjetas son del mismo tipo. Su escalera conserva **una** columna en móvil, necesaria porque `SagaLibraryCard` es horizontal. |
| Búsqueda y orden | En **cliente**, sin tocar la URL | Las colecciones llegan todas en la misma consulta (son decenas como mucho). Es lo contrario que `Todo`, donde el filtro es server-side y enlazable porque la rejilla es la biblioteca entera. |
| Línea secundaria de la tarjeta | Desglose por tipo | Sale de `typeCounts`, que `listCollections` ya calculaba para resolver `dominantType`: coste cero y dice algo que el total no dice. Con un solo tipo no se pinta (repetiría el total). |
| «Nueva colección» | Botón de cabecera, no tile | Con la rejilla a tres columnas, un recuadro punteado del tamaño de una tarjeta competía en peso con las colecciones reales y su sitio bailaba según cuántas hubiera. |
| «Sin colección» | Tira compacta al pie | Solo si hay títulos sueltos **y** el usuario ya tiene alguna colección: sin ninguna, «todo está sin organizar» no es información, es la biblioteca entera repetida bajo un estado vacío. |

## Qué se descartó

- **Meter búsqueda y orden en la URL** (como `LibraryFilters`). Enlazable, sí, pero un viaje
  al servidor por tecla sobre un conjunto que ya está entero en el cliente no compra nada.
- **Usar `SHELL_GRID` también en `Colecciones`** y topar la rejilla en tres columnas. Da un
  contenedor de 1600 con tarjetas de ~520px: justo lo que el comentario viejo temía.
- **Añadir buscador y orden a `Sagas`.** Nadie lo pidió y son pocas sagas seguidas.
- **Sidebar, gráficas o estadísticas generales**, excluidos explícitamente del encargo.

## Piezas

| Fichero | Papel |
|---|---|
| `src/lib/ui/layout.ts` | `SHELL_TILES` + `TILE_GRID_COLS`, añadidos **como par** (la regla del fichero: contenedor y escalera son una decisión, no dos). |
| `src/lib/ui/control-classes.ts` | `pillClass`/`segClass`, que estaban copiados literalmente en `library-filters.tsx` (servidor) y `collection-items.tsx` (cliente). Módulo sin JSX porque un componente de cliente no puede importar de uno de servidor sin arrastrarlo al bundle. |
| `src/lib/library/collections.ts` | `CollectionCard` gana `typeCounts`/`updatedAt`/`position` (ninguno cuesta una consulta nueva). Nueva `getUncollectedItems`. |
| `src/lib/library/collection-browse.ts` | `browseCollections(cards, query, sort)`: puro, testeable sin React. |
| `src/components/library/collection-card.tsx` | Pasa a componente de **cliente** (quien lo pinta filtra en el navegador y no puede renderizar un `async`). Abanico responsive 61→93px de ancho de portada. |
| `src/components/library/collections-browser.tsx` | Barra de búsqueda + orden + rejilla + los dos estados vacíos. |
| `src/components/library/collections-grid.tsx` | Solo datos: consulta y delega. |
| `src/components/library/new-collection-button.tsx` | Era `new-collection-tile.tsx`. Misma hoja `<dialog>`, otro disparador. |
| `src/components/library/uncollected-shelf.tsx` | Se apoya en `FavoritesShelf` (variante compacta), que gana una prop `heading` opcional. |
| `src/components/library/collection-skeletons.tsx` | `CollectionsGridSkeleton` sigue la forma nueva; `SagasPanelSkeleton` es nuevo. |

## Trampas

- **El abanico se desplaza *antes* de rotar.** Tailwind compone siempre
  `translate(...) rotate(...)` en ese orden; invertirlo da un desplazamiento diagonal. El
  offset crece con el tamaño de la portada (24 → 32 → 36px): con el fijo de 22px del diseño
  original, una portada de 93px tapaba casi entera a sus vecinas.
- **Los literales de clase van completos en el fuente.** Tailwind escanea nombres enteros;
  una cadena compuesta en tiempo de ejecución no genera CSS.
- **El botón de crear va FUERA del `<Suspense>` del recuento.** Ese boundary tiene
  `fallback={null}`, y compartiendo boundary el botón desaparecía hasta que llegara la
  cuenta.
- **Esqueleto y contenido comparten constante de rejilla.** Es el defecto que cerró la
  PR #372: los breakpoints de Tailwind miran la ventana, no el contenedor.
- **El buscador de colecciones NO se llama `q`.** `q` es el buscador de biblioteca de la
  pestaña `Todo`, que sí es server-side y sí va a la URL.

## Hallazgos colaterales

**DOS specs llevaban rotos** por la misma creencia falsa que esta spec corrige —que
`/coleccion` a secas abre en `Colecciones`— y los dos fallaban ya **antes** de este cambio:

- `e2e/coleccion-v2.spec.ts`: buscaba la tarjeta de la colección sembrada en la rejilla de la
  biblioteca, donde nunca ha estado.
- `e2e/happy-path.spec.ts` («marcar una colección como sorteable…»): se quedaba esperando un
  control de crear colección que en la pestaña `Todo` no existe.

Ambos se arreglan aquí (`?tab=colecciones`) por ser la misma creencia falsa; los comentarios
que la repetían (`page.tsx`, `collections-grid.tsx`, `collection-skeletons.tsx` y los propios
specs) se corrigen de paso.

Lo que **no** se arregla aquí, por ser diagnósticos distintos, queda en issues:

| Issue | Qué |
|---|---|
| [#640](https://github.com/borjar20/Biblioshare/issues/640) | El desplegable de filtros del detalle de colección pinta `search.types.book` en crudo: el namespace `search` no viaja al cliente en esta ruta. Reproducido. |
| [#641](https://github.com/borjar20/Biblioshare/issues/641) | `happy-path.spec.ts` borra la colección dentro del `try`, no del `finally`: dev acumula 27 colecciones huérfanas `e2e-*`. |
| [#642](https://github.com/borjar20/Biblioshare/issues/642) | Sospecha sin reproducir: `manage-actions.test.ts` falló una vez solo dentro de la suite completa. |
