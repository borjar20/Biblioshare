-- Shared, authenticated fixed-window quotas. No client can choose the limits
-- or reset the counters. One row per user/operation; deleted with the user.
create table private.request_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null,
  used integer not null check (used >= 0),
  primary key (user_id, operation)
);
alter table private.request_quotas enable row level security;
revoke all on private.request_quotas from public, anon, authenticated;

create function public.consume_request_quota(p_operation text, p_cost integer default 1)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  capacity integer;
  duration interval;
  consumed integer;
  instant timestamptz := statement_timestamp();
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select limits.n, limits.window_size into capacity, duration from (values
    ('catalog_request', 60, interval '1 minute'),
    ('catalog_create', 6000, interval '1 hour'),
    ('import_parse', 6, interval '1 hour'),
    ('import_rows', 6000, interval '1 hour'),
    ('pending_imports', 6000, interval '1 hour'),
    ('social_posts', 20, interval '1 minute'),
    ('social_comments', 60, interval '1 minute'),
    ('social_reactions', 120, interval '1 minute'),
    ('social_follows', 30, interval '1 minute'),
    ('push_devices', 20, interval '10 minutes'),
    ('activity_progress', 120, interval '1 minute'),
    ('club_round_state', 120, interval '1 minute'),
    ('saga_sequence', 30, interval '1 minute')
  ) as limits(operation, n, window_size) where limits.operation = p_operation;
  if capacity is null or p_cost is null or p_cost < 1 or p_cost > capacity then
    raise exception 'invalid quota operation or cost' using errcode = '22023';
  end if;
  insert into private.request_quotas as quota(user_id, operation, window_started_at, used)
    values (actor, p_operation, instant, p_cost)
  on conflict (user_id, operation) do update set
    used = case when quota.window_started_at + duration <= instant then p_cost
      else least(capacity + 1, quota.used + p_cost) end,
    window_started_at = case when quota.window_started_at + duration <= instant
      then instant else quota.window_started_at end
  returning used into consumed;
  return consumed <= capacity;
end;
$$;
revoke all on function public.consume_request_quota(text, integer) from public, anon;
grant execute on function public.consume_request_quota(text, integer) to authenticated;

create function private.require_request_quota(operation text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Background/service work has no user JWT. Existing RLS/RPC authorization
  -- remains responsible for anonymous access; this does not grant access.
  if auth.uid() is not null and not public.consume_request_quota(operation) then
    raise exception 'request quota exceeded' using errcode = 'PT429';
  end if;
end;
$$;
revoke all on function private.require_request_quota(text) from public, anon, authenticated;

create function private.enforce_write_quota()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_request_quota(TG_ARGV[0]);
  return new;
end;
$$;
revoke all on function private.enforce_write_quota() from public, anon, authenticated;

-- Triggers cover PostgREST and RPC writes as well as Server Actions. DELETE
-- stays available so users can remove their content/unfollow at any time.
do $$
declare target record;
begin
  for target in select * from (values
    ('books', 'catalog_create'), ('movies', 'catalog_create'), ('series', 'catalog_create'),
    ('posts', 'social_posts'), ('comments', 'social_comments'),
    ('reactions', 'social_reactions'), ('follows', 'social_follows'),
    ('pending_import_rows', 'pending_imports')
  ) as targets(relation, operation) loop
    execute format('create trigger request_quota before insert on public.%I for each row execute function private.enforce_write_quota(%L)', target.relation, target.operation);
  end loop;
end;
$$;
create trigger request_quota before insert or update on public.push_devices
  for each row execute function private.enforce_write_quota('push_devices');

-- Keep OIDs, signatures, ACLs and the existing query bodies. SQL readers become
-- VOLATILE PL/pgSQL because consuming a quota writes. RPC callers use POST.
do $migration$
declare target record; definition text; body text;
begin
  for target in select p.oid, p.proname, p.prosrc, l.lanname, p.proconfig,
      case p.proname when 'get_activities_progress' then 'activity_progress'
        when 'get_club_round_state' then 'club_round_state' else 'saga_sequence' end as operation
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and p.proname in
      ('get_activities_progress', 'get_club_round_state', 'save_saga_sequence')
  loop
    definition := pg_get_functiondef(target.oid);
    if target.lanname = 'sql' then
      body := E'#variable_conflict use_column\nbegin\n perform private.require_request_quota('
        || quote_literal(target.operation) || E');\n return query '
        || rtrim(target.prosrc, E' \n\r\t;') || E';\nend;';
      definition := replace(definition, 'LANGUAGE sql', 'LANGUAGE plpgsql');
      definition := replace(definition, 'STABLE', 'VOLATILE');
    elsif target.lanname = 'plpgsql' and target.proname = 'save_saga_sequence' then
      body := regexp_replace(target.prosrc, '\mbegin\M', 'begin perform private.require_request_quota(' || quote_literal(target.operation) || ');', 'i');
    else
      raise exception 'unexpected language for %', target.proname;
    end if;
    execute replace(definition, target.prosrc, body);
  end loop;
end;
$migration$;
