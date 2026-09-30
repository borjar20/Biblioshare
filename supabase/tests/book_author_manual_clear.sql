-- #870: local/dev SQL regression.  The transaction leaves no fixtures behind.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

do $test$
declare
  collaborator uuid := '00000000-0000-4000-8000-000000000870';
  ordinary uuid := '00000000-0000-4000-8000-000000000871';
  cleared_single uuid := '00000000-0000-4000-8000-000000000872';
  cleared_bulk uuid := '00000000-0000-4000-8000-000000000873';
  cleared_empty_single uuid := '00000000-0000-4000-8000-000000000877';
  cleared_empty_bulk uuid := '00000000-0000-4000-8000-000000000878';
  unknown_single uuid := '00000000-0000-4000-8000-000000000874';
  unknown_bulk uuid := '00000000-0000-4000-8000-000000000875';
  manual_value uuid := '00000000-0000-4000-8000-000000000876';
  blocked boolean := false;
  signature regprocedure;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (collaborator,'authenticated','authenticated','author-clear-collaborator@example.test',now(),now()),
    (ordinary,'authenticated','authenticated','author-clear-ordinary@example.test',now(),now());
  insert into public.profiles(user_id,username,role) values
    (collaborator,'author_clear_collaborator','collaborator'),
    (ordinary,'author_clear_ordinary','user');
  insert into public.books(id,title,author,repr_meta) values
    (cleared_single,'[TEST #870] cleared single','old author','{}'),
    (cleared_bulk,'[TEST #870] cleared bulk','old author','{}'),
    (cleared_empty_single,'[TEST #870] cleared empty single','old author','{}'),
    (cleared_empty_bulk,'[TEST #870] cleared empty bulk','old author','{}'),
    (unknown_single,'[TEST #870] unknown single',null,'{}'),
    (unknown_bulk,'[TEST #870] unknown bulk',null,'{}'),
    (manual_value,'[TEST #870] manual value','curated author','{}');

  perform set_config('request.jwt.claims',json_build_object('sub',collaborator,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update public.books set author = null where id in (cleared_single, cleared_bulk);
  update public.books set author = '' where id in (cleared_empty_single, cleared_empty_bulk);
  update public.books set author = 'curated author v2' where id = manual_value;
  execute 'reset role';

  perform pg_temp.assert_true(
    (select author is null and repr_meta #>> '{author,source}' = 'manual' from public.books where id=cleared_single),
    'collaborator clearing author to NULL records the retained manual sentinel');
  perform pg_temp.assert_true(
    (select author = '' and repr_meta #>> '{author,source}' = 'manual' from public.books where id=cleared_empty_single),
    'collaborator clearing author to empty records the retained manual sentinel');
  perform pg_temp.assert_true(
    (select repr_meta #>> '{author,source}' = 'manual' from public.books where id=manual_value),
    'manual nonempty author records manual source');

  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    update public.books set author='forbidden' where id=unknown_single;
  exception when others then
    blocked := sqlerrm like 'catalog ficha fields can only be edited by collaborators%';
  end;
  execute 'reset role';
  perform pg_temp.assert_true(blocked,'ordinary user cannot simulate author curation');

  execute 'set local role service_role';
  perform public.hydrate_book(cleared_single, null, null, null, null, null, null, 'provider single');
  perform public.hydrate_book(cleared_empty_single, null, null, null, null, null, null, 'provider empty single');
  perform public.hydrate_book(unknown_single, null, null, null, null, null, null, 'provider single');
  perform public.hydrate_book(manual_value, null, null, null, null, null, null, 'provider override');
  perform public.hydrate_books_bulk(jsonb_build_array(
    jsonb_build_object('book_id',cleared_bulk,'author','provider bulk'),
    jsonb_build_object('book_id',cleared_empty_bulk,'author','provider empty bulk'),
    jsonb_build_object('book_id',unknown_bulk,'author','provider bulk')
  ));
  execute 'reset role';

  perform pg_temp.assert_true((select author is null and repr_meta #>> '{author,source}'='manual' from public.books where id=cleared_single),'single hydrate preserves cleared manual author');
  perform pg_temp.assert_true((select author is null and repr_meta #>> '{author,source}'='manual' from public.books where id=cleared_bulk),'bulk hydrate preserves cleared manual author');
  perform pg_temp.assert_true((select author='' and repr_meta #>> '{author,source}'='manual' from public.books where id=cleared_empty_single),'single hydrate preserves empty manual author');
  perform pg_temp.assert_true((select author='' and repr_meta #>> '{author,source}'='manual' from public.books where id=cleared_empty_bulk),'bulk hydrate preserves empty manual author');
  perform pg_temp.assert_true((select author='provider single' and repr_meta -> 'author' is null from public.books where id=unknown_single),'single hydrate fills unknown author without inventing manual source');
  perform pg_temp.assert_true((select author='provider bulk' and repr_meta -> 'author' is null from public.books where id=unknown_bulk),'bulk hydrate fills unknown author without inventing manual source');
  perform pg_temp.assert_true((select author='curated author v2' and repr_meta #>> '{author,source}'='manual' from public.books where id=manual_value),'manual nonempty author remains untouched');

  for signature in select unnest(array[
    'public.stamp_repr_manual_on_curation()'::regprocedure,
    'public.hydrate_book(uuid,jsonb,text[],integer,integer,text,text,text)'::regprocedure,
    'public.hydrate_books_bulk(jsonb)'::regprocedure
  ]) loop
    perform pg_temp.assert_true(not has_function_privilege('anon',signature,'execute'),'anon cannot execute ' || signature);
    perform pg_temp.assert_true(not has_function_privilege('authenticated',signature,'execute'),'authenticated cannot execute ' || signature);
    perform pg_temp.assert_true(has_function_privilege('service_role',signature,'execute'),'service_role retains ' || signature);
    perform pg_temp.assert_true((select proconfig @> array['search_path=""'] from pg_proc where oid=signature),'empty search_path is pinned for ' || signature);
    perform pg_temp.assert_true(not exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
      where p.oid=signature and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
    ),'PUBLIC cannot execute ' || signature);
  end loop;

  raise notice 'PASS #870: manual author clear survives individual and bulk hydration; unknown remains fillable; ACLs preserved';
end;
$test$;

rollback;
