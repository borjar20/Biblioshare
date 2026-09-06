-- #1083, biblioshare-dev only. Requires a connection allowed to SET ROLE.
-- All fixtures and helper assertions are rolled back, including on failure
-- when the client aborts the transaction. Never run this against production.
begin;

create function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'assertion_failed: %', message; end if;
end;
$$;

create temp table burrow_users as
select n, ('10830000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as id
from generate_series(0, 70) n;
grant select on burrow_users to authenticated;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select id, 'authenticated', 'authenticated', 'burrow-sql-' || n || '@example.test', now(), now()
from burrow_users;
insert into public.profiles (user_id, username, is_public, role)
select id, 'burrow_sql_' || n, n not in (2, 3), 'user' from burrow_users;
insert into public.pet_state (user_id, name, class, last_stage)
select id, 'Nuez ' || n, 'wizard', case when n = 1 then 'acorn' else 'adult' end
from burrow_users where n <> 7;
insert into public.follows (follower_id, followee_id, status)
select '10830000-0000-4000-8000-000000000000', id,
       (case when n = 3 then 'pending' else 'accepted' end)::public.follow_status
from burrow_users where n <> 0 and n <> 6;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('10830000-0000-4000-8000-000000000000', '10830000-0000-4000-8000-000000000004'),
  ('10830000-0000-4000-8000-000000000005', '10830000-0000-4000-8000-000000000000');

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.get_burrow_pets(integer)', 'execute')
  and not has_function_privilege('anon', 'private.burrow_pets(uuid,integer)', 'execute'),
  'anonymous cannot execute wrapper or helper');

select set_config('request.jwt.claims', '{"sub":"10830000-0000-4000-8000-000000000000","role":"authenticated"}', true);
set local role authenticated;

select pg_temp.assert_true((select count(*) = 60 and min(total) = 65 and max(total) = 65 from public.get_burrow_pets()),
  'hard cap 60, total counts all 65 eligible neighbors');
select pg_temp.assert_true((select count(*) = 1 and min(total) = 65 from public.get_burrow_pets(0)), 'zero limit clamps to one');
select pg_temp.assert_true((select count(*) = 1 from public.get_burrow_pets(-10)), 'negative limit clamps to one');
select pg_temp.assert_true((select count(*) = 60 from public.get_burrow_pets(1000)), 'large limit clamps to sixty');
select pg_temp.assert_true((select count(*) = 60 from public.get_burrow_pets(null)), 'null limit defaults to sixty');
select pg_temp.assert_true(not exists (
  select 1 from public.get_burrow_pets() p join burrow_users u on u.id = p.user_id where n in (0,3,4,5,6,7)
), 'own, pending, blocked both ways, not followed and no pet are excluded');
select pg_temp.assert_true((select count(*) = 0 from public.pet_state where user_id <> auth.uid()), 'pet_state remains owner-only');
select pg_temp.assert_true((select array_agg(user_id) from public.get_burrow_pets()) =
  (select array_agg(user_id) from public.get_burrow_pets()), 'same viewer and day preserve order');
select pg_temp.assert_true((select count(*) = 0 from private.burrow_pets('10830000-0000-4000-8000-000000000001',60)),
  'helper cannot change viewer independently of the session');

-- Remove only fillers, so the cap cannot hide either of the positive cases.
reset role;
delete from public.follows where follower_id = '10830000-0000-4000-8000-000000000000'
  and followee_id in (select id from burrow_users where n >= 8);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 and min(total) = 2 from public.get_burrow_pets()), 'public and private accepted remain visible');
select pg_temp.assert_true(exists (select 1 from public.get_burrow_pets()
  where user_id = '10830000-0000-4000-8000-000000000001' and pet_stage = 'acorn'), 'acorn is included');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.get_burrow_pets()), 'no session returns no rows');

reset role;
rollback;
