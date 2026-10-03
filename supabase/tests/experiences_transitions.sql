begin;
create temporary table experience_transition(k text primary key,id uuid not null default gen_random_uuid());
insert into experience_transition(k) values('owner'),('other'),('limit_owner'),('root'),('moment'),('second');
grant select,update on experience_transition to authenticated;
insert into auth.users(id) select id from experience_transition where k in ('owner','other','limit_owner');
select set_config('request.jwt.claim.sub',(select id::text from experience_transition where k='owner'),true);
set local role authenticated;
do $$ declare result jsonb; root_id uuid; first_id uuid; second_id uuid; begin
  result := public.experience_create('{"title":"[TEST] concert","state":"lived","kind":"concert"}');
  root_id := (result->>'id')::uuid;
  update experience_transition set id=root_id where k='root';
  select id into first_id from public.experience_moments where experience_id=root_id;
  update experience_transition set id=first_id where k='moment';
  if (select count(*) from public.experience_moments where experience_id=root_id) <> 1 then raise exception 'FAIL atomic first moment'; end if;
  if not exists(select 1 from public.experience_moment_participants where moment_id=first_id and attendance_state='attended') then raise exception 'FAIL creator lived attendance'; end if;
  result := public.experience_update(root_id,0,'{"title":"[TEST] trip","shape":"trip","state":"lived","audience":"private"}');
  if result->>'revision' <> '1' then raise exception 'FAIL revision'; end if;
  begin
    perform public.experience_update(root_id,0,'{"title":"stale","shape":"trip","state":"lived","audience":"private"}');
    raise exception 'FAIL stale write accepted';
  exception when sqlstate 'PT409' then null; end;
  result := public.experience_save_moment(root_id,1,'{"title":"[TEST] museum","kind":"museum"}');
  second_id := (result->>'id')::uuid;
  update experience_transition set id=second_id where k='second';
  if not exists(select 1 from public.experience_moments where id=first_id and experience_id=root_id) then raise exception 'FAIL first moment moved'; end if;
  perform public.experience_reorder_moments(root_id,2,array[second_id,first_id]);
  if (select position from public.experience_moments where id=second_id) <> 0 then raise exception 'FAIL ordering'; end if;
  begin
    perform public.experience_reorder_moments(root_id,3,array[first_id,first_id]);
    raise exception 'FAIL duplicate ordering';
  exception when sqlstate '22023' then null; end;
  perform public.experience_remove_moment(root_id,3,second_id);
  begin
    perform public.experience_remove_moment(root_id,4,first_id);
    raise exception 'FAIL last moment removed';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.experience_create('{"title":"invalid","state":"planned","kind":"walk","startsOn":"2026-10-02","endsOn":"2026-10-01"}');
    raise exception 'FAIL invalid dates persisted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.experience_update(root_id,4,'{"title":"forge","shape":"single","state":"planned","audience":"private","creator_id":"00000000-0000-0000-0000-000000000001"}');
    raise exception 'FAIL immutable field accepted';
  exception when sqlstate '22023' then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from experience_transition where k='other'),true);
do $$ begin
  begin
    perform public.experience_reorder_moments((select id from experience_transition where k='root'),4,array[(select id from experience_transition where k='moment')]);
    raise exception 'FAIL alien structural mutation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare alien uuid:=gen_random_uuid(); begin
  insert into public.experiences(id,creator_id,title) values(alien,(select id from experience_transition where k='other'),'[TEST] other memory');
  begin
    update public.experience_moment_participants set experience_id=alien
      where moment_id=(select id from experience_transition where k='moment');
    raise exception 'FAIL cross-root attendance FK';
  exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from experience_transition where k='limit_owner'),true);
set local role authenticated;
do $$ declare e uuid; i integer; begin
  e:=(public.experience_create('{"title":"[TEST] limit","state":"planned","kind":"other"}')->>'id')::uuid;
  for i in 1..49 loop perform public.experience_save_moment(e,i-1,'{"title":"[TEST] moment","kind":"other"}'); end loop;
  begin
    perform public.experience_save_moment(e,49,'{"title":"[TEST] 51","kind":"other"}');
    raise exception 'FAIL moment limit';
  exception when sqlstate 'PT429' then null; end;
  if (select count(*) from public.experience_moments where experience_id=e)<>50 then raise exception 'FAIL exact moment boundary'; end if;
end $$;
reset role;
rollback;
