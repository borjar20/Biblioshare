# Feed — Tarjetas por tipo de evento — Design Spec

**Fecha:** 2026-07-29

**Rama:** `feat/feed-tarjetas-por-tipo`, apilada sobre `feat/inicio-feed-agrupado`
(PR #300, aún sin fusionar) porque rediseña los componentes que aquella creó.
Rebase sobre `main` cuando #300 se fusione.

## Contexto

Segunda iteración del rediseño del Inicio. La primera
(`2026-07-29-inicio-feed-agrupado-interactivo-design.md`, ya en PR #300) entregó
el feed agrupado con reacción por ítem, quick-add y ancho PC. Esta itera **la
forma de las tarjetas**: en vez de una tarjeta genérica por evento, cada **verbo**
tiene su propio layout. Mockup: `D:\Proyectos\Personal\Mockups\Rediseño - Inicio (1).html`
(frame "Feed agrupado · Tarjetas por tipo", tres variantes A/B/C).

Principio del mockup: **las reacciones y comentarios son independientes por ítem,
por avance y por reseña — nunca del grupo.** (Ya lo cumplimos en #300 con targets
reales por fila.)

## Estado actual (lo que #300 dejó)

- `FeedEntry` = `person` | `person-group` | `club`. `FeedList` despacha
  `person-group` → `FeedGroupCard`, `person` → `FeedCard`, `club` → `ClubFeedCard`.
- `FeedGroupCard` pinta altas/avances agrupados con portadas horizontales + reacción
  por ítem (`ReviewInteractions` con target `pass`/`progress_session`).
- Agrupación (`group-feed-entries.ts`): `added` por actor+día, `progressed` por
  actor+obra+día. **Este spec cambia la de `progressed`** (ver D-B1).
- `FeedEvent` sirve: actor, `itemType/itemId/itemTitle/itemCoverUrl/itemSubtitle`
  (autor solo en libros), `rating`, `reviewExcerpt`, `episode`,
  `progress:{durationMinutes}`, `interactionTarget`, contadores.
  **NO** sirve la posición de la sesión ni el texto de nota de avance (privado).
- Esquema vivo (verificado en dev, 2026-07-29):
  - `progress_sessions(id, user_id, session_date, duration_minutes, position jsonb,
    note text, created_at, pass_id, started_at)`. `position` = punto ALCANZADO
    (`{page}` en libros, `{season,episode}` en series). `note` = copia PRIVADA.
  - `notes(id, user_id, item_type, item_id, pass_id, session_id, kind, body,
    position, is_favorite, meta, is_spoiler, is_public, parent_note_id, created_at)`.
    La nota **compartible** vive aquí, enlazada por `session_id`, con `is_public` y
    `is_spoiler`.
  - `books.total_pages integer` (nullable).
  - `passes` tiene `started_on`/`finished_on` (para "N días").

## Decisiones

### D-DISPATCH — despacho por VERBO, no por "agrupado"

`FeedList` deja de elegir componente por `source`. Un renderer elige por **verbo**
del evento (singleton y grupo comparten componente, con 1..N ítems/pasos):

- `added` (1..N) → **CollectionCard** (variante A).
- `progressed` (1..N, ventana por obra) → **ProgressTimelineCard** (variante B).
- `finished`/`rated`/`reviewed`/`watchedEpisode` → **ReviewCard** (variante C).
- club → `ClubFeedCard` (sin tocar).

Esto sustituye a `FeedCard`/`FeedGroupCard` por tres componentes por-tipo (más el
club). Se pueden borrar `FeedCard`/`FeedGroupCard` cuando los tres nuevos cubran
sus casos (singleton incluido).

### Variante A — Colección (`added`)

Lista **vertical** (no la fila de portadas actual). Por ítem: portada o **lomo
tipográfico** (fallback cuando no hay `itemCoverUrl`: título en Fraunces sobre
`surface-2`), título, **autor** (`itemSubtitle`), fila de reacción propia
(`ReviewInteractions` compacto, target `pass`) y `QuickAddButton`. Cabecera:
avatar + "{actor} añadió N títulos a su colección" + badge "Colección". Pie de
grupo (N≥2): "Guardar los N en mi cola" (`quickAddManyToLibrary`).
**Sin datos nuevos.** Copy neutral "títulos" (ya decidido en #300).

### Variante B — Avances (`progressed`), timeline

#### D-B1 — agrupación por obra + ventana

`group-feed-entries.ts`: la clave de `progressed` pasa de `actor+obra+día` a
**`actor+obra`**, agrupando las sesiones de esa obra dentro de una **ventana de 7
días** (constante `PROGRESS_WINDOW_DAYS = 7`). Sesiones fuera de la ventana quedan
en otra tarjeta. `added` **no cambia** (sigue actor+día). Igual que #300, el
colapso se hace sobre la página ya cortada; una obra con sesiones partidas entre
tandas de paginación reaparece como segundo grupo (límite conocido, issue —
familia de #295).

#### D-B2 — datos nuevos servidos al feed (variante B)

Ampliar `FeedEvent.progress` (o un campo hermano por-paso) para transportar, **por
sesión**:
- `position` (jsonb) → renderizar "pág. N" (libros) o "T·E" (series).
- `percent`: `round(position.page / books.total_pages * 100)` cuando ambos existen;
  si falta `total_pages` o no es libro, se omite el %.
- `note` pública: `body` de la fila de `notes` con `session_id = sesión.id` **y
  `is_public = true`**; si no hay fila pública, `null`. `is_spoiler` viaja junto al
  body para el render spoiler-safe (ver D-B3). **Nunca** se sirve
  `progress_sessions.note` (la copia privada) ni el body de una nota no pública.
  Batch: una consulta a `notes` por las `session_id` de la página (mismo patrón
  batch que el resto de `getFeed`).

Como el timeline agrupa por obra, `getFeed` debe servir los **pasos** (sesiones)
del grupo, cada uno con su `interactionTarget` (`progress_session`), su `position`,
su `percent`, su `note` pública y su `eventDate`/hora.

#### D-B3 — privacidad

- **Posición (pág/%) pasa a ser pública.** Solo se sirve para sesiones ya visibles
  por la RLS de `progress_sessions` (dueño, o perfil público / seguidor aceptado —
  la misma que ya deja al feed leerlas). Es una **decisión de privacidad nueva** →
  `decisiones.md` (append). No hay cambio de RLS: la fila ya es legible; solo se
  empieza a *servir* un campo que antes se ocultaba.
- **Nota** solo cuando su fila de `notes` es `is_public = true`. Esto por fin
  **honra `is_public`** en el feed (lo que `feed.ts` decía pendiente). Se sirve con
  `case when is_public then body else null end`-style para que una nota privada
  **nunca** viaje al cliente.
- **Spoiler**: si la nota pública es `is_spoiler`, el timeline la pinta tras un
  "Mostrar spoiler" (oculta por defecto, revela al pulsar). No se sirve distinto;
  el gate es de UI.

#### D-B4 — layout timeline

Vertical, más reciente arriba: nodo en un raíl + "Llegó a la pág. **N** · **P%**"
(o "T2·E5" en series) + nota pública opcional (o spoiler-gate) + reacción por paso
+ hora relativa. Cabecera: avatar + "{actor} avanzó en **{obra}**" + badge
"Avances".

### Variante C — Reseña (`finished`/`rated`/`reviewed`, y episodios)

#### D-C1 — un solo target (como hoy)

Se mantiene **un** `interactionTarget` (`diary_entry` = el pase; `episode_watch`
en episodios). El mockup dibuja dos filas (hito vs reseña); **se implementa una
sola** fila de reacción (decisión del usuario). Cero DB nueva.

#### D-C2 — layout y meta

Hero: portada/lomo + badge "Finalizado" + título + estrellas (`rating`) + meta
"autor · N días · N pág" + texto de reseña (`reviewExcerpt`) + una fila de reacción.
Badge "Reseña". Episodios: mismo layout, con "T·E · título" en vez de páginas.
Datos nuevos servidos: **días de lectura** (`finished_on − started_on`, si ambos)
y `total_pages`. Ambos best-effort: si faltan, se omite ese trozo de meta.

## Arquitectura

### Capa de datos (`src/lib/social/feed.ts` + `group-feed-entries.ts`)

- `group-feed-entries.ts`: nueva clave de `progressed` (obra + ventana 7 d);
  `PersonGroupEntry` para `progressed` transporta los **pasos ordenados**.
- `feed.ts`:
  - `progressed`: seleccionar también `position` de `progress_sessions`; resolver
    `percent` con `books.total_pages` (ya se hace fetch del catálogo — añadir
    `total_pages` al select de `books`); batch a `notes` por `session_id` para el
    body público + `is_spoiler`.
  - `finished/reviewed`: servir `started_on` (ya se tiene `finished_on`) para los
    días; `total_pages` del libro para las páginas.
  - Tipos de `FeedEvent`: `progress` gana `position`/`percent`/`note`/`noteSpoiler`;
    nuevo `readingDays`/`totalPages` (o un `reviewMeta`) para C.

### UI (`src/components/social/`)

- Nuevos: `collection-card.tsx` (A), `progress-timeline-card.tsx` (B),
  `review-card.tsx` (C). Un `feed-item.tsx` (o el propio `FeedList`) despacha por
  verbo. `spine-cover.tsx` reusable (lomo tipográfico de fallback) para A/B/C.
- Reusan `ReviewInteractions`, `QuickAddButton`, `UserAvatar`, `RatingDots`.
- Baja `FeedCard`/`FeedGroupCard` cuando los tres cubran singleton+grupo.
- Spoiler-gate: pequeño componente cliente que oculta el body hasta el clic.

### i18n

Nuevas claves (`i18n-keeper`): badges `feed.kind.collection/progress/review`;
`feed.progress.reachedPage` ("Llegó a la pág. {page}"), `feed.progress.percent`,
`feed.progress.showSpoiler`; `feed.review.finished`, `feed.review.metaDays`,
`feed.review.metaPages`. Solo `messages/es.json` (único locale).

## Manejo de errores / bordes

- Obra con avances partida entre tandas de paginación → segundo timeline (issue,
  familia #295).
- `total_pages` null → sin %; `position` sin `page` (series) → "T·E".
- Nota no pública o inexistente → paso sin nota.
- Nota pública + spoiler → gate de UI.
- Singleton `progressed` → timeline de 1 paso; singleton `added` → CollectionCard
  de 1 ítem (sin pie "Guardar los N").

## Testing

- **Unit**: nueva clave de agrupación `progressed` (obra + ventana; sesiones fuera
  de 7 d en otra tarjeta; `added` intacto). Resolución de `percent`
  (page/total_pages; null → sin %). Selección de nota (pública sí, privada no).
- **e2e**: render de las tres variantes; nota privada NO visible en el DOM; nota
  pública sí; spoiler oculto hasta el clic; posición/% visible; reacción por paso.
- **qa-verifier** si hay tooling; si no, e2e Playwright sustituye (como en #300).

## Cierre documental (AGENTS.md)

- `data-model.md`: nota de que el feed ahora sirve `progress_sessions.position` y
  el `notes.body` **público** (honra `is_public`); fecha de verificación.
- `decisiones.md` (append): (D-B1) `progressed` agrupa por obra+ventana; (D-B3) la
  posición de lectura pasa a ser pública en el feed y el feed honra `is_public` de
  `notes`; (D-C1) una sola reacción en la tarjeta de reseña.
- `backlog.md`: si hay ítem de "rediseño feed", marcar; si no, no inventar.

## Issues a abrir

- Obra con avances partida entre tandas de paginación (familia #295, específico de
  timeline por obra).
- Cualquier parcial/sospecha durante la implementación.

## Fuera de alcance (explícito)

- La doble reacción hito-vs-reseña del mockup (variante C) — descartada (D-C1).
- Servir la nota privada de `progress_sessions.note` — nunca.
- Cambiar la RLS de `progress_sessions`/`notes` — no hace falta (solo se sirven
  campos ya legibles, condicionados por `is_public`).
