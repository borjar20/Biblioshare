-- E5.D4 — Notificaciones push (Web Push). Ver
-- docs/superpowers/specs/2026-07-12-push-notifications-design.md.
-- channel solo declara 'web' hoy; un canal nativo futuro (ios_native, vía
-- Capacitor/APNs) sería un ALTER TYPE ADD VALUE + una forma distinta de
-- `credentials`, sin rediseñar la tabla.

create type public.push_channel as enum ('web');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.push_channel not null default 'web',
  credentials jsonb not null,
  created_at timestamptz not null default now()
);

-- Constraint de tabla no admite expresiones (credentials->>'endpoint' no es
-- una columna) — el UNIQUE va como índice de expresión aparte. Re-suscribirse
-- desde el mismo dispositivo/endpoint es idempotente a nivel de aplicación
-- (delete+insert, ver subscription-actions.ts).
create unique index idx_push_subscriptions_user_channel_endpoint
  on public.push_subscriptions (user_id, channel, (credentials->>'endpoint'));

comment on table public.push_subscriptions is 'Suscripciones de push por usuario (E5.D4). channel discrimina el canal de entrega; credentials es jsonb específico de canal (hoy solo "web": {endpoint, keys:{p256dh,auth}}).';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
