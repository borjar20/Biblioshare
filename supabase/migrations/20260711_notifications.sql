-- EPIC-05 (social), Bloque D — notificaciones in-app (SD-5).
--
-- Infra mínima para notificar in-app: nuevo seguidor, solicitud de
-- seguimiento, solicitud aceptada. Deliberadamente SIN push/email/cron (§8-D):
-- se lee al cargar la app (campana con contador de no leídas). Push queda
-- como continuación futura sobre esta misma tabla cuando exista esa infra.
--
-- target_type/target_id son nullable y no se usan todavía (las 3 notificaciones
-- de follows apuntan al ACTOR, que ya lleva a su perfil) — quedan preparados
-- para cuando existan reacciones/comentarios/posts de club (Bloque B/F), que sí
-- necesitarán decir "sobre qué" ocurrió el evento.

create type public.notification_type as enum (
  'follow_request',
  'new_follower',
  'follow_accepted'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  target_type text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id <> actor_id)
);

-- Listado del destinatario ordenado por fecha.
create index idx_notifications_recipient on public.notifications (user_id, created_at desc);
-- Contador de no leídas: parcial, solo indexa las filas que importan para el badge.
create index idx_notifications_unread on public.notifications (user_id) where read_at is null;

comment on table public.notifications is 'Notificaciones in-app de EPIC-05 (SD-5): nuevo seguidor, solicitud de seguimiento, solicitud aceptada. Sin push/email — se lee al cargar (campana). Push futuro sobre esta misma tabla cuando exista esa infra (§8-D).';

alter table public.notifications enable row level security;

-- SELECT/UPDATE: solo el destinatario ve y marca como leídas las suyas.
create policy "notifications select own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "notifications update own" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- INSERT: cualquier autenticado puede crear una notificación de la que ES el
-- actor, dirigida a otro usuario (nunca a sí mismo — CHECK de la tabla). Mismo
-- espíritu que el gateo de colaborador en §8-H: la RLS es permisiva y confía en
-- que la capa de app (server actions de follow/reacción/comentario) solo llame
-- a notify() tras una acción real; falsificar una notificación sin la acción
-- real es un riesgo de baja severidad (ninguna fuga de datos ni escalada de
-- privilegios), aceptado a cambio de no acoplar esta tabla genérica a la lógica
-- de cada feature futura que la use.
create policy "notifications insert as actor" on public.notifications
  for insert to authenticated
  with check ((select auth.uid()) = actor_id);
