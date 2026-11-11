# Ficha con gesto — diseño

[Histórico · congelado 2026-11-11]

**Estado:** aprobado por Borja (brainstorming 2026-11-11).
**Antecedentes:** `2026-11-09-ficha-cartel-design.md` (la estética) y
`2026-11-10-ficha-acciones-design.md` (la tarjeta como mando de la obra).
**Prototipo:** `.superpowers/brainstorm/2026-11-11/ficha-con-gesto.html` (no versionado). Los
valores de animación de esta spec salen de él.

## Problema

La ficha cartel tiene identidad visual, pero actuar en ella es plano:

- La tarjeta del pase, el selector de estado y los puntos de nota cambian en seco. Los
  componentes de la tarjeta no tienen ninguna animación.
- La nota (puntos, media, histograma) y el chip de tipo usan el color del TIPO de obra, que choca
  con el tinte de la obra: naranja sobre el rojo de *Siega*, turquesa sobre el verde oliva de
  *Godzilla Minus Zero* (visto en producción el 2026-11-11).

## Decisiones

1. **Dentro de la ficha, el color de tipo es el de la obra.** Fuera de ella (feed, biblioteca,
   perfil, `/post/[id]`) la nota sigue con el color del tipo. Matiza la decisión que tiñó la nota
   con el tipo; se registra en `decisiones.md`.
2. **Gestos «con carácter»**, sin elementos nuevos en pantalla: se descartó la versión sobria
   (solo transiciones) y la juguetona (frases que reaccionan y chispas).
3. **Solo CSS.** Sin librerías de animación, sin textos nuevos, sin esquema y sin caché.
4. **Se mantiene «es estética, no juego»** (cartel, decisión 2): ningún gesto añade pasos ni
   retrasa una acción.
5. **Sin celebración al terminar:** ya la da el ritual de cierre.

## Qué cambia

### 1. Tinte de la nota

`src/components/detail/work-scope.module.css` redefine en su ámbito, en los tres bloques (claro,
`.dark` y tema «sistema» oscuro):

| Token | Valor en el ámbito |
|---|---|
| `--type-book`, `--type-movie`, `--type-series` | `var(--accent)` |
| `--type-book-ink`, `--type-movie-ink`, `--type-series-ink` | `var(--accent-ink)` |

No se toca ningún componente: cambian solos `RatingDots`, la media del hero y de Comunidad,
`RatingHistogram`, el chip de tipo, los chips de edición y episodio, y las marcas de la pestaña
Episodios.

`work-scope-contrast.test.ts` se amplía en los 360 tonos y los dos temas:

- `--type-*` como gráfico: 3:1 sobre `--background` y sobre `--surface`.
- `--type-*-ink` como texto: 4,5:1 sobre `--background`, sobre `--surface` y sobre su propio tinte
  al 10 % (`bg-type-*/10`) encima de ambos.

Si algún tono no llega, se ajusta la luminosidad del token en el ámbito, no el umbral.

**Comprobación al implementar:** buscar dentro de la ficha listas que mezclen tipos de obra y
distingan por color (candidata: la lista de sagas). Si existe, esa lista conserva los colores de
tipo globales con un ámbito propio que los restaura.

### 2. Gestos

| Pieza | Fichero | Gesto |
|---|---|---|
| Selector de estado | `status-segments.tsx` | El fondo de la opción activa pasa a ser un único elemento absoluto que se desplaza con `transform: translateX(índice × 100 %)`, 460 ms, `cubic-bezier(0.34, 1.56, 0.64, 1)`. El punto de la opción recién activada late una vez (escala 1 → 1,6 → 1 y un halo que se desvanece, 560 ms). |
| Barra de progreso | `pass-card.tsx` | `transition: width 800ms cubic-bezier(0.22, 1, 0.36, 1)`. Al montarse se llena desde 0. |
| Puntos de nota | `rating-dots.tsx` | Prop nueva `lively` (por defecto `false`). Con ella, los puntos hasta el que está bajo el cursor, el foco o el dedo escalan a 1,38 (140 ms); al fijar la nota, los puntos rellenos saltan en cadena (420 ms, 55 ms de desfase por punto, misma curva de rebote). |
| Botón principal e intenciones | `pass-card.tsx` | Borde inferior de 3 px en `--accent-hover`; al pulsar baja 3 px, escala a 0,985 y el borde desaparece (110 ms). |
| Histograma | `rating-histogram.tsx` | Prop nueva `animate` (por defecto `false`). Con ella las barras crecen desde la base al pintarse (620 ms, 45 ms de desfase por barra). |

- `lively` solo se activa en `PassCard`; `animate`, solo en `CommunitySummary`. El resto de usos
  de ambos componentes no cambia.
- Las animaciones viven en CSS modules junto a su componente. Todas van dentro de
  `@media (prefers-reduced-motion: no-preference)`: con movimiento reducido la ficha queda como
  hoy.
- El selector de estado conserva `role="group"`, `aria-pressed` y el orden de sus botones; el
  elemento deslizante es `aria-hidden`. No cambian roles, etiquetas ni `data-testid`.
- El latido del punto y el salto de los puntos de nota se disparan por un cambio hecho por el
  usuario, no al montar ni al llegar un refresco del servidor con el mismo valor.

## Pruebas

- **Unitarias:**
  - `status-segments`: el índice del elemento deslizante sigue al estado, también con las tres
    opciones de película y con el estado heredado «en curso».
  - `rating-dots`: con `lively`, fijar una nota marca los puntos rellenos; sin la prop, el DOM es
    el de hoy.
  - `work-scope-contrast`: los pares nuevos.
- **Navegador:** libro, película y serie; tema claro y oscuro; con movimiento reducido activado.
- **E2E:** los existentes de la tarjeta (`data-testid="status-badge"`, `pass-card-rating`) deben
  pasar sin cambios.

## Documentación al cerrar

- `decisiones.md`: entrada nueva (color de tipo = color de la obra dentro de la ficha; gestos de
  la tarjeta).
- `backlog.md`: casilla de la feature.
- `docs/architecture/graph.json`: nota en el nodo de la ficha si cambia alguna trampa.

## Fuera de alcance

- Textos con más voz, chispas o frases que reaccionan.
- La pestaña Comunidad más allá del color y del crecimiento del histograma (reacciones a un
  toque, compositor ligero, vacío único, orden y recuento real): bloque «Comunidad viva», con su
  propia spec.
- «Mi registro»: `2026-11-11-ficha-linea-de-lectura-design.md`.
