-- Local-only fixtures. Never run against production. All changes roll back.
begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  book_id uuid := gen_random_uuid();
  fixture_device_id uuid := gen_random_uuid();
  guarded_rpc text;
begin
  insert into auth.users(id) values (actor), (other_actor);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if not public.consume_request_quota('import_rows', 3000) then
    raise exception 'FAIL: a full supported CSV must fit';
  end if;
  if not public.consume_request_quota('import_rows', 3000) then
    raise exception 'FAIL: second supported CSV must fit';
  end if;
  if public.consume_request_quota('import_rows', 1) then
    raise exception 'FAIL: exhausted quota must reject';
  end if;
  perform set_config('request.jwt.claim.sub', other_actor::text, true);
  if not public.consume_request_quota('import_rows', 1) then
    raise exception 'FAIL: quota must be isolated by authenticated identity';
  end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  update private.request_quotas set window_started_at = now() - interval '2 hours'
    where user_id = actor and operation = 'import_rows';
  if not public.consume_request_quota('import_rows', 3000) then
    raise exception 'FAIL: an expired window must recover';
  end if;
  if has_table_privilege('authenticated', 'private.request_quotas', 'UPDATE')
    or has_table_privilege('anon', 'private.request_quotas', 'SELECT') then
    raise exception 'FAIL: clients must not read or reset quota counters';
  end if;
  if has_function_privilege('anon', 'public.consume_request_quota(text,integer)', 'EXECUTE') then
    raise exception 'FAIL: anonymous quota RPC access';
  end if;
  -- A normal catalog write succeeds; the actual trigger rejects a full quota.
  insert into public.books(id, title) values (book_id, '[TEST] quota');
  update private.request_quotas set used = 6000
    where user_id = actor and operation = 'catalog_create';
  begin
    insert into public.books(title) values ('[TEST] over quota');
    raise exception 'FAIL: catalog trigger did not enforce quota';
  exception when sqlstate 'PT429' then null;
  end;
  insert into public.follows(follower_id, followee_id) values (actor, other_actor);
  update private.request_quotas set used = 30
    where user_id = actor and operation = 'social_follows';
  delete from public.follows where follower_id = actor and followee_id = other_actor;
  begin
    insert into public.follows(follower_id, followee_id) values (actor, other_actor);
    raise exception 'FAIL: follow cycle did not enforce quota';
  exception when sqlstate 'PT429' then null;
  end;
  insert into public.push_devices(id, user_id, platform, token)
    values (fixture_device_id, actor, 'fcm_android', 'local-quota-fixture');
  update private.request_quotas set used = 20
    where user_id = actor and operation = 'push_devices';
  begin
    update public.push_devices set device_name = 'new name' where id = fixture_device_id;
    raise exception 'FAIL: push update did not enforce quota';
  exception when sqlstate 'PT429' then null;
  end;
  delete from public.push_devices where id = fixture_device_id;
  if (select count(*) from pg_trigger where tgname = 'request_quota'
      and tgfoid = 'private.enforce_write_quota()'::regprocedure and tgenabled = 'O') <> 9 then
    raise exception 'FAIL: missing write quota trigger';
  end if;
  -- Unchanged reader results on empty input, through the real wrapped bodies.
  if exists (select 1 from public.get_activities_progress('{}'::uuid[])) then
    raise exception 'FAIL: empty activity input must remain empty';
  end if;
  perform * from public.get_club_round_state(gen_random_uuid());
  foreach guarded_rpc in array array['activity_progress', 'club_round_state', 'saga_sequence'] loop
    insert into private.request_quotas(user_id, operation, window_started_at, used)
      values (actor, guarded_rpc, now(), 120)
      on conflict (user_id, operation) do update set used = 120;
    begin
      case guarded_rpc
        when 'activity_progress' then perform * from public.get_activities_progress('{}'::uuid[]);
        when 'club_round_state' then perform * from public.get_club_round_state(gen_random_uuid());
        else perform public.save_saga_sequence(gen_random_uuid(), '[]', '[]', '[]', '[]', '[]', '[]');
      end case;
      raise exception 'FAIL: RPC % did not enforce quota', guarded_rpc;
    exception when sqlstate 'PT429' then null;
    end;
  end loop;
  begin
    perform public.consume_request_quota('import_rows', -1);
    raise exception 'FAIL: negative cost accepted';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.consume_request_quota('import_rows');
    raise exception 'FAIL: missing identity accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS #811: CSV capacity, exhaustion, identity isolation, expiry and permissions';
end;
$test$;
rollback;
