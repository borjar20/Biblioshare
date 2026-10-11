# Entre nosotros: el Venn cabe en el lienzo (#1500)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1500. La decisión está en
`docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables, limpiadas por el propio fixture). Chromium de Playwright.

## Antes

Con diez personas, al abrir la pareja Tú–Beatriz QA el Venn quedaba bajo los controles: en
390 px, cuatro filas de chips, «Actualizar», la barra de retorno y dos filas de filtros sumaban
unos 450 px y el diagrama asomaba cortado al fondo del marco; en 1280 px los círculos quedaban
cortados por abajo.

## Después

Medido con `getBoundingClientRect` del marco del lienzo y de los círculos del Venn:

| Ancho | Marco (alto) | Círculos dentro del marco |
|---|---|---|
| 1280 px | 648 px | Sí: 52 px de margen inferior |
| 390 px | 608 px | Sí: 198 px de margen inferior |
| 320 px | 560 px | Sí: 200 px de margen inferior |

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-venn-visible/venn-1280.png` | Chips en una sola fila con «Actualizar» al final; el Venn entero. |
| `assets/2026-10-11-entre-nosotros-venn-visible/venn-390.png` | Una fila de chips desplazable con fundido en el borde; «Volver» y la ruta de niveles en la misma fila; filtros en una fila desplazable. |
| `assets/2026-10-11-entre-nosotros-venn-visible/region-390.png` | El cruce con la misma barra compacta. |

La primera tanda en 390 px mostraba los nombres de la pareja truncados a «T…» junto a la ruta; en
móvil pasan a ser solo para lectores de pantalla (los chips ya dicen quién se compara). En 320 px
la ruta completa no cabía junto a «Volver» y solo se muestra el nivel actual.

## Pruebas

- Vitest de comparaciones: 386 PASS. ESLint PASS.
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
