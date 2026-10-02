-- #1237: local-only regression fixtures. All users, rows and quotas roll back.
-- Execute with psql ON_ERROR_STOP=1; every assertion emits one native PASS line.
begin;

create function pg_temp.assert_true(condition boolean, label text)
returns void language plpgsql as $assert$
begin
  if not coalesce(condition, false) then
    raise exception 'FAIL #1237: %', label;
  end if;
  raise notice 'PASS #1237: %', label;
end;
$assert$;

create function pg_temp.expect_sqlstate(statement text, expected text, label text)
returns void language plpgsql as $assert$
declare observed text;
begin
  begin
    execute statement;
  exception when others then
    observed := sqlstate;
  end;
  perform pg_temp.assert_true(observed = expected, label || ' (' || expected || ')');
end;
$assert$;

do $test$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  prefix text := 'quota1237_' || replace(gen_random_uuid()::text, '-', '') || '_';
  first_id uuid;
  reused_id uuid;
  rejected_id text;
  before_editions bigint;
  after_editions bigint;
  idx integer;
  kind text;
begin
  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.register_catalog_item_by_volume(text)', 'EXECUTE'),
    'anonymous volume registration remains denied');
  perform pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.register_catalog_item_by_volume(text)', 'EXECUTE'),
    'authenticated volume registration remains allowed');
  perform pg_temp.assert_true(
    has_function_privilege('service_role', 'public.register_catalog_item_by_volume(text)', 'EXECUTE'),
    'service volume registration retains its existing execute grant');
  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.consume_request_quota(text,integer)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.consume_request_quota(text,integer)', 'EXECUTE'),
    'quota RPC keeps the existing client ACL');
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'private.enforce_write_quota()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.require_request_quota(text)', 'EXECUTE'),
    'internal quota helpers remain inaccessible to clients');
  perform pg_temp.assert_true(
    not has_table_privilege('authenticated', 'private.request_quotas', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'private.request_quotas', 'SELECT,INSERT,UPDATE,DELETE')
    and (select relrowsecurity from pg_class where oid = 'private.request_quotas'::regclass),
    'clients cannot inspect, reset or replace counters and quota RLS remains enabled');
  perform pg_temp.assert_true(
    (select proconfig @> array['search_path=""'] from pg_proc
      where oid = 'public.consume_request_quota(text,integer)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc
      where oid = 'private.enforce_write_quota()'::regprocedure),
    'quota functions retain an explicit empty search path');

  insert into auth.users(id) values (actor), (other_actor);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  execute 'set local role authenticated';
  for idx in 1..60 loop
    reused_id := public.register_catalog_item_by_volume(prefix || idx);
    if idx = 1 then first_id := reused_id; end if;
    if reused_id is null then raise exception 'FAIL #1237: registration % returned null', idx; end if;
  end loop;
  execute 'reset role';
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_google_volume_create') = 60,
    '60 authenticated new volumes consume exactly the GB-only capacity');
  perform pg_temp.assert_true(
    not exists (select 1 from private.request_quotas where user_id = actor
      and operation = 'catalog_create'),
    'GB-only insertion does not consume the generic catalog quota');
  perform pg_temp.assert_true(
    (select count(*) from public.books where google_books_volume_id like prefix || '%') = 60,
    'all 60 accepted shells exist');

  select count(*) into before_editions from public.book_editions;
  rejected_id := prefix || '61';
  execute 'set local role authenticated';
  perform pg_temp.expect_sqlstate(
    format('select public.register_catalog_item_by_volume(%L)', rejected_id), 'PT429',
    '61st new volume is rejected through the direct authenticated RPC');
  reused_id := public.register_catalog_item_by_volume(' ' || prefix || '1 ');
  perform pg_temp.assert_true(reused_id = first_id,
    'reusing a trimmed existing volume succeeds when the new-volume quota is exhausted');
  perform pg_temp.expect_sqlstate(
    format('select public.register_catalog_item_by_volume(%L)', prefix || '/invalid'), 'P0001',
    'invalid volume shape is still rejected before insertion');
  perform pg_temp.expect_sqlstate(
    'select public.register_catalog_item_by_volume(' || quote_literal(repeat('x', 257)) || ')',
    'P0001', 'the existing 256-character input boundary remains enforced');
  perform pg_temp.expect_sqlstate('select used from private.request_quotas', '42501',
    'the authenticated actor cannot read the private quota table');
  perform pg_temp.expect_sqlstate('update private.request_quotas set used = 0', '42501',
    'the authenticated actor cannot reset the private quota table');
  perform pg_temp.expect_sqlstate(
    format('insert into public.books(google_books_volume_id) values (%L)', prefix || 'direct'),
    '42501', 'direct client insertion into catalog remains denied');
  execute 'reset role';
  select count(*) into after_editions from public.book_editions;
  perform pg_temp.assert_true(
    not exists (select 1 from public.books where google_books_volume_id = rejected_id),
    'a quota rejection leaves no new book');
  perform pg_temp.assert_true(before_editions = after_editions,
    'a quota rejection leaves no automatic primary edition');
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_google_volume_create') = 60,
    'rejection, invalid inputs and reuse leave the counter at 60');

  perform set_config('request.jwt.claim.sub', other_actor::text, true);
  execute 'set local role authenticated';
  reused_id := public.register_catalog_item_by_volume(prefix || '1');
  perform pg_temp.assert_true(reused_id = first_id, 'another account reuses the same shared UUID');
  execute 'reset role';
  perform pg_temp.assert_true(
    not exists (select 1 from private.request_quotas where user_id = other_actor
      and operation = 'catalog_google_volume_create'),
    'shared catalog reuse is free for another account');
  execute 'set local role authenticated';
  perform public.register_catalog_item_by_volume(prefix || 'other');
  execute 'reset role';
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = other_actor
      and operation = 'catalog_google_volume_create') = 1
    and (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_google_volume_create') = 60,
    'accounts have independent new-volume quotas');

  perform set_config('request.jwt.claim.sub', actor::text, true);
  insert into private.request_quotas(user_id, operation, window_started_at, used)
    values (actor, 'catalog_create', statement_timestamp(), 5997);
  -- Privileged inserts exercise the same generic triggers as the catalog RPCs.
  -- The ordinary client INSERT ACL is separately checked above.
  insert into public.books(openlibrary_work_key, google_books_volume_id, title)
    values ('/works/OL12371237W', prefix || 'existing_mixed', '[TEST] Open Library quota');
  insert into public.movies(tmdb_id, title) values (1237123701, '[TEST] movie quota');
  insert into public.series(tmdb_id, title) values (1237123702, '[TEST] series quota');
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_create') = 6000,
    'Open Library, movies and series still consume their shared 6000/hour quota');
  execute 'set local role authenticated';
  reused_id := public.register_catalog_item_by_volume(prefix || 'existing_mixed');
  perform pg_temp.assert_true(
    reused_id = (select id from public.books where google_books_volume_id = prefix || 'existing_mixed'),
    'an existing book with both provider keys remains reusable when both quotas are exhausted');
  execute 'reset role';
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_create') = 6000
    and (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_google_volume_create') = 60,
    'reusing a book with both provider keys consumes neither quota');
  foreach kind in array array['books', 'movies', 'series'] loop
    perform pg_temp.expect_sqlstate(
      format('insert into public.%I(title) values (%L)', kind, '[TEST] generic over quota'),
      'PT429', kind || ' generic creation still rejects at capacity');
  end loop;
  perform pg_temp.expect_sqlstate(
    format('insert into public.books(openlibrary_work_key, google_books_volume_id) values (%L,%L)',
      '/works/OL12371238W', prefix || 'mixed'), 'PT429',
    'a book with an Open Library key and a Google volume remains on the generic path');

  execute 'set local role authenticated';
  perform pg_temp.assert_true(public.consume_request_quota('import_rows', 3000),
    'a supported 3000-row CSV still fits');
  perform pg_temp.assert_true(public.consume_request_quota('import_rows', 3000),
    'a second supported 3000-row CSV still fits in the import window');
  perform pg_temp.assert_true(not public.consume_request_quota('import_rows'),
    'the existing import_rows capacity remains 6000/hour');
  perform pg_temp.assert_true(public.consume_request_quota('catalog_request', 60),
    'the existing request quota remains 60/minute');
  perform pg_temp.assert_true(not public.consume_request_quota('catalog_request'),
    'the existing request quota still rejects after 60');
  perform pg_temp.expect_sqlstate(
    'select public.consume_request_quota(''catalog_google_volume_create'', 61)', '22023',
    'clients cannot request a cost larger than the fixed GB-only capacity');
  perform pg_temp.expect_sqlstate(
    'select public.consume_request_quota(''catalog_google_volume_create'', -1)', '22023',
    'clients cannot credit their quota with a negative cost');
  execute 'reset role';

  update private.request_quotas set window_started_at = statement_timestamp() - interval '2 hours'
    where user_id = actor and operation = 'catalog_google_volume_create';
  execute 'set local role authenticated';
  perform public.register_catalog_item_by_volume(prefix || 'next_window');
  execute 'reset role';
  perform pg_temp.assert_true(
    (select used = 1 and window_started_at >= statement_timestamp() - interval '1 minute'
      from private.request_quotas where user_id = actor
      and operation = 'catalog_google_volume_create'),
    'an expired GB-only window starts again at one even with other quotas exhausted');
  perform pg_temp.assert_true(
    (select used from private.request_quotas where user_id = actor
      and operation = 'catalog_create') = 6000,
    'resetting the GB-only window leaves the generic catalog counter unchanged');

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  perform pg_temp.expect_sqlstate(
    format('select public.register_catalog_item_by_volume(%L)', prefix || 'no_identity'),
    'P0001', 'the RPC still requires a user identity');
  execute 'reset role';
  execute 'set local role anon';
  perform pg_temp.expect_sqlstate(
    format('select public.register_catalog_item_by_volume(%L)', prefix || 'anonymous'),
    '42501', 'an actual anonymous call is rejected by the execute ACL');
  execute 'reset role';
end;
$test$;

rollback;
