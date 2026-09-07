-- #920: synthetic fixtures, always rolled back; run after the migration.
begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  curator uuid := gen_random_uuid();
  book uuid := gen_random_uuid();
  edition uuid;
  blocked boolean := false;
begin
  if has_function_privilege('authenticated',
    'public.register_verified_book_edition(uuid,uuid,text,text,text,integer,integer,text)', 'EXECUTE')
    or has_function_privilege('anon',
    'public.register_verified_book_edition(uuid,uuid,text,text,text,integer,integer,text)', 'EXECUTE') then
    raise exception 'FAIL: verified registration must be server-only';
  end if;
  if not has_function_privilege('service_role',
    'public.register_verified_book_edition(uuid,uuid,text,text,text,integer,integer,text)', 'EXECUTE') then
    raise exception 'FAIL: server cannot register';
  end if;
  insert into auth.users(id) values (actor);
  insert into auth.users(id) values (curator);
  insert into public.profiles(user_id, username, role) values (curator, 'ed920_' || left(replace(curator::text,'-',''),12), 'collaborator');
  insert into public.profiles(user_id, username) values (actor, 'ed920_' || left(replace(actor::text,'-',''),12));
  insert into public.books(id,title) values (book, '[TEST #920] verified edition');
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  begin
    perform public.register_book_edition(book, '9788410138407');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: ordinary user can register manual metadata'; end if;
  edition := public.register_verified_book_edition(book, actor, '9788410138407');
  if not exists (select 1 from public.book_editions where id=edition and book_id=book and created_by=actor) then
    raise exception 'FAIL: verified edition and attribution not persisted';
  end if;
  if public.register_verified_book_edition(book, actor, '9788410138407') is not null then
    raise exception 'FAIL: registration not idempotent';
  end if;
  perform set_config('request.jwt.claim.sub', curator::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  edition := public.register_book_edition(book, '9780306406157');
  if not exists (select 1 from public.book_editions where id=edition and created_by=curator) then
    raise exception 'FAIL: curator manual registration broken';
  end if;
  raise notice 'PASS #920: server grants, user rejection, registration, attribution and idempotence';
end;
$test$;
rollback;
