-- Structural and privilege assertions; no fixtures and no production connection.
do $verify$
declare
  item text;
begin
  foreach item in array array['passes', 'posts', 'pet_state', 'user_celebrations', 'push_devices', 'profiles'] loop
    if to_regclass('public.' || item) is null then
      raise exception 'Missing final table: %', item;
    end if;
  end loop;
  if to_regclass('public.diary_entries') is not null or to_regclass('public.thoughts') is not null then
    raise exception 'Legacy table rename was not applied';
  end if;
  foreach item in array array['related_posts_by_author', 'register_manual_catalog_item', 'get_companion_state', 'enforce_catalog_edit_collaborator_only', 'hydrate_book', 'hydrate_books_bulk', 'merge_book_into'] loop
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = item) then
      raise exception 'Missing final function: %', item;
    end if;
  end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('profiles', 'passes', 'pet_state') and not c.relrowsecurity) then
    raise exception 'RLS is disabled on a private table';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hydrate_book', 'hydrate_books_bulk', 'merge_book_into')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'Hydration role privilege contract failed';
  end if;
end $verify$;
