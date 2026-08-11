-- Preferencias de notificación por usuario (spec 2026-08-05-unified-notifications).
-- Las preferencias son del USUARIO, no de cada dispositivo/token: una fila por
-- usuario, columnas booleanas. Modelo OPT-OUT (todo a true por defecto) para no
-- cambiar el comportamiento actual, donde toda notificación intenta entregarse.
--
-- Dos ejes que el dispatcher cruza para decidir una entrega push:
--   - Canal: web_push / android_push (master switch por transporte).
--   - Categoría: social / clubs / progress / system (qué clase de aviso).
-- Un push llega si SU categoría está activa Y SU canal está activo.
--
-- La notificación IN-APP no se controla aquí: es la fuente de verdad y se crea
-- siempre (la spec pide «mantén la in-app aunque el usuario rechace push»). Un
-- silenciado total de la campana sería otra feature; no está en este alcance.
--
-- Horario silencioso: la spec lo pide «solo si ya existe infraestructura
-- compatible». No existe (no hay zona horaria por usuario ni ventana de
-- entrega), así que se deja fuera y se abre issue en vez de inventar la mitad.

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  web_push_enabled boolean not null default true,
  android_push_enabled boolean not null default true,

  category_social boolean not null default true,
  category_clubs boolean not null default true,
  category_progress boolean not null default true,
  category_system boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is 'Preferencias push por usuario (spec 2026-08-05). Opt-out: sin fila = todo activo. El dispatcher (service_role) cruza categoría (del tipo de notificación) x canal (web_push/android_push). La notificación in-app no se controla aquí; es la fuente de verdad.';

alter table public.notification_preferences enable row level security;

-- Self-only. El dispatcher lee las prefs del DESTINATARIO con service_role
-- (bypassa RLS), no con el cliente del actor.
create policy "notification_preferences select own" on public.notification_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_preferences insert own" on public.notification_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_preferences update own" on public.notification_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
