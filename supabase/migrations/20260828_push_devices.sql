-- Notificaciones push unificadas — modelo de dispositivos (spec
-- 2026-08-05-unified-notifications). Sustituye a push_subscriptions (E5.D4,
-- solo 'web') por UNA tabla que cubre los dos transportes vivos y deja hueco a
-- APNs sin rediseñar:
--   - web_push:    endpoint + p256dh + auth (VAPID), token NULL.
--   - fcm_android: token FCM, campos VAPID NULL.
--   - apns_ios:    reservado; misma forma que fcm_android (token, sin VAPID).
--
-- La notificación in-app (tabla notifications) sigue siendo la fuente de verdad.
-- Esta tabla solo guarda POR DÓNDE entregar el aviso secundario y su salud
-- operativa (último acierto, último error, contador de fallos) para poder
-- desactivar tokens muertos sin reintentar en bucle.

create type public.push_platform as enum ('web_push', 'fcm_android', 'apns_ios');

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform public.push_platform not null,

  -- Web Push (VAPID). Los tres van juntos: o están los tres, o los tres NULL.
  endpoint text,
  p256dh text,
  auth text,

  -- Canal nativo (FCM/APNs): token de registro del dispositivo.
  token text,

  -- Un token/endpoint muerto se apaga aquí (enabled=false) en vez de borrarse:
  -- así el usuario ve «error de registro» en ajustes y se conserva la última
  -- causa para depurar. El dispatcher solo mira las filas enabled.
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  failure_count integer not null default 0,

  -- Contexto opcional del dispositivo (diagnóstico y UI de ajustes).
  app_version text,
  device_id text,
  device_name text,

  created_at timestamptz not null default now(),

  -- No mezclar credenciales de dos mundos: es justo lo que pide la spec. Un
  -- web_push con un token nativo (o al revés) es un registro corrupto que el
  -- transporte equivocado intentaría enviar. Se rechaza en la BD, no en la app.
  constraint push_devices_credentials_shape check (
    case
      when platform = 'web_push'
        then endpoint is not null and p256dh is not null and auth is not null
             and token is null
      else token is not null
             and endpoint is null and p256dh is null and auth is null
    end
  )
);

-- Resuscribirse desde el mismo endpoint/token es idempotente a nivel de app
-- (delete-por-endpoint/token + insert, ver device-actions.ts). El UNIQUE lo
-- garantiza. Parciales porque el discriminante (endpoint vs token) depende del
-- canal y una constraint de tabla no admite la expresión condicional.
create unique index idx_push_devices_web_endpoint
  on public.push_devices (user_id, endpoint)
  where platform = 'web_push';
create unique index idx_push_devices_native_token
  on public.push_devices (user_id, token)
  where platform <> 'web_push';

-- El dispatcher carga los dispositivos ACTIVOS de un conjunto de destinatarios
-- (fan-out de club): índice parcial por user_id solo sobre los enabled.
create index idx_push_devices_user_enabled
  on public.push_devices (user_id)
  where enabled;

comment on table public.push_devices is 'Dispositivos push por usuario (unificado, spec 2026-08-05). platform discrimina el transporte; web_push usa endpoint+p256dh+auth (VAPID), fcm_android/apns_ios usan token. enabled/last_* rastrean la salud para apagar tokens muertos. La notificación in-app (notifications) es la fuente de verdad; esto es solo entrega secundaria best-effort.';

alter table public.push_devices enable row level security;

-- Self-only. El dispatcher lee/actualiza salud con service_role (bypassa RLS),
-- igual que send-push.ts hacía con push_subscriptions: el ACTOR que dispara la
-- notificación no tiene por qué poder leer los dispositivos del DESTINATARIO.
create policy "push_devices select own" on public.push_devices
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_devices insert own" on public.push_devices
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_devices update own" on public.push_devices
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "push_devices delete own" on public.push_devices
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Migración segura de las suscripciones web existentes. NO se borra
-- push_subscriptions aquí: se copia y se deja la tabla vieja en pie hasta
-- verificar en prod que push_devices las sirve (issue de retirada aparte).
-- on conflict do nothing por si la migración se re-aplica.
insert into public.push_devices (user_id, platform, endpoint, p256dh, auth, created_at)
select
  user_id,
  'web_push',
  credentials ->> 'endpoint',
  credentials -> 'keys' ->> 'p256dh',
  credentials -> 'keys' ->> 'auth',
  created_at
from public.push_subscriptions
where channel = 'web'
  and credentials ->> 'endpoint' is not null
on conflict do nothing;
