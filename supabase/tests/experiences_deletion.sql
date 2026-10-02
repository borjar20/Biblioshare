begin;
create temporary table experience_delete_fixture(k text primary key,id uuid not null default gen_random_uuid());
insert into experience_delete_fixture(k) values('owner'),('other'),('root');
grant select,update on experience_delete_fixture to authenticated;
insert into auth.users(id) select id from experience_delete_fixture where k in ('owner','other');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from experience_delete_fixture where k='owner'),true);
update experience_delete_fixture set id=(public.experience_create('{"title":"[TEST] deletion","state":"planned","kind":"walk"}')->>'id')::uuid where k='root';
select set_config('request.jwt.claim.sub',(select id::text from experience_delete_fixture where k='other'),true);
do $$ begin
  begin perform public.experience_delete((select id from experience_delete_fixture where k='root'),'[TEST] deletion'); raise exception 'FAIL alien deletion'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from experience_delete_fixture where k='owner'),true);
do $$ begin
  begin perform public.experience_delete((select id from experience_delete_fixture where k='root'),'wrong'); raise exception 'FAIL missing confirmation'; exception when sqlstate '22023' then null; end;
  if not exists(select 1 from public.experiences where id=(select id from experience_delete_fixture where k='root')) then raise exception 'FAIL rejected deletion changed root'; end if;
  perform public.experience_delete((select id from experience_delete_fixture where k='root'),'[TEST] deletion');
  if exists(select 1 from public.experiences where id=(select id from experience_delete_fixture where k='root'))
    or exists(select 1 from public.experience_moments where experience_id=(select id from experience_delete_fixture where k='root'))
    or exists(select 1 from public.experience_participants where experience_id=(select id from experience_delete_fixture where k='root')) then raise exception 'FAIL incomplete deletion'; end if;
end $$;
reset role;
rollback;
