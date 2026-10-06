-- Wrap-ups (spec 2026-10-06 §2, §4). Una fila por (user_id, kind): el periodo
-- siguiente la sobrescribe. El cliente NO escribe el payload (podría publicar
-- cifras inventadas): escriben el cron y las server actions con service role,
-- y estas RPC acotadas a auth.uid().

create table public.wrap_ups (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.wrap_up_kind not null,
  period_start date not null,
  period_end date not null,
  intensity text not null check (intensity in ('full', 'quiet')),
  payload jsonb not null check (payload->>'v' = '1'),
  generated_at timestamptz not null default now(),
  refreshed_at timestamptz,
  seen_at timestamptz,
  published_post_id uuid references public.posts(id) on delete set null,
  primary key (user_id, kind),
  check (period_end >= period_start)
);
alter table public.wrap_ups enable row level security;
create policy wrap_ups_select_own on public.wrap_ups for select to authenticated using (user_id = (select auth.uid()));
create policy wrap_ups_delete_own on public.wrap_ups for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.wrap_ups from anon, authenticated;
grant select, delete on public.wrap_ups to authenticated;
grant all on public.wrap_ups to service_role;

-- Lo que leen los seguidores: el resumen congelado al publicar. Nada más.
create table public.wrap_up_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.wrap_up_kind not null,
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.wrap_up_shares enable row level security;
create policy wrap_up_shares_select on public.wrap_up_shares for select to anon, authenticated
  using (public.can_view_profile(user_id));
revoke all on public.wrap_up_shares from anon, authenticated;
grant select on public.wrap_up_shares to anon, authenticated;
grant all on public.wrap_up_shares to service_role;

-- Ciclo post ↔ share: borrar uno se lleva al otro (sustitución, despublicar,
-- moderación). Borrar una fila ya borrada no hace nada, así que no hay bucle.
create or replace function private.wrap_up_share_cleanup_post()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  delete from public.posts where kind = 'wrap_up' and source_kind = 'wrap_up_share' and source_id = old.id;
  return old;
end $$;
create trigger wrap_up_shares_cleanup_post after delete on public.wrap_up_shares
  for each row execute function private.wrap_up_share_cleanup_post();

create or replace function private.wrap_up_post_cleanup_share()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.kind = 'wrap_up' and old.source_kind = 'wrap_up_share' then
    delete from public.wrap_up_shares where id = old.source_id;
  end if;
  return old;
end $$;
create trigger posts_wrap_up_cleanup_share after delete on public.posts
  for each row execute function private.wrap_up_post_cleanup_share();

-- Sustituir o borrar el wrap-up se lleva el share (y por el trigger, el post).
create or replace function private.wrap_up_cleanup_share()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' or new.period_start is distinct from old.period_start then
    delete from public.wrap_up_shares where user_id = old.user_id and kind = old.kind;
  end if;
  return coalesce(new, old);
end $$;
create trigger wrap_ups_cleanup_share after update or delete on public.wrap_ups
  for each row execute function private.wrap_up_cleanup_share();

-- Un post wrap_up solo nace por publish_wrap_up (marcador de operación, patrón
-- de private.guard_experience_post).
create or replace function private.guard_wrap_up_post()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.kind = 'wrap_up' and coalesce(current_setting('biblioshare.wrap_up_publish', true), '') <> 'on' then
    raise exception 'wrap_up posts are created only by publish_wrap_up';
  end if;
  return new;
end $$;
create trigger posts_guard_wrap_up before insert on public.posts
  for each row execute function private.guard_wrap_up_post();

create or replace function public.mark_wrap_up_seen(p_kind public.wrap_up_kind)
returns void language sql security definer set search_path to '' as $$
  update public.wrap_ups set seen_at = coalesce(seen_at, now())
   where user_id = (select auth.uid()) and kind = p_kind;
$$;

create or replace function public.publish_wrap_up(p_kind public.wrap_up_kind)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.wrap_ups;
  v_share uuid;
  v_post uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.wrap_ups where user_id = v_uid and kind = p_kind for update;
  if not found then raise exception 'wrap_up_not_found'; end if;
  if v_row.published_post_id is not null then return v_row.published_post_id; end if;

  insert into public.wrap_up_shares (user_id, kind, period_start, period_end, summary)
  values (v_uid, p_kind, v_row.period_start, v_row.period_end, v_row.payload->'share')
  returning id into v_share;

  perform set_config('biblioshare.wrap_up_publish', 'on', true);
  insert into public.posts (author_id, kind, anchor_type, anchor_id, source_kind, source_id)
  values (v_uid, 'wrap_up', 'wrap_up', v_share, 'wrap_up_share', v_share)
  returning id into v_post;
  perform set_config('biblioshare.wrap_up_publish', 'off', true);

  update public.wrap_ups set published_post_id = v_post where user_id = v_uid and kind = p_kind;
  return v_post;
end $$;

create or replace function public.unpublish_wrap_up(p_kind public.wrap_up_kind)
returns void language sql security definer set search_path to '' as $$
  delete from public.wrap_up_shares where user_id = (select auth.uid()) and kind = p_kind;
$$;

revoke all on function public.mark_wrap_up_seen(public.wrap_up_kind), public.publish_wrap_up(public.wrap_up_kind),
  public.unpublish_wrap_up(public.wrap_up_kind) from public, anon;
grant execute on function public.mark_wrap_up_seen(public.wrap_up_kind), public.publish_wrap_up(public.wrap_up_kind),
  public.unpublish_wrap_up(public.wrap_up_kind) to authenticated;

-- Despacho: cada hora en punto; actúa solo a la hora local que toca (patrón
-- dispatch_pet_nudges: pg_cron programa en UTC y el cambio de hora movería un
-- horario fijo). Mismos secretos de Vault que el resto de crons.
create or replace function private.dispatch_wrap_ups()
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_local timestamp := timezone('Europe/Madrid', now());
  v_kinds text[] := '{}';
  v_url text; v_secret text; v_kind text;
begin
  if extract(hour from v_local) = 9 and extract(isodow from v_local) = 1 then v_kinds := v_kinds || 'week'; end if;
  if extract(hour from v_local) = 9 and extract(day from v_local) = 1 then v_kinds := v_kinds || 'month'; end if;
  if extract(hour from v_local) = 10 and extract(month from v_local) = 12 and extract(day from v_local) = 26 then
    v_kinds := v_kinds || 'year';
  end if;
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wrap-ups') then perform cron.unschedule('wrap-ups'); end if;
  perform cron.schedule('wrap-ups', '0 * * * *', $job$ select private.dispatch_wrap_ups(); $job$);
end $$;

-- #1188: `posts insert own` rechaza cualquier source_kind sin rama. publish_wrap_up
-- es security definer (su dueño ignora RLS), pero la policy debe describir igual
-- la regla «la fuente es del autor» para el tipo nuevo. Recreada entera desde
-- pg_policies (dev, 2026-10-06) + la rama wrap_up_share.
alter policy "posts insert own" on public.posts
  with check (
    (select auth.uid()) = author_id
    and (
      source_id is null
      or (source_kind = 'pass'
          and exists (select 1 from public.passes s where s.id = source_id and s.user_id = author_id))
      or (source_kind = 'progress_session'
          and exists (select 1 from public.progress_sessions s where s.id = source_id and s.user_id = author_id))
      or (source_kind = 'episode_watch'
          and exists (select 1 from public.episode_watches s where s.id = source_id and s.user_id = author_id))
      or (source_kind = 'wrap_up_share'
          and exists (select 1 from public.wrap_up_shares s where s.id = source_id and s.user_id = author_id))
    )
  );
