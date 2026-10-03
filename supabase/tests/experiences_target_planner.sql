-- A comment owns an interaction target as well as pointing to its parent target.
-- A recursive visibility predicate must not run on that own target before the
-- comment ID and parent join have been checked, regardless of the chosen plan.
begin;
create temporary table xpt(k text primary key,id uuid not null default gen_random_uuid());
insert into xpt(k) values('owner'),('root'),('post'),('target'),('comment'),('comment_target');
grant select,update on xpt to anon,authenticated;
insert into auth.users(id) select id from xpt where k='owner';
insert into public.profiles(user_id,username,is_public)
select id,'planner_'||left(replace(id::text,'-',''),15),true from xpt where k='owner';

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xpt where k='owner'),true);
update xpt set id=(public.experience_create('{"title":"[TEST] planner","state":"lived","kind":"walk"}')->>'id')::uuid where k='root';
select public.experience_update((select id from xpt where k='root'),(select revision from public.experiences where id=(select id from xpt where k='root')),'{"title":"[TEST] planner","state":"lived","shape":"single","audience":"profile"}');
update xpt set id=(public.experience_publish((select id from xpt where k='root'))->>'id')::uuid where k='post';
update xpt set id=(select id from public.interaction_targets where kind='post' and source_id=(select id from xpt where k='post')) where k='target';
insert into public.comments(id,author_id,interaction_target_id,body)
select (select id from xpt where k='comment'),auth.uid(),(select id from xpt where k='target'),'[TEST] planner comment';
update xpt set id=(select id from public.interaction_targets where kind='comment' and source_id=(select id from xpt where k='comment')) where k='comment_target';
reset role;

-- Prefer the ID indexes for the first plan, then force nested sequential scans.
-- Settings change only after fixture creation and are rolled back with the test.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
set local enable_seqscan=off;
set local enable_indexscan=on;
set local enable_indexonlyscan=on;
set local enable_bitmapscan=on;
set local enable_hashjoin=on;
set local enable_mergejoin=on;
do $$ begin
  if public.can_view_target('comment',(select id from xpt where k='comment')) is distinct from true
    or public.can_view_interaction_target((select id from xpt where k='comment_target')) is distinct from true
    then raise exception 'FAIL public comment with index plan'; end if;
end $$;
set local enable_seqscan=on;
set local enable_indexscan=off;
set local enable_indexonlyscan=off;
set local enable_bitmapscan=off;
set local enable_hashjoin=off;
set local enable_mergejoin=off;
do $$ begin
  if public.can_view_target('comment',(select id from xpt where k='comment')) is distinct from true
    or public.can_view_interaction_target((select id from xpt where k='comment_target')) is distinct from true
    then raise exception 'FAIL public comment with sequential plan'; end if;
end $$;

-- Restore the normal planner before mutating the root.
set local enable_indexscan=on;
set local enable_indexonlyscan=on;
set local enable_bitmapscan=on;
set local enable_hashjoin=on;
set local enable_mergejoin=on;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xpt where k='owner'),true);
select public.experience_update((select id from xpt where k='root'),(select revision from public.experiences where id=(select id from xpt where k='root')),'{"title":"[TEST] planner","state":"lived","shape":"single","audience":"private"}');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
set local enable_seqscan=off;
do $$ begin
  if public.can_view_target('comment',(select id from xpt where k='comment')) is distinct from false
    or public.can_view_interaction_target((select id from xpt where k='comment_target')) is distinct from false
    then raise exception 'FAIL private comment with index plan'; end if;
end $$;
set local enable_seqscan=on;
set local enable_indexscan=off;
set local enable_indexonlyscan=off;
set local enable_bitmapscan=off;
set local enable_hashjoin=off;
set local enable_mergejoin=off;
do $$ begin
  if public.can_view_target('comment',(select id from xpt where k='comment')) is distinct from false
    or public.can_view_interaction_target((select id from xpt where k='comment_target')) is distinct from false
    then raise exception 'FAIL private comment with sequential plan'; end if;
end $$;
reset role;
rollback;
