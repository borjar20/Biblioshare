# Entre nosotros: mapa del grupo vivo (#1498)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1498. La decisión está en
`docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables, limpiadas por el propio fixture). Chromium de Playwright. Los tiempos
de las capturas cuentan desde que el mapa es visible, así que son aproximados.

## Capturas

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-mapa-vivo/intro-1280-150.png` | Entrada: las personas se asientan una tras otra (Luis QA aún llegando), la curva más fuerte empieza a dibujarse y el contador sube (29). |
| `assets/2026-10-11-entre-nosotros-mapa-vivo/intro-1280-450.png` | Más adelante: todas en su sitio, curvas dibujándose de la más fuerte a la más débil, contador en 31. |
| `assets/2026-10-11-entre-nosotros-mapa-vivo/hover-person-1280.png` | Ratón sobre Luis QA: se encienden sus nueve conexiones, incluidas las que el esqueleto del mapa no dibuja, y el resto se atenúa. |
| `assets/2026-10-11-entre-nosotros-mapa-vivo/hover-pair-1280.png` | Ratón sobre la tarjeta Tú–Beatriz QA: la tarjeta se eleva y el resto del grupo se atenúa en el mapa. |

La primera tanda mostró que las conexiones extra del resaltado esperaban al retraso de la
entrada y no aparecían durante el primer segundo; ahora se dibujan al momento.

## Pruebas

- Vitest de comparaciones: 387 PASS (nuevo: resaltado al pasar y al enfocar persona o pareja,
  atenuado del resto, limpieza al salir y al abrir la pareja, y entrada desactivada al navegar).
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
