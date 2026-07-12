# EPIC-05 Bloque F — Feed del club — Design

## Alcance

Este bloque cubre exactamente `E5.F1`–`E5.F3` del backlog (`docs/requirements/social-epic.md`):
posts de club (texto, actividad compartida, encuesta), UI del feed en `/club/[slug]`,
reacciones/comentarios reutilizando el motor polimórfico de Bloque B. Motor genérico de
actividades de club (Bloque G) explícitamente fuera de alcance — los posts de este bloque son
contenido de feed, no las "actividades" estructuradas (lectura conjunta, tierlist, etc.) de G.

**Ampliación deliberada de alcance frente al backlog original**: el "me gusta" en comentarios
pasa a estar disponible en **toda la app**, no solo en posts de club — al compartir el mismo
enum `target_kind` que ya usan las reseñas (Bloque B), no tiene sentido que un comentario sea
"gustable" solo quan cuelga de un post de club y no de una reseña. Los comentarios en reseñas
obtienen el botón de like gratis como efecto colateral de esta decisión.

## Decisiones tomadas en esta sesión

- **Tipos de post**: `text`, `activity_share` y `poll` los tres desde el inicio (no se difiere
  `poll` pese a la interrogación del backlog original).
- **Encuestas**: elección única (no múltiple); resultados **ocultos hasta que votas** (excepción:
  una encuesta cerrada revela resultados a todo el mundo, haya votado o no — inferencia natural
  de "cerrada", no preguntada explícitamente, a confirmar en la revisión de spec); con **fecha de
  cierre** obligatoria (`poll_ends_at`), tras la cual votar queda bloqueado a nivel de RLS, no
  solo de UI.
- **`activity_share`**: comparte cualquier `FeedEvent` propio reciente (el mismo modelo unificado
  de Bloque C — diario, episodios, altas de biblioteca), no solo reseñas. Caption de texto
  **obligatorio** junto a la actividad compartida.
- **Referencia viva, no snapshot**: el post guarda `{targetType, targetId}` apuntando a la fila
  origen (mismo espíritu on-read que SD-1); si el usuario edita o borra esa fila después, el post
  se re-deriva en cada lectura — puede mostrar los datos actualizados o un estado "ya no
  disponible" si se borró, nunca datos congelados desincronizados del origen.
- **Visibilidad de lo compartido anula la privacidad de perfil dentro del club**: si quien
  comparte tiene perfil privado y un compañero de club no le sigue, ese compañero **sí** puede
  ver el detalle de la actividad compartida — compartir a un club es una elección explícita de
  audiencia que prevalece sobre la visibilidad de seguidor/perfil normal, solo dentro de ese club.
- **Notificaciones**: se notifica a **todos los miembros activos** en cada post nuevo, sin
  silenciar-club (E5.J, que introduciría esa preferencia, queda explícitamente diferido — se
  acepta el ruido temporal en vez de bloquear este bloque por una feature que no existe todavía).
- **Quién puede publicar**: cualquier miembro activo (no gateado a moderator+) — unirse a un club
  es participar, no solo leer.

## Modelo de datos

```sql
create type public.club_post_kind as enum ('text', 'activity_share', 'poll');

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind public.club_post_kind not null,
  body text not null,              -- texto / caption obligatorio / pregunta de encuesta
  ref jsonb,                       -- solo activity_share: {targetType, targetId} hacia el
                                    -- FeedEvent origen (diary_entry/episode_watch/
                                    -- progress_session/library_entry)
  poll_ends_at timestamptz,        -- solo poll: cierre de votación
  created_at timestamptz not null default now()
);

create table public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  label text not null,
  position smallint not null
);

create table public.club_poll_votes (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.club_poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)   -- elección única: una fila por votante, UPSERT para cambiar
);
```

`target_kind` (existente, Bloque B) gana dos valores: `'club_post'` (los posts se vuelven
reaccionables/comentables) y `'comment'` (los comentarios se vuelven reaccionables — ver
ampliación de alcance arriba). `reactions` no cambia de esquema, solo el rango de `target_type`
que acepta. `comments` gana una restricción nueva:

```sql
alter table public.comments add constraint comments_no_nesting check (target_type <> 'comment');
```

Sin esto, nada impediría insertar un comentario cuyo propio `target_type` fuera `'comment'`
(anidación), que el diseño no contempla ("hilo plano, sin anidación", Bloque B) y que además
rompería la terminación de la rama recursiva de `can_view_target()` de abajo — un comentario
cuyo `target_id` apuntase a sí mismo produciría recursión infinita. El CHECK hace la anidación
irrepresentable en el esquema, no solo "no soportada por la UI".

`can_view_target()` (existente) gana dos ramas nuevas en su `case`:

```sql
when 'club_post' then exists (
  select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
)
when 'comment' then exists (
  select 1 from public.comments c where c.id = p_target_id
    and public.can_view_target(c.target_type, c.target_id)
)
```

La rama `'comment'` es recursiva sobre la misma función — termina en una sola pasada porque un
comentario nunca apunta a otro comentario (`target_type` de un comentario es siempre
`diary_entry`/`episode_watch`/`club_post`, nunca `comment`).

## RLS — la pieza genuinamente nueva

**`is_visible_via_club_share(p_target_type public.target_kind, p_target_id uuid) returns boolean`**
— nuevo helper `SECURITY DEFINER`: true si existe un `club_post` con `kind='activity_share'` cuyo
`ref` apunta a esta fila, en un club del que el usuario actual es miembro. Se añade como un `OR`
adicional a las políticas `SELECT` ya existentes de `diary_entries`/`episode_watches`, junto a
`can_view_profile()` — **sin tocar `can_view_profile()`**, que es un helper transversal usado por
todo el contenido de perfil desde Bloque A y no debe arriesgarse por esta feature concreta
(decisión explícita de la sesión: aislar el riesgo en un helper nuevo y angosto en vez de
centralizar en el helper general).

**`club_posts`**
- `SELECT`: `is_club_member(club_id)`.
- `INSERT`: `with check (author_id = auth.uid() and is_club_member(club_id))` — cualquier
  miembro activo.
- `DELETE`: autor propio o `has_min_club_role(club_id, 'moderator')` (mismo patrón que
  `club_members delete self or moderate`, Bloque E).
- Sin `UPDATE`: los posts no son editables (mismo criterio "Reddit-lite" que los comentarios de
  Bloque B — alta y borrado, sin edición).

**`club_poll_options`**
- `SELECT`: legible si el `club_posts` padre lo es (misma condición vía join).
- Sin `INSERT`/`UPDATE`/`DELETE` de cliente: las opciones se crean atómicamente junto al post
  dentro de una función `SECURITY DEFINER` (ver Dominio), igual que `create_club` inserta
  `clubs`+`club_members` juntos.

**`club_poll_votes`**
- `SELECT`: propio voto siempre visible; el conteo agregado (no la fila individual) se resuelve
  en el dominio, no vía RLS de esta tabla.
- `INSERT`/`UPDATE` (UPSERT del propio voto): `is_club_member(club_id del post)` **y**
  `now() < poll_ends_at` — votar tras el cierre se rechaza en la base de datos, no solo se oculta
  en la UI.

## Dominio (`src/lib/clubs/posts.ts`)

```
createTextPost(clubId, body)
createShareActivityPost(clubId, body, ref: { targetType, targetId })
createPoll(clubId, question, options: string[], endsAt)
  → inserta club_posts + club_poll_options atómicamente, función SECURITY DEFINER
votePoll(postId, optionId)
  → UPSERT en club_poll_votes; rechaza si poll_ends_at ya pasó (el RPC re-valida, no confía
    solo en RLS, mismo principio "doble comprobación" que transferOwnership de Bloque E)
deletePost(clubId, postId)
  → autor o moderator+
listClubPosts(clubId, cursor?)
  → paginado por cursor (mismo patrón "Cargar más" que el feed personal de Bloque C), cada post
    trae su ref re-derivada on-read si es activity_share, o sus opciones+conteo si es poll
      (conteo oculto si el viewer no ha votado y la encuesta sigue abierta)
```

## Notificaciones

Nuevo valor de `notification_type`: `club_post`, con `target_type='club'`/`target_id=clubs.id`
(mismo patrón que `club_invite` de Bloque E, reutiliza el enrutado a `/club/[slug]` ya existente
en `notify()`/`listNotifications()`). Al crear un post, un bucle sobre los miembros activos del
club (excepto el autor) llama a `notify()` una vez por destinatario — sin mecanismo de
fan-out nuevo, mismo `notify()` best-effort ya usado en todo el epic.

## UI

- Sección de feed en `/club/[slug]`, debajo de `ManageMembers`, visible solo a miembros
  (coherente con SD-4: el contenido de un club siempre es solo-miembros).
- Composer con tres acciones: "Publicar texto" / "Compartir actividad" / "Crear encuesta".
  El selector de actividad a compartir lista los `FeedEvent`s recientes propios del usuario
  (reutiliza el modelo de Bloque C).
- Tarjetas de post reutilizando `ReviewInteractions` (Bloque B), extendido para aceptar target
  `club_post` y para mostrar like en comentarios (`comment` como target).
- Encuestas: opciones como radio buttons, botón votar, barras de resultado (ocultas hasta votar
  o hasta el cierre), fecha/cuenta atrás de cierre visible.
- Paginación "Cargar más" igual que `FeedList` de Bloque C.
- Nuevo namespace i18n `clubPost.*`.

## Testing

Batería de impersonación RLS (mismo patrón que Bloques A/B/D/E) — la pieza de mayor riesgo de
este bloque es la interacción de visibilidad entre `club_posts` y `diary_entries`/
`episode_watches` (`is_visible_via_club_share`), así que recibe el mismo rigor que la Task 1 de
Bloque E: casos de miembro/no-miembro/anon sobre cada tabla nueva, más el caso específico de
perfil privado + compañero de club no-seguidor viendo (o no) el detalle de una actividad
compartida. Verificación manual en navegador con checklist, per convención de `docs/TESTING.md`.
