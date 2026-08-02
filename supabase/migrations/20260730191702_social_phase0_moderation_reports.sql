-- Social Phase 0: comment moderation and immutable content-report evidence.

create type public.content_report_reason as enum (
  'spam',
  'harassment',
  'spoiler',
  'hate',
  'other'
);

-- Resolve the club that owns a target. Comments cannot nest, but the helper is
-- recursive defensively and remains private because it bypasses source RLS.
create or replace function private.social_target_club_id(
  p_target_type public.target_kind,
  p_target_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_parent_type public.target_kind;
  v_parent_id uuid;
  v_club_id uuid;
begin
  case p_target_type
    when 'club_post' then
      select cp.club_id into v_club_id
      from public.club_posts cp where cp.id = p_target_id;
    when 'club_activity' then
      select ca.club_id into v_club_id
      from public.club_activities ca where ca.id = p_target_id;
    when 'activity_checkpoint' then
      select ca.club_id into v_club_id
      from public.club_activity_checkpoints cc
      join public.club_activities ca on ca.id = cc.activity_id
      where cc.id = p_target_id;
    when 'comment' then
      select c.target_type, c.target_id into v_parent_type, v_parent_id
      from public.comments c where c.id = p_target_id;
      if v_parent_type is not null then
        v_club_id := private.social_target_club_id(v_parent_type, v_parent_id);
      end if;
    else
      v_club_id := null;
  end case;
  return v_club_id;
end;
$function$;

revoke execute on function private.social_target_club_id(public.target_kind, uuid) from public;
grant execute on function private.social_target_club_id(public.target_kind, uuid) to authenticated;

-- May the current user delete comments attached to this target? Target owners,
-- club moderator+, and global admins qualify. Comment authors are handled by
-- the comments policy itself because the batch DTO already knows isOwn.
create or replace function private.can_moderate_target(
  p_target_type public.target_kind,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when public.has_min_role('admin') then true
    when private.social_target_owner_id(p_target_type, p_target_id) = (select auth.uid()) then true
    else coalesce(
      public.has_min_club_role(
        private.social_target_club_id(p_target_type, p_target_id),
        'moderator'
      ),
      false
    )
  end;
$function$;

revoke execute on function private.can_moderate_target(public.target_kind, uuid) from public;
grant execute on function private.can_moderate_target(public.target_kind, uuid) to authenticated;

create or replace function private.can_moderate_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.comments c
    where c.id = p_comment_id
      and (
        c.author_id = (select auth.uid())
        or private.can_moderate_target(c.target_type, c.target_id)
      )
  );
$function$;

revoke execute on function private.can_moderate_comment(uuid) from public;
grant execute on function private.can_moderate_comment(uuid) to authenticated;

-- Batch interface consumed by InteractionComment.canDelete. It returns target
-- IDs (not comment IDs): the caller combines the result with its local isOwn.
create or replace function public.moderatable_target_ids(
  candidate_target_type public.target_kind,
  candidate_target_ids uuid[]
)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $function$
  select distinct candidate_id
  from unnest(coalesce(candidate_target_ids, '{}'::uuid[])) as candidates(candidate_id)
  where candidate_id is not null
    and private.can_moderate_target(candidate_target_type, candidate_id);
$function$;

revoke execute on function public.moderatable_target_ids(public.target_kind, uuid[]) from public, anon;
grant execute on function public.moderatable_target_ids(public.target_kind, uuid[]) to authenticated;

-- Keep the ordinary visibility policy block-aware, but add a narrow moderator
-- SELECT path so owners/moderators can locate content they are allowed to delete.
create policy "comments select moderate" on public.comments
  for select to authenticated
  using (private.can_moderate_comment(id));

drop policy "comments delete own" on public.comments;
create policy "comments delete own or moderate" on public.comments
  for delete to authenticated
  using (private.can_moderate_comment(id));

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  target_type public.target_kind not null,
  target_id uuid not null,
  reason public.content_report_reason not null,
  details text,
  snapshot jsonb not null,
  status text not null default 'pending',
  resolution_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  target_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_reports_details_canonical check (
    details is null
    or (details = btrim(details) and char_length(details) between 1 and 2000)
  ),
  constraint content_reports_status_valid check (
    status in ('pending', 'actioned', 'dismissed')
  ),
  constraint content_reports_resolution_note_canonical check (
    resolution_note is null
    or (
      resolution_note = btrim(resolution_note)
      and char_length(resolution_note) between 1 and 2000
    )
  ),
  constraint content_reports_review_shape check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('actioned', 'dismissed') and reviewed_at is not null)
  )
);

create unique index content_reports_one_pending_per_reporter_target
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'pending';

create index content_reports_pending_created_idx
  on public.content_reports (created_at)
  where status = 'pending';

create index content_reports_reported_user_idx
  on public.content_reports (reported_user_id, created_at desc);

alter table public.content_reports enable row level security;

revoke all on table public.content_reports from anon, authenticated;
grant select, insert on table public.content_reports to authenticated;
grant update (status, resolution_note) on table public.content_reports to authenticated;

-- Snapshot and accountable user always come from the real target. Client values
-- are overwritten, including on direct Data API inserts.
create or replace function private.prepare_content_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reported_user_id uuid;
  v_snapshot jsonb;
begin
  case new.target_type
    when 'diary_entry' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'pass' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'episode_watch' then
      select e.user_id, jsonb_build_object(
        'review', e.review,
        'series_id', e.series_id,
        'created_at', e.created_at
      ) into v_reported_user_id, v_snapshot
      from public.episode_watches e where e.id = new.target_id;
    when 'progress_session' then
      select s.user_id, jsonb_build_object(
        'note', s.note,
        'pass_id', s.pass_id,
        'created_at', s.created_at
      ) into v_reported_user_id, v_snapshot
      from public.progress_sessions s where s.id = new.target_id;
    when 'club_post' then
      select cp.author_id, jsonb_build_object(
        'body', cp.body,
        'kind', cp.kind,
        'club_id', cp.club_id,
        'created_at', cp.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_posts cp where cp.id = new.target_id;
    when 'comment' then
      select c.author_id, jsonb_build_object(
        'body', c.body,
        'target_type', c.target_type,
        'target_id', c.target_id,
        'created_at', c.created_at
      ) into v_reported_user_id, v_snapshot
      from public.comments c where c.id = new.target_id;
    when 'activity_checkpoint' then
      select cc.created_by, jsonb_build_object(
        'label', cc.label,
        'position', cc.position,
        'activity_id', cc.activity_id,
        'created_at', cc.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activity_checkpoints cc where cc.id = new.target_id;
    when 'club_activity' then
      select ca.created_by, jsonb_build_object(
        'title', ca.title,
        'description', ca.description,
        'kind', ca.kind,
        'club_id', ca.club_id,
        'created_at', ca.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activities ca where ca.id = new.target_id;
  end case;

  if v_reported_user_id is null or v_snapshot is null then
    raise exception 'invalid_report_target' using errcode = '23503';
  end if;

  new.reported_user_id := v_reported_user_id;
  new.snapshot := v_snapshot;
  return new;
end;
$function$;

revoke execute on function private.prepare_content_report() from public, anon, authenticated;

create trigger trg_content_reports_prepare
  before insert on public.content_reports
  for each row execute function private.prepare_content_report();

-- Only admins and club moderator+ review reports. Target ownership alone never
-- reveals who reported the content.
create or replace function private.can_review_report_target(
  p_target_type public.target_kind,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when public.has_min_role('admin') then true
    else coalesce(
      public.has_min_club_role(
        private.social_target_club_id(p_target_type, p_target_id),
        'moderator'
      ),
      false
    )
  end;
$function$;

revoke execute on function private.can_review_report_target(public.target_kind, uuid) from public;
grant execute on function private.can_review_report_target(public.target_kind, uuid) to authenticated;

create policy "content reports select own" on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "content reports select reviewer" on public.content_reports
  for select to authenticated
  using (private.can_review_report_target(target_type, target_id));

create policy "content reports insert own visible target" on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and target_deleted_at is null
    and public.can_view_target(target_type, target_id)
    and private.social_target_owner_id(target_type, target_id) <> (select auth.uid())
  );

create policy "content reports update reviewer" on public.content_reports
  for update to authenticated
  using (private.can_review_report_target(target_type, target_id))
  with check (private.can_review_report_target(target_type, target_id));

-- Reviewers may only transition a pending report. Evidence and reporter fields
-- are immutable; nested trigger updates from target cleanup are allowed.
create or replace function private.guard_content_report_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if row(
    new.reporter_id,
    new.reported_user_id,
    new.target_type,
    new.target_id,
    new.reason,
    new.details,
    new.snapshot,
    new.created_at,
    new.target_deleted_at
  ) is distinct from row(
    old.reporter_id,
    old.reported_user_id,
    old.target_type,
    old.target_id,
    old.reason,
    old.details,
    old.snapshot,
    old.created_at,
    old.target_deleted_at
  ) then
    raise exception 'report_evidence_is_immutable' using errcode = '22000';
  end if;

  if old.status <> 'pending' or new.status not in ('actioned', 'dismissed') then
    raise exception 'invalid_report_transition' using errcode = '22000';
  end if;

  new.reviewed_by := (select auth.uid());
  new.reviewed_at := now();
  return new;
end;
$function$;

revoke execute on function private.guard_content_report_review() from public, anon, authenticated;

create trigger trg_content_reports_guard_review
  before update on public.content_reports
  for each row execute function private.guard_content_report_review();

-- Narrow comment-reporting RPC used by moderation-actions.ts. The trigger above
-- derives all evidence; this wrapper only fixes identity and canonical text.
create or replace function public.report_comment(
  p_comment_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_report_id uuid;
  v_reason public.content_report_reason;
  v_details text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_reason := p_reason::public.content_report_reason;
  v_details := nullif(btrim(p_details), '');

  insert into public.content_reports (
    reporter_id,
    target_type,
    target_id,
    reason,
    details,
    snapshot
  ) values (
    (select auth.uid()),
    'comment',
    p_comment_id,
    v_reason,
    v_details,
    '{}'::jsonb
  )
  returning id into v_report_id;

  return v_report_id;
end;
$function$;

revoke execute on function public.report_comment(uuid, text, text) from public, anon;
grant execute on function public.report_comment(uuid, text, text) to authenticated;
