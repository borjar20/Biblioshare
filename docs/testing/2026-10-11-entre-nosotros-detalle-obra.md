# Entre nosotros: detalle de obra legible (#1501)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1501. La decisión está en
`docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables). Recorrido: pareja Tú–Beatriz QA → cruce → primera obra. Chromium de
Playwright.

## Antes

En la revisión del 2026-10-11, «Sin valorar», «9/10» y «Ver ficha» quedaban encima de portadas
desenfocadas. Se veía el borde de un rectángulo desenfocado y un círculo fantasma del Venn, en
escritorio y en móvil.

## Después

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-detalle-obra/work-1280-early.png` | Llegada: la tarjeta sube bajo la portada cuando la cámara aterriza. |
| `assets/2026-10-11-entre-nosotros-detalle-obra/work-1280.png` | Tarjeta de papel legible sobre la colección desenfocada; cada nota en la misma escala 0–10, con punto del color de la persona; «Sin valorar» como pista discontinua vacía. |
| `assets/2026-10-11-entre-nosotros-detalle-obra/work-1280-dark.png` | Lo mismo sobre espresso. |
| `assets/2026-10-11-entre-nosotros-detalle-obra/work-390.png` | 390 px: la tarjeta ocupa el ancho y «Ver ficha» queda dentro. |

La primera tanda seguía mostrando el círculo fantasma del Venn detrás de la tarjeta; en el nivel
Obra el fondo del diagrama pasa a opacidad 0.

## Pruebas

- Vitest de comparaciones: PASS (nuevo: escala compartida, relleno y punto proporcionales a la
  nota, pista vacía sin valoración y escala oculta a lectores de pantalla, que ya leen la cifra).
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
