-- R4b: isolated fixtures, always rolled back. No real accounts are changed.
begin;
create function pg_temp.assert_true(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'assertion_failed: %', msg; end if; end $$;
select pg_temp.assert_true(to_regclass('public.pet_loadout') is not null, 'loadout exists');
insert into auth.users(id,aud,role,email,created_at,updated_at) values
('20260908-4000-4000-8000-00000000000a','authenticated','authenticated','r4b-a@example.test',now(),now()),
('20260908-4000-4000-8000-00000000000b','authenticated','authenticated','r4b-b@example.test',now(),now());
insert into public.profiles(user_id,username,is_public,role) values
('20260908-4000-4000-8000-00000000000a','r4b_sql_a',true,'user'),
('20260908-4000-4000-8000-00000000000b','r4b_sql_b',true,'user');
insert into public.pet_state(user_id,name,class) values
('20260908-4000-4000-8000-00000000000a','Nuez','wizard');
insert into public.pet_battles(id,user_id,intent_id,kind,enemy_id,ruleset_version,content_hash,seed,snapshot,status,inputs,result,digest,resolved_at,adventure_day,attempt,reward) values
('20260908-4000-4000-8000-000000000001','20260908-4000-4000-8000-00000000000a',gen_random_uuid(),'adventure','brote','r4.1',repeat('a',64),repeat('1',32),'{}','resolved','[]','{"outcome":"win"}',repeat('b',64),now(),current_date-1,1,'{"itemId":"sharp_bookmark","slot":"weapon"}'),
('20260908-4000-4000-8000-000000000002','20260908-4000-4000-8000-00000000000a',gen_random_uuid(),'adventure','brote','r4.1',repeat('a',64),repeat('1',32),'{}','resolved','[]','{"outcome":"win"}',repeat('b',64),now(),current_date-2,1,'{"itemId":"loan_pendant","slot":"amulet"}');
select * from public.set_pet_equipment('20260908-4000-4000-8000-00000000000a','weapon','20260908-4000-4000-8000-000000000001');
select pg_temp.assert_true(private.pet_equipment_snapshot('20260908-4000-4000-8000-00000000000a')->'weapon'->>'qualityBp'='10000','legacy neutral');
do $$ begin
 perform public.set_pet_equipment('20260908-4000-4000-8000-00000000000b','weapon','20260908-4000-4000-8000-000000000001');
 raise exception 'accepted foreign copy';
exception when others then if sqlerrm <> 'NOT_OWNED' then raise; end if; end $$;
do $$ begin
 perform public.set_pet_equipment('20260908-4000-4000-8000-00000000000a','weapon','20260908-4000-4000-8000-000000000002');
 raise exception 'accepted wrong slot';
exception when others then if sqlerrm <> 'WRONG_SLOT' then raise; end if; end $$;
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pet_loadout','INSERT'),'no direct insert');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pet_loadout','UPDATE'),'no direct update');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.set_pet_equipment(uuid,text,uuid)','EXECUTE'),'write RPC server only');
select pg_temp.assert_true(not has_function_privilege('anon','public.set_pet_equipment(uuid,text,uuid)','EXECUTE'),'anon denied');
select set_config('request.jwt.claims','{"sub":"20260908-4000-4000-8000-00000000000b","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.pet_loadout),'B cannot read A');
reset role;
create temp table first_training as select * from public.start_pet_training('20260908-4000-4000-8000-00000000000a','20260908-4000-4000-8000-000000000101',repeat('1',32),'brote','r4.2',repeat('a',64),'{"equipment":{"weapon":"forged"}}');
select pg_temp.assert_true((select snapshot->'equipment'->'weapon'->>'copyId'='20260908-4000-4000-8000-000000000001' from first_training),'server overwrites equipment');
select * from public.set_pet_equipment('20260908-4000-4000-8000-00000000000a','weapon',null);
select pg_temp.assert_true((select snapshot=(select snapshot from first_training) from public.start_pet_training('20260908-4000-4000-8000-00000000000a','20260908-4000-4000-8000-000000000101',repeat('2',32),'brote','r4.2',repeat('a',64),'{}')),'intent retry preserves snapshot');
select pg_temp.assert_true(private.pet_quality_v1('20260908-4000-4000-8000-00000000000a',current_date) in (8000,9000,10000,11000,12000),'valid quality');
insert into public.pet_battles(id,user_id,intent_id,kind,enemy_id,ruleset_version,content_hash,seed,snapshot,status,adventure_day,attempt) values
('20260908-4000-4000-8000-000000000003','20260908-4000-4000-8000-00000000000a','20260908-4000-4000-8000-000000000103','adventure','brote','r4.2',repeat('a',64),repeat('3',32),'{}','open',current_date,1);
create temp table reward_order as select '[{"itemId":"sharp_bookmark","slot":"weapon"},{"itemId":"heavy_ink_quill","slot":"weapon"},{"itemId":"librarian_loupe","slot":"weapon"},{"itemId":"last_page_amulet","slot":"amulet"},{"itemId":"loan_pendant","slot":"amulet"},{"itemId":"streak_medallion","slot":"amulet"}]'::jsonb as value;
create temp table won as select * from public.resolve_pet_adventure('20260908-4000-4000-8000-00000000000a','20260908-4000-4000-8000-000000000103','[]','{"outcome":"win"}',repeat('c',64),(select value from reward_order));
select pg_temp.assert_true((select reward->>'itemId'='heavy_ink_quill' and (reward->>'qualityBp')::int=private.pet_quality_v1(user_id,adventure_day) and reward->>'qualityVersion'='1' from won),'new quality and first unowned');
select pg_temp.assert_true((select reward=(select reward from won) and digest=repeat('c',64) from public.resolve_pet_adventure('20260908-4000-4000-8000-00000000000a','20260908-4000-4000-8000-000000000103','[{}]','{"outcome":"lose"}',repeat('d',64),'[]')),'resolution retry preserves reward');
select pg_temp.assert_true((select reward='{"itemId":"sharp_bookmark","slot":"weapon"}'::jsonb from public.pet_battles where id='20260908-4000-4000-8000-000000000001'),'legacy untouched');
rollback;
