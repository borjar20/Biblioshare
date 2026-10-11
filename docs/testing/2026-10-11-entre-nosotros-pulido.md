# Entre nosotros: pulido visual (#1487)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1487. Las decisiones están
en `docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas; a la décima se le borraron los pases para reproducir una persona sin obras).
Chromium de Playwright. Datos y usuarios desechables, limpiados por el propio fixture.

## Capturas

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-pulido/map10-1280-light.png` | Mapa de diez personas: 11 conexiones en lugar de 45; «Luis QA» (0 obras) atenuado y sin conexión; «Tú» arriba. |
| `assets/2026-10-11-entre-nosotros-pulido/map10-1280-dark.png` | Lo mismo en oscuro. |
| `assets/2026-10-11-entre-nosotros-pulido/venn-tu-1280.png` | Venn «Tú, Beatriz QA» con etiquetas y casillas como «Tú». |
| `assets/2026-10-11-entre-nosotros-pulido/tastes-1280.png` | Gustos: «Vuestros mundos» / «Lo que os gusta», barras sin tirador, «Tú» en las notas, lápiz en editar y «Actualizar». |
| `assets/2026-10-11-entre-nosotros-pulido/mobile-320-top.png` | Cabecera móvil compacta, intro en un párrafo. |

## Pruebas

- Vitest de comparaciones: 428 PASS (nuevos: esqueleto del mapa, atenuación, avatares
  y barra sin tirador, `presentViewer`).
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR. Los specs
  usan `shownName` para leer a quien mira como «Tú» en el lienzo y nombres reales en el editor.

## Límites

- El fixture no tiene avatares reales; la imagen de avatar en Gustos solo la cubre el test
  unitario.
- Capturas en `next dev` (aparece el indicador «Cache disabled» de desarrollo).
