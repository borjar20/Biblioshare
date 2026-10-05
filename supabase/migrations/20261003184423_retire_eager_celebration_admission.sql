-- #1334 phase 2: close admission; COMMIT before collecting quiescence.
-- Already admitted UPDATEs can still finish after this REVOKE. Keep the new
-- consumer disabled. Run scripts/db/celebrations-cutover.mjs for phase 3.
-- Never restore eager-drain EXECUTE as a rollback; producers remain available.

do $closed$
declare
  v_function regprocedure;
  v_grantee record;
begin
  foreach v_function in array array[
    'public.pull_pending_celebrations()'::regprocedure,
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
      raise exception using errcode = '55000', message = 'Celebration RPC has an inherited ordinary EXECUTE route';
    end if;
  end loop;
end;
$closed$;

comment on function public.pull_pending_celebrations() is
  'Legacy admission closed pending proven quiescence. Do not regrant the eager body; phase 3 installs the compatible no-op.';
