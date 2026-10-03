-- DEV/local only, postgres. Run after the experience browser suite, then run
-- cleanup-pending-photos --project=dev --kind=deleted --hours=1 --execute.
-- Never expose private audit deletion as a client RPC just to support tests.
begin;
create temporary table xp_cleanup_roots as
select e.id from public.experiences e join auth.users u on u.id=e.creator_id
 where e.title like '[QA Experiences]%' and u.email like 'qa_exp_%@example.invalid'
union select target_id from private.moderation_history
 where kind='experience' and snapshot->>'title' like '[QA Experiences]%';
create temporary table xp_cleanup_posts as
select id from public.posts where anchor_type='experience' and anchor_id in(select id from xp_cleanup_roots)
union select target_id from private.moderation_history where kind='post' and snapshot->>'anchor_type'='experience'
 and snapshot->>'anchor_id' in(select id::text from xp_cleanup_roots);
-- Preserve paths in the service-only queue before discarding QA evidence.
insert into private.experience_photo_cleanup(storage_path,queued_at)
select distinct p.value#>>'{}',now()-interval '2 hours'
from (select snapshot from private.moderation_history where target_id in(select id from xp_cleanup_roots union select id from xp_cleanup_posts)
 union all select snapshot from public.content_reports where target_id in(select id from xp_cleanup_roots union select id from xp_cleanup_posts)) s,
 lateral jsonb_path_query(s.snapshot,'$.**.storage_path') p(value)
where split_part(p.value#>>'{}','/',1) in(select id::text from xp_cleanup_roots)
on conflict(storage_path) do update set queued_at=excluded.queued_at;
delete from public.content_reports where target_id in(select id from xp_cleanup_roots union select id from xp_cleanup_posts);
delete from private.moderation_state where target_id in(select id from xp_cleanup_roots union select id from xp_cleanup_posts);
delete from private.moderation_history where target_id in(select id from xp_cleanup_roots union select id from xp_cleanup_posts);
-- Any surviving live fixture belongs to a disposable actor, never persistent QA.
delete from public.experiences where id in(select id from xp_cleanup_roots);
update private.experience_photo_cleanup set queued_at=now()-interval '2 hours'
 where split_part(storage_path,'/',1) in(select id::text from xp_cleanup_roots);
commit;
