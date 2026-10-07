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
