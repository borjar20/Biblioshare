begin;
create temporary table xc(k text primary key,id uuid not null default gen_random_uuid());
insert into xc(k) values('owner'),('member'),('outside'),('root'),('guest');
grant select on xc to authenticated;
insert into auth.users(id) select id from xc where k in ('owner','member','outside');
insert into public.profiles(user_id,username,is_public) select id,'xc_'||left(replace(id::text,'-',''),15),true from xc where k in ('owner','member','outside');
insert into public.experiences(id,creator_id,title,audience) select id,(select id from xc where k='owner'),'[TEST] older companion','participants' from xc where k='root';
insert into public.experience_participants(experience_id,user_id,invitation_state) select (select id from xc where k='root'),id,'accepted' from xc where k in ('owner','member');
insert into public.experience_participants(id,experience_id,guest_name,invitation_state) select id,(select id from xc where k='root'),'Ana del museo','accepted' from xc where k='guest';
-- More than a result page of newer memories without this companion.
insert into public.experiences(creator_id,title) select (select id from xc where k='owner'),'[TEST] newer '||i from generate_series(1,22) i;
insert into public.experience_participants(experience_id,user_id,invitation_state) select id,creator_id,'accepted' from public.experiences where creator_id=(select id from xc where k='owner') and id<>(select id from xc where k='root');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xc where k='owner'),true);
do $$ begin
  if (select count(*) from public.get_experience_companions())<>2 or not exists(select 1 from public.get_experience_companions() where id=(select id from xc where k='guest')) then raise exception 'FAIL older companion missing'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xc where k='outside'),true);
do $$ begin if exists(select 1 from public.get_experience_companions()) then raise exception 'FAIL unrelated companion list'; end if; end $$;
reset role;
rollback;
