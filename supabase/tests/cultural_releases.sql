-- Real PostgreSQL roles and synthetic accounts; local/dev only, every write rolls back.
begin;
create temporary table release_fixture(k text primary key,id uuid not null default gen_random_uuid());
insert into release_fixture(k) values('a'),('b'),('admin'),('day'),('month'),('year'),('unknown'),('draft'),('cancelled'),('dst'),('season'),('published_book');
grant select on release_fixture to anon,authenticated,service_role;
insert into auth.users(id) select id from release_fixture where k in ('a','b','admin');
insert into public.profiles(user_id,username,is_public,role)
  select id,'rls_'||left(replace(id::text,'-',''),15),true,case when k='admin' then 'admin'::public.user_role else 'user'::public.user_role end
  from release_fixture where k in ('a','b','admin');
insert into public.cultural_releases(id,work_key,source,source_key,item_type,modality,market,language,date_value,date_precision,status,title,source_name,source_url)
  select id,'editorial:'||id::text,'editorial',id::text,'book','book','ES','es',
    case k when 'day' then ((now() at time zone 'Europe/Madrid')::date+1)::text when 'month' then '2027-02' when 'year' then '2027' when 'dst' then '2026-03-30' else null end,
    case k when 'day' then 'day' when 'month' then 'month' when 'year' then 'year' when 'dst' then 'day' else 'unknown' end,
    case k when 'draft' then 'draft' when 'cancelled' then 'cancelled' else 'published' end,'[TEST] release '||k,'Editorial test','https://example.invalid/releases'
  from release_fixture where k in ('day','month','year','unknown','draft','cancelled','dst');

-- Public reads include cancellation facts, never drafts or private consent.
set local role anon;
do $$ begin
  if (select count(*) from public.cultural_releases where id in (select id from release_fixture))<>6 then raise exception 'FAIL public snapshots'; end if;
  begin perform * from public.release_subscriptions; raise exception 'FAIL anonymous consent read'; exception when insufficient_privilege then null; end;
  begin perform * from public.release_deliveries; raise exception 'FAIL anonymous ledger read'; exception when insufficient_privilege then null; end;
  begin perform public.release_set_subscription((select id from release_fixture where k='day'),true); raise exception 'FAIL anonymous subscription'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A public profile's preferences are still private. Clients cannot bypass the RPC.
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='a'),true);
set local role authenticated;
select public.release_set_subscription(id,true) from release_fixture where k in ('day','month','year','unknown','dst');
do $$ begin
  if (select count(*) from public.release_subscriptions where release_id in (select id from release_fixture))<>5 then raise exception 'FAIL own subscriptions'; end if;
  begin insert into public.release_subscriptions(user_id,release_id,baseline_revision) select (select id from release_fixture where k='b'),id,1 from release_fixture where k='day'; raise exception 'FAIL forged owner'; exception when insufficient_privilege then null; end;
  begin update public.cultural_releases set status='published' where id=(select id from release_fixture where k='draft'); raise exception 'FAIL normal direct publish'; exception when insufficient_privilege then null; end;
  begin perform public.release_editorial_save('{"title":"[TEST] forbidden"}'); raise exception 'FAIL non-admin RPC publish'; exception when insufficient_privilege then null; end;
  begin perform * from public.claim_release_deliveries(); raise exception 'FAIL client claim'; exception when insufficient_privilege then null; end;
  begin perform * from public.accept_release_delivery(gen_random_uuid(),gen_random_uuid()); raise exception 'FAIL client accept'; exception when insufficient_privilege then null; end;
  begin perform public.retry_release_delivery(gen_random_uuid(),gen_random_uuid()); raise exception 'FAIL client retry'; exception when insufficient_privilege then null; end;
  begin perform * from public.release_upsert_tmdb('[]',now()); raise exception 'FAIL client sync'; exception when insufficient_privilege then null; end;
  begin perform public.release_set_subscription((select id from release_fixture where k='draft'),true); raise exception 'FAIL draft subscription'; exception when invalid_parameter_value then null; end;
  begin perform public.release_set_subscription((select id from release_fixture where k='cancelled'),true); raise exception 'FAIL cancelled subscription'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='b'),true);
set local role authenticated;
do $$ begin if exists(select 1 from public.release_subscriptions where user_id=(select id from release_fixture where k='a')) then raise exception 'FAIL public-profile consent leaked'; end if; end $$;
select public.release_set_subscription((select id from release_fixture where k='unknown'),true);
reset role;

-- Constraints validate real dates/precision, type/modality, and exact season identity.
do $$ begin
  begin update public.cultural_releases set date_value='2027-02-30',date_precision='day' where id=(select id from release_fixture where k='day'); raise exception 'FAIL impossible day'; exception when check_violation then null; end;
  begin update public.cultural_releases set date_value='2027-13',date_precision='month' where id=(select id from release_fixture where k='month'); raise exception 'FAIL invalid month'; exception when check_violation then null; end;
  begin update public.cultural_releases set date_value='2027-02-01',date_precision='month' where id=(select id from release_fixture where k='month'); raise exception 'FAIL invented day'; exception when check_violation then null; end;
  begin update public.cultural_releases set date_value='2027',date_precision='unknown' where id=(select id from release_fixture where k='unknown'); raise exception 'FAIL unknown with date'; exception when check_violation then null; end;
  begin insert into public.cultural_releases(work_key,source,source_key,item_type,modality,market,title,source_name,source_url,tmdb_id)
    values('tmdb:tv:99','tmdb','tv:99:season:1:INT','series','season','INT','[TEST] bad season','TMDB','https://example.invalid',99); raise exception 'FAIL season without number'; exception when check_violation then null; end;
  begin insert into public.notifications(user_id,actor_id,type) values((select id from release_fixture where k='a'),(select id from release_fixture where k='b'),'release_reminder'); raise exception 'FAIL human release actor'; exception when check_violation then null; end;
end $$;

-- Market is part of release identity: ES and INT coexist under one work, with separate consent.
set local role service_role;
do $$ declare input jsonb; work text:='tmdb:movie:test:'||(select id::text from release_fixture where k='season'); rows_seen integer; attempt timestamptz:=clock_timestamp(); begin
  update public.release_sync_state set last_attempt_at=attempt where source='tmdb';
  input:=jsonb_build_object('work_key',work,'item_type','movie','modality','cinema','market','INT','language','es',
    'date_value','2027-10-12','date_precision','day','status','published','checked_at',now(),'title','[TEST] international cinema',
    'source_name','TMDB','source_url','https://example.invalid/movie','tmdb_id',99,'source_key',work||':cinema:INT');
  select count(*) into rows_seen from public.release_upsert_tmdb(jsonb_build_array(input),attempt);
  if rows_seen<>1 then raise exception 'FAIL TMDB insertion'; end if;
  perform public.release_upsert_tmdb(jsonb_build_array(input||jsonb_build_object('market','ES','source_key',work||':cinema:ES','title','[TEST] Spanish cinema')),attempt);
  perform public.release_upsert_tmdb(jsonb_build_array(input||jsonb_build_object('market','ES','modality','digital','source_key',work||':digital:ES','title','[TEST] Spanish digital')),attempt);
  if (select count(*) from public.cultural_releases where work_key=work)<>3 then raise exception 'FAIL market/modality grouping'; end if;
  begin
    perform public.release_upsert_tmdb(jsonb_build_array(input||jsonb_build_object('market','ES')),attempt);
    raise exception 'FAIL international identity moved to Spain';
  exception when invalid_parameter_value then null; end;
  perform public.release_upsert_tmdb('[]',attempt);
  if (select count(*) from public.cultural_releases where work_key=work and status='published')<>3 then raise exception 'FAIL absent provider cancelled rows'; end if;
end $$;
reset role;

-- A superseded source attempt cannot rewind date/revision/queue or mark source success.
set local role service_role;
do $$ declare payload jsonb; attempt_a timestamptz:='2026-10-06 09:00:00+00'; attempt_b timestamptz:='2026-10-06 10:00:00+00';
  prior public.cultural_releases; latest public.cultural_releases; work text:='tmdb:fence:'||(select id::text from release_fixture where k='season'); begin
  payload:=jsonb_build_object('work_key',work,'source_key',work||':cinema:ES','item_type','movie','modality','cinema','market','ES','language','es',
    'date_value','2027-10-12','date_precision','day','status','published','checked_at',attempt_a,'title','[TEST] source fencing',
    'source_name','TMDB','source_url','https://example.invalid/fence','tmdb_id',100);
  update public.release_sync_state set last_attempt_at=attempt_a,last_success_at=null where source='tmdb';
  select * into prior from public.release_upsert_tmdb(jsonb_build_array(payload),attempt_a);
  insert into public.release_subscriptions(user_id,release_id,baseline_revision) values((select id from release_fixture where k='a'),prior.id,prior.revision);
  update public.release_sync_state set last_attempt_at=attempt_b where source='tmdb';
  select * into latest from public.release_upsert_tmdb(jsonb_build_array(payload||jsonb_build_object('date_value','2027-10-14','checked_at',attempt_b)),attempt_b);
  if latest.revision<>2 then raise exception 'FAIL new source revision'; end if;
  begin perform public.release_upsert_tmdb(jsonb_build_array(payload),attempt_a); raise exception 'FAIL superseded source accepted'; exception when serialization_failure then null; end;
  begin perform public.release_upsert_tmdb('[]',null); raise exception 'FAIL missing source token accepted'; exception when serialization_failure then null; end;
  begin perform public.release_upsert_tmdb('[]',attempt_a); raise exception 'FAIL stale empty source batch accepted'; exception when serialization_failure then null; end;
  if (select date_value from public.cultural_releases where id=latest.id)<>'2027-10-14'
    or (select revision from public.cultural_releases where id=latest.id)<>2 then raise exception 'FAIL stale source rewound snapshot'; end if;
  if (select count(*) from public.release_deliveries where release_id=latest.id)<>1 then raise exception 'FAIL stale source changed queue'; end if;
  update public.release_sync_state set last_success_at=attempt_a where source='tmdb' and last_attempt_at=attempt_a;
  if found then raise exception 'FAIL stale source completion succeeded'; end if;
  if (select last_success_at from public.release_sync_state where source='tmdb') is not null then raise exception 'FAIL stale source completion marked success'; end if;
end $$;
reset role;

-- Rechecking metadata is not an effective release revision, and does not queue an update.
update public.cultural_releases set title='[TEST] revised title',checked_at=now(),revision=900 where id=(select id from release_fixture where k='unknown');
do $$ begin
  if (select revision from public.cultural_releases where id=(select id from release_fixture where k='unknown'))<>1 then raise exception 'FAIL metadata revision'; end if;
  if exists(select 1 from public.release_deliveries where release_id=(select id from release_fixture where k='unknown')) then raise exception 'FAIL recheck notification'; end if;
end $$;
update public.cultural_releases set date_value='2027-02',date_precision='month' where id=(select id from release_fixture where k='unknown');
do $$ begin
  if (select count(*) from public.release_deliveries where release_id=(select id from release_fixture where k='unknown') and reason='confirmed' and release_revision=2)<>2 then raise exception 'FAIL opted-in confirmation'; end if;
end $$;

-- Repeated enable is idempotent. Disable/resubscribe invalidates prior consent and jobs.
create temporary table previous_consent as select consent_generation from public.release_subscriptions where user_id=(select id from release_fixture where k='a') and release_id=(select id from release_fixture where k='unknown');
grant select on previous_consent to authenticated;
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='a'),true);
set local role authenticated;
select public.release_set_subscription((select id from release_fixture where k='unknown'),true);
do $$ begin if (select consent_generation from public.release_subscriptions where release_id=(select id from release_fixture where k='unknown'))<>(select consent_generation from previous_consent) then raise exception 'FAIL repeated enable generation'; end if; end $$;
select public.release_set_subscription((select id from release_fixture where k='unknown'),false);
select public.release_set_subscription((select id from release_fixture where k='unknown'),true);
reset role;
do $$ begin
  if (select baseline_revision from public.release_subscriptions where user_id=(select id from release_fixture where k='a') and release_id=(select id from release_fixture where k='unknown'))<>2 then raise exception 'FAIL new consent baseline'; end if;
  if (select state from public.release_deliveries where user_id=(select id from release_fixture where k='a') and release_id=(select id from release_fixture where k='unknown'))<>'suppressed' then raise exception 'FAIL stale consent queue'; end if;
  if (select consent_generation from public.release_subscriptions where user_id=(select id from release_fixture where k='a') and release_id=(select id from release_fixture where k='unknown'))=(select consent_generation from previous_consent) then raise exception 'FAIL new consent generation'; end if;
end $$;

create temporary table release_claims as select * from public.claim_release_deliveries(500) with no data;
grant all on release_claims to service_role;
set local role service_role;
insert into release_claims select * from public.claim_release_deliveries(500);
do $$ begin
  if (select count(*) from release_claims where release_id=(select id from release_fixture where k='day') and reason='reminder')<>1 then raise exception 'FAIL exact tomorrow reminder'; end if;
  if exists(select 1 from public.release_deliveries where release_id in (select id from release_fixture where k in ('month','year')) and reason='reminder') then raise exception 'FAIL partial reminder'; end if;
  if exists(select 1 from public.claim_release_deliveries(500) where release_id in (select id from release_fixture)) then raise exception 'FAIL unexpired claims returned twice'; end if;
end $$;
select public.accept_release_delivery(id,claim_token) from release_claims where release_id=(select id from release_fixture where k='day');
select public.accept_release_delivery(id,claim_token) from release_claims where release_id=(select id from release_fixture where k='day');
do $$ begin
  if (select count(*) from public.notifications where user_id=(select id from release_fixture where k='a') and target_id=(select id from release_fixture where k='day') and type='release_reminder')<>1 then raise exception 'FAIL notification dedupe'; end if;
  if (select count(*) from public.release_deliveries where release_id=(select id from release_fixture where k='day') and state='accepted' and accepted_at is not null and notification_id is not null)<>1 then raise exception 'FAIL atomic acceptance'; end if;
end $$;
reset role;

-- Disable after claim, before acceptance: no notification can be inserted.
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='b'),true);
set local role authenticated;
select public.release_set_subscription((select id from release_fixture where k='unknown'),false);
reset role;
set local role service_role;
select public.accept_release_delivery(id,claim_token) from release_claims where user_id=(select id from release_fixture where k='b');
do $$ begin if exists(select 1 from public.notifications where user_id=(select id from release_fixture where k='b') and target_id in (select id from release_fixture)) then raise exception 'FAIL acceptance after withdrawal'; end if; end $$;
reset role;

-- Revisions supersede unaccepted work. Explicit cancellation has its own reason.
update public.cultural_releases set date_value='2027-03',date_precision='month' where id=(select id from release_fixture where k='unknown');
update public.cultural_releases set status='cancelled' where id=(select id from release_fixture where k='unknown');
set local role service_role;
select public.accept_release_delivery(id,claim_token) from release_claims where user_id=(select id from release_fixture where k='a') and release_id=(select id from release_fixture where k='unknown');
do $$ begin
  if exists(select 1 from public.notifications where user_id=(select id from release_fixture where k='a') and target_id=(select id from release_fixture where k='unknown')) then raise exception 'FAIL stale revision accepted'; end if;
  if (select count(*) from public.release_deliveries where release_id=(select id from release_fixture where k='unknown') and reason='cancelled' and state='pending')<>1 then raise exception 'FAIL cancellation opted-in only'; end if;
end $$;
truncate release_claims;
insert into release_claims select * from public.claim_release_deliveries(500);
select public.accept_release_delivery(id,claim_token) from release_claims where reason='cancelled';
do $$ begin if (select count(*) from public.notifications where target_id=(select id from release_fixture where k='unknown') and type='release_cancelled' and actor_id is null)<>1 then raise exception 'FAIL cancellation notification'; end if; end $$;
reset role;

-- DST: 23:30 UTC is already the next Madrid civil day after the spring clock change.
set local role service_role;
truncate release_claims;
insert into release_claims select * from public.claim_release_deliveries(500,'2026-03-28 23:30:00+00');
do $$ begin if (select count(*) from release_claims where release_id=(select id from release_fixture where k='dst') and reason='reminder')<>1 then raise exception 'FAIL Madrid civil-date scheduling'; end if; end $$;
reset role;

-- Publishing an ISBN-less book uses the catalog-only RPC and leaves passes unchanged.
create temporary table initial_pass_count as select count(*) n from public.passes where user_id=(select id from release_fixture where k='admin');
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='admin'),true);
set local role authenticated;
do $$ declare published public.cultural_releases; begin
  if not exists(select 1 from public.cultural_releases where id=(select id from release_fixture where k='draft')) then raise exception 'FAIL admin draft read'; end if;
  select * into published from public.release_editorial_save(jsonb_build_object('title','[TEST] ISBN-less announcement','author','Test Author','modality','book','market','ES','language','es','dateValue',null,'datePrecision','unknown','status','published','sourceName','Test Editorial','sourceUrl','https://example.invalid/book'));
  if published.book_id is null then raise exception 'FAIL published book canonical catalog'; end if;
  begin perform public.release_editorial_save(jsonb_build_object('title','[TEST] conflict'),published.id,999); raise exception 'FAIL editorial conflict'; exception when serialization_failure then null; end;
end $$;
reset role;

-- Translation dates describe an edition/market; never invent the work's original year.
-- Cover direct publication at every supported known precision, then draft -> published.
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='admin'),true);
set local role authenticated;
do $$ declare
  input jsonb; published public.cultural_releases; draft public.cultural_releases;
  original public.cultural_releases; linked public.cultural_releases; date_case record;
begin
  input:=jsonb_build_object('title','[TEST] translation original year','author','Test Author',
    'modality','book_translation','market','ES','language','es','status','published',
    'sourceName','Test Editorial','sourceUrl','https://example.invalid/translation-year');
  for date_case in select * from (values
    ('2027-10-12','day'),('2027-10','month'),('2027','year')
  ) as wanted(date_value,date_precision) loop
    select * into published from public.release_editorial_save(
      input||jsonb_build_object('dateValue',date_case.date_value,'datePrecision',date_case.date_precision));
    if published.book_id is null then raise exception 'FAIL translated book catalog missing'; end if;
    if (select published_year from public.books where id=published.book_id) is not null then
      raise exception 'FAIL translation date invented original publication year (% precision)',date_case.date_precision;
    end if;
    if published.date_value is distinct from date_case.date_value
      or published.date_precision is distinct from date_case.date_precision then
      raise exception 'FAIL translation announcement date changed';
    end if;
  end loop;

  input:=input||jsonb_build_object('title','[TEST] draft translation original year',
    'dateValue','2028-03','datePrecision','month','status','draft');
  select * into draft from public.release_editorial_save(input);
  if draft.book_id is not null then raise exception 'FAIL draft translation created catalog'; end if;
  select * into published from public.release_editorial_save(input||jsonb_build_object('status','published'),
    draft.id,draft.revision,draft.updated_at);
  if published.book_id is null
    or (select published_year from public.books where id=published.book_id) is not null then
    raise exception 'FAIL draft publication invented translation original year';
  end if;
  if published.date_value<>'2028-03' or published.date_precision<>'month' then
    raise exception 'FAIL draft translation date changed';
  end if;

  -- Control: the ordinary book route retains its original publication year.
  select * into original from public.release_editorial_save(input||jsonb_build_object(
    'title','[TEST] ordinary book original year','modality','book','status','published',
    'dateValue','1998','datePrecision','year'));
  if original.book_id is null
    or (select published_year from public.books where id=original.book_id) is distinct from 1998 then
    raise exception 'FAIL ordinary book publication year lost';
  end if;

  -- Linking a known work preserves its original year rather than replacing it with translation year.
  select * into linked from public.release_editorial_save(input||jsonb_build_object(
    'title','[TEST] linked translation original year','modality','book_translation','status','published',
    'bookId',original.book_id,'dateValue','2030-05','datePrecision','month'));
  if linked.book_id is distinct from original.book_id
    or (select published_year from public.books where id=original.book_id) is distinct from 1998 then
    raise exception 'FAIL linked translation changed original book year';
  end if;
end $$;
reset role;


-- Editorial updated_at is a separate all-write token; event revisions never become edit counters.
select set_config('request.jwt.claim.sub',(select id::text from release_fixture where k='admin'),true);
set local role authenticated;
do $$ declare input jsonb; original public.cultural_releases; first_edit public.cultural_releases; reviewed public.cultural_releases; published public.cultural_releases; metadata_edit public.cultural_releases; begin
  input:=jsonb_build_object('title','[TEST] two editor snapshots','author','Test Author','modality','book','market','ES','language','es',
    'dateValue',null,'datePrecision','unknown','status','draft','sourceName','Test Editorial','sourceUrl','https://example.invalid/original');
  select * into original from public.release_editorial_save(input);
  select * into first_edit from public.release_editorial_save(input||jsonb_build_object('sourceUrl','https://example.invalid/corrected'),original.id,original.revision,original.updated_at);
  if first_edit.updated_at<=original.updated_at or first_edit.revision<>original.revision then raise exception 'FAIL edit token/event revision separation'; end if;
  begin perform public.release_editorial_save(input||jsonb_build_object('title','[TEST] stale title'),original.id,original.revision,original.updated_at); raise exception 'FAIL stale metadata accepted'; exception when serialization_failure then null; end;
  begin perform public.release_editorial_save(input,original.id,original.revision); raise exception 'FAIL missing editorial edit token'; exception when serialization_failure then null; end;
  begin perform public.release_editorial_save(input,original.id,original.revision,original.updated_at); raise exception 'FAIL stale mark reviewed accepted'; exception when serialization_failure then null; end;
  begin perform public.release_editorial_save(input||jsonb_build_object('status','published'),original.id,original.revision,original.updated_at); raise exception 'FAIL stale publish accepted'; exception when serialization_failure then null; end;
  if (select source_url from public.cultural_releases where id=original.id)<>'https://example.invalid/corrected' then raise exception 'FAIL stale metadata clobbered URL'; end if;
  select * into reviewed from public.release_editorial_save(input||jsonb_build_object('sourceUrl','https://example.invalid/corrected'),first_edit.id,first_edit.revision,first_edit.updated_at);
  if reviewed.updated_at<=first_edit.updated_at or reviewed.revision<>first_edit.revision then raise exception 'FAIL review token/event revision'; end if;
  select * into published from public.release_editorial_save(input||jsonb_build_object('sourceUrl','https://example.invalid/corrected','status','published'),reviewed.id,reviewed.revision,reviewed.updated_at);
  if published.revision<>reviewed.revision+1 or published.source_url<>'https://example.invalid/corrected' then raise exception 'FAIL fresh publish preserves metadata'; end if;
  perform public.release_set_subscription(published.id,true);
  select * into metadata_edit from public.release_editorial_save(input||jsonb_build_object('title','[TEST] corrected public metadata','sourceUrl','https://example.invalid/second-correction','status','published'),published.id,published.revision,published.updated_at);
  if metadata_edit.revision<>published.revision or metadata_edit.updated_at<=published.updated_at then raise exception 'FAIL public metadata false revision'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.release_deliveries d join public.cultural_releases r on r.id=d.release_id where r.title='[TEST] corrected public metadata') then raise exception 'FAIL metadata emitted false alert'; end if;
  if to_regprocedure('public.release_upsert_tmdb(jsonb)') is not null then raise exception 'FAIL legacy TMDB overload retained'; end if;
  if to_regprocedure('public.release_editorial_save(jsonb,uuid,integer)') is not null then raise exception 'FAIL legacy editorial overload retained'; end if;
end $$;
-- Revalidate every column grant and the replaced RPC ACL, not only default table privileges.
do $$ declare col record; role_name text; api text; begin
  for col in select table_name,column_name from information_schema.columns where table_schema='public'
    and table_name in ('cultural_releases','release_subscriptions','release_deliveries','release_sync_state') loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_column_privilege(role_name,('public.'||col.table_name)::regclass,col.column_name,'SELECT')
        is distinct from (col.table_name='cultural_releases' or (col.table_name='release_subscriptions' and role_name='authenticated')) then
        raise exception 'FAIL SELECT column grant %.% %',col.table_name,col.column_name,role_name;
      end if;
      if has_column_privilege(role_name,('public.'||col.table_name)::regclass,col.column_name,'INSERT')
        or has_column_privilege(role_name,('public.'||col.table_name)::regclass,col.column_name,'UPDATE') then
        raise exception 'FAIL client DML column grant %.% %',col.table_name,col.column_name,role_name;
      end if;
    end loop;
    if not has_column_privilege('service_role',('public.'||col.table_name)::regclass,col.column_name,'SELECT')
      or not has_column_privilege('service_role',('public.'||col.table_name)::regclass,col.column_name,'INSERT')
      or not has_column_privilege('service_role',('public.'||col.table_name)::regclass,col.column_name,'UPDATE') then
      raise exception 'FAIL service column grant %.%',col.table_name,col.column_name;
    end if;
  end loop;
  foreach api in array array['public.release_upsert_tmdb(jsonb,timestamptz)','public.claim_release_deliveries(integer,timestamptz)',
    'public.accept_release_delivery(uuid,uuid)','public.release_delivery_is_current(uuid,uuid)','public.retry_release_delivery(uuid,uuid,text)'] loop
    if has_function_privilege('anon',api,'EXECUTE') or has_function_privilege('authenticated',api,'EXECUTE')
      or not has_function_privilege('service_role',api,'EXECUTE') then raise exception 'FAIL service-only RPC ACL %',api; end if;
  end loop;
  if not has_function_privilege('authenticated','public.release_editorial_save(jsonb,uuid,integer,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.release_editorial_save(jsonb,uuid,integer,timestamptz)','EXECUTE') then raise exception 'FAIL editorial wrapper ACL'; end if;
end $$;
do $$ begin
  if (select count(*) from public.passes where user_id=(select id from release_fixture where k='admin'))<>(select n from initial_pass_count) then raise exception 'FAIL publishing changed passes'; end if;
  if exists(select 1 from cron.job where jobname='cultural-releases' and active) then raise exception 'FAIL scheduler activated before deployment'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('release_set_subscription','release_editorial_save','release_upsert_tmdb','claim_release_deliveries','accept_release_delivery','retry_release_delivery','release_delivery_is_current','release_date_valid','release_before_write','release_queue_change','release_invalidate_consent','dispatch_cultural_releases') and not ('search_path=""'=any(p.proconfig))) then raise exception 'FAIL release search_path'; end if;
end $$;
select 'PASS: release privacy, real roles, date constraints, opt-in generations, supersession, atomic dedupe, Madrid civil day, catalog-only publication and original work publication year';
rollback;
