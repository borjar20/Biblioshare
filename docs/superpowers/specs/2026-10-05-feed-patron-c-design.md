# Feed: patrón C para todas las tarjetas

> [Histórico · congelado 2026-10-05] Spec de diseño. El estado vivo lo mandan el código y `decisiones.md`.

Continúa la revisión estética del feed de la PR #1227 (hitos en una línea, reseñas y visionados
más densos), que no tocó las tarjetas de valoración ni de episodios.

## Problema

1. **Espacio desperdiciado.** Las tarjetas «valoró» y «marcó un episodio de» (`ReviewCard`) son
   tres capas apiladas: la tarjeta, una caja interior con una portada de 58 px que fija ~110 px
   de alto aunque dentro solo haya título, nota y una línea mono, y una fila de pie «Comentar».
   Con «marcó un episodio» la caja queda casi vacía.
2. **Serie o episodio no se distinguen.** Valorar la serie («Serie · 2021») y valorar un episodio
   («Serie · S2E3 · +3 episodios») usan el mismo verbo, «valoró». Solo los separa una línea mono
   de 10 px.
3. **Nota engañosa en el post diario de series.** El post `watched` agrupa los episodios del día,
   pero lleva solo la nota del **primer** episodio (`feed.ts`, `kind === "watched"`). Junto a
   «+3 episodios» parece la nota de los cuatro.
4. El título del episodio ya llega al feed (`episode.title`) y no se pinta.

## Decisiones

- **Una nota por episodio** en el post diario: mini-lista con `S#E#`, título y su nota (o «—»).
  Se descartaron «solo la del episodio nombrado» (pierde información) y «la media del día» (pierde
  qué episodio gustó).
- **Patrón C** (elegido entre la fila tipo hito (A), la caja apretada (B) y C, sobre una maqueta):
  lo que se valoró/hizo es el título; la nota va grande a la derecha.
- **Se aplica a todas las tarjetas del feed**, no solo a la de valoración: se diseñó todo de una
  vez para que el feed quede coherente. Experiencias queda fuera (componente propio,
  `ExperienceCard`; se revisa aparte, ver «Fuera de alcance»).

## El patrón

Todas las tarjetas tienen el mismo esqueleto:

1. **Cabecera fina** (una línea): avatar de 22 px · quién · verbo preciso · hora corta · icono de
   comentarios (con contadores si hay actividad, como el `threadLink` del hito) · menú de borrar.
2. **Fila de obra**: portada de 30 px · título en serif de 15 px · datos en mono de 10,5 px ·
   hueco a la derecha para el «valor» (nota en puntos grandes, %, botón «Añadir»).
3. **Contenido** debajo, **solo si existe**: extracto de reseña (4 líneas y «Seguir leyendo»,
   como hoy), texto del pensamiento, mini-lista (episodios, pasos de avance, miembros).

Desaparecen la caja interior (`bg-surface-muted`) y la fila de pie (`PostSummary`): su función pasa
al icono de la cabecera, que enlaza a `/post/[id]`.

Las variantes de superficie que ya existen se mantienen:

| Superficie | Prop | Cabecera |
|---|---|---|
| Feed de Inicio | — | completa, con icono de comentarios |
| Actividad del perfil | `hideActor` | sin avatar ni nombre; el verbo empieza en mayúscula; hora y menú a la derecha |
| Cabecera de `/post/[id]` | `showInteractions=false` | sin icono de comentarios (el hilo va debajo); la reseña se pinta entera, sin recortar |

## Componentes

En `src/components/social/feed-card/`:

- **`FeedCardShell`** — `article` + cabecera fina + `children`. Props: actor (o `actorSlot` para
  el visionado conjunto y el club, que tienen varios avatares o un club), `verb: ReactNode`,
  `eventDate`, `postId`, `reactionCount`, `commentCount`, `viewerCanDelete`, `hideActor`,
  `showInteractions`. Encapsula `useDeletePost`, `PostDeleteMenu` y `PostDeleteError`, y devuelve
  `null` si el post se borró.
- **`FeedWorkRow`** — portada + título (enlazados a `itemHref`) + línea de datos + `trailing:
  ReactNode`. Prop `size: "md" | "sm"` (30 px para la obra principal, 24 px para las filas de
  colección).
- **`FeedMiniList`** — filas compactas `etiqueta mono · texto (ellipsis) · valor`, con un máximo de
  `max` filas y una línea «+N más». La usan los episodios, los avances y los miembros del visionado
  conjunto.

Cada tarjeta existente (`review-card`, `milestone-card`, `joint-card`, `thought-card`,
`progress-timeline-card`, `collection-card`, `club-feed-card`) conserva su nombre y su despacho en
`feed-item.tsx` y se reescribe sobre estas piezas. `PostSummary` deja de usarse en estas tarjetas; se
conserva porque `ExperienceFeedCard` lo sigue usando.

## Tarjeta por tarjeta

| Tarjeta | Verbo de la cabecera | Título | Derecha | Contenido |
|---|---|---|---|---|
| Valoración/reseña de libro o peli | «terminó», «terminó y valoró», «reseñó» | obra; datos: tipo · autor/año · días · pág. | nota | extracto (si hay) |
| Valoración/fin de la **serie** | «terminó la serie», «valoró la serie», «reseñó la serie» | serie; datos: Serie · año | nota | extracto (si hay) |
| Episodios del día (post `watched`) | «valoró N episodios» si alguno tiene nota; si no, «vio un episodio» / «vio N episodios» | 1 episodio: «S2E3 · Título» con «de Loki» en los datos. Varios: la serie | 1 episodio: su nota | varios: mini-lista de hasta 3 (`S#E#` · título · nota o «—») y «+N más»; extracto de la reseña del episodio nombrado, si hay |
| Hito (empezó/abandonó) | «empezó», «abandonó» | obra; datos: tipo · autor · año · temporadas | «Añadir» si quien mira no la tiene y el hito no es suyo | fila de contexto actual (pase propio, seguidos que la llevan) |
| Visionado conjunto | «A y B vieron juntos» (avatares superpuestos en la cabecera) | obra; datos: tipo · año · «media del grupo» | media | mini-lista de miembros: avatar 16 px · nombre · extracto en una línea · nota |
| Avances | «avanzó en» | obra; datos: tipo · autor | último % (o S#E#) | mini-lista de pasos: cuándo · «p. 412» / S#E# / minutos · nota pública en una línea · % |
| Colección | «añadió N obras a su biblioteca» | — (la lista es el cuerpo) | — | filas `FeedWorkRow size="sm"` con «Añadir» / «La tienes» |
| Pensamiento | «pensó sobre» | ancla (obra, saga…); datos: tipo · autor | — | texto del pensamiento (con `SpoilerGate`) |
| Club | «propuso» (cabecera con el club) | título de la actividad; datos: propuesta por · participantes | chip del tipo de actividad | — |

Se van los chips «PENSAMIENTO», «AVANCES» y «COLECCIÓN»: el verbo ya lo dice, como se hizo con
«Reseña» en la PR #1227.

En las mini-listas, los avances legados sin post que hoy abren un hilo en línea
(`ReviewInteractions`) **no** se pintan dentro de la fila: la fila enlaza al post si lo hay, y el
hilo en línea del legado se mantiene debajo de la lista, como hoy.

## Datos

Solo cambia `getFeed` (`src/lib/social/feed.ts`), en el post `watched`:

- La consulta `dayWatches` sobre `episode_watches` añade `season_number, episode_number, rating` a
  su `select`. No hay consultas nuevas ni cambio de esquema. RLS no cambia: es el mismo cliente de
  la petición (lo que se ve de cada episodio es lo que el que mira puede ver del autor) y **no se
  cachea** (regla #437).
- `FeedEvent` gana `episodes?: { season: number; episode: number; title: string | null; rating:
  number | null }[] | null`: los episodios de ese autor, serie y día, ordenados por temporada y
  episodio, con el título de `titleByEpisode`. `episodeCount` se deriva de `episodes.length` y se
  conserva mientras alguna superficie lo lea.
- Un mismo episodio marcado dos veces el mismo día cuenta una vez (se deduplica por temporada y
  episodio; gana la fila con nota).
- El verbo de la cabecera sale de los datos en la tarjeta: `episodes.some(e => e.rating != null)`
  decide «valoró» frente a «vio». `verbForReviewable` no cambia (sigue decidiendo «reseñó»).

Textos nuevos en `messages/es.json` (namespace `feed`): los verbos por tipo de obra (`finished`,
`rated` y `reviewed` con variante de serie), `ratedEpisodes`/`watchedEpisodes` con plural,
`moreItems` («+{count} más») y `noRating` («—»). Los que dejen de usarse (`watchedEpisode`,
`review.moreEpisodes`, `kind.*` del feed) se borran.

## Entrega

Una spec, tres PRs, en este orden:

1. **Armazón + valoración/reseña + episodios.** `FeedCardShell`, `FeedWorkRow`, `FeedMiniList`;
   `ReviewCard` reescrita; datos de `episodes` en `feed.ts`. Arregla el problema que abrió esta
   spec.
2. **Hito, visionado conjunto, pensamiento.**
3. **Avances, colección, club.**

Cada PR deja el feed coherente por sí misma: lo que no ha migrado aún conserva su aspecto actual.

## Pruebas

- **Unitarias de `feed.ts`:** un post `watched` con 4 episodios del día devuelve `episodes`
  ordenado y con la nota de cada uno; un episodio duplicado el mismo día cuenta una vez; un post
  de un solo episodio devuelve una lista de 1.
- **Render de cada tarjeta** (adaptar `review-joint-cards.test.tsx`, `milestone-card.test.tsx` y
  añadir las que falten): verbo correcto por caso (serie, 1 episodio, varios con nota, varios sin
  nota); «+N más» con más de 3 episodios; sin icono de comentarios con `showInteractions=false`;
  sin nombre con `hideActor`.
- **e2e** (`feed-tarjetas-por-tipo`, `social-interaction-targets`, `thoughts`): adaptar los
  selectores a la nueva estructura y comprobar que el icono de comentarios lleva a `/post/[id]`.
- Verificación visual en el navegador (Inicio, perfil y `/post/[id]`) a ancho de móvil, en claro y
  en oscuro.

## Fuera de alcance

- **Experiencias** (`ExperienceFeedCard` → `ExperienceCard`): se abre una issue para pasarlas al
  patrón en otra spec.
- La forma del post (`posts.kind`) y la agrupación del feed no cambian: cada post sigue siendo una
  tarjeta (#731/#814).
- La consulta de `series_episodes` trae todos los episodios de cada serie para sacar unos pocos
  títulos; es una ineficiencia previa que no se toca aquí.
