-- Read-only assertions against actual objects after the pet_battles migration.
-- Run as postgres (psql -v ON_ERROR_STOP=1). No production data is required.
begin;
do $$
declare
  role_name text;
  privilege_name text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.pet_battles'::regclass) then
    raise exception 'pet_battles: RLS disabled';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pet_battles') <> 1 then
    raise exception 'pet_battles: unexpected policy count';
  end if;
  if not has_table_privilege('authenticated', 'public.pet_battles', 'SELECT') then
    raise exception 'pet_battles: owner read grant missing';
  end if;
  if has_table_privilege('anon', 'public.pet_battles', 'SELECT') then
    raise exception 'pet_battles: anonymous read grant present';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(role_name, 'public.pet_battles', privilege_name) then
        raise exception 'pet_battles: % unexpectedly has %', role_name, privilege_name;
      end if;
    end loop;
    foreach privilege_name in array array['INSERT', 'UPDATE'] loop
      if has_any_column_privilege(role_name, 'public.pet_battles', privilege_name) then
        raise exception 'pet_battles: % has writable columns (%)', role_name, privilege_name;
      end if;
    end loop;
  end loop;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.pet_battles', privilege_name) then
      raise exception 'pet_battles: service_role lacks %', privilege_name;
    end if;
  end loop;
end $$;
rollback;
