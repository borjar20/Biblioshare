begin;
create temporary table xr(k text primary key,id uuid not null default gen_random_uuid());
insert into xr(k) values('owner'),('member'),('absent'),('outsider'),('blocked'),('root'),('moment'),('moment2'),('memberrow'),('absentrow'),('review'),('post');
grant select,update on xr to anon,authenticated;
insert into auth.users(id) select id from xr where k in ('owner','member','absent','outsider','blocked');
insert into public.profiles(user_id,username,is_public) select id,'rev_'||left(replace(id::text,'-',''),15),true from xr where k in ('owner','member','absent','outsider','blocked');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
-- Task 2: new kinds are accepted; unknown kinds are rejected.
update xr set id=(public.experience_create('{"title":"[TEST] reviews","kind":"food","state":"lived"}')->>'id')::uuid where k='root';
do $$ begin
  if (select kind from public.experience_moments where experience_id=(select id from xr where k='root'))<>'food' then raise exception 'FAIL food kind'; end if;
  begin perform public.experience_create('{"title":"x","kind":"karaoke","state":"lived"}'); raise exception 'FAIL unknown kind'; exception when sqlstate '22023' then null; end;
end $$;
rollback;
