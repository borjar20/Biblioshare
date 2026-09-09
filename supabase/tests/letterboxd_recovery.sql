-- Synthetic fixture. Each test run rolls back every effect.
begin;
do $test$
declare actor uuid := gen_random_uuid(); job uuid; movie uuid; result jsonb; local_pass uuid; version text; count_before integer;
begin
  insert into auth.users(id) values(actor);
  insert into public.profiles(user_id,username) values(actor,'recovery_'||left(actor::text,8));
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('a',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic new film','sourceKey',repeat('b',64),'planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('c',64),'finishedOn','2020-01-01','rating',8))))));
  perform public.archive_confirm(job,false,false);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  movie := public.archive_register_movie(job,0,987654321,jsonb_build_object('title','Synthetic new film','coverUrl','https://image.tmdb.org/t/p/w342/synthetic.jpg'));
  if not exists(select 1 from public.movies where id=movie and title='Synthetic new film' and cover_url is not null and hydrated_at is not null) then raise exception 'FAIL usable catalog'; end if;
  if public.archive_apply(job,0,movie) <> 'imported' then raise exception 'FAIL automatic new movie'; end if;
  if (select count(*) from public.passes where user_id=actor and item_id=movie) <> 1 then raise exception 'FAIL missing pass'; end if;
  perform public.archive_finish(job);
  if (select state from public.archive_imports where id=job) <> 'done' then raise exception 'FAIL final state'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('d',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic retry','sourceKey',repeat('e',64),'planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('f',64),'finishedOn','2022-01-01','rating',6,'review','Imported review'))))));
  perform public.archive_confirm(job,false,false);
  perform public.archive_error(job,0,'provider_temporary');
  perform public.archive_finish(job);
  if (select state from public.archive_imports where id=job) <> 'partial' then raise exception 'FAIL error presented as finished'; end if;
  perform public.archive_resolve(job,0,'retry');
  insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating) values(actor,'movie',movie,'completed',false,'2022-01-01',6) returning id into local_pass;
  if public.archive_apply(job,0,movie) <> 'conflict' then raise exception 'FAIL association must be proposed'; end if;
  result := public.archive_review_row(job,0);
  version := result->>'version';
  if not (result->'comparisons'->0->>'proposed')::boolean then raise exception 'FAIL missing proposal'; end if;
  if (select review from public.passes where id=local_pass) is not null then raise exception 'FAIL preview wrote review'; end if;
  result := public.archive_decide(job,0,'associate',result->>'version');
  if result->>'state' <> 'imported' then raise exception 'FAIL association not applied: %',result; end if;
  if (select count(*) from public.passes where user_id=actor and finished_on='2022-01-01') <> 1 then raise exception 'FAIL association duplicated'; end if;
  if (select review from public.passes where id=local_pass) <> 'Imported review' then raise exception 'FAIL gap not filled'; end if;
  result := public.archive_decide(job,0,'associate',version);
  if result->>'state' <> 'imported' then raise exception 'FAIL repeat confirmation'; end if;
  select count(*) into count_before from public.archive_import_decisions where job_id=job;
  perform public.archive_review_job(job);
  if (select count(*) from public.archive_import_decisions where job_id=job)<>count_before then raise exception 'FAIL plan wrote decisions'; end if;
  if public.archive_undo(job)<>0 then raise exception 'FAIL association undo'; end if;
  if (select review from public.passes where id=local_pass) is not null then raise exception 'FAIL restore original review'; end if;
  if exists(select 1 from public.archive_import_sources where user_id=actor and source_key=repeat('f',64)) then raise exception 'FAIL undo left association'; end if;
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('1',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic concurrent','sourceKey',repeat('2',64),'planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('3',64),'finishedOn','2022-01-01','rating',6,'review','Other imported review'))))));
  perform public.archive_confirm(job,false,false);
  perform public.archive_apply(job,0,movie);
  result := public.archive_review_row(job,0);
  update public.passes set review='Later local edit' where id=local_pass;
  result := public.archive_decide(job,0,'accept',result->>'version');
  if result->>'state'<>'stale' then raise exception 'FAIL stale confirmation applied'; end if;
  if (select review from public.passes where id=local_pass)<>'Later local edit' then raise exception 'FAIL lost later edit'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.archive_review_job(job);
    raise exception 'FAIL outsider read';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  result := public.archive_review_row(job,0);
  perform public.archive_decide(job,0,'accept',result->>'version');
  update public.passes set finished_on='2023-01-01' where id=local_pass;
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('4',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic absent date','sourceKey',repeat('2',64),'planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('3',64),'finishedOn',null,'rating',6,'review',null))))));
  perform public.archive_confirm(job,false,false);
  if public.archive_apply(job,0,movie)<>'conflict' then raise exception 'FAIL edited date not protected'; end if;
  result := public.archive_review_row(job,0);
  result := public.archive_decide(job,0,'accept',result->>'version');
  if result->>'state'<>'imported' or (select finished_on from public.passes where id=local_pass)<>'2023-01-01' then raise exception 'FAIL absent date erased local date'; end if;
  update public.passes set review='Another local edit' where id=local_pass;
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('5',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic mixed viewings','sourceKey',repeat('2',64),'planned',false,'passes',jsonb_build_array(
      jsonb_build_object('sourceKey',repeat('3',64),'finishedOn','2023-01-01','rating',6,'review','Reviewed value'),
      jsonb_build_object('sourceKey',repeat('6',64),'finishedOn','2024-01-01','rating',8,'review','New viewing'))))));
  perform public.archive_confirm(job,false,false);
  if public.archive_apply(job,0,movie)<>'conflict' then raise exception 'FAIL mixed row not reviewed'; end if;
  select count(*) into count_before from public.passes where user_id=actor;
  result := public.archive_review_row(job,0);
  if not (result->'comparisons'->1->>'unrepresented')::boolean then raise exception 'FAIL new viewing not identified'; end if;
  result := public.archive_decide(job,0,'accept',result->>'version');
  if result->>'state'<>'imported' or (select count(*) from public.passes where user_id=actor)<>count_before+1 then raise exception 'FAIL mixed row added wrong count'; end if;
  if (public.archive_summary(job)->>'passes')::integer<>2 then raise exception 'FAIL actual incorporated pass count'; end if;
  job := public.archive_create(jsonb_build_object('fingerprint',repeat('7',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic retry cap','sourceKey',repeat('8',64),'planned',false,'passes','[]'::jsonb))));
  perform public.archive_confirm(job,false,false);
  for count_before in 1..3 loop
    perform public.archive_error(job,0,'provider_temporary');
    perform public.archive_finish(job);
    if count_before<3 then perform public.archive_resolve(job,0,'retry'); end if;
  end loop;
  begin
    perform public.archive_resolve(job,0,'retry');
    raise exception 'FAIL unlimited retries';
  exception when raise_exception then
    if sqlerrm<>'not_retryable' then raise; end if;
  end;
end $test$;
do $policy$
declare actor uuid:=gen_random_uuid(); movie uuid:=gen_random_uuid(); local_pass uuid; job_a uuid; job_b uuid; job_c uuid; analysis jsonb; comparison jsonb;
begin
  insert into auth.users(id) values(actor);
  insert into public.profiles(user_id,username) values(actor,'policy_'||left(actor::text,8));
  insert into public.movies(id,title) values(movie,'Synthetic policy');
  insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating,review) values(actor,'movie',movie,'completed',true,'2020-01-01',8,'Original local review') returning id into local_pass;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  analysis:=jsonb_build_object('fingerprint',repeat('a',64),'movies',jsonb_build_array(jsonb_build_object('title','Synthetic policy','sourceKey',repeat('b',64),'planned',true,'passes',jsonb_build_array(jsonb_build_object('sourceKey',repeat('c',64),'finishedOn','2020-01-01','rating',8,'review','Archive review')))));
  job_a:=public.archive_create(analysis); perform public.archive_confirm(job_a,false,false); perform public.archive_apply(job_a,0,movie);
  comparison:=public.archive_review_row(job_a,0);
  if comparison->>'plannedAction'<>'add' then raise exception 'FAIL planned effect omitted'; end if;
  perform public.archive_decide(job_a,0,'associate',comparison->>'version');
  if not (select fill_only from public.archive_import_sources where user_id=actor and source_key=repeat('c',64)) then raise exception 'FAIL missing fill policy'; end if;
  update public.passes set review='Later local review' where id=local_pass;
  job_b:=public.archive_create(jsonb_set(analysis,'{fingerprint}',to_jsonb(repeat('d',64))));
  perform public.archive_confirm(job_b,false,false); perform public.archive_apply(job_b,0,movie);
  comparison:=public.archive_review_row(job_b,0);
  perform public.archive_decide(job_b,0,'accept',comparison->>'version');
  if (select fill_only from public.archive_import_sources where user_id=actor and source_key=repeat('c',64)) then raise exception 'FAIL acceptance policy'; end if;
  if public.archive_undo(job_b)<>0 then raise exception 'FAIL undo accepted policy'; end if;
  if not (select fill_only from public.archive_import_sources where user_id=actor and source_key=repeat('c',64)) then raise exception 'FAIL undo lost fill policy'; end if;
  job_c:=public.archive_create(jsonb_set(analysis,'{fingerprint}',to_jsonb(repeat('e',64))));
  perform public.archive_confirm(job_c,false,false);
  if public.archive_apply(job_c,0,movie)<>'imported' then raise exception 'FAIL reimport after policy undo'; end if;
  if (select review from public.passes where id=local_pass)<>'Later local review' then raise exception 'FAIL later import overwrote restored local review'; end if;
end $policy$;
do $interleaved$
declare actor uuid:=gen_random_uuid(); movie_a uuid:=gen_random_uuid(); movie_b uuid:=gen_random_uuid(); job uuid; comparison jsonb; expected_source jsonb;
begin
  insert into auth.users(id) values(actor);
  insert into public.profiles(user_id,username) values(actor,'inter_'||left(actor::text,8));
  insert into public.movies(id,title) values(movie_a,'Synthetic interleave A'),(movie_b,'Synthetic interleave B');
  insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating)
    values(actor,'movie',movie_a,'completed',true,'2020-01-01',8),(actor,'movie',movie_b,'completed',true,'2020-01-01',8);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  job:=public.archive_create(jsonb_build_object('fingerprint',repeat('1',64),'movies',jsonb_build_array(
    jsonb_build_object('title','Synthetic interleave A','sourceKey',repeat('2',64),'planned',false,'passes',jsonb_build_array(jsonb_build_object('sourceKey',repeat('3',64),'finishedOn','2020-01-01','rating',8))),
    jsonb_build_object('title','Synthetic interleave B','sourceKey',repeat('4',64),'planned',false,'passes',jsonb_build_array(jsonb_build_object('sourceKey',repeat('5',64),'finishedOn','2020-01-01','rating',8))))));
  perform public.archive_confirm(job,false,false);
  perform public.archive_apply(job,0,movie_a); perform public.archive_apply(job,1,movie_b);
  comparison:=public.archive_review_row(job,0);
  perform public.archive_decide(job,0,'associate',comparison->>'version');
  -- Another operation changes only policy after the first decision, without changing a pass.
  update public.archive_import_sources set fill_only=false where user_id=actor and source_key=repeat('3',64);
  select to_jsonb(s) into expected_source from public.archive_import_sources s where user_id=actor and source_key=repeat('3',64);
  comparison:=public.archive_review_row(job,1);
  perform public.archive_decide(job,1,'associate',comparison->>'version');
  if public.archive_undo(job)=0 then raise exception 'FAIL interleaved source change unprotected'; end if;
  if (select to_jsonb(s) from public.archive_import_sources s where user_id=actor and source_key=repeat('3',64)) is distinct from expected_source then raise exception 'FAIL interleaved policy erased'; end if;
end $interleaved$;

do $grants$
begin
  if has_function_privilege('authenticated','public.archive_register_movie(uuid,integer,bigint,jsonb)','EXECUTE') or has_function_privilege('anon','public.archive_register_movie(uuid,integer,bigint,jsonb)','EXECUTE') then raise exception 'FAIL exposed server registration'; end if;
  if not has_function_privilege('service_role','public.archive_register_movie(uuid,integer,bigint,jsonb)','EXECUTE') then raise exception 'FAIL worker registration denied'; end if;
  if not has_column_privilege('authenticated','public.archive_import_items','attempts','SELECT') or has_column_privilege('authenticated','public.archive_import_items','attempts','UPDATE') then raise exception 'FAIL attempts column grants'; end if;
  if not has_column_privilege('authenticated','public.archive_import_sources','fill_only','SELECT') or has_column_privilege('authenticated','public.archive_import_sources','fill_only','UPDATE') then raise exception 'FAIL source policy grants'; end if;
  if has_table_privilege('authenticated','private.archive_source_effects','SELECT,INSERT,UPDATE,DELETE') then raise exception 'FAIL private journal exposed'; end if;
end $grants$;
rollback;
\echo PASS letterboxd recovery contracts
