-- Own withdrawal is independent of group access, blocks and moderation.
-- Never use this lock to grant consent or edit another person's contribution.
create function private.experience_withdrawal_lock(p_id uuid) returns public.experiences
language plpgsql security definer set search_path='' as $$
declare e public.experiences;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  select * into e from public.experiences where id=p_id for update;
  if not found or not exists(select 1 from public.experience_participants where experience_id=p_id and user_id=auth.uid() and invitation_state='accepted') then raise exception 'own membership required' using errcode='42501'; end if;
  if not public.consume_request_quota('experience_write',1) then raise exception 'quota' using errcode='PT429'; end if;
  return e;
end $$;
revoke all on function private.experience_withdrawal_lock(uuid) from public,anon,authenticated;

create or replace function public.experience_set_share_identity(p_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null then raise exception 'invalid consent' using errcode='22023'; end if;
  if p_enabled then
    perform private.experience_lock(p_id);
    if not private.can_contribute_experience(p_id) then raise exception 'member required' using errcode='42501'; end if;
  else perform private.experience_withdrawal_lock(p_id); end if;
  update public.experience_participants set share_identity=p_enabled,updated_at=now() where experience_id=p_id and user_id=auth.uid() and invitation_state='accepted';
  if not found then raise exception 'own membership required' using errcode='42501'; end if;
  return jsonb_build_object('experienceId',p_id);
end $$;
create or replace function public.experience_remove_participant(p_participant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_participants; e public.experiences;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  select * into p from public.experience_participants where id=p_participant_id;
  if not found then raise exception 'member required' using errcode='42501'; end if;
  if p.user_id=auth.uid() and p.invitation_state='accepted' then e:=private.experience_withdrawal_lock(p.experience_id);
  else e:=private.experience_lock(p.experience_id); end if;
  select * into p from public.experience_participants where id=p_participant_id for update;
  if not found or p.user_id=e.creator_id or (e.creator_id<>auth.uid() and p.user_id is distinct from auth.uid()) then raise exception 'ownership required' using errcode='42501'; end if;
  delete from public.experience_participants where id=p.id;
  return jsonb_build_object('experienceId',p.experience_id);
end $$;
-- A creator/companion block suspends external attribution in either direction.
create or replace function private.can_view_experience_participant(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_participants p join public.experiences e on e.id=p.experience_id where p.id=p_id
    and private.can_view_experience(p.experience_id)
    and (p.user_id is null or not public.users_are_blocked(p.user_id))
    and (private.can_contribute_experience(p.experience_id) or
      (p.invitation_state='accepted' and p.share_identity and p.user_id is not null and public.can_view_profile(p.user_id)
       and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.creator_id and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=e.creator_id)))));
$$;
-- Minimal own-membership summary permits withdrawal without exposing group data.
create or replace function public.get_profile_experiences(p_user_id uuid,p_state text default 'all',p_kind text default null,p_after_created timestamptz default null,p_after_id uuid default null)
returns setof public.experiences language plpgsql stable security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and p_kind not in ('concert','show','exhibition','museum','walk','other')) or ((p_after_created is null)<>(p_after_id is null)) then raise exception 'invalid filters' using errcode='22023'; end if;
  if not public.can_view_profile(p_user_id) or public.users_are_blocked(p_user_id) then return; end if;
  return query select e.* from public.experiences e join public.experience_participants own on own.experience_id=e.id and own.user_id=p_user_id and own.invitation_state='accepted'
    where private.can_view_experience(e.id) and (p_user_id=auth.uid() or (e.audience='profile' and (e.creator_id=p_user_id or (own.share_identity and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.creator_id and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=e.creator_id))))))
      and (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended')) or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_after_created is null or (e.created_at,e.id)<(p_after_created,p_after_id))
    order by e.created_at desc,e.id desc limit 21;
end $$;
create function public.get_experience_own_memberships() returns table(participant_id uuid,experience_id uuid,title text,created_at timestamptz,share_identity boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.experience_id,e.title,p.created_at,p.share_identity from public.experience_participants p join public.experiences e on e.id=p.experience_id
  where p.user_id=auth.uid() and p.user_id<>e.creator_id and p.invitation_state='accepted' and not private.can_contribute_experience(e.id)
  order by p.created_at desc,p.id;
$$;

create or replace function public.experience_report(p_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; report uuid;
begin
  e:=private.experience_lock(p_id);
  if not private.can_view_experience(p_id) or e.creator_id=auth.uid() then raise exception 'visible target required' using errcode='42501'; end if;
  if p_reason is null or p_reason not in ('spam','harassment','spoiler','hate','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'invalid report' using errcode='22023'; end if;
  insert into public.content_reports(reporter_id,target_type,target_id,reason,details) values(auth.uid(),'experience',p_id,p_reason::public.content_report_reason,nullif(btrim(p_details),'')) returning id into report;
  return jsonb_build_object('id',report,'experienceId',p_id);
end $$;

-- Invoker RLS applies to roots, participants and identity projection independently.
-- This list has no result-page/state/kind filters; callers paginate its full set.
create function public.get_experience_companions() returns table(id uuid,user_id uuid,guest_name text,username text,display_name text,avatar_url text)
language sql stable security invoker set search_path='' as $$
  select distinct on (coalesce(p.user_id,p.id)) p.id,p.user_id,p.guest_name,a.username,a.display_name,a.avatar_url
  from public.experiences e join public.experience_participants mine on mine.experience_id=e.id and mine.user_id=auth.uid() and mine.invitation_state='accepted'
  join public.experience_participants p on p.experience_id=e.id and p.invitation_state='accepted' and p.user_id is distinct from auth.uid()
  left join public.profile_identities a on a.user_id=p.user_id
  order by coalesce(p.user_id,p.id),p.id;
$$;
-- Separate author-only preview; the group-photo URL continues to require access.
create function public.experience_can_preview_own_photo(p_photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_photos p where p.id=p_photo_id and p.author_id=auth.uid() and p.status='ready' and private.moderation_available('experience',p.experience_id));
$$;
revoke all on function public.get_experience_own_memberships(),public.get_experience_companions(),public.experience_can_preview_own_photo(uuid) from public,anon;
grant execute on function public.get_experience_own_memberships(),public.get_experience_companions(),public.experience_can_preview_own_photo(uuid) to authenticated;
