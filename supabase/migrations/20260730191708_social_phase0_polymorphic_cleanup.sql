-- Social Phase 0: remove existing inert polymorphic orphans and prevent new
-- ones. Reports are audit evidence: target deletion resolves them but never
-- deletes them.

-- Remove reactions whose target row no longer exists. Visibility is not used
-- here: valid private targets must survive the cleanup.
delete from public.reactions r
where not case r.target_type
  when 'diary_entry' then exists (select 1 from public.passes p where p.id = r.target_id)
  when 'pass' then exists (select 1 from public.passes p where p.id = r.target_id)
  when 'episode_watch' then exists (select 1 from public.episode_watches e where e.id = r.target_id)
  when 'progress_session' then exists (select 1 from public.progress_sessions s where s.id = r.target_id)
  when 'club_post' then exists (select 1 from public.club_posts cp where cp.id = r.target_id)
  when 'comment' then exists (select 1 from public.comments c where c.id = r.target_id)
  when 'activity_checkpoint' then exists (
    select 1 from public.club_activity_checkpoints cc where cc.id = r.target_id
  )
  when 'club_activity' then exists (
    select 1 from public.club_activities ca where ca.id = r.target_id
  )
  else false
end;

delete from public.comments c
where not case c.target_type
  when 'diary_entry' then exists (select 1 from public.passes p where p.id = c.target_id)
  when 'pass' then exists (select 1 from public.passes p where p.id = c.target_id)
  when 'episode_watch' then exists (select 1 from public.episode_watches e where e.id = c.target_id)
  when 'progress_session' then exists (select 1 from public.progress_sessions s where s.id = c.target_id)
  when 'club_post' then exists (select 1 from public.club_posts cp where cp.id = c.target_id)
  when 'activity_checkpoint' then exists (
    select 1 from public.club_activity_checkpoints cc where cc.id = c.target_id
  )
  when 'club_activity' then exists (
    select 1 from public.club_activities ca where ca.id = c.target_id
  )
  else false
end;

-- The previous DELETE may itself orphan reactions on deleted comments.
delete from public.reactions r
where r.target_type = 'comment'
  and not exists (select 1 from public.comments c where c.id = r.target_id);

-- Notification target_type is intentionally text rather than target_kind; only
-- purge the known target labels when their referenced row is gone.
delete from public.notifications n
where n.target_id is not null
  and (
    (n.target_type = 'diary_entry' and not exists (
      select 1 from public.passes p where p.id = n.target_id
    ))
    or (n.target_type = 'pass' and not exists (
      select 1 from public.passes p where p.id = n.target_id
    ))
    or (n.target_type = 'episode_watch' and not exists (
      select 1 from public.episode_watches e where e.id = n.target_id
    ))
    or (n.target_type = 'progress_session' and not exists (
      select 1 from public.progress_sessions s where s.id = n.target_id
    ))
    or (n.target_type = 'club' and not exists (
      select 1 from public.clubs c where c.id = n.target_id
    ))
    or (n.target_type = 'club_post' and not exists (
      select 1 from public.club_posts cp where cp.id = n.target_id
    ))
    or (n.target_type = 'comment' and not exists (
      select 1 from public.comments c where c.id = n.target_id
    ))
    or (n.target_type = 'activity_checkpoint' and not exists (
      select 1 from public.club_activity_checkpoints cc where cc.id = n.target_id
    ))
    or (n.target_type in ('club_activity', 'club_event') and not exists (
      select 1 from public.club_activities ca where ca.id = n.target_id
    ))
  );

create or replace function private.cleanup_social_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_type text;
begin
  foreach v_target_type in array tg_argv loop
    -- Deleting comments first intentionally fires this same cleanup function on
    -- each comment, removing likes/notifications about that comment too.
    delete from public.comments c
    where c.target_type::text = v_target_type
      and c.target_id = old.id;

    delete from public.reactions r
    where r.target_type::text = v_target_type
      and r.target_id = old.id;

    delete from public.notifications n
    where n.target_type = v_target_type
      and n.target_id = old.id;

    update public.content_reports cr
    set status = 'actioned',
        target_deleted_at = coalesce(cr.target_deleted_at, now()),
        reviewed_at = coalesce(cr.reviewed_at, now())
    where cr.target_type::text = v_target_type
      and cr.target_id = old.id
      and cr.target_deleted_at is null;
  end loop;

  return old;
end;
$function$;

revoke execute on function private.cleanup_social_target() from public, anon, authenticated;

create trigger trg_passes_cleanup_social_target
  after delete on public.passes
  for each row execute function private.cleanup_social_target('diary_entry', 'pass');

create trigger trg_episode_watches_cleanup_social_target
  after delete on public.episode_watches
  for each row execute function private.cleanup_social_target('episode_watch');

create trigger trg_progress_sessions_cleanup_social_target
  after delete on public.progress_sessions
  for each row execute function private.cleanup_social_target('progress_session');

create trigger trg_clubs_cleanup_social_target
  after delete on public.clubs
  for each row execute function private.cleanup_social_target('club');

create trigger trg_club_posts_cleanup_social_target
  after delete on public.club_posts
  for each row execute function private.cleanup_social_target('club_post');

create trigger trg_comments_cleanup_social_target
  after delete on public.comments
  for each row execute function private.cleanup_social_target('comment');

create trigger trg_activity_checkpoints_cleanup_social_target
  after delete on public.club_activity_checkpoints
  for each row execute function private.cleanup_social_target('activity_checkpoint');

create trigger trg_club_activities_cleanup_social_target
  after delete on public.club_activities
  for each row execute function private.cleanup_social_target('club_activity', 'club_event');
