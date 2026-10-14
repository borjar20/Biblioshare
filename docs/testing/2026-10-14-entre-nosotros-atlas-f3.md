# Entre nosotros: atlas, evidencia de F3 (lentes Tiempo e Islas)

`[Histórico · verificado 2026-10-14]`

Verificación de la fase F3 del rediseño del atlas: las lentes «Tiempo» (una vía por persona a lo largo de los años, con hilos entre las apariciones de una misma obra) e «Islas» (modos Tipo, Género y Autor/Director), y la retirada de Gustos.

## Build usado

- Commit `7ab38ea7` (rama `claude/entre-nosotros-redesign-74ece2`), `npm run build` + `npm run start` en el puerto 3000, Node v22.23.2.
- Supabase **dev** (`.env.local` del worktree). Fixture `withComparisonFixture(…)` no integrado para los e2e: 3 personas (Tú, Beatriz QA, Carlos QA), 30 libros en común con `finished_on: 2026-09-01`, nota 9 y género Drama. El autor es texto libre (no está en `credits`), así que en Autor/Director todo cae en «Otros».
- Servidor parado al terminar; el 3000 queda libre.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npx vitest run src/components/comparisons src/lib/comparisons` | 31 ficheros, **567 pruebas, todas pasan** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errores, 31 warnings preexistentes |

E2E contra el build de `7ab38ea7`, `-c playwright.comparisons.config.ts`, por lotes (TRAMPAS §5):

| Lote | Resultado |
|---|---|
| `e2e/entre-nosotros-atlas.spec.ts` (chromium + mobile) | 6 passed, 6 skipped (skips por proyecto) |
| `e2e/entre-nosotros.spec.ts -g "CRUD\|profile"` | 2 passed |
| `e2e/entre-nosotros.spec.ts -g "transport\|conflict"` | 2 passed (incluye el test de conflicto adaptado al retirar Gustos) |
| `e2e/entre-nosotros.spec.ts -g "isolation"` | 1 passed |
| `LOCAL ONLY` | excluido a propósito: falla contra dev (#1520) |

Los mismos cuatro lotes pasaron antes sobre el build de `36496c28` (antes de los dos arreglos de Tiempo).

E2E nuevos:
- «escritorio: Tiempo e Islas resumen lo dibujado y el modo de Islas cambia las islas»: resumen de Tiempo, mini-ficha con los años (es `aria-hidden`, se comprueba con `toBeAttached`), resúmenes de Islas en Tipo, Género y Autor/Director, y que con el formato «Libros» el modo Tipo desaparece.
- «móvil: Tiempo desde el icono y la hoja con los años»: el toque abre la hoja con «Tú: 2026».

## Arreglos de esta tarea

- **Tiempo en móvil recortaba la etiqueta del último año y los nombres largos** (`a3f9c579`, `7ab38ea7`, `paint-tiempo.ts`). Las etiquetas están en píxeles de pantalla y el encaje en unidades de mundo, así que con 10 vías (k ≈ 0,2) «2027» se salía por la derecha y «Diana Ana QA» por la izquierda. Ahora el nombre se desplaza a la derecha lo justo para quedar dentro (`max(x, ancho/2 + 4)`), y el año de cierre se omite si no cabe: cierra el rango y no tiene columna propia. Un primer intento lo giraba a la izquierda de su línea, pero pisaba la etiqueta del año anterior (columnas de ~45 px), por eso se omite. En escritorio sigue viéndose. Prueba nueva en `paint-tiempo.test.ts`.

## Capturas

Carpeta `docs/testing/assets/2026-10-14-entre-nosotros-atlas-f3/`, generadas con un spec temporal (no commiteado) sobre el fixture **integrado** (10 personas, una película y una serie). Antes de abrir el atlas se movieron las fechas de los libros `i`: Tú `2021-01-15 + i meses`, Beatriz `+ (i + 3)`, Carlos `+ (30 − i)`. Las otras 7 personas, la película y la serie siguen en 2026-09-01.

Escritorio 1280×800:
- [desktop-tiempo.png](assets/2026-10-14-entre-nosotros-atlas-f3/desktop-tiempo.png): «Llegaste tú primero a 18 de 32 obras compartidas».
- [desktop-tiempo-tooltip.png](assets/2026-10-14-entre-nosotros-atlas-f3/desktop-tiempo-tooltip.png): mini-ficha con el año de cada persona.
- [desktop-islas-tipo.png](assets/2026-10-14-entre-nosotros-atlas-f3/desktop-islas-tipo.png): Libros (3 en común), Películas y Series (0 en común).
- [desktop-islas-genero.png](assets/2026-10-14-entre-nosotros-atlas-f3/desktop-islas-genero.png): una sola isla, Drama, con las 32 obras.
- [desktop-islas-autor.png](assets/2026-10-14-entre-nosotros-atlas-f3/desktop-islas-autor.png): todo en «Otros».

Móvil (Pixel 7, con toque):
- [mobile-tiempo.png](assets/2026-10-14-entre-nosotros-atlas-f3/mobile-tiempo.png)
- [mobile-tiempo-sheet.png](assets/2026-10-14-entre-nosotros-atlas-f3/mobile-tiempo-sheet.png): hoja con los años.
- [mobile-islas.png](assets/2026-10-14-entre-nosotros-atlas-f3/mobile-islas.png)

Sin scroll horizontal en ninguna (`scrollWidth ≤ innerWidth`).

## Observaciones visuales

- **La tira de medias de Islas apila las caras en el mismo punto.** Las 10 personas tienen nota media 9 en Libros/Drama/Otros, así que las 10 caras caen en el mismo sitio de la tira y solo se ve la última («LQ»). Con datos reales con medias parecidas pasará lo mismo. La escala de la mini-ficha de Opinión ya apila; la tira de Islas no. Sin arreglar: es una decisión de diseño (apilar, desplazar o agrupar).
- **Autor/Director: la isla «Otros» dice «3 en común» y el resumen dice «Aún no tenéis obras en común en ninguna isla».** El resumen no cuenta «Otros» a propósito (es lo que pide el e2e), pero leído junto a la isla parece una contradicción. Habría que matizar el texto del resumen o el de la isla.
- **Tiempo con muchas vías queda estrecho en escritorio.** 10 vías × 230 de alto frente a 6 años × 270 de ancho: el encaje lo limita la altura y el gráfico ocupa ~360 px de 1280. La mitad derecha (2024–2026) está casi vacía por los datos del fixture.
- **Tiempo: los nombres de las vías van muy pegados al avatar de la vía siguiente** (con 10 vías en móvil y en escritorio). Se leen, pero el nombre parece del avatar de abajo.
- **Las fechas iguales dibujan un «poste» vertical**: las 7 personas sin fechas movidas y los libros 0–2 de 2026-09-01 se unen con un hilo vertical que atraviesa todas las vías. Es lo esperado con estos datos.
- **Islas Tipo**: Películas y Series son islas mínimas con una sola obra. Quedan a distinta altura que Libros por el orden en espiral; se ve algo descompensado, pero es el diseño.
- La hoja móvil tapa las dos últimas vías. Es lo esperable de una hoja.
- La hoja del atlas en móvil no se cierra con Escape (solo con «Cerrar»). Viene de F1; en un teléfono no hay teclado, pero en un portátil táctil o con teclado externo sí importaría.

## Incidencias de la ejecución

- Una vez, el spec temporal de capturas en móvil se quedó en «Cargando comparación…» tras crear el grupo (fixture integrado, 10 personas, Supabase dev). Al repetirlo pasó. No se vio en los e2e.

## No verificado

- Dispositivo real (táctil, pellizco, rendimiento) en Tiempo e Islas.
- Autor/Director con créditos reales: el fixture no tiene `credits`, así que solo se ha visto «Otros».
- Más de 10 categorías en Género/Autor (el corte a «Otros») fuera de los unitarios.
- fps con ~1.000 obras; portadas reales (F4).
- Test LOCAL ONLY contra Supabase local.
