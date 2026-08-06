# Diseño — «Pensamiento»: post manual anclado a una entidad

- **Fecha:** 2026-08-06
- **Estado:** diseño aprobado en brainstorming, pendiente de plan de implementación
- **Origen:** petición del dueño + mockup `templates/post-thought/PostThought.dc.html`
  (proyecto Claude Design `7502da71-…`)
- **Área:** `area:social`

## 1. Objetivo

Añadir un **tipo de publicación manual** al feed: un **Pensamiento** es un texto libre
**anclado a una entidad** (un título, una saga o una persona), pensado para **abrir hilos
sobre esa entidad sin tener que reseñarla ni tener progreso registrado**.

Es el **primer contenido autoral** del feed personal. Hoy `getFeed` es un *fan-out on-read*
puro: toda tarjeta se DERIVA de una acción previa del usuario (alta de pase, sesión,
terminado, episodio, actividad de club). No existe ninguna tabla de «posts». Un Pensamiento
existe solo porque alguien lo escribió, así que introduce una **fuente nueva y real**.

El patrón más cercano que ya existe es `club_activities`: una tabla autoral con `created_at`
que ya se enchufa al feed y al sistema de interacciones. Copiamos esa forma.

## 2. Decisiones tomadas (brainstorming)

1. **El ancla es obligatoria pero polimórfica.** Un pensamiento va SIEMPRE sobre algo, y ese
   algo puede ser un **item de catálogo** (`book`/`movie`/`series`), una **saga** o una
   **persona** (autoría/dirección/reparto — todas viven ya en `/persona/[id]`, tabla `people`).
   → cinco `anchor_type`: `book | movie | series | saga | person`, todos con fila e `id`
   estables y ficha de detalle existente.
2. **Alcance v1 = mockup completo.** Entran los cuatro extras: blur de spoiler (post),
   formato markdown-lite, paleta de 4 emojis y reacciones en comentarios.
3. **Paleta de 4 emojis = en TODO el feed** (no solo en Pensamientos). Es un cambio de
   producto propio sobre la capa de interacciones compartida.
4. **Compositor = acción dedicada** (botón que abre el compositor en modal/hoja), no una caja
   siempre visible en la cabecera del feed.
5. **Autocompletado del ancla:** items desde *tu biblioteca* (tus pases); sagas y personas
   por búsqueda *global* del catálogo (conjuntos pequeños, «las sagas de mi biblioteca» es
   difuso). Revisable si molesta.

## 3. Modelo de datos

### 3.1 Tabla `thoughts`

```
thoughts
  id            uuid primary key default gen_random_uuid()
  user_id       uuid not null references auth.users(id) on delete cascade
  anchor_type   thought_anchor_type not null      -- enum: book|movie|series|saga|person
  anchor_id     uuid not null                     -- polimórfico: sin FK única
  body          text not null check (char_length(body) <= 2000 and char_length(btrim(body)) > 0)
  is_spoiler    boolean not null default false
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()  -- trigger set_updated_at
```

- **`anchor_id` no lleva FK SQL**: apunta a cinco tablas distintas (`books`/`movies`/`series`/
  `sagas`/`people`). La integridad se garantiza **en la server action** (`createThought`
  resuelve la fila del ancla antes del insert y rechaza si no existe). Es la misma renuncia
  pragmática que ya vive `saga_items`. Coste asumido: si se borra la entidad ancla, el
  pensamiento queda colgado → el loader lo trata como «ancla no resoluble» y lo descarta del
  feed (mismo criterio que un evento sin catálogo en `getFeed`).
- Índices: `thoughts_user_id_created_at_idx` (feed por autor / paginación) y
  `thoughts_anchor_idx (anchor_type, anchor_id)` (para «pensamientos sobre esta entidad»,
  aunque su superficie llegue después).
- **Grants por columna (#375):** al crear la tabla, otorgar los grants finos que exige el
  patrón del repo; correr la **superficie 6 de `docs/DRIFT-CHECK.md`**. Una columna sin grant
  rompe la escritura ENTERA de la tabla, compila y revienta en prod.

### 3.2 `interaction_targets`: nueva clase `thought`

Para que un Pensamiento reciba reacciones y comentarios como cualquier otro target:

- Añadir el valor `thought` al enum de `interaction_targets.kind` (hoy 8 clases → 9).
- Trigger resolutor (espejo de los existentes `trg_*_resolve_interaction_target`): al insertar
  un `thought`, materializa su fila en `interaction_targets` con `owner_id = user_id`,
  `commentable = true`, `reactable = true`, y los `*_notification_type` correspondientes.
- Nuevos valores de notificación si hacen falta (`thought_comment`, `thought_reaction`) en los
  enums `comment_notification_type` / `reaction_notification_type`, o reutilizar los genéricos
  existentes si el copy no los distingue.

### 3.3 RLS

- `select`: visible para el dueño y para quien pueda ver su perfil — misma política
  «seguidor aceptado / perfil público» (`can_view_profile`) que ya filtran las fuentes del
  feed. La RLS de la fuente resuelve la visibilidad; el feed solo filtra por seguidos.
- `insert`/`update`/`delete`: solo el dueño (`user_id = auth.uid()`), con el bloqueo
  bidireccional que ya comparten `reactions`/`comments`.

## 4. Integración en el feed (6ª fuente)

`thoughts` se añade como **sexta fuente** del fan-out de `getFeed` y como sexta entrada de
`FEED_SOURCE_COLUMNS` en `feed-order.ts`.

- **Es la forma más simple de fuente:** `created_at` es a la vez la columna de orden y el
  timestamp de registro (`kind: "timestamptz"`, igual que `added` y `clubs`). No hay
  backdating ni columna date-only, así que no arrastra ninguna de las trampas de
  `finished_on`/`watched_on`.
- `eventIdPrefix: "thoughts:"`.
- Nuevo `FeedVerb: "thought"` y nueva **variante de tarjeta**.
- El ancla (título/portada o nombre/foto + href) se resuelve en el **mismo batch por tipo** que
  el feed ya hace para el catálogo, extendido con `sagas` y `people`. Cada tipo aporta:
  `book/movie/series` → título + `cover_url`; `saga` → nombre + portada; `person` → nombre +
  foto/avatar + iniciales de fallback.
- `interactionTarget: { targetType: "thought", targetId: thoughts.id }` → hilo y reacciones por
  la vía estándar de Bloque B.
- El Pensamiento **es** un evento de persona (no de club): entra en el feed de Inicio y en la
  pestaña Actividad del perfil (`actorId`). A diferencia de las altas, **no** se suprime en el
  feed propio: es contenido que el usuario eligió publicar.

## 5. Compositor (`createThought`)

Acción dedicada (botón) que abre el compositor en modal/hoja. Contenido:

1. **Selector de ancla** con autocompletado (§2.5). Un único buscador que devuelve resultados
   de los cinco tipos (items desde biblioteca; sagas y personas global), cada resultado con su
   miniatura y subtítulo (autor para libros, rol para personas si aplica). Al elegir → chip del
   ancla con ✕ para cambiarla. **No se puede publicar sin ancla.**
2. **Textarea** (≤2000, contador).
3. **Barra markdown-lite:** `**negrita**`, `*cursiva*`, `- lista`. Toggle **spoiler**.
4. **Publicar.**

`createThought(input)` es una **server action que devuelve un resultado discriminado**
(`{ ok: true, id } | { ok: false, error }`), NUNCA lanza para errores esperables — Next.js
borra el `.message` de los `Error` en prod (trampa registrada). Valida: ancla existe y es
resoluble, body no vacío ≤2000. Tras publicar: `revalidateFeed` + cierre del modal + la tarjeta
aparece arriba (UI optimista reconciliada, patrón `useOptimisticAction` ya en el repo).

## 6. Tarjeta e hilo

- Cabecera: avatar + «**{autor}** compartió un pensamiento» + píldora dorada «Pensamiento».
- **Chip del ancla** (portada/foto + título/nombre) enlazado a su ficha (`/libro`, `/pelicula`,
  `/serie`, `/saga/[id]`, `/persona/[id]` — vía el helper `item-href.ts` extendido).
- **Spoiler:** si `is_spoiler` y no revelado → cuerpo con blur + botón «Ver spoiler» (reutiliza
  el patrón `is_spoiler` de notas).
- **Cuerpo:** render markdown-lite (negrita/cursiva/listas) + `@menciones` resueltas con
  `resolveKnownMentions` + `MentionText` (ya existentes). El parser es un módulo puro con tests
  (mismos tokens que el mockup: `**`, `*`, `@`, `- `).
- **Pie + hilo:** reacciones (paleta §7) + comentarios (máquina estándar de `comments`), con
  compositor de comentario inline. Cada comentario: menciones, blur de spoiler y **paleta de
  reacciones** propia.

## 7. Reacciones multi-emoji (capa compartida, app-wide)

Hoy `toggleReaction(interactionTargetId)` **fija `kind:"like"`** y toda tarjeta pinta un solo
♡. El esquema YA está preparado para varias reacciones: `reactions` es única por
`(interaction_target_id, user_id, kind)` — **no hace falta migración de datos**. Las filas
actuales (`kind:"like"`) siguen siendo la reacción ♡.

Cuatro kinds (del mockup): `like` (♡), `read` (📖), `shock` (😱), `fire` (🔥). `like` se
conserva tal cual por compatibilidad.

**Cambios en la capa compartida (blast radius real — ~10 componentes de tarjeta + módulos):**

- `toggleReaction(interactionTargetId, kind)` — nuevo parámetro `kind` (default `"like"` para
  no romper llamadas existentes durante la migración).
- `InteractionSummary`: pasa de `{ reactionCount, viewerReacted }` a un **desglose por kind**
  (`reactionsByKind: Record<Kind, { count; viewerReacted }>`), conservando `reactionCount`
  total y `viewerReacted` (= algún kind activo) como derivados para no reescribir todos los
  consumidores de golpe.
- `getInteractionSummary` agrupa por kind.
- `interaction-optimistic.ts` + sus tests: la reconciliación optimista opera por kind.
- **Consumidores a migrar a la paleta** (todos renderizan reacciones hoy):
  `review-card`, `review-interactions`, `progress-timeline-card`, `episode-ratings-card`,
  `collection-card`, `community-panel`, `club-post-card`, `activity-chat`, `checkpoint-chat`,
  `round-block`, y el hilo de comentarios. Se sustituye el botón ♡ único por el componente de
  paleta reutilizable `<ReactionBar>`.
- **Notificaciones:** el dedupe actual es `reaction:${target}:${user}`. Se mantiene **una
  notificación por (target, usuario)** con independencia del emoji (reaccionar es un evento
  social; cambiar de emoji no re-notifica). Documentar la decisión.

> Riesgo: es la superficie con más regresión potencial del proyecto. Se implementa como
> **fase propia y primera**, con la capa compartida verde (tests de `interactions`,
> `interaction-actions`, `interaction-optimistic`) antes de tocar la UI de Pensamientos.

## 8. Fuera de alcance v1 (→ issues)

- «Pensamientos sobre esta entidad» agregados en la ficha del item/saga/persona (el índice
  `thoughts_anchor_idx` lo deja preparado, pero la superficie de lectura llega después).
- Edición/borrado de un Pensamiento publicado desde la tarjeta (más allá de la RLS que ya lo
  permite) — decidir UX aparte.
- Adjuntar más de una entidad a un mismo pensamiento (v1 = una ancla).

## 9. Testing

- **Puro/unitario (Vitest):** parser markdown-lite (`**`/`*`/`@`/`- `, casos límite anidados y
  sin cierre); `feed-order` con la 6ª fuente (cursor, empates cruzados, espejo SQL); resolución
  de ancla por tipo; multi-kind en `interactions`/`interaction-optimistic`.
- **Regla de test que sí protege:** provocar el fallo y ver el test rojo antes de darlo por
  bueno (registrada en memoria/AGENTS).
- **E2E (Playwright, contra build de prod):** publicar un pensamiento anclado a cada tipo de
  entidad → aparece en el feed con su chip; blur de spoiler revela; comentar y reaccionar con
  cada emoji; el hilo persiste. El e2e crea sus propios datos desechables (patrón del club
  desechable de rondas).
- **Advisors de seguridad** tras la migración (RLS de `thoughts`, grants por columna).

## 10. Definición de «hecho» (checklist de cierre)

- `docs/requirements/data-model.md` actualizado (tabla `thoughts`, clase `thought` de
  `interaction_targets`, kinds de `reactions`) + fecha de verificación.
- Superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) corrida.
- Casilla marcada en `docs/requirements/backlog.md`; decisión de forma (paleta app-wide,
  ancla polimórfica sin FK) al final de `docs/requirements/decisiones.md` (append-only).
- Migración **dev primero, prod después**; verificación contra `pg_proc`/`pg_class`, no el
  ledger.
- Pendientes/limitaciones (§8) abiertos como **issues** con sus tres etiquetas.

## 11. Fases de implementación (detalle → plan)

1. **Reacciones multi-emoji (capa compartida, app-wide).** Primero y aislado; capa verde.
2. **Esquema:** migración `thoughts` + enum `thought_anchor_type` + clase `thought` de
   `interaction_targets` + trigger resolutor + RLS + grants (dev).
3. **Feed:** 6ª fuente en `feed.ts` + `feed-order.ts` + resolución de ancla + variante de
   tarjeta.
4. **Compositor + `createThought`** (acción dedicada, selector de ancla, markdown-lite, spoiler).
5. **Tarjeta e hilo** (render, chip de ancla, spoiler, menciones, paleta, comentarios).
6. **Tests** (unitarios + e2e) y **cierre documental**.
