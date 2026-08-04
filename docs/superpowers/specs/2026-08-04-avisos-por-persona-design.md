---
title: Avisos por persona (notificaciones de los eventos de un usuario que sigues)
date: 2026-08-04
status: design
epic: EPIC-05 (social)
---

# Avisos por persona

## Qué resuelve

Hoy, cuando alguien a quien sigues termina un libro, registra una sesión o ve
un episodio, **no recibes nada**: el feed es on-read (sin filas de evento) y
`notify()` solo salta en interacciones directas (seguir, reaccionar, comentar).

Se quiere poder **activar una campana sobre una persona concreta** para recibir
notificación in-app + push de **sus eventos**, eligiendo **por persona** qué
tipos de evento avisan.

## Decisiones tomadas

- **Requiere seguir.** La campana solo aparece cuando la relación está
  `accepted`. Reutiliza `follows`; cero tablas nuevas.
- **Elección por persona.** Un set de categorías por relación, no una
  preferencia global.
- **Cuatro categorías:** `finished`, `session`, `episode`, `added`.
  `added` se ofrece **con un aviso** en la propia campana (una alta manual
  múltiple puede llegar en ráfaga; el import masivo NO avisa, ver más abajo).
- **Escritura por service-role.** La RLS de `follows` solo deja al *followee*
  hacer UPDATE (aceptar solicitudes); dar UPDATE al *follower* reabriría el
  agujero de privacidad que `20260711_social_follows.sql` blinda a propósito
  (auto-aceptarse en un perfil privado). El interruptor escribe por
  service-role desde la acción — el patrón que ya usan `notify()` y Storage.

## Modelo de datos

Una columna en `follows`:

```sql
alter table public.follows
  add column notify_events text[] not null default '{}';
```

- Vacío `{}` = campana apagada. Con ≥1 categoría = encendida.
- Valores permitidos: `finished`, `session`, `episode`, `added`. La validación
  vive en la app (server action), no como CHECK/enum — mantiene la columna
  flexible y evita otra migración por categoría futura.
- **Sin índice** de entrada (volúmenes minúsculos). Si el fan-out se midiera
  lento, un GIN sobre `notify_events` es la vía; no antes.

`notification_type` gana cuatro valores (dirección "ampliar", la inofensiva —
el bundle viejo no los conoce y no rompe nada):

```sql
alter type public.notification_type add value 'followed_finished';
alter type public.notification_type add value 'followed_session';
alter type public.notification_type add value 'followed_episode';
alter type public.notification_type add value 'followed_added';
```

(Migración aparte de cualquier uso: un valor de enum recién añadido no se puede
usar en la misma transacción.)

## Mapeo evento → tipo → target

Todos los `target_type` reutilizan la resolución de href que ya existe en
`resolveTargetHrefs()` (notifications.ts) — **cero código de enlace nuevo**.
`diary_entry` lee `passes` por id; `episode_watch` lee `episode_watches`. Ambos
enlazan a la pestaña Comunidad de la ficha.

| Categoría  | Tipo notif.         | target_type    | target_id          | Sitio de enganche (acción)         |
|------------|---------------------|----------------|--------------------|------------------------------------|
| `finished` | `followed_finished` | `diary_entry`  | `passId`           | `closePass` (passes/actions)       |
| `session`  | `followed_session`  | `diary_entry`  | pass de la sesión  | `addSession` (sessions/actions)    |
| `episode`  | `followed_episode`  | `episode_watch`| `episodeWatchId`   | `markEpisodeWatched` (episode-actions) |
| `added`    | `followed_added`    | `diary_entry`  | `passId` creado    | acciones de alta (ver abajo)       |

El texto de la campana es genérico ("{name} terminó una obra"), sin nombrar el
ítem — el href te lleva allí. Mismo patrón que `club_post`, etc. Enriquecer el
copy con el título es trabajo futuro, no v1.

## Fan-out

Helper nuevo en `src/lib/social/notifications.ts` (mismo contrato best-effort
que `notify()`: nunca lanza):

```ts
notifyFollowersOfEvent(
  supabase,
  actorId: string,
  category: NotifyCategory,
  target: { type: NotificationType; targetType: ReviewTargetType; targetId: string },
): Promise<void>
```

1. Lee por **service-role** los seguidores suscritos:
   `follows` con `followee_id = actorId`, `status = 'accepted'`,
   `category = any(notify_events)` → `follower_id[]`.
   (Service-role para no acoplar esto a la RLS y no exponer `notify_events` por
   el cliente del actor.)
2. Si la lista está vacía, return.
3. `notifyMany(supabase, { userIds, actorId, type, targetType, targetId })` —
   que ya trae dedup, filtrado de bloqueos, inserción in-app en lote y push en
   lote. No reimplementamos nada de eso.

## Enganches (best-effort, tras la escritura real)

Cada uno se llama **después** de que la fila del evento se escribe con éxito;
un fallo del aviso no revierte la acción real (mismo espíritu que
`notifyPublicReviewMentions`).

- **`finished`** → en `closePass`, tras `savePassFields` OK. **Solo en
  `closePass`, NUNCA en `updatePass`** (editar un pase cerrado no debe
  re-notificar — calca la regla que ya usan las menciones).
- **`session`** → en `addSession`, tras insertar la fila de `progress_sessions`.
- **`episode`** → en `markEpisodeWatched` (episode-actions), tras insertar el
  `episode_watch`.
- **`added`** → en las acciones de alta interactiva, cuando se crea un pase
  nuevo. Requiere saber si `applyTransition` **insertó** un pase:
  se añade `created: boolean` a la variante `done` de `TransitionOutcome`
  (`true` en las ramas createActive/archiveAndCreate, `false` en
  updateActive/none). Las acciones de alta (`addToLibrary`, alta manual,
  add-existing, quick-add de un ítem) disparan `added` cuando `outcome.created`.

### Por qué `added` no es la tormenta que parece

El **import masivo NO pasa por estas acciones**: `commit-row.ts` inserta en
`passes` directamente (`supabase.from("passes").insert(...)`), sin
`applyTransition`. Así que un import de 126 títulos **no dispara ni un aviso**.
El residual (una persona añadiendo varias obras a mano en un rato) es lo que
cubre el aviso de la campana. El quick-add en lote (`addMany`) queda **fuera**
del enganche por el mismo motivo (evitar ráfagas auto-infligidas): solo se
engancha el alta de un ítem.

## Interruptor (escritura)

Server action nueva `setFollowNotify(targetUserId, categories: NotifyCategory[])`:

1. Usuario autenticado (si no, no-op/redirect).
2. Verifica que existe follow `accepted` (`follower_id = me`,
   `followee_id = target`) — lectura con el cliente de usuario (la RLS deja al
   follower leer su propia fila).
3. Valida `categories` contra el set permitido; descarta lo desconocido.
4. Escribe `notify_events = categories` por **service-role**
   (`follower_id = me`, `followee_id = target`).
5. `revalidatePath('/u/[username]')` para que el perfil repinte el estado.

`NOTIFY_CATEGORIES` (el set permitido) vive junto a la action, importable por la
UI y por el fan-out.

## Interruptor (lectura del estado inicial)

`getFollowNotify(supabase, viewerId, targetUserId): Promise<NotifyCategory[]>`
en `follows.ts` — lee `notify_events` de la propia fila (RLS del follower).
El perfil (`/u/[username]/page.tsx`) ya resuelve `getFollowState`; añade esta
lectura solo cuando el estado es `accepted`.

## UI

`NotifyBell` (client) junto a `FollowButton`, **visible solo si
`followState === 'accepted'`**:

- Botón campana: rellena si `notify_events.length > 0`, contorno si vacío.
- Abre un popover/menú (primitivas de `components/ui`) con **un checkbox por
  categoría**. La fila de `added` lleva una línea de aviso ("puede llegar en
  ráfagas si añades muchas obras seguidas").
- Al cambiar → `setFollowNotify(targetUserId, nextCategories)`, optimista con
  `useOptimisticAction` (mismo patrón que `FollowButton`), revierte en error.

## i18n

`messages/es.json` (solo `es`):
- `notifications.followedFinished/followedSession/followedEpisode/followedAdded`
  → "{name} terminó una obra" / "…registró una sesión" / "…vio un episodio" /
  "…añadió algo a su biblioteca".
- `social.*` → etiqueta de la campana, títulos del menú, nombres de categoría y
  el aviso de `added`.

## Fuera de alcance (v1)

- Enriquecer el copy con el título del ítem.
- Agrupación / anti-ráfaga de avisos (coalescer un burst en un solo aviso).
- Cubrir quick-add en lote y el import como fuentes de `added`.
- Índice GIN sobre `notify_events` (hasta que una medición lo pida).

## Sincronización de doc al cerrar (AGENTS.md «hecho»)

- `docs/requirements/data-model.md`: columna `follows.notify_events` + 4 valores
  nuevos de `notification_type`, con fecha de verificación.
- `docs/requirements/backlog.md`: marcar la casilla de la feature.
- `docs/requirements/decisiones.md`: append — "avisos por persona sobre
  `follows` (no tabla nueva), escritura por service-role por la RLS de follows".
- Regenerar `database.types.ts`.
