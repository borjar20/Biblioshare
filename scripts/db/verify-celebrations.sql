-- PostgreSQL smoke after phase 3; all synthetic actors/rows roll back.
-- SQL auth.uid()/authenticated boundary, not an Auth/JWT-signature or UI test.
\set ON_ERROR_STOP on
begin isolation level read committed;
do $actors$
declare v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(v_a), (v_b);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('biblioshare.qa_celebration_b', v_b::text, true);
end;
$actors$;
set local role authenticated;
do $verify$
declare
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_unknown uuid := gen_random_uuid();
  v_claim jsonb;
  v_old_token uuid;
  v_new_token uuid;
  v_actor text := auth.uid()::text;
  v_before text;
  v_after text;
begin
  insert into public.user_celebrations(id,user_id,event_type,event_key,first_triggered_at)
    values(v_first,auth.uid(),'qa_cap',v_first::text,'2020-01-01'),
      (v_second,auth.uid(),'qa_cap',v_second::text,'2021-01-01'),
      (v_unknown,auth.uid(),'qa_unknown',v_unknown::text,'2019-01-01');
  if public.claim_next_celebration(array[]::text[])->>'kind' <> 'empty' then raise exception 'Empty capabilities consumed data'; end if;
  v_claim := public.claim_next_celebration(array['qa_cap']);
  if v_claim->>'kind' <> 'claimed' or (v_claim->>'id')::uuid <> v_first
     or v_claim->>'actor_id' <> v_actor or (v_claim->>'lease_ms')::integer <> 30000
     or (v_claim->>'claim_expires_at')::timestamptz <= clock_timestamp()
     or exists(select 1 from public.user_celebrations where displayed_at is not null) then
    raise exception 'Claim contract/FIFO/unsealed reservation failed';
  end if;
  v_old_token := (v_claim->>'claim_token')::uuid;
  if public.claim_next_celebration(array['qa_cap'])->>'kind' <> 'busy' then raise exception 'Live head lease was skipped'; end if;
  if public.release_celebration(v_first,v_old_token) <> 'released' then raise exception 'Release failed'; end if;
  v_new_token := (public.claim_next_celebration(array['qa_cap'])->>'claim_token')::uuid;
  if v_new_token = v_old_token or public.ack_celebration(v_first,v_old_token) <> 'stale'
     or public.release_celebration(v_first,v_old_token) <> 'stale' then raise exception 'Reclaim fencing failed'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('biblioshare.qa_celebration_b'), true);
  if exists(select 1 from public.user_celebrations) or public.ack_celebration(v_first,v_new_token) <> 'stale' then
    raise exception 'Other actor can read/ACK a private reservation';
  end if;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  if public.ack_celebration(v_first,v_new_token) <> 'acked'
     or public.ack_celebration(v_first,v_new_token) <> 'already_acked'
     or public.release_celebration(v_first,v_new_token) <> 'already_acked' then raise exception 'Idempotent ACK failed'; end if;
  v_claim := public.claim_next_celebration(array['qa_cap']);
  if (v_claim->>'id')::uuid <> v_second then raise exception 'FIFO successor failed'; end if;
  update public.user_celebrations set claim_expires_at = clock_timestamp() - interval '1 second' where id = v_second;
  if public.ack_celebration(v_second,(v_claim->>'claim_token')::uuid) <> 'acked' then
    raise exception 'Expired unreplaced token cannot ACK';
  end if;
  if exists(select 1 from public.user_celebrations where id=v_unknown and (displayed_at is not null or claim_token is not null)) then
    raise exception 'Unsupported type was consumed';
  end if;
  select md5(jsonb_agg(to_jsonb(c) order by id)::text) into v_before from public.user_celebrations c;
  if exists(select 1 from public.pull_pending_celebrations()) then raise exception 'Legacy returned data after cutover'; end if;
  select md5(jsonb_agg(to_jsonb(c) order by id)::text) into v_after from public.user_celebrations c;
  if v_before is distinct from v_after then raise exception 'Legacy no-op mutated ledger'; end if;
end;
$verify$;
rollback;
select 'PASS: recoverable celebrations, FIFO/fencing/private ownership/idempotent ACK/legacy no-op; fixtures rolled back';
