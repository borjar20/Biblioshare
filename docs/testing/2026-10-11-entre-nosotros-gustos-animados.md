# Entre nosotros: Gustos animado (#1499)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1499. La decisión está en
`docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables; todas sus obras son de Drama, así que la nube tiene una sola
categoría). Selección: Tú, Beatriz QA y Carlos QA. Chromium de Playwright.

## Capturas

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-gustos-animados/tastes-1280-150.png` | Arranque: la burbuja de Drama entra escalando y las barras empiezan a crecer desde 0. |
| `assets/2026-10-11-entre-nosotros-gustos-animados/tastes-1280-400.png` | A mitad: barras escalonadas por persona (Carlos QA aún creciendo) y medias contando (8.8 → 8.9). |
| `assets/2026-10-11-entre-nosotros-gustos-animados/tastes-1280-1500.png` | Final: valores exactos; la única categoría queda en el centro de la nube, no arriba a la izquierda. |
| `assets/2026-10-11-entre-nosotros-gustos-animados/tastes-390-1500.png` | 390 px: los mismos paneles apilados. |

## Pruebas

- Vitest de comparaciones: PASS. Nuevos: barras dibujadas como `scaleX` de su media y nube
  centrada con una categoría; cifras que cuentan desde 0 con movimiento y exactas con
  movimiento reducido.
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
