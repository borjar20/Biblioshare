# Entre nosotros: atlas, evidencia de F4 (portadas, lista, teclado y estado)

`[Histórico · verificado 2026-10-14]`

Verificación de la fase F4 del rediseño del atlas: portadas reales con zoom de portada (caché LRU de 300, loader del CDN a 96 px), «Ver como lista» como vía de teclado y lector de pantalla, atajos de teclado en el lienzo, lente y modo de Islas en la URL, y caras y cámara en `sessionStorage` por cuenta y grupo.

## Build usado

- Commit `0d98bed1` (rama `claude/entre-nosotros-redesign-74ece2`), `npm run build` + `npm run start` en el puerto 3000, Node v22.23.2.
- Supabase **dev** (`.env.local` del worktree). Fixture `withComparisonFixture(…)` no integrado para los e2e: 3 personas (Tú, Beatriz QA, Carlos QA) y 30 libros en común.
- Servidor parado al terminar; el 3000 queda libre.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npx vitest run src/components/comparisons src/lib/comparisons` | 32 ficheros, **316 pruebas, todas pasan** (Task 5 retiró los tests del lienzo antiguo) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errores, 31 warnings preexistentes |

E2E contra el build de `0d98bed1`, `-c playwright.comparisons.config.ts`, por lotes (TRAMPAS §5):

| Lote | Resultado |
|---|---|
| `e2e/entre-nosotros-atlas.spec.ts` (chromium + mobile) | 11 passed, 11 skipped (skips por proyecto) |
| `e2e/entre-nosotros.spec.ts -g "CRUD\|profile"` | 2 passed |
| `e2e/entre-nosotros.spec.ts -g "transport\|conflict"` | 2 passed |
| `e2e/entre-nosotros.spec.ts -g "isolation"` | 1 passed |
| `LOCAL ONLY` | excluido a propósito: falla contra dev (#1520) |

Los mismos lotes pasaron antes sobre el build de `befc5cdb` (antes de los dos arreglos visuales).

E2E nuevos (`e2e/entre-nosotros-atlas.spec.ts`):
- «escritorio: las portadas se piden solo con zoom de portada»: con `page.on('request')` desde el login, ninguna petición a `comparison-fixture.invalid` a zoom de mapa; tras volar al grupo (zoom > 1,1) hay al menos una, todas con `width=96` (loader del CDN, nunca `/_next/image`), y `0 < data-atlas-covers ≤ 300`.
- «escritorio: «Ver como lista» enlaza las obras con el filtro de caras y vuelve al mapa»: región «Lista de obras» con el foco y 30 enlaces `/libro/…`; Tab llega al primer enlace; apagar Carlos QA y Beatriz QA deja los 30 (son obras de Tú); pulsar otra vez «Ver como lista» (no hay «Ver como mapa»: el botón tiene nombre fijo y `aria-pressed`) devuelve el lienzo.
- «escritorio: teclado en el lienzo y la lente en la URL tras recargar»: foco de teclado en el lienzo con el anillo dibujado (`::after` del host), `+` sube `data-atlas-zoom`, `2` → Opinión, `4` → Islas, la URL lleva `lente=islas` y `page.reload()` mantiene Islas.
- «escritorio: al volver de la ficha siguen la cámara y las caras»: zoom guardado, Carlos apagado, clic en una obra, `goBack()`: mismo zoom (±0,01) y Carlos con `aria-pressed="false"`.
- «móvil: «Ver como lista» desde el dock y un toque abre la ficha».

El helper `loginComparisonActor` enruta ahora `catalog-cover.jpg*`: el loader del CDN añade `?width=96` y la ruta exacta anterior no casaba, así que la portada fallaba contra `.invalid` y el atlas pintaba el bloque de color.

## Medición del test de presupuesto (Task 2)

`atlas-engine.perf.test.ts` (jsdom, 1.000 obras × 10 dueños en Tiempo, 10.000 apariciones y 1.000 hilos, `ctx` no-op, 1280×800). Aserciones: `sync()` < 120 ms y mediana de frame < 12 ms. Cuatro ejecuciones locales:

| Medición | Antes | Después |
|---|---|---|
| `sync()` inicial | 5,0 – 7,8 ms | 7,4 – 8,4 ms |
| Mediana de frame (apariciones en vuelo, hilos en transición) | 2,22 – 3,00 ms | 0,73 – 0,77 ms |
| Mediana de frame asentado | — | 0,70 – 1,06 ms |

El frame baja ~3,5×; el `sync` sube ~2 ms porque construye una vez los índices que antes se rehacían en cada frame. Es CPU de escritorio con `ctx` falso: no mide el raster del canvas ni un Android.

## Arreglos de esta tarea

- **Restos del lienzo antiguo** (`befc5cdb`): fuera `data-comparison-reveal` (sin lectores) y el respaldo `[data-camera-moving]` de `settled` en `entre-nosotros.spec.ts`. Prueba nueva en `atlas-view.test.tsx`: con `chosen=['b','x']` y `x` no disponible, las caras activas son exactamente `['b']`.
- **El anillo de foco del lienzo no se veía** (`12bbc751`, `atlas.module.css`). Con `:focus-visible` confirmado por el navegador, la captura no tenía anillo: Chrome pinta el `outline` con `outline-offset` negativo de un `<canvas>` debajo de su mapa de bits compuesto. Ahora lo dibuja el host con `::after` (borde de 2 px, inset 1 px, por encima de las capas). El e2e de teclado lo comprueba tras Shift+Tab/Tab.
- **La lista empezaba bajo el degradado del resumen y el pie del mapa pisaba sus filas** (`0d98bed1`, `atlas-list.tsx`, `atlas-view.tsx`). El primer encabezado quedaba medio difuminado: la lista usaba el inset del lienzo, que excluye a propósito el degradado de 32 px. Ahora suma esos 32 px. El pie de la lente («Cada obra cae entre quienes la tienen…») explica el mapa y se superponía a las filas que pasan bajo el dock; se oculta con la lista abierta. Pruebas en `atlas-list.test.tsx` y `atlas-view.test.tsx`.

## Capturas

Carpeta `docs/testing/assets/2026-10-14-entre-nosotros-atlas-f4/`, generadas con un spec temporal (no commiteado) sobre el fixture **integrado** (10 personas, 30 libros, una película y una serie). **Todas las portadas del fixture son la misma imagen** (`catalog-cover.jpg`), así que la caché solo guarda una (`data-atlas-covers = 1`): las capturas enseñan que se pintan, no la variedad ni la presión sobre la LRU de 300.

Escritorio 1280×800:
- [desktop-covers.png](assets/2026-10-14-entre-nosotros-atlas-f4/desktop-covers.png): zoom 2,8 en el grupo de 29, portadas reales.
- [desktop-keyboard-focus.png](assets/2026-10-14-entre-nosotros-atlas-f4/desktop-keyboard-focus.png): anillo de foco dorado alrededor del lienzo tras llegar con Tab.
- [desktop-list-quien.png](assets/2026-10-14-entre-nosotros-atlas-f4/desktop-list-quien.png): encabezados por grupo de dueños.
- [desktop-list-opinion.png](assets/2026-10-14-entre-nosotros-atlas-f4/desktop-list-opinion.png): «Tú 9 · media del resto 9.0».

Móvil:
- [mobile-list.png](assets/2026-10-14-entre-nosotros-atlas-f4/mobile-list.png) (Pixel 7).
- [mobile-islas-dock-pixel7.png](assets/2026-10-14-entre-nosotros-atlas-f4/mobile-islas-dock-pixel7.png), [mobile-islas-dock-375.png](assets/2026-10-14-entre-nosotros-atlas-f4/mobile-islas-dock-375.png), [mobile-islas-dock-360.png](assets/2026-10-14-entre-nosotros-atlas-f4/mobile-islas-dock-360.png): dock con Islas pulsada (las de 360 y 375 rehechas tras el arreglo del título de Islas). A 360 px: modos 51–292, lentes 73–271, «Ver como lista» 300–344; sin solapes y sin scroll horizontal.

Sin scroll horizontal en ninguna (`scrollWidth ≤ innerWidth`).

## Observaciones visuales

- *(Arreglado.)* Sin anillo de foco en el lienzo.
- *(Arreglado.)* Primer encabezado de la lista difuminado bajo el resumen; pie de la lente encima de las filas.
- *(Arreglado.)* **Islas a 360 y 375 px: el título «Libros» quedaba tapado por la fila de caras** (a 412 px se leía entero). Causa: el extent de Islas reservaba el hueco de los textos de arriba (título, «n en común», tira de medias y su pila de caras) como 110 unidades de **mundo**, pero el pintor los dibuja a tamaño fijo en **píxeles de pantalla** (hasta 52 + 42 + 30 px sobre el disco). En un móvil estrecho el encaje aleja la cámara (k menor) y ese margen de mundo encoge por debajo de los textos. Arreglo: el extent de Islas se detiene en los discos y el motor suma `islandLabelRoom()` (píxeles, calculado con la misma colocación de caras que el pintor) al inset superior al encajar, solo con la lente Islas; ese hueco solo limita el zoom, para no disparar el respaldo de `fit` cuando la banda libre baja del 40 %. Prueba en `atlas-canvas.test.tsx` (360×740, insets 176/175, 10 caras con la misma media): el borde superior del título queda bajo el inset y los discos sobre el dock; antes del arreglo el título empezaba en y = 144 < 176. Capturas rehechas a 360×780 y 375×780 con el fixture integrado: «Libros» y «3 en común» se leen enteros bajo la fila de caras.
- **Las portadas a zoom 2,8 son pequeñas** (~24 px de ancho) y sin título: es el umbral `TITLE_ZOOM`, sin cambios.
- **El anillo de foco sigue tras clicar en el lienzo** si el foco llegó antes por teclado (`desktop-covers.png`): es como funciona `:focus-visible`.
- La lista de Opinión no tiene encabezados y, con todas las notas iguales, el orden por |dif| no se aprecia.
- En la primera tanda, la captura de foco salió durante el fundido de salida del cargador (420 ms) y se veía su fantasma bajo el lienzo. Es transitorio; se rehízo esperando al fundido.

## No verificado

- Dispositivo Android real y fps reales con ~1.000 obras: solo el test de presupuesto en jsdom (arriba).
- Portadas distintas y la expulsión de la LRU con más de 300 portadas fuera de los unitarios.
- Lector de pantalla real sobre la lista.
- Test LOCAL ONLY contra Supabase local.

## Corregido tras la revisión final

Código probado en `3746e3f8` (fixes en `904ba0d4` y `3746e3f8`).

- **Cámara sin tocar restaurada como del usuario.** El motor informa en `onSettled` si la cámara es del usuario (rueda, pellizco, arrastre, zoom, teclado, vuelo a un grupo o restaurada de una así); un encaje no se guarda y borra la que hubiera. Cambio de formato, recarga, otro tamaño o Islas Todo→Libros encajan la escena nueva; la vuelta desde la ficha tras mover la cámara la restaura. Pruebas en `atlas-canvas.test.tsx` y `atlas-view.test.tsx`.
- **Memoria borrada en cualquier logout.** `LogoutButton` vacía la memoria del atlas antes de salir; al montar, el explorador poda la de otras cuentas de la pestaña. Pruebas en `logout-saved.test.tsx`, `explorer.test.tsx` y `atlas-ui-state.test.ts`.
- **Escrituras tras invalidar.** Al invalidar la sesión la cuenta queda cerrada en `atlas-ui-state` y `writeGroupMemory` no escribe hasta un payload nuevo; el motor no avisa tras desmontarse.
- **Rejilla de Tiempo acotada.** `paintTiempoBack` recorre solo los años en pantalla; `datedYear` trata como sin fecha los años < 1900 o > año actual + 1 (en el trazado, el resumen y la mini-ficha).
- **Escape de la hoja.** Se escucha en el escenario, no en `document`: Escape en la hoja de grupos no cierra la de la obra. Un cambio de lente con el foco en la hoja lo lleva al lienzo.

| Comprobación | Resultado |
|---|---|
| `vitest run src/components/comparisons src/lib/comparisons src/components/nav src/app/ajustes` | 36 ficheros, 368 tests |
| `tsc --noEmit` · `npm run lint` | limpio · 0 errores |
| `entre-nosotros-atlas.spec.ts` (ambos proyectos, `next start`) | 11 passed, 11 skipped (cada proyecto salta los del otro) |
| `entre-nosotros.spec.ts -g "CRUD\|profile"` | 2 passed |
| `entre-nosotros.spec.ts -g "transport\|conflict"` | 1.ª tanda 1 failed / 1 passed; repetida 2 passed; `conflict --repeat-each 3`: 2 passed, 1 failed |
| `entre-nosotros.spec.ts -g "isolation"` | 1 passed |

El fallo intermitente de `conflict` es en la línea 162: el guardado de la primera pestaña devuelve `ok: true` en vez de `conflict`. `settled(other)` solo espera al atlas, no a la respuesta del guardado de la otra pestaña, así que a veces la primera guarda antes. Es temporización del test, anterior a estos cambios (no tocan grupos ni revisiones). Medido con trazas: `settled(other)` volvía a los ~60 ms, el guardado de la primera pestaña salía a los ~90 ms y la respuesta de la otra llegaba entre 330 y 750 ms (2 de 5 fallos con `--repeat-each 5`). Corregido en el test: espera la respuesta de la Server Action de la otra pestaña y su chip «Grupo: Otra pestaña QA» antes de que guarde la primera; la aserción de `conflict` se mantiene. Contra `next start`: `conflict --repeat-each 6` 6 passed, `-g "transport|conflict"` 2 passed.

## Ajustes tras prueba con datos reales

Al probarlo con datos reales (4 personas, hasta 830 obras) salieron cinco problemas; el porqué está en `decisiones.md` (entrada del 2026-10-14, «Entre nosotros: ajustes del atlas tras probarlo con datos reales»). Cada arreglo lleva su test unitario, escrito antes y visto fallar:

- **Quién sin solapes** (`layout.test.ts`): 4 personas en cuadrado con {T,M}, {L,F}, {T,L,M,F}, {T,L}, {T,F}, {L,M} y grupos de una persona de 830/400/300/120 → ningún par de grupos a menos de `ra + rb`, ninguno a menos de `r + 80` de un polo, lo de una persona más allá de su polo, determinista. Con una persona el grupo va debajo; con dos, hacia fuera a izquierda y derecha. El nombre del polo de abajo se pinta encima del avatar.
- **Mini-ficha** (`atlas-view.test.tsx`): portada por `cdnLoader` a 96 px con bloque de color si no hay o falla (`onError`); solo dueños que son caras activas, en hover y en la hoja.
- **Notas en cifras** (`rating-scale.test.tsx`): fila «Tú 6 · Bea 4 · Carla sin nota» bajo la pista; `aria-label` igual que antes.
- **Textos de Opinión** (`atlas-view.test.tsx`): una cara más («Nota de Bea →», «Tú sí, Bea no»), dos («Media de Bea y Carla →», «el resto»), más de tres («Media de 4 personas →»), con y sin Tú como referencia.
- **Tiempo e Islas solo con lo compartido** (`tiempo.test.ts`, `islands.test.ts`, `list.test.ts`): con dos o más caras solo entran obras con al menos dos dueños activos; con una, todo lo suyo. Se adaptaron los fixtures que contaban con obras de una sola persona.

| Comprobación (commit `7a880295`, `next start`) | Resultado |
|---|---|
| `vitest run src/components/comparisons src/lib/comparisons` | 32 ficheros, 342 tests |
| `tsc --noEmit` · `npm run lint` | limpio · 0 errores, 31 warnings preexistentes |
| `entre-nosotros-atlas.spec.ts` (ambos proyectos) | 11 passed, 11 skipped |
| `entre-nosotros.spec.ts -g "CRUD\|profile"` | 2 passed |
| `entre-nosotros.spec.ts -g "transport\|conflict"` | 2 passed |
| `entre-nosotros.spec.ts -g "isolation"` | 1 passed |

Los resúmenes del e2e de 3 personas no cambian («Llegaste tú primero a 30 de 30 obras compartidas», «Donde más os parecéis: Libros, con 30 en común»): en ese fixture todo es compartido.

Capturas en `docs/testing/assets/2026-10-14-entre-nosotros-atlas-ajustes/`, escritorio 1280×800, con un spec temporal (no commiteado) sobre el fixture integrado y un grupo de 4 (Tú, Beatriz QA, Carlos QA, Diana Ana QA). Para reproducir el cuadrado se añadieron libros desechables: 40 de Tú+Carlos y 25 de Beatriz+Diana (parejas opuestas), 20 de Tú+Beatriz, 150 solo de Tú y 60 solo de Diana, con notas y fechas variadas.

- [quien-4-personas.png](assets/2026-10-14-entre-nosotros-atlas-ajustes/quien-4-personas.png): los grupos 3, 40, 25, 29 y 20 separados y sin tapar polos; los 150 de Tú encima de su polo, los 60 de Diana a su izquierda; «Carlos QA · 72 obras» encima de su avatar. Con la primera holgura (40 unidades) las cifras de los grupos del centro se pisaban; se subió a 120.
- [opinion-tooltip.png](assets/2026-10-14-entre-nosotros-atlas-ajustes/opinion-tooltip.png): 3 caras; ejes «Tu nota →» y «Media de Beatriz QA y Carlos QA →», esquinas «Tú sí, el resto no» y «El resto sí, tú no»; la mini-ficha con portada, la escala y «Tú 9 · Beatriz QA 3» (Carlos no tiene esa obra). Un título largo sin espacios se salía de la tarjeta: ahora parte (`overflow-wrap: anywhere`).
- [tiempo-compartidas.png](assets/2026-10-14-entre-nosotros-atlas-ajustes/tiempo-compartidas.png): Tú y Beatriz QA; solo las obras compartidas por las dos, sin los 150 libros de Tú solo. «Llegaste tú primero a 46 de 52 obras compartidas».

