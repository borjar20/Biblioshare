-- Social Phase 1: canonical interaction registry.  The legacy polymorphic
-- columns remain during the application transition, but database ownership,
-- visibility, and lifecycle are now rooted in interaction_targets.

alter type public.notification_type add value if not exists 'activity_liked';
alter type public.notification_type add value if not exists 'activity_commented';
alter type public.notification_type add value if not exists 'checkpoint_commented';

-- New enum labels cannot be used by the following DDL until committed.
commit;

create type public.interaction_audience_kind as enum (
  'profile',
  'club_member',
  'activity_participant',
  'checkpoint_reached'
);

create table public.interaction_targets (
  id uuid primary key default gen_random_uuid(),
  kind public.target_kind not null,
  source_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience_kind public.interaction_audience_kind not null,
  audience_id uuid not null,
  href text not null check (href like '/%'),
  commentable boolean not null,
  reactable boolean not null,
  comment_notification_type public.notification_type,
  reaction_notification_type public.notification_type,
  unique (kind, source_id),
  constraint interaction_targets_commentable_shape check (
    commentable = (comment_notification_type is not null)
  ),
  constraint interaction_targets_reactable_shape check (
    reactable = (reaction_notification_type is not null)
  )
);

alter table public.interaction_targets enable row level security;
revoke all on table public.interaction_targets from anon, authenticated;
grant select on table public.interaction_targets to anon, authenticated;

create or replace function private.item_interaction_href(
  p_item_type public.item_type,
  p_item_id uuid,
  p_community boolean default false
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case p_item_type
    when 'book' then '/libro/'
    when 'movie' then '/pelicula/'
    when 'series' then '/serie/'
  end || p_item_id::text || case when p_community then '?tab=community' else '' end;
$function$;

create or replace function private.upsert_interaction_target(
  p_kind public.target_kind,
  p_source_id uuid,
  p_owner_id uuid,
  p_audience_kind public.interaction_audience_kind,
  p_audience_id uuid,
  p_href text,
  p_commentable boolean,
  p_reactable boolean,
  p_comment_notification_type public.notification_type,
  p_reaction_notification_type public.notification_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  insert into public.interaction_targets as target (
    kind, source_id, owner_id, audience_kind, audience_id, href,
    commentable, reactable, comment_notification_type, reaction_notification_type
  ) values (
    p_kind, p_source_id, p_owner_id, p_audience_kind, p_audience_id, p_href,
    p_commentable, p_reactable, p_comment_notification_type, p_reaction_notification_type
  ) on conflict (kind, source_id) do update set
    owner_id = excluded.owner_id,
    audience_kind = excluded.audience_kind,
    audience_id = excluded.audience_id,
    href = excluded.href,
    commentable = excluded.commentable,
    reactable = excluded.reactable,
    comment_notification_type = excluded.comment_notification_type,
    reaction_notification_type = excluded.reaction_notification_type
  returning target.id into v_id;
  return v_id;
end;
$function$;
revoke execute on function private.upsert_interaction_target(public.target_kind, uuid, uuid, public.interaction_audience_kind, uuid, text, boolean, boolean, public.notification_type, public.notification_type) from public, anon, authenticated;

create or replace function private.sync_pass_interaction_targets()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform private.upsert_interaction_target('diary_entry', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href(new.item_type, new.item_id, true), true, true, 'review_commented', 'review_liked');
  perform private.upsert_interaction_target('pass', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href(new.item_type, new.item_id), true, true, 'activity_commented', 'activity_liked');
  return new;
end;
$function$;

create or replace function private.sync_episode_watch_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform private.upsert_interaction_target('episode_watch', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href('series', new.series_id, true), true, true, 'review_commented', 'review_liked');
  return new;
end;
$function$;

create or replace function private.sync_progress_session_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_item_type public.item_type; v_item_id uuid;
begin
  select p.item_type, p.item_id into v_item_type, v_item_id from public.passes p where p.id = new.pass_id;
  perform private.upsert_interaction_target('progress_session', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href(v_item_type, v_item_id), true, true, 'activity_commented', 'activity_liked');
  return new;
end;
$function$;

create or replace function private.sync_club_post_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_slug text;
begin
  select slug into v_slug from public.clubs where id = new.club_id;
  perform private.upsert_interaction_target('club_post', new.id, new.author_id, 'club_member', new.club_id,
    '/club/' || v_slug, true, true, 'club_post_commented', 'club_post_liked');
  return new;
end;
$function$;

create or replace function private.sync_club_activity_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_slug text;
begin
  select slug into v_slug from public.clubs where id = new.club_id;
  perform private.upsert_interaction_target('club_activity', new.id, new.created_by, 'activity_participant', new.id,
    '/club/' || v_slug || '/actividad/' || new.id::text, true, true, 'activity_commented', 'activity_liked');
  return new;
end;
$function$;

create or replace function private.sync_checkpoint_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_slug text; v_owner uuid;
begin
  select c.slug, a.created_by into v_slug, v_owner
  from public.club_activities a join public.clubs c on c.id = a.club_id where a.id = new.activity_id;
  perform private.upsert_interaction_target('activity_checkpoint', new.id, v_owner, 'checkpoint_reached', new.id,
    '/club/' || v_slug || '/actividad/' || new.activity_id::text, true, false, 'checkpoint_commented', null);
  return new;
end;
$function$;

create or replace function private.sync_comment_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_parent public.interaction_targets%rowtype;
begin
  select * into v_parent from public.interaction_targets where id = new.interaction_target_id;
  if not found then raise exception 'invalid_interaction_target' using errcode = '23503'; end if;
  perform private.upsert_interaction_target('comment', new.id, new.author_id, v_parent.audience_kind, v_parent.audience_id,
    v_parent.href, false, true, null, 'comment_liked');
  return new;
end;
$function$;

alter table public.comments add column interaction_target_id uuid;
alter table public.reactions add column interaction_target_id uuid;
alter table public.notifications add column interaction_target_id uuid;
alter table public.comments add constraint comments_interaction_target_id_fkey foreign key (interaction_target_id) references public.interaction_targets(id) on delete cascade;
alter table public.reactions add constraint reactions_interaction_target_id_fkey foreign key (interaction_target_id) references public.interaction_targets(id) on delete cascade;
alter table public.notifications add constraint notifications_interaction_target_id_fkey foreign key (interaction_target_id) references public.interaction_targets(id) on delete cascade;
create index comments_interaction_target_idx on public.comments (interaction_target_id, created_at);
create index reactions_interaction_target_idx on public.reactions (interaction_target_id);
create index notifications_interaction_target_idx on public.notifications (interaction_target_id);

create or replace function private.resolve_interaction_target(
  p_kind public.target_kind, p_source_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_target_id uuid;
begin
  select id into v_target_id from public.interaction_targets where kind = p_kind and source_id = p_source_id;
  if v_target_id is null then raise exception 'invalid_interaction_target' using errcode = '23503'; end if;
  return v_target_id;
end;
$function$;
revoke execute on function private.resolve_interaction_target(public.target_kind, uuid) from public, anon, authenticated;

create or replace function private.resolve_comment_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  -- Legacy fields are still the compatibility input. Ignore any canonical id
  -- supplied by a client so authority remains the source registry.
  new.interaction_target_id := private.resolve_interaction_target(new.target_type, new.target_id);
  return new;
end;
$function$;

create or replace function private.resolve_reaction_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  new.interaction_target_id := private.resolve_interaction_target(new.target_type, new.target_id);
  return new;
end;
$function$;

create or replace function private.resolve_notification_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_target_id uuid;
begin
  if new.target_type is null or new.target_id is null then
    new.interaction_target_id := null;
  else
    select t.id into v_target_id
    from public.interaction_targets t
    where t.kind::text = new.target_type and t.source_id = new.target_id;
    new.interaction_target_id := v_target_id;
  end if;
  return new;
end;
$function$;

create trigger trg_comments_resolve_interaction_target before insert or update of target_type, target_id on public.comments for each row execute function private.resolve_comment_interaction_target();
create trigger trg_reactions_resolve_interaction_target before insert or update of target_type, target_id on public.reactions for each row execute function private.resolve_reaction_interaction_target();
create trigger trg_notifications_resolve_interaction_target before insert or update of target_type, target_id on public.notifications for each row execute function private.resolve_notification_interaction_target();

create trigger trg_passes_sync_interaction_targets after insert or update of user_id, item_type, item_id on public.passes for each row execute function private.sync_pass_interaction_targets();
create trigger trg_episode_watches_sync_interaction_target after insert or update of user_id, series_id on public.episode_watches for each row execute function private.sync_episode_watch_interaction_target();
create trigger trg_progress_sessions_sync_interaction_target after insert or update of user_id, pass_id on public.progress_sessions for each row execute function private.sync_progress_session_interaction_target();
create trigger trg_club_posts_sync_interaction_target after insert or update of club_id, author_id on public.club_posts for each row execute function private.sync_club_post_interaction_target();
create trigger trg_club_activities_sync_interaction_target after insert or update of club_id, created_by on public.club_activities for each row execute function private.sync_club_activity_interaction_target();
create trigger trg_activity_checkpoints_sync_interaction_target after insert or update of activity_id, created_by on public.club_activity_checkpoints for each row execute function private.sync_checkpoint_interaction_target();
create trigger trg_comments_sync_interaction_target after insert on public.comments for each row execute function private.sync_comment_interaction_target();

-- Backfill sources first, then the derived comment targets, then consumers.
select private.upsert_interaction_target('diary_entry', p.id, p.user_id, 'profile', p.user_id, private.item_interaction_href(p.item_type, p.item_id, true), true, true, 'review_commented', 'review_liked') from public.passes p;
select private.upsert_interaction_target('pass', p.id, p.user_id, 'profile', p.user_id, private.item_interaction_href(p.item_type, p.item_id), true, true, 'activity_commented', 'activity_liked') from public.passes p;
select private.upsert_interaction_target('episode_watch', e.id, e.user_id, 'profile', e.user_id, private.item_interaction_href('series', e.series_id, true), true, true, 'review_commented', 'review_liked') from public.episode_watches e;
select private.upsert_interaction_target('progress_session', s.id, s.user_id, 'profile', s.user_id, private.item_interaction_href(p.item_type, p.item_id), true, true, 'activity_commented', 'activity_liked') from public.progress_sessions s join public.passes p on p.id = s.pass_id;
select private.upsert_interaction_target('club_post', cp.id, cp.author_id, 'club_member', cp.club_id, '/club/' || c.slug, true, true, 'club_post_commented', 'club_post_liked') from public.club_posts cp join public.clubs c on c.id = cp.club_id;
select private.upsert_interaction_target('club_activity', a.id, a.created_by, 'activity_participant', a.id, '/club/' || c.slug || '/actividad/' || a.id::text, true, true, 'activity_commented', 'activity_liked') from public.club_activities a join public.clubs c on c.id = a.club_id;
select private.upsert_interaction_target('activity_checkpoint', cp.id, a.created_by, 'checkpoint_reached', cp.id, '/club/' || c.slug || '/actividad/' || a.id::text, true, false, 'checkpoint_commented', null) from public.club_activity_checkpoints cp join public.club_activities a on a.id = cp.activity_id join public.clubs c on c.id = a.club_id;
select private.upsert_interaction_target('comment', c.id, c.author_id, parent.audience_kind, parent.audience_id, parent.href, false, true, null, 'comment_liked') from public.comments c join public.interaction_targets parent on parent.kind = c.target_type and parent.source_id = c.target_id;

do $function$
declare v_comments_before bigint; v_reactions_before bigint; v_notifications_before bigint;
begin
  select count(*) into v_comments_before from public.comments where interaction_target_id is null;
  select count(*) into v_reactions_before from public.reactions where interaction_target_id is null;
  select count(*) into v_notifications_before from public.notifications where interaction_target_id is null;
  update public.comments c set interaction_target_id = t.id from public.interaction_targets t where t.kind = c.target_type and t.source_id = c.target_id;
  update public.reactions r set interaction_target_id = t.id from public.interaction_targets t where t.kind = r.target_type and t.source_id = r.target_id;
  update public.notifications n set interaction_target_id = t.id from public.interaction_targets t where n.target_type = t.kind::text and n.target_id = t.source_id;
  raise notice 'social phase 1 backfill nulls before comments=% reactions=% notifications=%; after comments=% reactions=% notifications=%',
    v_comments_before, v_reactions_before, v_notifications_before,
    (select count(*) from public.comments where interaction_target_id is null),
    (select count(*) from public.reactions where interaction_target_id is null),
    (select count(*) from public.notifications where interaction_target_id is null);
end;
$function$;

delete from public.comments where interaction_target_id is null;
delete from public.reactions where interaction_target_id is null;

create or replace function private.can_view_interaction_target(p_interaction_target_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.interaction_targets t
    where t.id = p_interaction_target_id
      and not public.users_are_blocked(t.owner_id)
      and case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.has_reached_checkpoint(t.source_id)
      end
  );
$function$;
revoke execute on function private.can_view_interaction_target(uuid) from public;
grant execute on function private.can_view_interaction_target(uuid) to anon, authenticated;
create or replace function public.can_view_interaction_target(p_interaction_target_id uuid)
returns boolean
language sql stable security invoker set search_path = '' as $function$
  select private.can_view_interaction_target(p_interaction_target_id);
$function$;
revoke execute on function public.can_view_interaction_target(uuid) from public;
grant execute on function public.can_view_interaction_target(uuid) to anon, authenticated;
create policy "interaction targets select visible" on public.interaction_targets
  for select to anon, authenticated
  using (public.can_view_interaction_target(id));

drop policy if exists "reactions select visible" on public.reactions;
drop policy if exists "reactions insert own on visible target" on public.reactions;
drop policy if exists "reactions delete own" on public.reactions;
create policy "reactions select visible canonical" on public.reactions for select to anon, authenticated using (public.can_view_interaction_target(interaction_target_id));
create policy "reactions insert own canonical" on public.reactions for insert to authenticated with check ((select auth.uid()) = user_id and public.can_view_interaction_target(interaction_target_id) and exists (select 1 from public.interaction_targets t where t.id = interaction_target_id and t.reactable));
create policy "reactions delete own canonical" on public.reactions for delete to authenticated using ((select auth.uid()) = user_id and public.can_view_interaction_target(interaction_target_id));

drop policy if exists "comments select visible" on public.comments;
drop policy if exists "comments insert own on visible target" on public.comments;
drop policy if exists "comments delete own or moderate" on public.comments;
create policy "comments select visible canonical" on public.comments for select to anon, authenticated using (public.can_view_interaction_target(interaction_target_id));
create policy "comments insert own canonical" on public.comments for insert to authenticated with check ((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id) and exists (select 1 from public.interaction_targets t where t.id = interaction_target_id and t.commentable));
create policy "comments delete own or moderate canonical" on public.comments for delete to authenticated using (((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id)) or private.can_moderate_comment(id));

-- Retain the Phase 0 cleanup triggers, but make their first responsibility the
-- canonical target.  The narrow legacy cleanup remains for rows that predate a
-- resolvable source during the transition.
create or replace function private.cleanup_social_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_target_type text;
begin
  foreach v_target_type in array tg_argv loop
    update public.content_reports cr set status = 'actioned', target_deleted_at = coalesce(cr.target_deleted_at, now()), reviewed_at = coalesce(cr.reviewed_at, now())
      where cr.target_type::text = v_target_type and cr.target_id = old.id and cr.target_deleted_at is null;
    delete from public.interaction_targets t where t.kind::text = v_target_type and t.source_id = old.id;
    delete from public.comments c where c.interaction_target_id is null and c.target_type::text = v_target_type and c.target_id = old.id;
    delete from public.reactions r where r.interaction_target_id is null and r.target_type::text = v_target_type and r.target_id = old.id;
    delete from public.notifications n where n.interaction_target_id is null and n.target_type = v_target_type and n.target_id = old.id;
  end loop;
  return old;
end;
$function$;
revoke execute on function private.cleanup_social_target() from public, anon, authenticated;
