-- dispatch_wrap_ups fallaba la primera vez que tocaba despachar (lunes
-- 2026-10-12 09:00 Madrid): `v_kinds || 'week'` resuelve el literal sin tipo
-- como text[] (array || array) y revienta con «malformed array literal». Las
-- horas sin despacho salían antes por `cardinality = 0` y nunca llegaban ahí,
-- así que el cron parecía sano. Afectaba igual a 'month' y 'year'.
--
-- El cálculo de qué crónicas tocan sale a una función pura para poder
-- probarlo sin Vault ni pg_net (supabase/tests/wrap_ups.sql).
create or replace function private.wrap_up_kinds_due(p_local timestamp)
returns text[] language sql immutable set search_path to '' as $$
  select array_remove(array[
    case when extract(hour from p_local) = 9 and extract(isodow from p_local) = 1 then 'week' end,
    case when extract(hour from p_local) = 9 and extract(day from p_local) = 1 then 'month' end,
    case when extract(hour from p_local) = 10 and extract(month from p_local) = 12
              and extract(day from p_local) = 26 then 'year' end
  ]::text[], null);
$$;
revoke all on function private.wrap_up_kinds_due(timestamp) from public, anon, authenticated;

create or replace function private.dispatch_wrap_ups()
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_kinds text[] := private.wrap_up_kinds_due(timezone('Europe/Madrid', now()));
  v_url text; v_secret text; v_kind text;
begin
  if cardinality(v_kinds) = 0 then return; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'dispatch_wrap_ups: faltan app_base_url/cron_secret en Vault; no se despacha nada';
    return;
  end if;

  foreach v_kind in array v_kinds loop
    perform net.http_post(
      url := v_url || '/api/cron/wrap-ups',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('kind', v_kind),
      timeout_milliseconds := 60000
    );
  end loop;
end $$;
revoke all on function private.dispatch_wrap_ups() from public, anon, authenticated;
