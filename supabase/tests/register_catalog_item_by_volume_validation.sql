-- #924: regression matrix for the authenticated Google Books shell RPC.
-- All synthetic data remains inside this transaction.
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
  actor uuid := '00000000-0000-4000-8000-000000000924';
  bad_values text[] := array[
    null,
    '   ',
    'abc def',
    'abc' || chr(9) || 'def',
    'abc' || chr(10) || 'def',
    'abc/def',
    'abc?def',
    'abc.def',
    'caf' || chr(233),
    repeat('x', 257),
    repeat('x', 5000)
  ];
  expected_errors text[] := array[
    'volume id required',
    'volume id required',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id',
    'invalid volume id'
  ];
  idx integer;
  rejected boolean;
  first_id uuid;
  second_id uuid;
  checks integer := 0;
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values (actor, 'authenticated', 'authenticated', 'register-volume-924@example.test', now(), now());

  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.register_catalog_item_by_volume(text)'::regprocedure, 'execute'),
    'anon has no execute privilege on register_catalog_item_by_volume'
  );
  perform pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.register_catalog_item_by_volume(text)'::regprocedure, 'execute'),
    'authenticated retains execute privilege on register_catalog_item_by_volume'
  );
  perform pg_temp.assert_true(
    has_function_privilege('service_role', 'public.register_catalog_item_by_volume(text)'::regprocedure, 'execute'),
    'service_role retains execute privilege on register_catalog_item_by_volume'
  );
  checks := checks + 3;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000924","role":"authenticated"}', true);
  execute 'set local role authenticated';

  for idx in 1..array_length(bad_values, 1) loop
    rejected := false;
    begin
      perform public.register_catalog_item_by_volume(bad_values[idx]);
    exception when sqlstate 'P0001' then
      perform pg_temp.assert_true(sqlerrm = expected_errors[idx],
        format('invalid volume ID has expected error: %s', quote_nullable(bad_values[idx])));
      rejected := true;
    when others then
      raise exception 'assertion_failed: invalid volume ID raised unexpected SQLSTATE %: %',
        sqlstate, sqlerrm;
    end;
    perform pg_temp.assert_true(rejected,
      format('rejected invalid volume ID: %s', quote_nullable(bad_values[idx])));
    checks := checks + 1;
  end loop;

  first_id := public.register_catalog_item_by_volume('zyTCAlFPjgYC');
  second_id := public.register_catalog_item_by_volume('zyTCAlFPjgYC');
  perform pg_temp.assert_true(first_id = second_id, '12-character volume ID remains idempotent');
  perform pg_temp.assert_true(public.register_catalog_item_by_volume('a') is not null,
    'one-character volume ID is accepted');
  perform pg_temp.assert_true(public.register_catalog_item_by_volume('ab_cd-EF123') is not null,
    'underscore, hyphen and variable-length volume ID are accepted');
  perform pg_temp.assert_true(public.register_catalog_item_by_volume(repeat('a', 256)) is not null,
    'exactly 256-character volume ID is accepted');
  perform pg_temp.assert_true(first_id = public.register_catalog_item_by_volume(' zyTCAlFPjgYC '),
    'trimmed volume ID remains idempotent');
  checks := checks + 5;

  raise notice 'PASS #924: % invalid and valid-shape/idempotency checks', checks;
end;
$test$;

rollback;
