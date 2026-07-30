-- Deploy only after notify()/notifyMany() write with the server-side service
-- role client. Recipients keep SELECT/UPDATE/DELETE under their existing RLS.
drop policy if exists "notifications insert as actor"
  on public.notifications;

revoke insert on table public.notifications from anon, authenticated;
