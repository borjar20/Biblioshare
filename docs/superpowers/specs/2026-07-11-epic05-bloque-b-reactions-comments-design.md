# EPIC-05 Bloque B — Reacciones y comentarios en reseñas

Diseño para `E5.B1`–`E5.B4` de `docs/requirements/social-epic.md` (SD-3). Construido sobre
Bloques A (grafo social, `can_view_profile`) y D (notificaciones), ambos ya en prod.

## 1. Alcance

Permitir reaccionar ("me gusta") y comentar en hilo plano las reseñas existentes —
`diary_entries.review` (libros/películas/series) y `episode_watches.review` (episodios de
serie) — sin mover las reseñas de donde ya viven. Notificar al autor de la reseña cuando
alguien reacciona o comenta.

**Fuera de alcance de este documento**: Web Push para las notificaciones (todas, no solo
las nuevas de este bloque) — es un diseño independiente, a brainstormear después de este.
Tampoco entra edición de comentarios, ni que el autor de la reseña pueda borrar comentarios
ajenos (queda para E5.J, moderación).

## 2. Modelo de datos y RLS

```sql
create type public.target_kind as enum ('diary_entry', 'episode_watch');

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, kind)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
```

`target_kind` solo declara los dos valores reales hoy (`diary_entry`, `episode_watch`) — no
se pre-declaran `club_post`/`comment` (Bloque F/H1 aún no existen); se añaden con
`ALTER TYPE ... ADD VALUE` en su propia migración cuando esos bloques arranquen.

Helper `SECURITY DEFINER` que resuelve el dueño a través del target polimórfico, mismo
patrón que `can_view_profile`/`is_club_member`:

```sql
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
  end;
$$;
```

RLS en ambas tablas:
- **SELECT**: `can_view_target(target_type, target_id)`.
- **INSERT**: `can_view_target(...)` Y `user_id`/`author_id = auth.uid()`.
- **DELETE**: solo la fila propia (`user_id`/`author_id = auth.uid()`) — sin override del
  dueño del contenido (decisión explícita de este diseño, difiere de la nota original de
  SD-3; el override queda para E5.J).

No hay `UPDATE` policy — no se permite editar comentarios (decisión explícita: crear +
borrar únicamente, tono "Reddit-lite").

## 3. Dominio y capa de servidor

Sigue el patrón lectura/escritura ya establecido (`follows.ts`+`actions.ts`,
`notifications.ts`+`notification-actions.ts`):

- **`src/lib/social/interactions.ts`** (lectura): `getInteractionSummary(supabase, targets)`
  — dos queries batch (`reactions`/`comments` con `target_id IN (...)`), agrupadas en un mapa
  `${target_type}:${target_id}` → `{ reactionCount, viewerReacted, commentCount, comments }`.
  Comentarios acotados a los últimos 20 por target (hilo esperado corto; sin paginación en
  este MVP).
- **`src/lib/social/interaction-actions.ts`** (`"use server"`): `toggleReaction(targetType,
  targetId)` (borra si existe, si no inserta; `revalidatePath` de la página actual),
  `addComment(targetType, targetId, body)`, `deleteComment(commentId)`.

**Nota de nombres**: difiere del boceto original del backlog (`reactions.ts` +
`comments.ts` separados) — se unifican en un único par lectura/escritura porque todo call
site necesita ambos tipos de interacción a la vez. `social-epic.md` E5.B2 se actualiza para
reflejar este nombre real tras la implementación.

`get-community.ts` y `get-episode-reviews.ts` llaman a `getInteractionSummary` con sus IDs de
fila como targets y fusionan el resultado en `CommunityReview`/`EpisodeReview` antes de
devolver — `CommunityPanel` solo consume los campos ya enriquecidos, sin fetching propio.

## 4. UI y deep-linking

**`ReviewInteractions`** (`"use client"`, `useTransition`, mismo patrón que `FollowButton`:
el estado se deriva de las props revalidadas por el servidor, sin estado optimista local),
renderizado al pie de cada `<article>` de reseña en `CommunityPanel`:
- Botón "me gusta": icono + contador, llama a `toggleReaction`.
- Toggle "N comentarios": expande/colapsa una lista de comentarios ya prefetcheada +
  textarea + botón de envío (`addComment`); cada comentario propio tiene un botón de borrar
  (`deleteComment`). Viewer no logueado ve los contadores pero los controles se sustituyen
  por un enlace a `/login` (mismo patrón que `FollowButton` con `!viewerLoggedIn`).

**Deep-linking**: `item-detail-tabs.tsx` pasa de `useState` puro a leer un tab inicial desde
la URL:

```tsx
const searchParams = useSearchParams();
const initialTab = (searchParams.get("tab") as TabId) ?? "info";
const [tab, setTab] = useState<TabId>(initialTab);
```

y cada clic de pestaña actualiza la URL vía `router.replace` (shallow, sin scroll-jump). Sin
`?tab=` en la URL, el comportamiento por defecto (`"info"`) no cambia respecto a hoy.

## 5. Enganche de notificaciones (E5.B4)

- Nuevos valores del enum `notification_type`: `review_liked`, `review_commented`.
- `toggleReaction`/`addComment` llaman a `notify()` (ya existente) tras un alta exitosa
  (nunca al quitar el "me gusta" ni al borrar comentario), con `target_type`/`target_id`
  iguales al **target de la reacción/comentario** (la reseña/episodio comentado — no el id
  de la propia fila de `reactions`/`comments`) — reutilizando columnas de `notifications`
  que existían sin uso desde Bloque D.
- Guarda de auto-notificación: si `actorId === ownerId` (reaccionar/comentar tu propia
  reseña) no se llama a `notify()` — el `CHECK (user_id <> actor_id)` de la tabla fallaría
  si se intentara.
- `listNotifications` resuelve el enlace por tipo: los de la familia follow siguen
  apuntando a `/u/[actorUsername]`; `review_liked`/`review_commented` resuelven el ítem
  dueño (`diary_entry` → `diary_entries.library_entry_id` → `library_entries.item_type`/
  `item_id`; `episode_watch` → `episode_watches.series_id` directo) y enlazan a
  `itemHref(itemType, itemId) + "?tab=community"` (reutilizando el helper existente
  `src/lib/catalog/item-href.ts`, sin duplicar el mapeo de rutas).
- `notification-bell.tsx` cambia su `href` hardcodeado a `/u/${actorUsername}` por un
  `href` calculado por fila en `listNotifications`.

## 6. i18n

Namespace `social` (estilo plano existente): `like`/`unlike`, `commentsCount` (plural ICU),
`writeComment`, `postComment`, `deleteComment`. Namespace `notifications`: `reviewLiked`
("{name} le gustó tu reseña"), `reviewCommented` ("{name} comentó tu reseña") — mismo estilo
que `followRequest`/`newFollower`/`followAccepted`.

## 7. Testing y despliegue

Mismo proceso que Bloques A/D:
1. Migración a **dev**, verificar con batería de impersonación en transacciones con
   rollback: extraño / seguidor-aceptado / no-seguidor sobre reseña de perfil privado, anon,
   idempotencia del toggle (`UNIQUE` evita duplicar el "me gusta" en doble clic), solo-dueño
   puede borrar su comentario, guarda de auto-notificación.
2. E2E en navegador con dos usuarios de prueba: reaccionar/comentar como uno, confirmar el
   ciclo de notificación y que el deep link aterriza en la pestaña Comunidad correcta del
   ítem para el otro.
3. Aplicar a **prod**, actualizar `schema-baseline.sql` y `database.types.ts`, limpiar datos
   de prueba, actualizar `social-epic.md` (E5.B1–B4 → hecho, nombres de archivo reales) y
   `docs/REQUIREMENTS.md` §9.
