-- Synthetic fixtures with real roles. Local/dev only; every write rolls back.
begin;
create temporary table experience_fixture(k text primary key, id uuid not null default gen_random_uuid());
insert into experience_fixture(k) values ('owner'),('accepted'),('pending'),('third'),('blocked'),('admin'),('root'),('moment'),('guest'),('accepted_member'),('pending_member');
grant select on experience_fixture to anon,authenticated;
insert into auth.users(id) select id from experience_fixture where k in ('owner','accepted','pending','third','blocked','admin');
insert into public.profiles(user_id,username,is_public,role)
select id,'exp_'||left(replace(id::text,'-',''),15),true,case when k='admin' then 'admin'::public.user_role else 'user'::public.user_role end
from experience_fixture where k in ('owner','accepted','pending','third','blocked','admin');
insert into public.experiences(id,creator_id,title,audience)
select id,(select id from experience_fixture where k='owner'),'[TEST] private memory','participants' from experience_fixture where k='root';
insert into public.experience_moments(id,experience_id,title,kind,position)
select id,(select id from experience_fixture where k='root'),'[TEST] concert','concert',0 from experience_fixture where k='moment';
insert into public.experience_participants(id,experience_id,user_id,invitation_state)
select (select id from experience_fixture where k='accepted_member'),(select id from experience_fixture where k='root'),id,'accepted' from experience_fixture where k='accepted';
insert into public.experience_participants(id,experience_id,user_id,invitation_state)
select (select id from experience_fixture where k='pending_member'),(select id from experience_fixture where k='root'),id,'invited' from experience_fixture where k='pending';
insert into public.experience_participants(id,experience_id,guest_name,invitation_state)
select id,(select id from experience_fixture where k='root'),'Private guest','accepted' from experience_fixture where k='guest';
insert into public.user_blocks(blocker_id,blocked_id)
select (select id from experience_fixture where k='blocked'),id from experience_fixture where k='owner';

do $$ declare who record; visible boolean; begin
  for who in select k,id from experience_fixture where k in ('owner','accepted','pending','third','blocked','admin') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    select exists(select 1 from public.experiences where id=(select id from experience_fixture where k='root')) into visible;
    if visible <> (who.k in ('owner','accepted')) then raise exception 'FAIL participants audience: %',who.k; end if;
    if who.k in ('pending','third','blocked','admin') and exists(select 1 from public.experience_participants where experience_id=(select id from experience_fixture where k='root')) then
      raise exception 'FAIL hidden memberships: %',who.k;
    end if;
    reset role;
  end loop;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.experiences where id=(select id from experience_fixture where k='root')) then raise exception 'FAIL anonymous private memory'; end if;
end $$;
reset role;

update public.experiences set audience='profile' where id=(select id from experience_fixture where k='root');
set local role anon;
do $$ begin
  if not exists(select 1 from public.experiences where id=(select id from experience_fixture where k='root')) then raise exception 'FAIL public memory'; end if;
  if exists(select 1 from public.experience_participants where experience_id=(select id from experience_fixture where k='root')) then raise exception 'FAIL guest/account consent leak'; end if;
  if exists(select 1 from public.experience_moment_participants where experience_id=(select id from experience_fixture where k='root')) then raise exception 'FAIL attendance leak'; end if;
end $$;
reset role;
update public.experience_participants set share_identity=true where id=(select id from experience_fixture where k='accepted_member');
set local role anon;
do $$ begin
  if (select count(*) from public.experience_participants where experience_id=(select id from experience_fixture where k='root')) <> 1 then raise exception 'FAIL consent projection'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from experience_fixture where k='blocked'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.experiences where id=(select id from experience_fixture where k='root')) then raise exception 'FAIL blocked public memory'; end if;
end $$;
reset role;
update public.experiences set audience='private' where id=(select id from experience_fixture where k='root');
select set_config('request.jwt.claim.sub',(select id::text from experience_fixture where k='accepted'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.experiences where id=(select id from experience_fixture where k='root')) then raise exception 'FAIL private must revoke accepted access'; end if;
  begin
    update public.experiences set creator_id=auth.uid() where id=(select id from experience_fixture where k='root');
    raise exception 'FAIL direct write granted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.experience_create(jsonb)','EXECUTE') then raise exception 'FAIL anonymous mutation'; end if;
  if has_table_privilege('authenticated','public.experience_photos','INSERT') then raise exception 'FAIL photo direct writes'; end if;
end $$;
rollback;
