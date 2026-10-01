-- #875: both event reference formats survive a book merge. All fixtures roll back.
begin;
create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $f$
begin
  if not coalesce(p_condition,false) then raise exception 'assertion_failed: %',p_message; end if;
end;
$f$;

do $seed$
declare
  actor uuid := '00000000-0000-4000-8000-000000875001';
  club uuid := '00000000-0000-4000-8000-000000875002';
  loser uuid := '00000000-0000-4000-8000-000000875003';
  winner uuid := '00000000-0000-4000-8000-000000875004';
  other_book uuid := '00000000-0000-4000-8000-000000875005';
  release_activity uuid := '00000000-0000-4000-8000-000000875010';
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(actor,'authenticated','authenticated','merge-event-875@example.test',now(),now());
  insert into public.profiles(user_id,username,role) values(actor,'merge_event_875','collaborator');
  insert into public.clubs(id,slug,name,owner_id) values(club,'merge-event-875','[TEST #875] references',actor);
  insert into public.books(id,title) values(loser,'[TEST #875] loser'),(winner,'[TEST #875] winner'),(other_book,'[TEST #875] other book');
  -- Catalog IDs may coincide across media; a matching UUID is not enough to repoint.
  insert into public.movies(id,title) values(loser,'[TEST #875] movie');
  insert into public.series(id,title) values(loser,'[TEST #875] series');
  insert into public.club_activities(id,club_id,created_by,kind,event_type,title,config)
  values(release_activity,club,actor,'evento','lanzamiento','release-book',
    jsonb_build_object('item',jsonb_build_object('itemType','book','itemId',loser::text),'releaseType','publicacion','allDay',false,'region','España','custom',jsonb_build_array(1,null,'keep')));
  insert into public.club_activities(club_id,created_by,kind,event_type,title,config) values
  (club,actor,'evento','fecha_destacada','date-books',jsonb_build_object('allDay',true,'custom','keep','relations',jsonb_build_array(
    jsonb_build_object('kind','item','itemType','book','itemId',loser::text,'extra','keep'),
    jsonb_build_object('kind','item','itemType','movie','itemId',loser::text),
    jsonb_build_object('kind','item','itemType','series','itemId',loser::text),
    jsonb_build_object('kind','activity','activityId',release_activity::text),
    jsonb_build_object('kind','item','itemType','book','itemId',other_book::text),
    null,
    jsonb_build_object('kind','item','itemType','book','itemId',loser::text),
    'opaque',17,
    jsonb_build_object('kind','item','itemType','book'),
    jsonb_build_object('kind','activity','activityId',release_activity::text,'itemType','book','itemId',loser::text),
    jsonb_build_object('kind','other','itemType','book','itemId',loser::text)))),
  (club,actor,'evento','lanzamiento','release-movie',jsonb_build_object('item',jsonb_build_object('itemType','movie','itemId',loser::text))),
  (club,actor,'evento','lanzamiento','release-series',jsonb_build_object('item',jsonb_build_object('itemType','series','itemId',loser::text))),
  (club,actor,'tierlist','fecha_destacada','other-kind',jsonb_build_object('item',jsonb_build_object('itemType','book','itemId',loser::text),'relations',jsonb_build_array(jsonb_build_object('kind','item','itemType','book','itemId',loser::text)))),
  (club,actor,'evento','encuentro','other-event',jsonb_build_object('item',jsonb_build_object('itemType','book','itemId',loser::text))),
  (club,actor,'evento','lanzamiento','null-config',null),
  (club,actor,'evento','lanzamiento','scalar-config','17'::jsonb),
  (club,actor,'evento','fecha_destacada','non-array',jsonb_build_object('relations',jsonb_build_object('kind','item','itemType','book','itemId',loser::text))),
  (club,actor,'evento','fecha_destacada','empty-array','{"relations":[],"allDay":true}'::jsonb),
  (club,actor,'evento','fecha_destacada','scalar-date','"opaque"'::jsonb);
end;
$seed$;

create temp table qa875_before on commit drop as
select id,title,config from public.club_activities where club_id='00000000-0000-4000-8000-000000875002';

do $test$
declare
  loser uuid := '00000000-0000-4000-8000-000000875003';
  winner uuid := '00000000-0000-4000-8000-000000875004';
  expected jsonb;
begin
  perform pg_temp.assert_true(not has_function_privilege('anon','public.merge_book_into(uuid,uuid)'::regprocedure,'execute'),'anon cannot merge');
  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.merge_book_into(uuid,uuid)'::regprocedure,'execute'),'authenticated cannot merge');
  perform pg_temp.assert_true(has_function_privilege('service_role','public.merge_book_into(uuid,uuid)'::regprocedure,'execute'),'service retains merge');
  execute 'set local role service_role';
  perform public.merge_book_into(loser,winner);
  execute 'reset role';
  select jsonb_set(config,'{item,itemId}',to_jsonb(winner::text),false) into expected from qa875_before where title='release-book';
  perform pg_temp.assert_true((select a.config=expected from public.club_activities a join qa875_before b using(id) where b.title='release-book'),'book release repoints only its itemId');
  select jsonb_set(jsonb_set(config,'{relations,0,itemId}',to_jsonb(winner::text),false),'{relations,6,itemId}',to_jsonb(winner::text),false)
  into expected from qa875_before where title='date-books';
  perform pg_temp.assert_true((select a.config=expected from public.club_activities a join qa875_before b using(id) where b.title='date-books'),'date repoints both books preserving order, duplicates, other media, activities and opaque entries');
  perform pg_temp.assert_true(not exists(select 1 from public.club_activities a join qa875_before b using(id) where b.title not in ('release-book','date-books') and a.config is distinct from b.config),'unrelated kinds, event types and malformed configs remain identical');
  perform pg_temp.assert_true(not exists(select 1 from public.books where id=loser) and exists(select 1 from public.books where id=winner),'book loser deleted and winner retained');
  perform pg_temp.assert_true(exists(select 1 from public.movies where id=loser) and exists(select 1 from public.series where id=loser),'coincident movie and series IDs retained');
  raise notice 'PASS #875: two event formats, order/keys, media guards, malformed configs, service ACL';
end;
$test$;
rollback;

-- An existing user-data conflict must abort before either JSON reference changes.
begin;
create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $f$
begin if not coalesce(p_condition,false) then raise exception 'assertion_failed: %',p_message; end if; end;
$f$;
do $test$
declare
  actor uuid := '00000000-0000-4000-8000-000000875001';
  club uuid := '00000000-0000-4000-8000-000000875002';
  loser uuid := '00000000-0000-4000-8000-000000875003';
  winner uuid := '00000000-0000-4000-8000-000000875004';
  blocked boolean := false;
  initial_release jsonb;
  initial_date jsonb;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values(actor,'authenticated','authenticated','merge-event-blocked-875@example.test',now(),now());
  insert into public.profiles(user_id,username,role) values(actor,'merge_event_blocked_875','collaborator');
  insert into public.clubs(id,slug,name,owner_id) values(club,'merge-event-blocked-875','[TEST #875] blocked',actor);
  insert into public.books(id,title) values(loser,'[TEST #875] blocked loser'),(winner,'[TEST #875] blocked winner');
  insert into public.passes(user_id,item_type,item_id,status,is_active) values(actor,'book',loser,'planned',true),(actor,'book',winner,'planned',true);
  initial_release:=jsonb_build_object('item',jsonb_build_object('itemType','book','itemId',loser::text));
  initial_date:=jsonb_build_object('relations',jsonb_build_array(jsonb_build_object('kind','item','itemType','book','itemId',loser::text)));
  insert into public.club_activities(club_id,created_by,kind,event_type,title,config) values
    (club,actor,'evento','lanzamiento','blocked-release',initial_release),
    (club,actor,'evento','fecha_destacada','blocked-date',initial_date);
  execute 'set local role service_role';
  begin perform public.merge_book_into(loser,winner);
  exception when others then blocked := sqlerrm like 'merge_book_into abortada:%passes%'; end;
  execute 'reset role';
  perform pg_temp.assert_true(blocked,'two active passes preserve the conservative abort');
  perform pg_temp.assert_true((select config=initial_release from public.club_activities where club_id=club and title='blocked-release'),'abort preserves release reference');
  perform pg_temp.assert_true((select config=initial_date from public.club_activities where club_id=club and title='blocked-date'),'abort preserves date reference');
  perform pg_temp.assert_true((select count(*) from public.books where id in(loser,winner))=2,'abort preserves both books');
  perform pg_temp.assert_true((select count(*) from public.passes where user_id=actor and item_id in(loser,winner))=2,'abort preserves both passes');
  raise notice 'PASS #875: user conflict aborts before event references or books change';
end;
$test$;
rollback;
