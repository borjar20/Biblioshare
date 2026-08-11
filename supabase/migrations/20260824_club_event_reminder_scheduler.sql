-- El PRIMER trabajo programado del repo. Retira el bloqueo de #394.
--
-- Va en su propia migración a propósito: es la única pieza que necesita secretos
-- en Vault y la única que se puede retirar sola (`cron.unschedule`) sin tocar la
-- feature. Si algún día se cambia de mecanismo, este fichero es el que se
-- reemplaza.
--
-- Por qué pg_cron y no Vercel Cron: la cuenta de Vercel es Hobby, donde un cron
-- corre UNA vez al día y a una hora no garantizada — incompatible con un
-- recordatorio «15 minutos antes». pg_cron da granularidad de minutos en el plan
-- gratuito de Supabase.
--
-- Por qué salta a HTTP en vez de escribir en `notifications` desde SQL: firmar
-- VAPID es web-push, o sea Node. Un job que solo insertara filas llenaría la
-- campana y no enviaría ni un push. Saltando a la ruta se reutiliza el
-- notifyMany/sendPushToUsers que ya existe, en vez de duplicar el sistema de
-- notificaciones (§25 del encargo).
--
-- ANTES DE QUE ESTO HAGA NADA hay que crear los dos secretos, una vez por
-- entorno (no van en git):
--
--   select vault.create_secret('https://biblioshare.vercel.app', 'app_base_url');
--   select vault.create_secret('<mismo valor que CRON_SECRET en Vercel>', 'cron_secret');
--
-- Sin ellos la función avisa y no despacha: nunca entra en un bucle de errores
-- contra una URL vacía.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.dispatch_event_reminders()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'dispatch_event_reminders: faltan los secretos app_base_url/cron_secret en Vault; no se despacha nada';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/event-reminders',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function private.dispatch_event_reminders() from public, anon, authenticated;

-- Cada 5 minutos. Es el ÚNICO error de puntualidad del sistema y es explícito: un
-- recordatorio se entrega entre 0 y 5 minutos DESPUÉS de su momento teórico,
-- nunca antes.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-reminders') then
    perform cron.unschedule('event-reminders');
  end if;
  perform cron.schedule(
    'event-reminders',
    '*/5 * * * *',
    $job$ select private.dispatch_event_reminders(); $job$
  );
end $$;
