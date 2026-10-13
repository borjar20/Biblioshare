# Entre nosotros: atlas, evidencia de F2 (lente Opinión)

`[Histórico · verificado 2026-10-13]`

Verificación de la fase F2 del rediseño del atlas: la lente «Opinión» (dispersión nota de la referencia × media del resto, banda de coincidencia, esquinas con nombre y escala de notas por persona en la mini-ficha y en la hoja móvil).

## Build usado

- Commit `1e79b6e5` (rama `claude/entre-nosotros-redesign-74ece2`), `npm run build` + `npm run start` en el puerto 3000, Node v22.23.2.
- Supabase **dev** (`.env.local` del worktree). Fixture `withComparisonFixture(…)` no integrado: 3 personas (Tú, Beatriz QA, Carlos QA), 30 libros en común, todos con nota 9. Grupo «Atlas QA» creado por la UI.
- Servidor parado al terminar; el 3000 queda libre.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npx vitest run src/components/comparisons src/lib/comparisons` | 27 ficheros, **540 pruebas, todas pasan** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errores, 31 warnings preexistentes |

E2E contra el build de `1e79b6e5`, `-c playwright.comparisons.config.ts`, por lotes (TRAMPAS §5):

| Lote | Resultado |
|---|---|
| `e2e/entre-nosotros-atlas.spec.ts` (chromium + mobile) | 4 passed, 4 skipped (skips por proyecto) |
| `e2e/entre-nosotros.spec.ts -g "CRUD\|profile"` | 2 passed |
| `e2e/entre-nosotros.spec.ts -g "transport\|conflict"` | 2 passed |
| `e2e/entre-nosotros.spec.ts -g "isolation"` | 1 passed |
| `LOCAL ONLY` | excluido a propósito: falla contra dev (#1520) |

Los mismos cuatro lotes pasaron también sobre el build de `c784059c` (antes del arreglo de la flecha del eje Y).

E2E nuevos: «escritorio: Opinión resume, la mini-ficha pone las notas y sobrevive al cambio de formato» y «móvil: Opinión desde el icono y la hoja con la escala de notas».

- La mini-ficha de escritorio es `aria-hidden` (duplicado de ratón de la hoja), así que su escala se busca con `includeHidden: true`.
- Trampa encontrada: tras pulsar una lente, `data-atlas-moving` sigue en `false` hasta el siguiente fotograma del motor, así que esperar `settled` devolvía la sonda de **Quién** y el toque móvil caía en vacío. El spec usa `lensSettled`: deja pasar dos `requestAnimationFrame` y luego espera a que se asiente (mismo problema que ya documentaba `zoomToWork` para el vuelo al grupo).

## Arreglos de esta tarea

- **Escala de notas apilada**: con 3 personas en la misma nota, la tercera cara se salía de la pista de 40 px. La pista crece con la pila más alta: `20 + (pila − 1)·14 + 8` px, mínimo 40.
- **Mini-ficha de Opinión cortada abajo**: con el puntero en la mitad baja del escenario se abre hacia arriba (`bottom` en vez de `top`). Se ve en `desktop-opinion-tooltip.png`.
- **Hoja abierta tras cambiar de lente**: cambiar de lente limpia `hover` y `picked`.
- **Flecha del eje Y al revés**: el título se pinta girado −90° y «← Media del resto» dejaba la flecha abajo, apuntando hacia abajo. Ahora es «Media del resto →» (flecha arriba, apuntando hacia arriba).

## Capturas

Carpeta `docs/testing/assets/2026-10-13-entre-nosotros-atlas-f2/`, generadas con un spec temporal (no commiteado). Antes de abrir el atlas se repartieron las notas de Beatriz (`(i·7) mod 10 + 1`) y Carlos (`(i·3) mod 10 + 1`); Tú sigue con 9 en todo.

Escritorio 1280×800:
- [desktop-opinion.png](assets/2026-10-13-entre-nosotros-atlas-f2/desktop-opinion.png): encajado, Tú como referencia.
- [desktop-opinion-covers.png](assets/2026-10-13-entre-nosotros-atlas-f2/desktop-opinion-covers.png): portadas, zoom 1,56, con la rueda sobre el montón de obras.
- [desktop-opinion-tooltip.png](assets/2026-10-13-entre-nosotros-atlas-f2/desktop-opinion-tooltip.png): mini-ficha de la obra más baja (se abre hacia arriba).
- [desktop-opinion-ref.png](assets/2026-10-13-entre-nosotros-atlas-f2/desktop-opinion-ref.png): Tú desactivada, Beatriz QA es la referencia (6 coincidencias, 18 choques).

Móvil (Pixel 7, con toque):
- [mobile-opinion.png](assets/2026-10-13-entre-nosotros-atlas-f2/mobile-opinion.png)
- [mobile-opinion-sheet.png](assets/2026-10-13-entre-nosotros-atlas-f2/mobile-opinion-sheet.png): hoja con la escala de notas.

Sin scroll horizontal en ninguna de las dos (`scrollWidth ≤ innerWidth`).

## Observaciones visuales

- **El reparto de notas del plan no da coincidencias con Tú de referencia.** Las notas de Beatriz y Carlos suman siempre 12 (o 2 cuando `i` es múltiplo de 10), así que la media del resto vale 6 o 1. Con Tú a 9, las 30 obras chocan y caen en dos montones, en (9, 6) y en (9, 1). La dispersión que se buscaba solo se ve con Beatriz como referencia (`desktop-opinion-ref.png`). Para F3 conviene un reparto que también varíe la nota de Tú.
- **Las notas extremas (1 y 10) quedan en el borde del marco**: el punto sale medio fuera y pisa la línea del marco o la zona de las cifras de los ejes. Se ve en `desktop-opinion-ref.png` (arriba a la izquierda, abajo a la izquierda y a la derecha) y en el montón de (9, 1). No se ha tocado: hay que decidir si el marco se agranda medio punto, y eso cambia la geometría del fondo.
- **El título del eje Y se recorta por la izquierda en móvil**: las letras de «Media del resto →» tocan el borde de la pantalla y pierden parte del trazo. Pasa porque el encaje no reserva hueco para el título girado. Sin arreglar.
- **Móvil: hueco vacío grande** (~100 px CSS) entre las caras y el marco. El encaje centra un marco cuadrado en una franja alta.
- **Portadas (`k > 1,1`) sin contexto**: al acercarse no queda a la vista ningún eje ni esquina, solo el montón. Las 25 obras en (9, 6) se apilan casi en el mismo punto.
- La mini-ficha tapa la esquina «Tú sí, ellos no» cuando se pasa por las obras de abajo a la derecha. Es lo esperable de un tooltip.
- En la escala de notas de la mini-ficha, dos caras en la misma nota se solapan 6 px a propósito (paso de 14 px, cara de 20 px). Con iniciales se siguen leyendo.

## No verificado

- Dispositivo real (táctil, pellizco, rendimiento de la hoja).
- fps con ~1.000 obras: solo se probó con 30.
- Portadas reales: son de F4; aquí solo se ven placeholders.
- Android (Capacitor) y lectores de pantalla en la lente Opinión.
- Test LOCAL ONLY contra Supabase local.
