# Entre nosotros: el mapa se transforma en el Venn (#1497)

[Histórico · congelado 2026-10-11] Evidencia de la entrega de #1497. La decisión está en
`docs/requirements/decisiones.md` (entrada del 2026-10-11).

## Entorno

`next dev` local contra biblioshare-dev, fixture integrado de `e2e/support/comparison-fixtures.ts`
(10 personas desechables, limpiadas por el propio fixture). Chromium de Playwright. Capturas del
escenario del lienzo tomadas durante la transición; los tiempos son aproximados porque cuentan
desde que Playwright resuelve el clic.

## Antes

En la revisión del 2026-10-11 el Venn ya estaba completo en el fotograma de 120 ms: avatares,
curvas y contador desaparecían en un fotograma y solo se movía la pila de portadas.

## Después

| Captura | Qué comprueba |
|---|---|
| `assets/2026-10-11-entre-nosotros-mapa-venn/desktop-in-100.png` | Arranque: los círculos de Tú y Beatriz QA nacen de sus avatares; el resto del grupo sigue visible. |
| `assets/2026-10-11-entre-nosotros-mapa-venn/desktop-in-250.png` | A mitad: los círculos crecen mientras viajan, el resto se dispersa y se desvanece y la curva de la pareja se contrae. |
| `assets/2026-10-11-entre-nosotros-mapa-venn/desktop-in-550.png` | Aterrizaje: nombres en su sitio y contadores de región ya completos. |
| `assets/2026-10-11-entre-nosotros-mapa-venn/desktop-out-250.png` | Vuelta: el mismo recorrido al revés; el grupo reaparece mientras los círculos se repliegan hacia los avatares. |
| `assets/2026-10-11-entre-nosotros-mapa-venn/mobile-in-250.png`, `mobile-in-end.png` | 390 px: misma secuencia en el mapa estrecho. |

La primera tanda mostró los círculos casi a tamaño final con la posición apenas recorrida: el
radio usaba una curva con rebote muy adelantada. El radio pasó a seguir el recorrido, con un
leve abombamiento antes de aterrizar, y se repitieron las capturas.

## Pruebas

- Vitest de comparaciones: PASS, con `morph.test.ts` nuevo (extremos, orden de capas, círculo
  exacto en ambos extremos, contadores escalonados y reloj compartido con la cámara, incluida la
  interrupción).
- Tras volver al mapa, el foco regresa a la tarjeta de pareja que abrió el Venn.
- e2e `playwright.comparisons.config.ts` contra `next dev`: resultado en la PR.
