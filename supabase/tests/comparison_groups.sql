-- Synthetic fixtures, real API roles, no persisted data. Local/dev only.
begin;
-- RED before installation: these real object references must fail.
select count(*) from public.comparison_groups;
select count(*) from public.comparison_group_members;
select 'public.save_comparison_group(uuid,text,uuid[],integer)'::regprocedure;
select 'public.delete_comparison_group(uuid,integer)'::regprocedure;
create temporary table comparison_fixture(n integer primary key, id uuid not null default gen_random_uuid());
insert into comparison_fixture(n) select generate_series(0,14);
grant select on comparison_fixture to authenticated, anon;
insert into auth.users(id) select id from comparison_fixture;
insert into public.profiles(user_id,username,is_public)
select id, 'cmp_' || left(replace(id::text,'-',''),18), n <> 1 from comparison_fixture;
insert into public.follows(follower_id,followee_id,status)
select (select id from comparison_fixture where n=0), id,
case when n=12 then 'pending'::public.follow_status else 'accepted'::public.follow_status end
from comparison_fixture where n between 1 and 12;
insert into public.user_blocks(blocker_id,blocked_id)
select (select id from comparison_fixture where n=11),id from comparison_fixture where n=0;
-- Preserve an accepted follow in this admin-only fixture to isolate can_view_profile.
insert into public.follows(follower_id,followee_id,status)
select (select id from comparison_fixture where n=0),id,'accepted' from comparison_fixture where n=11;
create function pg_temp.expect_error(q text, expected text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Expected %, got %: % / %', expected, sqlstate, sqlerrm, q;
  end;
  raise exception 'Expected %, succeeded: %', expected, q;
end $$;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.ids(lo integer, hi integer) returns uuid[] language sql as $$
select array_agg(id order by n) from comparison_fixture where n between lo and hi
$$;

-- Catalog ACL contract: column grants, immutable identity/token, private API.
select pg_temp.check_true(not has_table_privilege('anon', 'public.comparison_groups', 'SELECT'), 'anon table');
select pg_temp.check_true(not has_table_privilege('authenticated', 'public.comparison_groups', 'INSERT'), 'no broad insert');
select pg_temp.check_true(not has_column_privilege('authenticated', 'public.comparison_groups', 'revision', 'UPDATE'), 'revision immutable');
select pg_temp.check_true(not has_column_privilege('authenticated', 'public.comparison_groups', 'owner_id', 'INSERT'), 'owner immutable');
select pg_temp.check_true(not has_column_privilege('authenticated', 'public.comparison_group_members', 'user_id', 'UPDATE'), 'participant immutable');
select pg_temp.check_true(has_column_privilege('authenticated', 'public.comparison_groups', 'name', 'INSERT,UPDATE'), 'name writable');
select pg_temp.check_true(has_column_privilege('authenticated', 'public.comparison_group_members', 'position', 'INSERT,UPDATE'), 'position writable');
select pg_temp.check_true(not has_function_privilege('anon', 'public.save_comparison_group(uuid,text,uuid[],integer)', 'EXECUTE'), 'anon RPC');
select pg_temp.check_true(not has_function_privilege('anon', 'public.delete_comparison_group(uuid,integer)', 'EXECUTE'), 'anon delete RPC');
select pg_temp.check_true(not exists (
  select 1 from information_schema.columns c
  where c.table_schema='public' and c.table_name in ('comparison_groups','comparison_group_members')
  and (has_column_privilege('authenticated', ('public.'||c.table_name)::regclass,c.column_name,'INSERT')
       <> case when c.table_name='comparison_groups' then c.column_name='name' else c.column_name in ('group_id','user_id','position') end
    or has_column_privilege('authenticated', ('public.'||c.table_name)::regclass,c.column_name,'UPDATE')
       <> case when c.table_name='comparison_groups' then c.column_name='name' else c.column_name='position' end)
), 'every column matches intended grant surface');
select pg_temp.check_true(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('comparison_group_touch','comparison_member_guard','comparison_group_size_check','save_comparison_group','delete_comparison_group') and (prosecdef or proconfig is distinct from array['search_path=""'])), 'invoker empty search_path');

select set_config('request.jwt.claim.sub',(select id::text from comparison_fixture where n=0),true);
set local role authenticated;
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,10),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,' ',pg_temp.ids(0,1),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,repeat('x',61),pg_temp.ids(0,1),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,1),1)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||pg_temp.ids(0,0),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||array[null::uuid],null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||pg_temp.ids(12,12),null)$q$,'42501');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||pg_temp.ids(13,13),null)$q$,'42501');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||pg_temp.ids(11,11),null)$q$,'42501');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',null,null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_comparison_group('invalid','x',pg_temp.ids(0,1),null)$q$,'22P02');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,0)||array[gen_random_uuid()],null)$q$,'42501');
select public.save_comparison_group(null,'  pair  ',pg_temp.ids(0,1),null);
select public.save_comparison_group(null,'others',pg_temp.ids(1,2),null);
select public.save_comparison_group(null,'ten',pg_temp.ids(0,9),null);
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select count(*)=3 from public.comparison_groups), '2/10, private followed, without self');
select pg_temp.check_true((select name='pair' and revision=3 from public.comparison_groups where name='pair'), 'trim/final revision');
select pg_temp.expect_error($q$insert into public.comparison_groups(owner_id,name) values (auth.uid(),'spoof')$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_groups set owner_id=auth.uid()$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_groups set id=gen_random_uuid()$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_groups set revision=9$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_group_members set user_id=auth.uid()$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_group_members set group_id=gen_random_uuid()$q$,'42501');
select pg_temp.expect_error($q$update public.comparison_group_members set id=gen_random_uuid()$q$,'42501');
select pg_temp.expect_error($q$select public.save_comparison_group(id,'stale',pg_temp.ids(0,1),1) from public.comparison_groups where name='pair'$q$,'PT409');
select pg_temp.expect_error($q$select public.delete_comparison_group(id,1) from public.comparison_groups where name='pair'$q$,'PT409');
select pg_temp.expect_error($q$select public.delete_comparison_group(gen_random_uuid(),1)$q$,'PT404');
-- Deferred cardinality catches direct DML and rolls back the invalid subtransaction.
select pg_temp.expect_error($q$insert into public.comparison_groups(name) values ('empty'); set constraints all immediate$q$,'22023');
select pg_temp.expect_error($q$delete from public.comparison_group_members where group_id=(select id from public.comparison_groups where name='pair') and position=1; set constraints all immediate$q$,'22023');
select pg_temp.expect_error($q$insert into public.comparison_group_members(group_id,user_id,position) select id,(pg_temp.ids(10,10))[1],10 from public.comparison_groups where name='ten'$q$,'23514');
select pg_temp.expect_error($q$insert into public.comparison_group_members(group_id,user_id,position) select id,(pg_temp.ids(0,0))[1],2 from public.comparison_groups where name='pair'$q$,'23505');
select pg_temp.expect_error($q$insert into public.comparison_group_members(group_id,user_id,position) select id,(pg_temp.ids(12,12))[1],2 from public.comparison_groups where name='pair'$q$,'42501');
-- A single UPDATE can swap positions; the unique position constraint is deferred.
update public.comparison_group_members set position=1-position where group_id=(select id from public.comparison_groups where name='pair');
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select revision=5 from public.comparison_groups where name='pair'),'direct reorder token');
reset role;
create temporary table comparison_saved as select id,revision,name from public.comparison_groups where owner_id=(pg_temp.ids(0,0))[1];
grant select on comparison_saved to authenticated,anon;
select set_config('request.jwt.claim.sub',(select id::text from comparison_fixture where n=14),true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.comparison_groups),'third party groups hidden');
select pg_temp.check_true((select count(*)=0 from public.comparison_group_members),'third party members hidden');
select pg_temp.expect_error($q$select public.save_comparison_group(id,'foreign',pg_temp.ids(0,1),revision) from comparison_saved where name='pair'$q$,'PT404');
select pg_temp.expect_error($q$select public.delete_comparison_group(id,revision) from comparison_saved where name='pair'$q$,'PT404');
select pg_temp.expect_error($q$insert into public.comparison_group_members(group_id,user_id,position) select id,auth.uid(),2 from comparison_saved where name='pair'$q$,'42501');
update public.comparison_groups set name='hijacked';
delete from public.comparison_groups;
reset role;
set local role anon;
select pg_temp.expect_error('select * from public.comparison_groups','42501');
select pg_temp.expect_error('select * from public.comparison_group_members','42501');
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(0,1),null)$q$,'42501');
select pg_temp.expect_error($q$select public.delete_comparison_group(gen_random_uuid(),1)$q$,'42501');
reset role;
-- Existing slots survive a deleted account; deleting that user does not edit the group.
delete from auth.users where id=(pg_temp.ids(1,1))[1];
select pg_temp.check_true((select count(*)=3 from public.comparison_group_members where user_id=(pg_temp.ids(1,1))[1]),'deleted user slots preserved');
delete from public.follows where follower_id=(pg_temp.ids(0,0))[1] and followee_id=(pg_temp.ids(2,2))[1];
select set_config('request.jwt.claim.sub',(pg_temp.ids(0,0))[1]::text,true);
set local role authenticated;
-- Removed/deleted people can be removed, but never re-added.
select pg_temp.expect_error($q$select public.save_comparison_group(id,'others',pg_temp.ids(1,2),revision) from public.comparison_groups where name='others'$q$,'42501');
select public.save_comparison_group(id,'edited',pg_temp.ids(3,4),revision) from public.comparison_groups where name='others';
select pg_temp.check_true((select name='edited' and revision>3 from public.comparison_groups where name='edited'), 'replacement returns persisted token');
select public.delete_comparison_group(id,revision) from public.comparison_groups where name='pair';
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select count(*)=2 from public.comparison_groups),'edit/delete after lost access');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($q$select public.save_comparison_group(null,'x',pg_temp.ids(3,4),null)$q$,'42501');
select pg_temp.expect_error($q$select public.delete_comparison_group(gen_random_uuid(),1)$q$,'42501');
reset role;
-- Owner cascade must also skip deferred checks for vanished parents.
delete from auth.users where id=(pg_temp.ids(0,0))[1];
set constraints all immediate;
select pg_temp.check_true((select count(*)=0 from public.comparison_groups where id in (select id from comparison_saved)),'owner cascade');
select 'PASS: comparison groups real-role/ACL/direct-DML/deferred-size contract';
rollback;
