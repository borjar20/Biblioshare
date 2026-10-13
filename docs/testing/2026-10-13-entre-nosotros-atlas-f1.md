# Entre nosotros: atlas, evidencia de F1

`[Histórico · verificado 2026-10-13]`

Verificación de la fase F1 del rediseño del atlas (`/comunidad/entre-nosotros`, a sangre, siempre oscuro, `<canvas>`).

## Build usado

- Commit `babf2391` (rama `claude/entre-nosotros-redesign-74ece2`), `npm run build` + `npm run start` en el puerto 3000, Node v22.23.2.
- Supabase **dev** (`.env.local` del worktree). Fixture `withComparisonFixture(…, { integrated: true })`: 10 personas; Tú, Beatriz QA y Carlos QA comparten 30 libros + una película + una serie. Grupo «Atlas QA» creado por la UI.
- Servidor parado al terminar; el 3000 queda libre.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errores, 31 warnings preexistentes |
| `npx vitest run` | **574 ficheros, 6018 pruebas, todas pasan** |
| e2e `entre-nosotros-atlas.spec.ts` (chromium + mobile, build de producción) | 2 passed, 2 skipped (los skips son por proyecto: cada test se salta en el otro proyecto) |
| e2e `entre-nosotros.spec.ts -g "CRUD\|profile\|transport"` | 3 passed |
| e2e `entre-nosotros.spec.ts -g "conflict\|isolation"` | 2 passed |
| e2e `entre-nosotros.spec.ts -g "LOCAL ONLY"` | falla contra dev: preexistente, es un `expect` del origen de Supabase (`127.0.0.1:54321`), no un `test.skip`. Solo corre bien contra Supabase local |
| `npx tsx --test e2e/support/club-round-fixture.test.ts` | 9 pass |

Los e2e son los de la Task 9 (informe en `.superpowers/sdd/task-9-report.md`), con las dos rondas de arreglos posteriores: las caras del atlas sobreviven al cambio de formato (`8b8b60ea`) y, si nadie de la selección sigue en el cruce, vuelven todas (`cb0cfcf7`). Tras la segunda ronda no se repitieron los e2e; los últimos fueron tras la primera. Los commits posteriores (`babf2391`, extensión finita del atlas sin personas) solo están cubiertos por los unitarios de esta pasada. Las capturas sí salen del build de `babf2391`.

## Capturas

Carpeta `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f1/`. Generadas con un script Playwright desechable (no commiteado).

Escritorio 1280×720 (retomadas tras los arreglos visuales; antes eran 1280×800):
- [desktop-map.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-map.png): mapa encajado (zoom de encaje).
- [desktop-covers.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-covers.png): portadas, zoom 2,45 (aterrizaje del vuelo al grupo).
- [desktop-titles.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-titles.png): títulos, zoom 4,41 (> 3,2, tras un «Acercar»).
- [desktop-tooltip.png](assets/2026-10-13-entre-nosotros-atlas-f1/desktop-tooltip.png): tooltip sobre una obra.

Móvil (Pixel 7, con toque):
- [mobile-map.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-map.png)
- [mobile-sheet.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-sheet.png): hoja de una obra («Abrir ficha», «Cerrar»).
- [mobile-groups.png](assets/2026-10-13-entre-nosotros-atlas-f1/mobile-groups.png): hoja de grupos (selector, Editar grupo, Crear grupo, Actualizar).

## Arreglos visuales tras F1

Las capturas de la primera pasada mostraban seis problemas; se arreglaron y las siete capturas se retomaron con el build del arreglo (e2e del atlas: 2 passed, 2 skipped; unitarios de `src/components/comparisons` y `src/lib/comparisons`: 504 pasan).

1. **Cabecera móvil (≤ 640 px) ocupaba un tercio de la pantalla.** Ahora la fila 1 es la flecha «Volver» solo icono (nombre accesible «Volver a Comunidad» por `aria-label`), el título a 18 px y el chip de grupo; la fila 2 junta secciones y formatos en una única fila con scroll horizontal y sin barra. Altura medida: 94 px a 412 px de ancho (antes ~150). Escritorio sin cambios.
2. **Aro de la cara activa recortado.** La fila de caras móvil tiene 4 px de relleno interior y margen negativo que lo compensa; los aros se ven enteros.
3. **Hilos del lienzo atravesando resumen y caras.** `.overlayTop` lleva un velo (`--atlas-ground` sólido y degradado a transparente en los 32 px de abajo), con `pointer-events: none` en el contenedor. Para que el velo no tape polos ni la etiqueta del grupo, el encaje y el vuelo al grupo enmarcan la franja libre entre la capa superior y el dock (la vista mide ambas con `ResizeObserver` y se las pasa al motor como `insets`); al cambiar la altura de la capa solo se reencaja si la cámara sigue en el encaje.
4. **«Abrir ficha» partido en dos líneas.** Botones con `white-space: nowrap`; en móvil las acciones van debajo del título y los dueños.
5. **El vuelo al grupo saltaba a títulos (k≈4,2) con letra de 6-7 px.** El vuelo se limita a `[1,6; 2,8]` (calculado con la franja libre y factor 0,38), así que aterriza en portadas. Los títulos (umbrales 1,1 y 3,2 intactos) usan `min(14, max(9, 1,5·k))` px, se ajustan al ancho de la portada (partiendo palabras largas), máximo 3 líneas con elipsis, sobre una banda oscura.
6. **Hoja de grupos al ras del borde inferior.** El `<dialog>` es una tarjeta redondeada entera con margen inferior que incluye `env(safe-area-inset-bottom)`, `max-height: 85dvh` y `overflow: auto`; todos los botones quedan visibles.

Queda:
- Títulos sin espacios y largos (como `qa_comp_motion_NN`) se parten por caracteres y acaban en elipsis a zoom bajo de títulos; se leen enteros acercando más.
- Con 10 personas, en el mapa la etiqueta de un grupo pequeño puede quedar bajo un polo (p. ej. el «2» junto a Beatriz QA): es de la disposición, no de estos arreglos.
- Siguen igual que en F1: el tooltip de escritorio tapa obras vecinas; en móvil no hay botones de zoom (solo gestos); portadas de color sin imagen (F4).

## No verificado

- Dispositivo real (táctil, gestos de pellizco, rendimiento de la hoja).
- fps con ~1.000 obras: solo se probó con 30 obras y un par más.
- Covers reales: son de F4; aquí solo se ven placeholders.
- Android (Capacitor) y lectores de pantalla en el atlas.
- Test LOCAL ONLY contra Supabase local.
- Pérdida de cobertura: el e2e de «handoff» de carga del lienzo antiguo se borró (ver informe de Task 9); no hay equivalente para el atlas.
