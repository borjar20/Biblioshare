-- #1334 phase 1: expand only. Claims remain disabled for ordinary callers.
-- Legacy behavior is retained until its admission is closed and all admitted
-- transactions are proven terminal. No historical row or producer is changed.
-- SQL contract matches the independently reviewed and PostgreSQL-tested r4.

alter table public.user_celebrations
  add column claim_token uuid,
  add column claim_expires_at timestamptz;

alter table public.user_celebrations
  add constraint user_celebrations_claim_pair
  check ((claim_token is null) = (claim_expires_at is null));

comment on column public.user_celebrations.claim_token is
  'Recoverable display reservation; rotates on reclaim. Retained after ACK for idempotent ACK retries. Not an auth credential.';
comment on column public.user_celebrations.claim_expires_at is
  'Server-clock lease deadline for a pending display reservation. Expiry does not mark displayed_at.';

create function public.claim_next_celebration(p_supported_types text[])
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_row public.user_celebrations%rowtype;
  v_now timestamptz;
  v_token uuid;
  v_expiry timestamptz;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_supported_types is null
     or cardinality(p_supported_types) > 32
     or exists (
       select 1 from unnest(p_supported_types) t(event_type)
       where t.event_type is null or length(t.event_type) not between 1 and 64
     ) then
    raise exception using errcode = '22023', message = 'Invalid celebration capabilities';
  end if;

  loop
    -- Select the oldest compatible pending row, including a live lease. Skipping
    -- leased heads would let another tab overtake an unshown earlier event.
    select c.id into v_id
      from public.user_celebrations c
     where c.user_id = v_user
       and c.displayed_at is null
       and c.event_type = any(p_supported_types)
     order by c.first_triggered_at, c.id
     limit 1;
    if not found then
      return jsonb_build_object('kind', 'empty', 'actor_id', v_user);
    end if;

    -- Do not repeat displayed_at IS NULL in this locked read. If a concurrent
    -- ACK finishes while this statement waits, inspect its fresh row version
    -- and restart the head selection on a new READ COMMITTED statement.
    select c.* into v_row
      from public.user_celebrations c
     where c.id = v_id and c.user_id = v_user
     for update;
    if not found then
      continue;
    end if;
    if v_row.displayed_at is not null
       or not (v_row.event_type = any(p_supported_types)) then
      continue;
    end if;

    -- Start the lease AFTER any lock wait. now() would be transaction-start time.
    v_now := clock_timestamp();
    if v_row.claim_token is not null and v_row.claim_expires_at > v_now then
      return jsonb_build_object(
        'kind', 'busy',
        'actor_id', v_user,
        'retry_after_ms', greatest(
          1, ceil(extract(epoch from (v_row.claim_expires_at - v_now)) * 1000)::integer
        )
      );
    end if;

    v_token := pg_catalog.gen_random_uuid();
    v_expiry := v_now + interval '30 seconds';
    update public.user_celebrations c
       set claim_token = v_token, claim_expires_at = v_expiry
     where c.id = v_row.id and c.user_id = v_user;
    return jsonb_build_object(
      'kind', 'claimed',
      'actor_id', v_user,
      'id', v_row.id,
      'event_type', v_row.event_type,
      'event_key', v_row.event_key,
      'payload', v_row.payload,
      'claim_token', v_token,
      'lease_ms', 30000,
      'claim_expires_at', v_expiry
    );
  end loop;
end;
$function$;

create function public.ack_celebration(p_id uuid, p_claim_token uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.user_celebrations%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'Invalid celebration reservation';
  end if;
  select c.* into v_row
    from public.user_celebrations c
   where c.id = p_id and c.user_id = v_user
   for update;
  if not found then return 'stale'; end if;
  if v_row.claim_token is distinct from p_claim_token then return 'stale'; end if;
  if v_row.displayed_at is not null then return 'already_acked'; end if;

  -- An expired token may ACK a display that happened while it was valid IF no
  -- other claimant replaced it. A replaced token can never ACK the new lease.
  -- Expiry governs who may reclaim; equality governs ACK fencing.
  update public.user_celebrations c
     set displayed_at = clock_timestamp()
   where c.id = v_row.id and c.user_id = v_user;
  return 'acked';
end;
$function$;

create function public.release_celebration(p_id uuid, p_claim_token uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.user_celebrations%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'Invalid celebration reservation';
  end if;
  select c.* into v_row
    from public.user_celebrations c
   where c.id = p_id and c.user_id = v_user
   for update;
  if not found then return 'stale'; end if;
  if v_row.claim_token is distinct from p_claim_token then return 'stale'; end if;
  if v_row.displayed_at is not null then return 'already_acked'; end if;
  update public.user_celebrations c
     set claim_token = null, claim_expires_at = null
   where c.id = v_row.id and c.user_id = v_user;
  return 'released';
end;
$function$;

-- Default privileges can grant service_role or another role automatically.
-- No ordinary caller may execute the new protocol before the cutover gate.
do $closed$
declare
  v_function regprocedure;
  v_grantee record;
begin
  foreach v_function in array array[
    'public.claim_next_celebration(text[])'::regprocedure,
    'public.ack_celebration(uuid,uuid)'::regprocedure,
    'public.release_celebration(uuid,uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_function);
    for v_grantee in
      select distinct r.rolname from pg_proc p,
        lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        join pg_roles r on r.oid = a.grantee
      where p.oid = v_function and a.grantee <> p.proowner
    loop
      execute format('revoke all on function %s from %I', v_function, v_grantee.rolname);
    end loop;
    if exists (
      select 1 from pg_roles r join pg_proc p on p.oid = v_function
      where not r.rolsuper and not pg_has_role(r.oid, p.proowner, 'USAGE')
        and has_function_privilege(r.oid, p.oid, 'EXECUTE')
    ) or has_function_privilege('authenticated', v_function, 'EXECUTE')
      or has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception using errcode = '55000', message = 'New celebration RPC admission must remain closed';
    end if;
  end loop;
end;
$closed$;

comment on function public.claim_next_celebration(text[]) is
  'Claim one compatible pending celebration for auth.uid(), without sealing displayed_at. 30-second recoverable lease; FIFO among compatible rows.';
comment on function public.ack_celebration(uuid, uuid) is
  'ACK an actually presented celebration for auth.uid() and the current claim token; idempotent with token retained after ACK.';
comment on function public.release_celebration(uuid, uuid) is
  'Best-effort release of an unshown reservation owned by auth.uid(); never clears displayed_at.';

