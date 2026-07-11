# EPIC-05 Bloque C — Feed de actividad personal

Diseño para `E5.C1`–`E5.C3` de `docs/requirements/social-epic.md` (SD-1). Construido sobre
Bloque A (grafo social) y Bloque B (reacciones/comentarios), ambos ya en prod.

## 1. Alcance

Una pestaña "Siguiendo" en el home con la actividad reciente de los usuarios que sigues
(seguimiento aceptado): terminaste/valoraste/reseñaste un ítem, avanzaste en una sesión,
marcaste un episodio, o añadiste algo nuevo a tu biblioteca. Reacciones/comentarios inline
(reutilizando Bloque B) en los eventos que tienen una reseña o un episodio detrás. Filtro
por tipo de ítem y un toggle "solo reseñas".

**Fuera de alcance**: cualquier tabla nueva (SD-1 decide explícitamente on-read, "no
construir `activity_events` por si acaso"); un matriz completo de filtro por cada verbo
(solo el toggle "solo reseñas" en v1); infinite scroll (botón "Cargar más" en su lugar).

## 2. Modelo de datos y estrategia de query

Sin tablas nuevas. Un tipo normalizado agregando cuatro fuentes ya existentes:

```ts
type FeedVerb = "added" | "progressed" | "finished" | "rated" | "reviewed" | "watchedEpisode";

type FeedEvent = {
  id: string;                    // `${sourceTable}:${rowId}`
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  verb: FeedVerb;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  eventDate: string;              // clave de orden/cursor
  rating: number | null;
  reviewExcerpt: string | null;
  episode: { season: number; episode: number; title: string | null } | null;
  progress: { durationMinutes: number | null; note: string | null } | null;
  interactionTarget: { targetType: "diary_entry" | "episode_watch"; targetId: string } | null;
};
```

**Derivación del verbo** — "el más específico gana", aplicado simétricamente a las dos
fuentes con reseña/rating opcionales:
- `library_entries` (solo altas nuevas) → siempre `added`.
- `progress_sessions` → siempre `progressed`.
- `diary_entries` → `reviewed` si tiene `review`, si no `rated` si tiene `rating`, si no
  `finished`.
- `episode_watches` → `reviewed` si tiene `review`, si no `rated` si tiene `rating`, si no
  `watchedEpisode`.

**Elegibilidad de reacciones**: no se limita a los verbos `reviewed`/`watchedEpisode` —
**cualquier** evento con origen en `diary_entries` (`finished`/`rated`/`reviewed`) o
`episode_watches` (`watchedEpisode`/`rated`/`reviewed`) tiene una fila de target real y
gana `ReviewInteractions` inline, porque el modelo de target de Bloque B es por fila, no
por verbo. Solo `added` (`library_entries`) y `progressed` (`progress_sessions`) quedan sin
interacción inline (sin `target_kind` válido).

## 3. Dominio

**`src/lib/social/feed.ts`** — una función, `getFeed(supabase, viewerId, options?)` donde
`options: { cursor?: string; pageSize?: number; itemType?: ItemType; reviewsOnly?: boolean
}` (todos opcionales, `pageSize` por defecto 20). Los filtros `itemType`/`reviewsOnly` se
aplican como parte de las cuatro queries del paso 2 — ver §5 para el detalle exacto de
cómo se traducen a condiciones SQL por fuente:

1. Resuelve seguidos aceptados (`select followee_id from follows where follower_id =
   viewerId and status = 'accepted'`). Vacío → `{ events: [], nextCursor: null }`
   inmediato (alimenta el estado vacío).
2. Cuatro queries en paralelo, cada una `user_id IN (seguidos)`, filtrada por cursor
   (`< cursor` sobre su propia columna de fecha) y `ORDER BY <fecha> DESC LIMIT pageSize`:
   - `library_entries` (`created_at`) → `added`
   - `progress_sessions` (`session_date`) → `progressed`, join a `library_entries` para
     `item_type`/`item_id`
   - `diary_entries` (`finished_on`) → verbo escalonado, join a `library_entries`
   - `episode_watches` (`watched_on`) → verbo escalonado, ítem siempre `series`
     (`series_id` directo, sin join)
3. Merge-sort de los cuatro arrays normalizados por `eventDate` descendente, corta a
   `pageSize`. `nextCursor` = la fecha más antigua de la página resultante, o `null` si
   ninguna de las cuatro queries del paso 2 devolvió `pageSize` filas **en su fetch bruto**
   (es decir, todas las fuentes se agotaron antes del merge/corte del paso 3) — chequeo
   estándar de paginación multi-fuente. Importante: esta comprobación se hace sobre el
   recuento crudo de cada query del paso 2, no sobre cuántas filas de cada fuente
   sobrevivieron el corte a `pageSize` del paso 3 (una fuente puede haber devuelto una
   página llena y aun así perder casi todas sus filas en el merge si las otras fuentes
   tenían eventos más recientes).
4. Resolución batch: identidades de actor (`profile_identities`, una query), ítems de
   catálogo (`books`/`movies`/`series` agrupados por tipo, reutilizando el patrón ya
   inline en `get-library-items.ts`), y resúmenes de interacción (`getInteractionSummary`
   de Bloque B, una llamada por target type — ids `diary_entry` de los eventos de esa
   página, ids `episode_watch` de los eventos de esa página).
5. Ensambla y devuelve `FeedEvent[]` + `nextCursor`.

Página de 20 eventos, "Cargar más" (no infinite scroll).

## 4. UI y ubicación

El home (`src/app/page.tsx`) gana un tab switcher cliente (`HomeTabs`, componente nuevo,
mismo mecanismo `?tab=` ya construido para `item-detail-tabs.tsx` en Bloque B — slots/tabs
distintos, mecánica idéntica). Dos pestañas: **Panel** (dashboard actual, por defecto, sin
`?tab=`) y **Siguiendo** (`?tab=following`).

**`FeedCard`** — un componente, cambia de forma según `verb`:
- `added`/`progressed`: fila compacta — avatar, nombre, texto del verbo, portada +
  título del ítem (enlaza a la ficha), fecha. Sin fila de interacción (sin target válido).
  `progressed` añade duración/nota si existen.
- `finished`/`rated`/`reviewed`/`watchedEpisode`: misma cabecera, más puntos de rating si
  existen, más extracto de reseña si existe (truncado, mismo estilo que `CommunityReview`),
  más `ReviewInteractions` embebido (reutilizado literal de Bloque B, mismas props, mismas
  server actions) — siempre tienen `interactionTarget` válido.

**`FeedList`** (cliente, mantiene cursor + eventos acumulados): renderiza `FeedCard` por
evento; botón "Cargar más" al pie llama a un wrapper de server action sobre `getFeed` con
el cursor actual, añade resultados. Estado vacío (sin seguidos, o seguidos sin actividad):
mensaje + CTA a `/usuarios` (descubrimiento, ya existente per E5.A5).

## 5. Filtros (E5.C3)

**Decisión revisada durante la planificación de implementación**: filtros **server-side**
vía query params, no predicados cliente — `library-filters.tsx` (7.12) ya establece este
patrón (`<Link>` con query params, refetch completo por cambio de filtro) y es más
consistente seguirlo que introducir un segundo patrón de filtrado en el mismo código base.
Esto también elimina de raíz la aspereza de UX que tenía la versión cliente-side (el
"Cargar más" podía tardar en mostrar resultados bajo un filtro activo porque agotaba el
buffer sin refrescar del servidor) — con filtros server-side cada cambio es un refetch
limpio, igual que en la página de biblioteca hoy.

`getFeed(supabase, viewerId, { cursor?, pageSize, itemType?, reviewsOnly? })` aplica los
filtros como parte de las cuatro queries del §3:
- **Por tipo de ítem** (`itemType`): añade `.eq("item_type", itemType)` en la query de
  `library_entries` (directo) y, para `diary_entries`/`progress_sessions` (que llegan a
  `item_type` vía el join a `library_entries`), filtra tras el join — o, más simple y
  barato, primero resuelve el subconjunto de `library_entries.id` que cumple el
  `item_type` pedido (una query extra sobre `library_entries` con `user_id IN (seguidos)
  AND item_type = X`) y usa esos ids para acotar `diary_entries.library_entry_id`/
  `progress_sessions.library_entry_id` vía `.in(...)`. `episode_watches` no necesita este
  filtro (siempre es `series`; si `itemType` es `book`/`movie`, la query de episodios se
  omite directamente).
- **Toggle "Solo reseñas"** (`reviewsOnly`): cuando está activo, las queries de
  `library_entries` y `progress_sessions` se omiten por completo (esos verbos nunca son
  `reviewed`), y `diary_entries`/`episode_watches` añaden `.not("review", "is", null")`.
- **Por tipo de ítem** UI: chips Todos/Libro/Película/Serie (mismo patrón visual que
  `library-filters.tsx`, componente server con `<Link>` construyendo el query string).
- **Toggle "Solo reseñas"** UI: mismo estilo de pill/chip, alterna `?reviewsOnly=1` en la
  URL.

Cambiar cualquier filtro resetea el cursor/buffer de la pestaña Siguiendo (nueva
navegación completa a `?tab=following&itemType=...&reviewsOnly=...`, sin estado
acumulado previo que arrastrar) — consistente con cómo cualquier cambio de filtro en la
biblioteca también empieza una lista nueva.

## 6. i18n

Namespace `feed` nuevo: label de pestaña, una cadena por verbo (`added`/`progressed`/
`finished`/`rated`/`reviewed`/`watchedEpisode`), copy de estado vacío, "Cargar más",
labels de filtro. El contenido de rating/reseña/episodio reutiliza claves existentes de
`detail`/`social` donde aplica (puntos de rating, texto de reseña) en vez de duplicarlas.

## 7. Testing y despliegue

Sin migración → sin batería de impersonación RLS (la query del feed se apoya
completamente en la RLS ya verificada de las cuatro tablas fuente vía `can_view_profile`/
`can_view_target`, tal como establece SD-1: el feed no necesita lógica de visibilidad
propia). Verificación: `tsc`/`eslint` limpios, más E2E manual en navegador — como viewer
siguiendo a 1-2 usuarios con actividad variada (un terminado, un rating, una reseña, una
sesión de progreso, un alta nueva en biblioteca, un episodio marcado), confirmar que el
feed muestra la tarjeta/verbo correcto por evento, que las reacciones funcionan inline,
que "Cargar más" pagina correctamente, que los filtros acotan la vista, y que el estado
vacío se renderiza para una cuenta nueva sin seguir a nadie.
