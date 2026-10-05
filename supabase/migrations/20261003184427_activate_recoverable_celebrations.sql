-- #1334 phase 3: executed by scripts/db/celebrations-cutover.mjs after the
-- phase-2 COMMIT. Ordinary migration replay without the live gate FAILS closed.
-- Session context is checked evidence, not permission: this migration also
-- independently requires full visibility, fresh statistics, closed effective
-- ACLs, every captured transaction terminal, no prepared transactions, and no
-- other current transaction in this database. It never kills a backend.

do $gate$
declare
  v_context jsonb;
  v_cutoff timestamptz;
  v_database oid;
  v_legacy regprocedure := 'public.pull_pending_celebrations()'::regprocedure;
  v_function regprocedure;
  v_function_identity jsonb;
  v_member record;
begin
  if coalesce(current_setting('biblioshare.celebrations_cutover', true), '') = '' then
    raise exception using errcode = '55000', message = 'Live celebration cutover checker required';
  end if;
  v_context := current_setting('biblioshare.celebrations_cutover')::jsonb;
  if v_context->>'version' is distinct from '1'
     or v_context->>'privileged_dispatch_paused' is distinct from 'true'
     or jsonb_typeof(v_context->'cohort') is distinct from 'array'
     or jsonb_typeof(v_context->'functions') is distinct from 'array'
     or v_context->>'observer_role' is distinct from current_user then
    raise exception using errcode = '55000', message = 'Invalid live celebration cutover context';
  end if;
  if current_setting('transaction_isolation') <> 'read committed'
     or current_setting('track_activities') <> 'on'
     or not exists (select 1 from pg_roles r where r.rolname = current_user
       and (r.rolsuper or pg_has_role(r.oid, 'pg_read_all_stats', 'USAGE'))) then
    raise exception using errcode = '55000', message = 'Full live activity visibility and READ COMMITTED required';
  end if;

  select oid into strict v_database from pg_database where datname = current_database();
  v_cutoff := (v_context->>'cutoff')::timestamptz;
  if v_cutoff is null or v_cutoff >= transaction_timestamp()
     or (v_context->>'database_oid')::oid is distinct from v_database
     or (v_context->>'table_oid')::oid is distinct from 'public.user_celebrations'::regclass::oid
     or (v_context->>'legacy_oid')::oid is distinct from v_legacy::oid
     or v_context->>'legacy_definition_md5' is distinct from md5(pg_get_functiondef(v_legacy))
     or jsonb_array_length(v_context->'functions') <> 4
     or (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('pull_pending_celebrations','claim_next_celebration','ack_celebration','release_celebration')) <> 4 then
    raise exception using errcode = '55000', message = 'Cutover identity or committed pre-cut snapshot mismatch';
  end if;

  foreach v_function in array array[
    v_legacy,
    'public.claim_next_celebration(text[])'::regprocedure,
    'public.ack_celebration(uuid,uuid)'::regprocedure,
    'public.release_celebration(uuid,uuid)'::regprocedure
  ] loop
    select e into v_function_identity from jsonb_array_elements(v_context->'functions') e
      where (e->>'oid')::oid = v_function::oid;
    if v_function_identity is null
       or v_function_identity->>'definition_md5' is distinct from md5(pg_get_functiondef(v_function))
       or exists (
         select 1 from pg_proc p,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where p.oid = v_function and a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) or exists (
         select 1 from pg_roles r join pg_proc p on p.oid = v_function
         where not r.rolsuper and not pg_has_role(r.oid, p.proowner, 'USAGE')
           and has_function_privilege(r.oid, p.oid, 'EXECUTE')
       ) or has_function_privilege('authenticated', v_function, 'EXECUTE')
         or has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception using errcode = '55000', message = 'Cutover RPC definition or closed effective ACL mismatch';
    end if;
  end loop;

  perform pg_stat_clear_snapshot();
  if exists (select 1 from pg_stat_activity a where a.datid = v_database
    and a.pid <> pg_backend_pid() and (
      a.backend_start is null or a.backend_type is null or a.state = 'disabled'
      or (a.backend_type = 'client backend' and a.state is null)
      or (a.state in ('idle in transaction', 'idle in transaction (aborted)') and a.xact_start is null)
    )) then
    raise exception using errcode = '55000', message = 'Hidden or incomplete backend activity blocks cutover';
  end if;
  if exists (select 1 from pg_prepared_xacts where database = current_database()) then
    raise exception using errcode = '55000', message = 'Prepared transactions block celebration cutover';
  end if;
  for v_member in select * from jsonb_to_recordset(v_context->'cohort')
    as m(pid integer, backend_start timestamptz, xact_start timestamptz)
  loop
    if v_member.pid is null or v_member.pid <= 0 or v_member.backend_start is null
       or v_member.xact_start is null or v_member.xact_start > v_cutoff
       or exists (select 1 from pg_stat_activity a where a.datid = v_database
         and a.pid = v_member.pid and a.backend_start = v_member.backend_start
         and a.xact_start = v_member.xact_start) then
      raise exception using errcode = '55000', message = 'Captured celebration transaction has no terminal receipt';
    end if;
  end loop;
  -- Conservative independent defense, even against an incomplete/forged cohort.
  -- Busy traffic causes BLOCK; waiting a fixed duration is never a substitute.
  if exists (select 1 from pg_stat_activity a where a.datid = v_database
    and a.pid <> pg_backend_pid() and a.xact_start is not null) then
    raise exception using errcode = '55000', message = 'Other current transactions block celebration activation';
  end if;
end;
$gate$;

create or replace function public.pull_pending_celebrations()
returns table (event_type text, event_key text, payload jsonb)
language sql
volatile
security invoker
set search_path = public, pg_temp
as $function$
  select null::text, null::text, null::jsonb where false;
$function$;

comment on function public.pull_pending_celebrations() is
  'Deprecated eager drain: compatible zero-row no-op with no ledger writes. Recoverable consumer uses claim/ACK/release.';
comment on table public.user_celebrations is
  'Private earned celebrations. UNIQUE(user_id,event_type,event_key) deduplicates earning; a recoverable claim reserves display and an idempotent token-fenced ACK seals displayed_at.';

revoke all on function public.pull_pending_celebrations() from public, anon, service_role;
grant execute on function public.pull_pending_celebrations() to authenticated;
grant execute on function public.claim_next_celebration(text[]) to authenticated;
grant execute on function public.ack_celebration(uuid,uuid) to authenticated;
grant execute on function public.release_celebration(uuid,uuid) to authenticated;
