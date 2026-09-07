-- #812: regression of the catalog trigger with disposable rows only.
-- Local database only. Always rollback, including successful runs.
begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  book uuid := gen_random_uuid();
  film uuid := gen_random_uuid();
  show uuid := gen_random_uuid();
  blocked boolean;
begin
  insert into auth.users(id) values (actor);
  insert into public.profiles(user_id, username)
    values (actor, 'gate_' || left(replace(actor::text, '-', ''), 12));
  insert into public.books(id, title) values (book, '[TEST] catalog gate');
  insert into public.movies(id, title) values (film, '[TEST] catalog gate');
  insert into public.series(id, title) values (show, '[TEST] catalog gate');
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('app.hydrating', 'off', true);
  if public.has_min_role('collaborator') then
    raise exception 'Invalid fixture: expected ordinary user';
  end if;
  -- Legitimate first hydration remains possible.
  update public.books set openlibrary_work_key = '/works/TEST812W',
    hydrated_at = now(), editions_synced_at = now() where id = book;
  update public.movies set hydrated_at = now() where id = film;
  update public.series set hydrated_at = now() where id = show;
  -- Repeating the same values is harmless, not a re-set.
  update public.books set hydrated_at = hydrated_at where id = book;
  blocked := false;
  begin
    update public.books set hydrated_at = null where id = book;
  exception when raise_exception then
    if sqlerrm <> 'catalog technical fields can only be re-set by collaborators' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: populated book hydration must be protected'; end if;
  blocked := false;
  begin
    update public.books set editions_synced_at = null where id = book;
  exception when raise_exception then
    if sqlerrm <> 'catalog technical fields can only be re-set by collaborators' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: populated edition sync must be protected'; end if;
  blocked := false;
  begin
    update public.books set openlibrary_work_key = '/works/OTHER812W' where id = book;
  exception when raise_exception then
    if sqlerrm <> 'catalog technical fields can only be re-set by collaborators' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: populated book identity must be protected'; end if;
  blocked := false;
  begin
    update public.movies set hydrated_at = null where id = film;
  exception when raise_exception then
    if sqlerrm <> 'catalog technical fields can only be re-set by collaborators' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: populated movie hydration must be protected'; end if;
  blocked := false;
  begin
    update public.series set hydrated_at = null where id = show;
  exception when raise_exception then
    if sqlerrm <> 'catalog technical fields can only be re-set by collaborators' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: populated series hydration must be protected'; end if;
  raise notice 'PASS #812: initial hydration, no-op and five protected transitions';
end;
$test$;
rollback;
