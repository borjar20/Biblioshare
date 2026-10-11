# Entre nosotros: editor de grupos como hoja (#1486)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1486. Las decisiones están
en `docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables, limpiadas por el propio fixture). Chromium de Playwright.

## Capturas

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-editor/empty-1280.png` | Sin grupos: estado vacío con «Crear tu primer grupo». |
| `assets/2026-10-11-entre-nosotros-editor/editor-1280.png` | Hoja centrada: fichas «Tú», Beatriz, Carlos, Diana con quitar; «Incluirme»; búsqueda y seguidos con avatar; pie fijo. |
| `assets/2026-10-11-entre-nosotros-editor/editor-360.png` | La misma hoja pegada abajo en móvil, con cuerpo desplazable. |

La primera tanda de capturas mostró el texto de «Incluirme» desbordando su recuadro: los
hijos de la columna con scroll se encogían. Se corrigió con `[&>*]:shrink-0` y se repitieron.

## Pruebas

- Vitest de comparaciones: 436 PASS (nuevos: hoja abierta como diálogo, fichas en orden con
  «Tú» primero y quitar, cierre con ✕ como cancelación, estado vacío con y sin seguidos).
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
