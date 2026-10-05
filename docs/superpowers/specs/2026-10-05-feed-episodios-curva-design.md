# Feed: episodios del día en fichas o curva, sin notas ocultas

> [Histórico · congelado 2026-10-05] Spec de diseño. El estado vivo lo mandan el código y `decisiones.md`.

Sigue a `2026-10-05-feed-patron-c-design.md` (PR #1415). Allí el post diario de una serie con
varios episodios pasó a una mini-lista con la nota de cada uno, recortada a 3 filas y «+N más».
Funciona, pero las notas que pasan de la tercera quedan ocultas y la lista no se ve de un vistazo.
Se decidió sobre maquetas (fichas, barras, mapa de calor, carrusel, curva).

## Regla por número de episodios

Mismo umbral en el feed y en la página del post (`/post/[id]`):

| Episodios | Feed | Post (`showInteractions=false`) |
|---|---|---|
| 1 | Como ahora: el episodio es el título («S2E3 · 1893», «de Loki») y la nota a la derecha | Igual |
| 2-3 | **Fichas** en una fila | **Fichas grandes**, título completo |
| 4-12 | **Curva** | **Curva grande** + **lista completa** en 2 columnas |
| 13 o más | **Curva compacta** (sin etiquetas por punto desde 9) | **Curva grande** + **3 mejores y 3 peores** en 2 columnas + el resto plegado en «Ver los N episodios» |

En el feed, la curva lleva etiquetas por punto hasta 8 episodios; de 9 en adelante pasa a modo
compacto. No hay «+N más» en ningún caso: la mini-lista de 3 filas de la PR #1415 desaparece de
esta tarjeta.

## Escala

**Siempre sobre 5, con medios**, como el resto de la app: la nota guardada (1-10) se divide entre
2 y se formatea con `formatDots` (`src/lib/rating/dots.ts`): «4», «3,5». Vale para fichas,
etiquetas de la curva, eje, «mejor episodio» y la media de los datos («media 3,8»). Los puntos
(`RatingDots`) siguen igual.

## Fichas (2-3 episodios)

Rejilla de 2 o 3 columnas iguales. Cada ficha: código (`S1E4`), nota grande («4/5»), puntos
(`RatingDots size="sm"`) y título en 2 líneas como mucho. Sin nota: «—» apagado y «sin nota».
El **mejor** lleva ★ junto al código y el borde resaltado.

En el post, las mismas fichas a mayor tamaño y con el título entero.

## Curva (4 o más)

SVG propio, sin librería de gráficos. Ancho fluido (`viewBox` + `width:100%`).

- **Eje vertical fijo 1-5** a la izquierda, con una guía tenue por nivel, **en todos los tamaños**.
- **Sin línea de media** dentro del gráfico.
- Un punto por episodio; los consecutivos con nota se unen con una línea continua y un relleno
  suave debajo.
- **Episodio sin nota:** círculo hueco en la base del gráfico; el tramo que lo salta va en
  discontinuo.
- **Cambio de temporada:** línea vertical discontinua con «T2» arriba.
- **Mejor episodio:** punto más grande y claro.
- **Hasta 8 episodios (feed) / siempre (post):** nota encima de cada punto y código debajo
  (`E4`). En el feed con 9 o más: puntos pequeños, sin etiquetas, y el primer y último código en
  los extremos.
- Debajo, en el feed: «★ S1E8 · El que permanece 5».

Color: el de la escala de series que ya usa `RatingDots` (`--type-series`), no un morado nuevo.

## Post: lista y destacados

- **4-12:** debajo de la curva, todos los episodios en **2 columnas** (orden de emisión, de arriba
  abajo por columna): código · título · puntos · nota. El mejor, resaltado con ★.
- **13 o más:** dos columnas «Lo mejor» y «Lo peor», 3 episodios cada una con código, título,
  puntos y nota; debajo, «Ver los N episodios» despliega la lista completa en 2 columnas (estado
  de cliente, sin navegación).

## Empates y casos límite

- **Empate en la nota más alta:** la ★ y el resaltado van a **todos** los empatados. Si todos los
  episodios con nota empatan, no se marca ninguno (no hay «mejor»).
- **Ningún episodio con nota:** fichas sin ★; curva con todos los puntos huecos en la base y sin
  línea «mejor».
- Lo peor/lo mejor (13+) ignora los episodios sin nota.

## Datos

No cambian: `FeedEvent.episodes` (PR #1415) ya trae temporada, episodio, título y nota, ordenados.

**Reseña:** sigue siendo solo la del episodio del que cuelga el post, como hoy (feed recortada,
post entera). Traer la reseña de cada episodio del día queda en una issue aparte.

## Componentes

En `src/components/social/feed-card/episodes/`:

- `episode-tiles.tsx` — `EpisodeTiles({ episodes, size: "feed" | "post" })`.
- `episode-curve.tsx` — `EpisodeCurve({ episodes, size: "feed" | "post" })`. La geometría (x/y de
  cada punto, tramos continuos/discontinuos, separadores de temporada, ticks) va en una función
  pura `curveGeometry(episodes, opts)` en `curve-geometry.ts`, testeable sin DOM.
- `episode-list.tsx` — `EpisodeList({ episodes })`: lista en 2 columnas para el post.
- `episode-highlights.tsx` — `EpisodeHighlights({ episodes })`: mejor/peor + desplegable (cliente).
- `best-episodes.ts` — `bestEpisodes(episodes)` con la regla de empates.

`ReviewCard` elige qué pintar según `episodes.length` y `showInteractions`. La ruta de 1 episodio y
la ruta de obra no cambian. `FeedMiniList` deja de usarse aquí (se conserva para las PRs 2-3).

## Pruebas

- `curve-geometry`: ticks 1-5 siempre; punto sin nota en la base; tramo discontinuo al saltarlo;
  separador al cambiar de temporada; etiquetas sí/no según tamaño y número.
- `bestEpisodes`: único, empate parcial (varios), empate total (ninguno), sin notas.
- Render de `ReviewCard`: 2-3 → fichas; 4-12 → curva (feed) y curva + lista (post); 13+ → curva +
  mejores/peores + «Ver los N episodios» que despliega; notas en base 5 («3,5»).
- Revisión visual a 375 px y en escritorio, claro y oscuro.

## Fuera de alcance

- Reseña de cada episodio en el post (issue aparte).
- Interacción de tocar un punto de la curva para ver su título.
