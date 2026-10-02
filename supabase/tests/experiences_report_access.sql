begin;
create temporary table xr(k text primary key,id uuid not null default gen_random_uuid());
insert into xr(k) values('owner'),('outsider'),('pending'),('former'),('member'),('root');
grant select on xr to authenticated;
insert into auth.users(id) select id from xr where k<>'root';
insert into public.profiles(user_id,username,is_public) select id,'xr_'||left(replace(id::text,'-',''),15),true from xr where k<>'root';
insert into public.experiences(id,creator_id,title,audience) select id,(select id from xr where k='owner'),'[TEST] report access','participants' from xr where k='root';
insert into public.experience_participants(experience_id,user_id,invitation_state) select (select id from xr where k='root'),id,case when k='pending' then 'invited' else 'accepted' end from xr where k in ('owner','member','pending','former');
delete from public.experience_participants where user_id=(select id from xr where k='former');
set local role authenticated;
do $$ declare actor uuid; begin
  for actor in select id from xr where k in ('outsider','pending','former') loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    if exists(select 1 from public.experiences where id=(select id from xr where k='root')) then raise exception 'FAIL inaccessible fixture visible'; end if;
    begin perform public.experience_report((select id from xr where k='root'),'spam','[TEST] forbidden'); raise exception 'FAIL inaccessible experience reported'; exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
  perform public.experience_report((select id from xr where k='root'),'spam','[TEST] visible');
end $$;
reset role;
do $$ begin if (select count(*) from public.content_reports where target_id=(select id from xr where k='root'))<>1 then raise exception 'FAIL invalid report retained'; end if; end $$;
update public.experiences set audience='profile' where id=(select id from xr where k='root');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='pending'),true);
do $$ begin begin perform public.experience_report((select id from xr where k='root'),'spam'); raise exception 'FAIL public pending report'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
