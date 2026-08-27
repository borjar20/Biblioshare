---
target: Coleccion (/coleccion)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-27T12-33-35Z
slug: src-app-coleccion-page-tsx
---
# Critique · Colección (`/coleccion`)

Method: dual-agent (A: revisión de diseño · B: detector + navegador). Cuenta medida: 138 obras (9 libros, 127 películas, 2 series), 22 colecciones, 4 sagas seguidas. Medidas a 1440×900, 1180×800 y 390×844 en claro y oscuro.

Nota de entorno: con `127.0.0.1:3000` el dev server devuelve 403 en `/_next/static/chunks/*` y la página NO hidrata; con `localhost:3000` sí, pero la extensión de Chrome no navega a `localhost`. La interacción se midió con el Chromium de Playwright del worktree.

## Design Health Score

| # | Heurística | Score | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | Subpestañas sin `aria-current`; el filtro por defecto solo se anuncia como un «1» en una píldora |
| 2 | Sistema / mundo real | 2 | «ÍTEMS EN TOTAL» en la métrica más grande: palabra prohibida por el glosario |
| 3 | Control y libertad | 2 | «Limpiar» vive dentro del desplegable y solo si `activeCount>0`; la búsqueda sin resultados no ofrece salida |
| 4 | Consistencia | 2 | Tres pestañas hermanas con tres contratos de clic distintos |
| 5 | Prevención de errores | 3 | Géneros acotados para que ningún chip filtre a 0; el borrado explica que no elimina títulos |
| 6 | Reconocer > recordar | 1 | El estado de filtrado no está en pantalla: hay que abrir un panel para saber por qué faltan 129 obras |
| 7 | Flexibilidad | 2 | Filtros en la URL (bien); cero selección múltiple, y en móvil un filtro por apertura de hoja |
| 8 | Estética y minimalismo | 3 | Paper bien aplicado; lo estropean 16 botones permanentes sobre las portadas y un panel de 34 opciones |
| 9 | Diagnóstico y recuperación | 2 | `pinError` y `HiddenDroppedNote` ejemplares; el vacío de la rejilla dice una falsedad |
| 10 | Ayuda y documentación | 1 | Sorteo, pase, destacados y saga se exigen sin presentarse |
| **Total** | | **20/40** | Acceptable, borde inferior |

## Veredicto de especificidad

Partida en dos. `Colecciones` y `Sagas` están escritas para este producto: el abanico de tres portadas rotadas de `CollectionCard` dibuja el hueco con portadas punteadas cuando está vacía, `SagaLibraryCard` mete el orden narrativo curado dentro de la biblioteca, y `CollectionSummary` tiñe las tres cifras por medio. Nada de eso se copia sin rehacer el modelo de datos.

La pestaña `Todo` —lo que ve el 90 % de las visitas— no. Es una rejilla de portadas con chip de estado y dos botones encima; la marca de tipo de medio se gasta en un borde de 1 px invisible a 190 px de columna, así que 9 libros + 127 películas + 2 series se presentan como un muro indiferenciado. Y el componente firma del sistema NO se usa aquí: `CoverCard` tiene dos consumidores en toda la app y ninguno es la biblioteca. En esta sola vista conviven cuatro implementaciones de «portada + texto», y divergen a la vista: los títulos de Destacados salen en sans 12 px y los de la rejilla de debajo en serif 14 px, a 40 px de distancia.

**Escaneo determinista:** exit 2, 16 hallazgos, todos `design-system-font-size`. Nueve ficheros limpios, incluido `page.tsx`.

**Superposición:** Todo 81 hallazgos / Colecciones 138 / Sagas 39. Lo real tras descartar falsos positivos: `undersized-ui-text` (10,5 px en badges de estado ×9, 9,5 px en la línea de metadatos ×6, y 21 repeticiones de 10 px en «Vacía · ábrela para añadir»), más dos warnings propios de `next/image`.

**Falsos positivos descartados contra DESIGN.md:** `dark-glow` (36/89/17) son `shadow-card`/`shadow-cover`, marrones a propósito —desaparecen en tema claro—; `gpt-thin-border-wide-shadow` son esas mismas dos sombras medidas por blur; `overused-font` ×3 por pestaña es la Regla de los Tres Papeles; `cream-palette` es el papel cálido canónico; `image-hover-transform` es el `scale-105` documentado del componente firma; `text-occlusion` 5 de 6 es el propio panel de filtros tapando lo de debajo; `pulsing-dot` son esqueletos; los 10 px de `label-section` y de la nav móvil son el escalón Label documentado.

## Lo que funciona

1. **El hueco se dibuja, no se deja en blanco:** `CollectionCard` pinta el abanico igual cuando la colección está vacía (tres portadas punteadas, misma geometría) y añade «Vacía · ábrela para añadir». El estado degradado tiene forma propia en vez de parecer a medio cargar.
2. **Lo destructivo está tras el «···» y la pregunta dice la consecuencia real:** «Los títulos no se eliminarán de tu biblioteca». Eso es lo que evita que la gente aprenda a decir que sí sin leer.
3. **Contraste del texto secundario resuelto y verificado** en la propia página: `--muted-foreground` da 5,11:1 en claro y 6,53:1 en oscuro. La Regla de la Tinta Fantasma se cumple, salvo por la vía de opacidad (ver P2).
4. **Un solo ancho para las tres pestañas** (`SHELL_GRID`): cambiar de pestaña ya no salta de layout. Cero desbordes horizontales en los 18 casos medidos.

## Incidencias prioritarias

**[P1] La vista por defecto esconde el 93 % de la biblioteca detrás de un filtro que nadie puso.** `resolveEffectiveType` (`page.tsx:106-137`) aplica el interés declarado en onboarding: 138 obras en la cuenta, 9 en pantalla, y la única señal es una píldora «1» junto a Filtros. Además, como `itemType` queda definido, la condición de `page.tsx:221` falla y el Resumen + Destacados **no se pintan nunca** en la entrada por defecto. Verificado por los dos agentes de forma independiente. *Fix:* sacar `itemType` de la condición cuando el tipo viene del onboarding (`isExplicitType`, línea 115) y pintar un chip visible «Mostrando: Libros ×» **fuera** del desplegable.

**[P1] «Tu biblioteca está vacía» con 138 obras dentro.** Buscar `zzzqqq` devuelve ese titular, el mensaje «Aún no has añadido nada» y el botón «Buscar algo», que manda al catálogo común cuando lo que hay que hacer es limpiar la búsqueda. Y `q` no suma a `activeCount` (`library-filters.tsx:96-100`), así que tampoco aparece «Limpiar». Las tres líneas son falsas. La clave `collection.noMatch` ya existe en `messages/es.json` y no se usa. *Fix* en `page.tsx:243-255`.

**[P1] «22 colecciones · 138 títulos» encima de una rejilla que suma 2.** `CollectionsHeader` (`page.tsx:271-290`) concatena el recuento de colecciones con el total de la **biblioteca**. 21 de las 22 colecciones tienen 0 títulos. Y al pie de la misma pestaña: «136 títulos sin organizar». Tres números que no cuadran entre sí. Principio 10 de UI-GUIA.

**[P1] 138 obras en una página de 23.062 px (390×844) y 8.706 px (1440×900), con los filtros scrolleados fuera de vista.** `LibraryGrid` se llama sin `limit` (el parámetro existe en la firma, línea 342, y nunca se pasa). La barra de filtros no es `sticky`. *Fix:* sticky con `--topbar-h` (la constante ya existe) + `limit` y «cargar más» reutilizando `saga-load-more.tsx`, con `COVER_GRID_COLS` o las columnas dejan de alinearse.

**[P2] Los recuentos de género se pintan a 2,55:1 en claro y 3,04:1 en oscuro** (`library-filters.tsx:213`, `opacity-60` sobre un token que sí cumple). El repo ya legisló contra 2,25:1 y tiene test, pero el test mira el token, no el resultado tras componer opacidad. El número informa la decisión («Drama 56» vs «Clásicos 1»), no es adorno.

## Banderas por persona

**Alex (viene de Letterboxd):** un filtro por apertura de hoja en móvil (los controles son `Link` que navegan y la hoja muere); combinar tres filtros = abrirla tres veces. Cero operaciones por lotes con 136 títulos sin organizar. Cero atajos. A favor: los filtros van a la URL y una vista filtrada se comparte.

**Sam (teclado y lector):** `role="menu"` con hijos que no son `menuitem` (`filters-dropdown.tsx:316-318`); sin gestión de foco confirmada (F4-024) y con 34 controles dentro, así que el coste es mayor que donde se midió; Shift+Tab se va detrás de una hoja opaca y el fondo scrollea bajo ella; subpestañas sin `aria-current`.

**Casey (móvil, un pulgar):** dianas de 32×32 separadas 6 px (`library-item-card.tsx:91` y `111`) sin `tap-44`; 276 botones permanentes sobre las portadas en una vista cuya tesis es «la portada es el material»; scroll perdido al volver de una ficha dentro de una página de 23.062 px.

**El migrante de Goodreads:** la colisión grande «biblioteca vs colección» está curada, pero las sagas importadas de TMDB se llaman «Matrix - Colección» a un clic de la pestaña «Colecciones»; «Todo» nombra a la vez la pestaña y la primera píldora de tipo; «ÍTEMS EN TOTAL» usa la palabra prohibida en la métrica más grande; y «Sorteo» aparece en el menú «···» sin existir en ninguna otra parte de la pantalla.

## Observaciones menores

- Tres contratos de clic en tres pestañas hermanas: Colecciones enlaza la tarjeta entera, Todo solo portada y título, Sagas no enlaza la tarjeta (`saga-library-card.tsx:20-22`).
- La pestaña Sagas no tiene ni buscador ni orden.
- El orden «Personalizado» de Colecciones es el defecto y no hay forma de personalizarlo desde aquí.
- La búsqueda de Colecciones no persiste (estado local, no URL): volver con atrás pierde filtro y orden.
- Glifos Unicode haciendo de iconos: el cuadro de «Añadir a colección» (`library-item-card.tsx:113`) y el `＋` de `new-collection-button.tsx:63`. El sistema declara un set propio de trazo 1.8 en `currentColor`.
- `confirm()` nativo para borrar colección (`collection-menu.tsx:126`) frente a 28 ficheros con `<dialog>` + `showModal()`.
- `next/image`: «Image with src … has `fill` and parent element with invalid `position` static» ×6, una por portada de la rejilla. Warning real, no cosmético.
- A 1440 el bloque superior deja ~535 px de fila vacía a la derecha de los tres Destacados.

## Preguntas que abre

1. Si `Todo` es lo que ve el 90 % de las visitas y no distingue un libro de una película, ¿para qué existe la tríada de color de medio?
2. ¿Por qué la pantalla que se llama «Mi Biblioteca» no permite añadir nada a la biblioteca?
3. ¿Qué se supone que hace alguien con 136 títulos sin organizar? Es un diagnóstico sin tratamiento.
4. Si el Resumen es el único sitio donde se ve que existen abandonados y con 138 obras esa parte del gráfico mide menos de 3 px, ¿sigue siendo cierto?
5. El proyecto tiene un test que impide que un token coloree texto a 2,25:1, y tiene texto vivo a 2,55:1 puesto con `opacity-60`. ¿Cuántas otras reglas están vigiladas por el token y no por el resultado?
