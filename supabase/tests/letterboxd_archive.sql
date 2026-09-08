-- Observable persistence contracts; synthetic, rollback-only local fixture.
begin;
do $test$
declare
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); movie uuid := gen_random_uuid();
  job uuid; next_job uuid; analysis jsonb; outcome text; relation text;
begin
  insert into auth.users(id) values(actor),(outsider);
  insert into public.profiles(user_id,username) values(actor,'archive_'||left(actor::text,8)),(outsider,'archive_'||left(outsider::text,8));
  insert into public.movies(id,title) values(movie,'Synthetic archive film');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  analysis := jsonb_build_object('fingerprint',repeat('a',64),'movies',jsonb_build_array(jsonb_build_object(
    'sourceKey',repeat('b',64),'title','Synthetic archive film','planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('c',64),'finishedOn','2020-01-01','rating',6),
      jsonb_build_object('sourceKey',repeat('d',64),'finishedOn','2020-01-01','rating',8)))));
  analysis := analysis || jsonb_build_object('conflicts',jsonb_build_array(jsonb_build_object('movieKey',repeat('b',64),'sourceKey',repeat('9',64),'review','Unassociated text','rating',9)));
  job := public.archive_create(analysis);
  if (select jsonb_array_length(payload->'reviewConflicts') from public.archive_import_items where job_id=job and ordinal=0) <> 1 then raise exception 'FAIL lost review conflict'; end if;
  if exists(select 1 from public.passes where user_id=actor) then raise exception 'FAIL preview wrote passes'; end if;
  perform public.archive_confirm(job,false,false);
  outcome := public.archive_apply(job,0,movie);
  if outcome <> 'imported' or (select count(*) from public.passes where user_id=actor) <> 2 then raise exception 'FAIL two same-day passes'; end if;
  if (select count(*) from public.passes where user_id=actor and is_active) <> 1 then raise exception 'FAIL active pass'; end if;
  perform public.archive_apply(job,0,movie);
  if (select count(*) from public.passes where user_id=actor) <> 2 then raise exception 'FAIL replay duplicates'; end if;
  if public.archive_create(analysis) <> job then raise exception 'FAIL repeated ZIP'; end if;
  -- Source corrections update the original viewing and undo restores its date.
  analysis := jsonb_set(jsonb_set(analysis,'{fingerprint}',to_jsonb(repeat('e',64))),'{movies,0,passes,0,finishedOn}','"2021-01-01"');
  next_job := public.archive_create(analysis);
  perform public.archive_confirm(next_job,false,false);
  if public.archive_apply(next_job,0,movie) <> 'imported' then raise exception 'FAIL source date update'; end if;
  if not exists(select 1 from public.passes where user_id=actor and finished_on='2021-01-01' and is_active and rating=6) then raise exception 'FAIL corrected date active ordering'; end if;
  if public.archive_undo(next_job) <> 0 then raise exception 'FAIL undo correction'; end if;
  if (select count(*) from public.passes where user_id=actor and finished_on='2020-01-01') <> 2 then raise exception 'FAIL restored viewing dates'; end if;
  -- Source snapshots must track restored rows so later archives can update them.
  analysis := jsonb_set(analysis,'{fingerprint}',to_jsonb(repeat('f',64)));
  next_job := public.archive_create(analysis);
  perform public.archive_confirm(next_job,false,false);
  if public.archive_apply(next_job,0,movie) <> 'imported' then raise exception 'FAIL provenance after undo'; end if;
  -- Explicit conflict acceptance must not collapse two origins onto one local pass.
  movie := gen_random_uuid();
  insert into public.movies(id,title) values(movie,'Local overlap');
  insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating) values(actor,'movie',movie,'completed',true,'2019-01-01',2);
  insert into public.progress_sessions(user_id,pass_id,note) select actor,id,'prior session' from public.passes where user_id=actor and item_id=movie;
  analysis := jsonb_build_object('fingerprint',repeat('1',64),'movies',jsonb_build_array(jsonb_build_object('sourceKey',repeat('2',64),'title','Local overlap','planned',false,'passes',jsonb_build_array(
    jsonb_build_object('sourceKey',repeat('3',64),'finishedOn','2019-01-01','rating',6),
    jsonb_build_object('sourceKey',repeat('4',64),'finishedOn','2019-01-01','rating',8)))));
  next_job := public.archive_create(analysis); perform public.archive_confirm(next_job,false,false);
  if public.archive_apply(next_job,0,movie) <> 'conflict' then raise exception 'FAIL local conflict missing'; end if;
  perform public.archive_resolve(next_job,0,'accept');
  if public.archive_apply(next_job,0,movie) <> 'imported' then raise exception 'FAIL accepted overlap'; end if;
  if (select count(*) from public.passes where user_id=actor and item_id=movie) <> 2 then raise exception 'FAIL collapsed origins'; end if;
  if public.archive_undo(next_job) <> 0 then raise exception 'FAIL undo overlap'; end if;
  if (select count(*) from public.passes where user_id=actor and item_id=movie and rating=2) <> 1 then raise exception 'FAIL restored local note'; end if;
  -- Several local candidates stay ambiguous until explicitly imported separately.
  insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating) values(actor,'movie',movie,'completed',false,'2019-01-01',3);
  analysis := replace(replace(replace(analysis::text,repeat('1',64),repeat('5',64)),repeat('3',64),repeat('6',64)),repeat('4',64),repeat('7',64))::jsonb;
  next_job := public.archive_create(analysis); perform public.archive_confirm(next_job,false,false);
  if public.archive_apply(next_job,0,movie) <> 'conflict' then raise exception 'FAIL ambiguous overlap'; end if;
  perform public.archive_resolve(next_job,0,'accept');
  if public.archive_apply(next_job,0,movie) <> 'conflict' then raise exception 'FAIL ambiguous auto-link'; end if;
  perform public.archive_resolve(next_job,0,'separate');
  if public.archive_apply(next_job,0,movie) <> 'imported' then raise exception 'FAIL explicit separate'; end if;
  if (select count(*) from public.passes where user_id=actor and item_id=movie) <> 4 then raise exception 'FAIL separate lost local passes'; end if;
  insert into public.progress_sessions(user_id,pass_id,note) select actor,id,'later session' from public.passes where user_id=actor and item_id=movie and rating=8;
  if public.archive_undo(next_job)=0 then raise exception 'FAIL removed pass with later session'; end if;
  if (select count(*) from public.progress_sessions where user_id=actor) <> 2 then raise exception 'FAIL lost sessions'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  begin
    perform public.archive_apply(job,0,movie);
    raise exception 'FAIL outsider permitted';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  for relation in select unnest(array['archive_imports','archive_import_items','archive_import_sources','archive_import_effects']) loop
    if not has_table_privilege('authenticated','public.'||relation,'SELECT') or has_table_privilege('authenticated','public.'||relation,'INSERT,UPDATE,DELETE') then raise exception 'FAIL owner table ACL %',relation; end if;
    if has_table_privilege('anon','public.'||relation,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'FAIL anon table ACL %',relation; end if;
  end loop;
  if not has_column_privilege('authenticated','public.archive_imports','announcement_snapshot','SELECT') or has_column_privilege('authenticated','public.archive_imports','announcement_snapshot','UPDATE') then raise exception 'FAIL new column grant'; end if;
  if has_function_privilege('anon','public.archive_create(jsonb)','EXECUTE') then raise exception 'FAIL anon RPC'; end if;
  raise notice 'PASS archive: preview, two passes/day, replay, active pass, source corrections, undo provenance and ownership';
end $test$;
rollback;
