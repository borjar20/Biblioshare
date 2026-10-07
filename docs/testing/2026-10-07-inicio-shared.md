# Inicio — portadas y barras se transforman al ampliar

> [Canónico para el delta local de PR #1457 · verificado contra código, SSR y Chromium el 2026-10-07]

El usuario pide extender la transformación del foco de Hoy a Sale esta semana y
Tu semana. Se usa el mismo wrapper focus: títulos visibles, una portada por obra
y siete barras persistentes. Portadas y gráfico crecen/recolocan sus nodos; el
resto del contenido entra después. Recoger invierte el recorrido. La crónica
permanece visible y clicable mientras Novedades crece debajo de ella.

## Pruebas y alcance

Dos regresiones SSR con **StatsRail/ThisWeekReleases y sus hojas reales**, provider
i18n real y mocks solo de consultas/entorno de servidor: RED de 14 barras/6 imágenes
(duplicado resumen/detalle), GREEN de 7/3. Se comprueba también una única región
nombrada de novedades. El helper materializa solo los componentes async de servidor;
los de cliente se renderizan con React SSR. Fixtures locales, sin DB ni red.

Chromium usa los slots SSR de esos mismos componentes, HomeExpandable y
HomePanelsProvider reales, y CSS/ fuentes compilados por Next dev. Hay una crónica
representativa para verificar su fila y un SVG de prueba para la red de portadas;
no se atribuye a esa fixture la ejecución del reproductor. Se confirma identidad
de todos los nodos, x/y/tamaño iniciales a 0 ms, geometría intermedia a 160 ms,
cierre inverso y opacidad de objetos constante. Las filas de información/fechas
usan grid 0fr/1fr, sin recortar listados extensos por un tope de altura. No se simula el morph con dos
vistas ni imágenes clonadas.

| Elemento | Resumen | 160 ms | Ampliado |
|---|---:|---:|---:|
| Portada primera (caja con inclinación) | 34,09 px | 60,39 px | 64 px |
| Barra semanal | 5 px | 17,77 px | 20 px |
| Alto tarjeta novedades | 96 px | interpolado | 828 px en fixture de tres obras |
| Alto tarjeta semana | 54 px | interpolado | 156 px |

PASS a 320/390/768/1280 px, claro/oscuro, ancho sin desborde, movimiento reducido,
exclusión entre paneles, crónica presente/ausente, novedades vacías/error y
actividad fría. Mini gráfico y título no se solapan. El detalle sin semana no
expone ceros ni etiquetas ocultas a accesibilidad; en PC se mantiene el guard.
El esqueleto semanal pasa a 96 px, como la tarjeta contraída real.

La revisión independiente descubre el root de novedades interceptando los clics
sobre la crónica. RED con clic normal en Chromium: timeout por caja transparente;
GREEN con pointer-events:none en el root y auto en stage/controles, antes y después
de ampliar. Corrección revisada sin hallazgos pendientes. También quedan cubiertos
el root sin transición en reduced, el enlace que alteraba el primer fotograma y
la región interior redundante de novedades.

La app **Next dev real + cuenta persistente de biblioshare-dev** vuelve a pasar
el recorrido de Hoy (fotogramas, selección, foco, Escape, exclusión, títulos
largos y tamaños 320/390/768/1280), incluyendo los nuevos bloques en sus estados
vacío/sin semana disponibles en la cuenta. Sin errores JavaScript de página y
sin sembrar datos de biblioteca. Se conservan los antecedentes de stream cerrado
#1251/#1263/#1301 durante login dev.

16/16 unitarios focales de paneles compartidos/TodayPicker/TodayActions PASS;
TypeScript y eslint focal PASS. E2E existente actualizado con fotogramas y nodos
persistentes de portadas/barras, más recorrido del reproductor con novedades
abiertas para CI. Este corte no ejecuta de nuevo la suite autenticada completa de
backend local ni build/start de producción; evidencia previa en inicio-inline.md.
No se acredita despliegue ni Safari/Firefox.

Artefactos efímeros en .superpowers/qa/2026-10-07-inicio-shared/:
slots.json, probe.mjs, observed.json y capturas. Las capturas de fixtures son
pruebas de composición/movimiento, no capturas de las obras del usuario.

## Corrección de cabecera: cierre y calendario separados

La captura del usuario muestra el cierre sobre «Ver todas las novedades».
Chromium reproduce el solapamiento a 768 px: la cabecera externa colocaba
el botón 34 px demasiado a la izquierda y el enlace reservaba solo 36 px.
Se lleva el cierre al borde derecho interior y ambas cabeceras reservan
56 px (44 px de botón y 12 px de separación). La reserva también se interpola
para conservar el primer fotograma del morph.

RED de intersección a 768 px antes del ajuste; GREEN a 320/390/520/768/1099 px
con slots SSR, wrapper/provider y CSS de Next reales. Se comprueban cajas
separadas, hit-test sobre el extremo derecho del enlace y clic normal en el
cierre. El probe previo sigue pasando identidad DOM, fotogramas, recorrido
inverso, claro/oscuro, movimiento reducido y PC a 1280 px. TypeScript y eslint
focal PASS. El E2E autenticado existente incorpora la aserción de no solapamiento
a 320/390/768 px para CI; no se repite la suite autenticada completa ni build/start
de producción en este ajuste CSS.

## Corrección de Tu semana: cierre centrado con el título

La captura del usuario muestra la flecha por debajo de «Tu semana». RED en
Chromium: 13 px entre los centros verticales del título y botón. El botón de
44 px estaba anclado al borde superior de una cabecera de 18 px. Se centra
en esa cabecera con top:50% y translateY(-50%), solo para Tu semana en móvil.

GREEN con diferencia inferior a 0,5 px a 320/390/520/768/1099 px y en el estado
sin actividad a 390 px. Se conservan 44×44 px y el cierre por clic normal.
El mismo probe mantiene portadas/barras persistentes, morph de ida/vuelta,
claro/oscuro, movimiento reducido y PC a 1280 px. TypeScript y eslint focal
PASS. La regresión de alineación, tamaño y clic del cierre se añade al E2E
existente de 320/390/768 px para CI; no se repite aquí la suite autenticada
completa ni build/start de producción.

## Crónica a ancho completo y tarjetas Paper de Novedades

Petición del 2026-10-07: al abrir los anuncios semanales, la crónica no debe dejar
media fila vacía; el resumen ha de mostrar el período completo en varias líneas y
las obras han de compartir el estilo nuevo de `/novedades`. Se integra main
97bd837e (#1455), conservando la landing pública, sus cuatro slots, el calendario,
los filtros y el Inicio personal expandible de esta PR.

- RED Chromium: crónica de 170 px dentro de una fila de 350 px tras ampliar.
- GREEN: misma crónica a todo el ancho; separación de 10 px respecto a
  Sale esta semana en el estado ampliado final. ResizeObserver reserva su altura flexible al envolver la fecha.
- Resumen real de HomeWrapUp con período largo: texto completo a 320 px, varias
  líneas, sin elipsis ni desbordamiento. Revisión visual de ambos estados.
- Browser probe: slots SSR reales de ThisWeekReleases/StatsRail, componentes reales
  HomeExpandable/HomeWrapUp y CSS de Next dev más el módulo Paper de producción.
  El reproductor se sustituye por un stub de abrir/cerrar; no acredita una sesión
  real de StoryPlayer. Fotogramas 0/160/final y reverso, portadas/barras persistentes,
  320/390/520/768/1099/1280, claro/oscuro, reduced motion, crónica presente/ausente,
  estados sin anuncios/error y actividad vacía. PASS. Las portadas crecen de
  34,085 px visuales a 53,389 px intermedios y 56 px finales a 390 px.
- ReleaseWorkCard comparte `releases.module.css` con `/novedades`; Home conserva
  tres imágenes principales y el fondo ambiental emplea la misma URL como CSS.
  Portada ampliada 56 px hasta 640, 72 px en tablet y 36 px en el lateral de PC.
- CI: añadidas aserciones de texto completo, crónica a ancho completo y separación;
  adaptado el extremo del morph al nuevo tamaño. La suite autenticada de CI
  requiere Supabase local desechable y no se ha repetido en este corte.

Verificación final del corte:

- 55 unitarios en seis archivos PASS: slots compartidos, HomeWrapUp, tarjeta/acciones
  de Novedades, semana pública, agenda/calendario y ruta `/novedades`.
- TypeScript y ESLint focal PASS; `diff --check` e integridad del mapa PASS.
- `next build` PASS; `next start` y Chromium sobre Inicio autenticado a
  320/390/768/1280 y `/novedades` PASS, sin errores de página. La cuenta persistente
  de desarrollo no tiene crónica ni lanzamientos esta semana; ese recorrido acredita
  el estado vacío y el render integrado. Los estados con datos se acreditan con
  el probe de componentes/slots. Sin semillas ni ediciones explícitas de contenido;
  no se abrió el reproductor real.
- El probe se repite contra la CSS compilada de producción, cargando además el
  módulo de tarjetas después del CSS global. La revisión independiente detectó
  una colisión de especificidad en PC: se eleva el selector del Home para preservar
  36 px de portada y 10 px de padding en cualquier orden de chunks. Regresión
  geométrica añadida al probe y al E2E de PC; revisión final sin hallazgos pendientes.
- La animación conjunta interpola anchura en ambas direcciones; la separación de
  10 px descrita arriba corresponde al estado final, no a cada fotograma del recorrido.
- El aviso incidental de RSC «destination stream closed early» al abandonar una
  navegación dev conserva su seguimiento previo en #1301; no hubo error de página.

## Acceso a Novedades al pie, centrado

Último ajuste de cabecera solicitado el 2026-10-07: mover Ver todas las novedades
debajo del contenido. RED Chromium: el enlace seguía por encima de los anuncios.
GREEN: enlace tras la última tarjeta (o estado vacío/error), centro horizontal a
menos de 0,5 px del centro del bloque, 12 px de separación y altura de 44 px.
Se comprueba el borde pulsable después de desplazar la página hasta el pie.

El enlace permanece montado y su fila crece de 0fr a 1fr con el morph; con movimiento
reducido no se anima. La flecha de cierre comparte el centro del título. El Inicio
personal usa el mismo pie en PC, conservando portadas de 36 px y padding de 10 px;
la landing pública mantiene su enlace original en cabecera.

- Probe de slots y componentes reales: 320/390/520/768/1099/1280, claro/oscuro,
  reduced motion, fotogramas 0/160/final/reverso, crónica presente/ausente,
  vacíos/error/cold, identidad persistente y controles: PASS.
- Cinco unitarios focales en `home-shared-panels` y `this-week-releases` PASS;
  además se materializaron los slots SSR con una prueba temporal de QA, retirada.
- TypeScript, ESLint y `diff --check` PASS. E2E de CI incorpora las aserciones de
  posición, centrado y área táctil; la suite autenticada completa no se repite
  en este ajuste de presentación. El build/start previo conserva su alcance.

## Abanico colapsado centrado

RED Chromium a 390 px: centro de las tres portadas 36,5 px a la izquierda del
centro de la tarjeta. GREEN: diferencia menor de 0,5 px. Se calcula el ancho del
abanico según los elementos presentes (29/52/75 px antes de la rotación), y el
padding existente interpola esa posición al desplegar la misma portada.

Probe PASS con una, dos y tres portadas a 390 px; tres a 320/390/520/768/1099 px.
También PASS el morph 0/160/final y reverso, identidad de portadas/barras, crónica
multilínea y a todo el ancho, pie centrado/pulsable, estados vacíos/error, temas,
movimiento reducido y PC1280 con portadas de 36 px. Los casos de una y dos obras
reducen el DOM del slot SSR y conservan las inclinaciones de cada cardinalidad;
no siembran datos ni acreditan consultas contra un catálogo real.

E2E de CI añade medición del centro del conjunto visual. ESLint focal y
`diff --check` PASS. No se repite la suite autenticada completa, los unitarios ni
build/start en este cambio exclusivamente de CSS; los cortes previos conservan
su alcance.

## Márgenes iguales en crónica y anuncios semanales

RED a 390 px: cabecera de crónica a 12/12 px (izquierda/arriba) respecto a su
borde; cabecera semanal a 11/9 px. GREEN: ambas a 12/12 px con diferencia menor
de 0,5 px. Relleno semanal igualado a 11 px y altura de línea a 18,4 px,
coincidiendo con la crónica. Ancho del título superpuesto ajustado al espacio
interior, también cuando ocupa dos líneas. La altura de línea se expresa en px
para que su transición al extremo ampliado de 28 px no cambie el primer fotograma.

Chromium PASS: 320/390/520/768/1099 con igualdad de insets, fan centrado y
una/dos/tres portadas, temas y movimiento reducido; PC1280 conserva su geometría.
También PASS 0/160/final y reverso sin salto inicial, identidad de portadas,
crónica flexible, pie centrado y pulsable, vacíos/error y actividad sin datos.
E2E de CI incorpora igualdad de márgenes. ESLint focal y `diff --check` PASS;
no se repiten unitarios, suite autenticada completa ni build/start por ser un
ajuste exclusivo de CSS. Los gates anteriores conservan su alcance.
