begin;
create temporary table xw(k text primary key,id uuid not null default gen_random_uuid());
insert into xw(k) values('owner'),('one'),('two'),('root'),('moment'),('p1'),('p2');
grant select on xw to authenticated,anon;
insert into auth.users(id) select id from xw where k in ('owner','one','two');
insert into public.profiles(user_id,username,is_public) select id,'xw_'||left(replace(id::text,'-',''),15),true from xw where k in ('owner','one','two');
insert into public.experiences(id,creator_id,title,audience) select id,(select id from xw where k='owner'),'[TEST] withdraw','profile' from xw where k='root';
insert into public.experience_moments(id,experience_id,title,kind,position) select id,(select id from xw where k='root'),'Walk','walk',0 from xw where k='moment';
insert into public.experience_participants(id,experience_id,user_id,invitation_state,share_identity) select id,(select id from xw where k='root'),(select id from xw where k=case when p.k='p1' then 'one' else 'two' end),'accepted',true from xw p where k in ('p1','p2');
insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state) select (select id from xw where k='root'),(select id from xw where k='moment'),id,'attended' from xw where k in ('p1','p2');
insert into public.experience_favorites(experience_id,moment_id,user_id) select (select id from xw where k='root'),(select id from xw where k='moment'),id from xw where k in ('one','two');
insert into public.user_blocks(blocker_id,blocked_id) values((select id from xw where k='owner'),(select id from xw where k='one')),((select id from xw where k='two'),(select id from xw where k='owner'));
set local role authenticated;
do $$ declare actor uuid; begin
  for actor in select id from xw where k in ('one','two') loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform public.experience_set_share_identity((select id from xw where k='root'),false);
    if exists(select 1 from public.experiences where id=(select id from xw where k='root')) then raise exception 'FAIL withdrawal reopens root'; end if;
    if not exists(select 1 from public.get_experience_own_memberships() where experience_id=(select id from xw where k='root')) then raise exception 'FAIL unreachable withdrawal'; end if;
    begin perform public.experience_set_share_identity((select id from xw where k='root'),true); raise exception 'FAIL blocked grant'; exception when insufficient_privilege then null; end;
    begin perform public.experience_remove_participant((select id from xw where k=case when actor=(select id from xw where k='one') then 'p2' else 'p1' end)); raise exception 'FAIL alien removal'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
-- Suppress external attribution immediately on a block, even before withdrawal.
update public.experience_participants set share_identity=true where experience_id=(select id from xw where k='root');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.experience_participants where experience_id=(select id from xw where k='root')) or exists(select 1 from public.experience_moment_participants where experience_id=(select id from xw where k='root')) or exists(select 1 from public.experience_favorites where experience_id=(select id from xw where k='root')) then raise exception 'FAIL blocked attribution'; end if;
  if exists(select 1 from public.get_profile_experiences((select id from xw where k='one'))) or exists(select 1 from public.get_profile_experiences((select id from xw where k='two'))) then raise exception 'FAIL blocked profile attribution'; end if;
end $$;
reset role;
update public.experiences set audience='private' where id=(select id from xw where k='root');
set local role authenticated;
do $$ declare actor uuid; begin
  for actor in select id from xw where k in ('one','two') loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform public.experience_remove_participant((select id from xw where k=case when actor=(select id from xw where k='one') then 'p1' else 'p2' end));
    if exists(select 1 from public.get_experience_own_memberships()) then raise exception 'FAIL removed membership remains'; end if;
  end loop;
end $$;
reset role;
do $$ begin if exists(select 1 from public.experience_favorites where experience_id=(select id from xw where k='root')) then raise exception 'FAIL withdrawn favorite'; end if; end $$;
rollback;
