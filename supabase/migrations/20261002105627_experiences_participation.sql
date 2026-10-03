-- The root lock serializes membership limits and concurrent structural edits.
create function private.experience_lock(p_id uuid) returns public.experiences
language plpgsql security definer set search_path='' as $$
declare e public.experiences;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  select * into e from public.experiences where id=p_id for update;
  if not found or not private.moderation_available('experience',p_id) or public.users_are_blocked(e.creator_id) then raise exception 'unavailable' using errcode='42501'; end if;
  if not public.consume_request_quota('experience_write',1) then raise exception 'quota' using errcode='PT429'; end if;
  return e;
end $$;
revoke all on function private.experience_lock(uuid) from public,anon,authenticated;

create or replace function private.can_view_experience(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experiences e where e.id=p_id
    and private.moderation_available('experience',e.id) and not public.users_are_blocked(e.creator_id)
    and (e.creator_id=auth.uid() or (e.audience<>'private' and exists(
      select 1 from public.experience_participants m where m.experience_id=e.id and m.user_id=auth.uid() and m.invitation_state='accepted'))
      or (e.audience='profile' and public.can_view_profile(e.creator_id) and not exists(
        select 1 from public.experience_participants m where m.experience_id=e.id and m.user_id=auth.uid() and m.invitation_state='invited'))));
$$;

create function public.experience_invite(p_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; p public.experience_participants;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id<>auth.uid() then raise exception 'owner required' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=auth.uid() or public.users_are_blocked(p_user_id) or not exists(select 1 from public.profiles where user_id=p_user_id) then raise exception 'invalid person' using errcode='22023'; end if;
  select * into p from public.experience_participants where experience_id=p_id and user_id=p_user_id;
  if not found then
    if (select count(*) from public.experience_participants where experience_id=p_id)>=30 then raise exception 'participants limit' using errcode='PT429'; end if;
    insert into public.experience_participants(experience_id,user_id) values(p_id,p_user_id) returning * into p;
  elsif p.invitation_state='declined' then
    update public.experience_participants set invitation_state='invited',share_identity=false,updated_at=now() where id=p.id returning * into p;
  end if;
  if e.audience='private' then update public.experiences set audience='participants',revision=revision+1,updated_at=now() where id=p_id; end if;
  return jsonb_build_object('id',p.id,'experienceId',p_id,'notifyUserId',case when p.invitation_state='invited' then p_user_id end,'notifyActorId',auth.uid());
end $$;
create function public.experience_add_guest(p_id uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; person uuid;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id<>auth.uid() then raise exception 'owner required' using errcode='42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid guest' using errcode='22023'; end if;
  if (select count(*) from public.experience_participants where experience_id=p_id)>=30 then raise exception 'participants limit' using errcode='PT429'; end if;
  insert into public.experience_participants(experience_id,guest_name,invitation_state) values(p_id,btrim(p_name),'accepted') returning id into person;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id) select p_id,id,person from public.experience_moments where experience_id=p_id;
  return jsonb_build_object('id',person,'experienceId',p_id);
end $$;
create function public.experience_respond_invitation(p_participant_id uuid,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_participants; e public.experiences; old_state text; recipient uuid;
begin
  select * into p from public.experience_participants where id=p_participant_id;
  if not found or p.user_id is distinct from auth.uid() then raise exception 'own invitation required' using errcode='42501'; end if;
  e:=private.experience_lock(p.experience_id);
  select * into p from public.experience_participants where id=p_participant_id for update;
  if not found or p.user_id is distinct from auth.uid() or p.user_id=e.creator_id then raise exception 'own invitation required' using errcode='42501'; end if;
  if p_response is null or p_response not in ('accept','decline') then raise exception 'invalid response' using errcode='22023'; end if;
  if p_response='accept' and e.audience='private' then raise exception 'private' using errcode='42501'; end if;
  old_state:=p.invitation_state;
  update public.experience_participants set invitation_state=case when p_response='accept' then 'accepted' else 'declined' end,
    share_identity=case when p_response='decline' then false else share_identity end,updated_at=now() where id=p.id;
  if p_response='accept' then
    insert into public.experience_moment_participants(experience_id,moment_id,participant_id)
      select p.experience_id,id,p.id from public.experience_moments where experience_id=p.experience_id on conflict do nothing;
    if old_state<>'accepted' then recipient:=e.creator_id; end if;
  else
    delete from public.experience_moment_participants where participant_id=p.id;
    delete from public.experience_favorites where experience_id=p.experience_id and user_id=auth.uid();
  end if;
  return jsonb_build_object('id',p.id,'experienceId',p.experience_id,'notifyUserId',recipient,'notifyActorId',auth.uid());
end $$;
create function public.experience_set_attendance(p_moment_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; person uuid;
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  select id into person from public.experience_participants where experience_id=root and user_id=auth.uid() and invitation_state='accepted';
  if person is null then raise exception 'member required' using errcode='42501'; end if;
  if p_state is null or p_state not in ('planned','attended','skipped') then raise exception 'invalid attendance' using errcode='22023'; end if;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state) values(root,p_moment_id,person,p_state)
    on conflict(moment_id,participant_id) do update set attendance_state=excluded.attendance_state;
  return jsonb_build_object('experienceId',root);
end $$;
create function public.experience_set_guest_attendance(p_moment_id uuid,p_participant_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; e public.experiences;
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  e:=private.experience_lock(root);
  if e.creator_id<>auth.uid() or not exists(select 1 from public.experience_participants where id=p_participant_id and experience_id=root and user_id is null) then raise exception 'guest ownership required' using errcode='42501'; end if;
  if p_state is null or p_state not in ('planned','attended','skipped') then raise exception 'invalid attendance' using errcode='22023'; end if;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state) values(root,p_moment_id,p_participant_id,p_state)
    on conflict(moment_id,participant_id) do update set attendance_state=excluded.attendance_state;
  return jsonb_build_object('experienceId',root);
end $$;
create function public.experience_set_favorite(p_id uuid,p_moment_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.experience_lock(p_id);
  if not private.can_contribute_experience(p_id) then raise exception 'member required' using errcode='42501'; end if;
  if p_moment_id is null then delete from public.experience_favorites where experience_id=p_id and user_id=auth.uid();
  else
    if not exists(select 1 from public.experience_moments where id=p_moment_id and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
    insert into public.experience_favorites(experience_id,user_id,moment_id) values(p_id,auth.uid(),p_moment_id)
      on conflict(experience_id,user_id) do update set moment_id=excluded.moment_id;
  end if;
  return jsonb_build_object('experienceId',p_id);
end $$;
create function public.experience_set_share_identity(p_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.experience_lock(p_id);
  if p_enabled is null then raise exception 'invalid consent' using errcode='22023'; end if;
  if p_enabled and not private.can_contribute_experience(p_id) then raise exception 'member required' using errcode='42501'; end if;
  update public.experience_participants set share_identity=p_enabled,updated_at=now() where experience_id=p_id and user_id=auth.uid() and invitation_state='accepted';
  if not found then raise exception 'own membership required' using errcode='42501'; end if;
  return jsonb_build_object('experienceId',p_id);
end $$;
create function public.experience_remove_participant(p_participant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_participants; e public.experiences;
begin
  select * into p from public.experience_participants where id=p_participant_id;
  if not found then raise exception 'member required' using errcode='42501'; end if;
  e:=private.experience_lock(p.experience_id);
  select * into p from public.experience_participants where id=p_participant_id for update;
  if not found or p.user_id=e.creator_id or (e.creator_id<>auth.uid() and p.user_id is distinct from auth.uid()) then raise exception 'ownership required' using errcode='42501'; end if;
  delete from public.experience_participants where id=p.id;
  return jsonb_build_object('experienceId',p.experience_id);
end $$;
create function public.get_experience_invitations() returns table(participant_id uuid,experience_id uuid,title text,starts_on date,ends_on date,creator_id uuid,username text,display_name text,avatar_url text)
language sql stable security definer set search_path='' as $$
  select p.id,e.id,e.title,e.starts_on,e.ends_on,e.creator_id,a.username,a.display_name,a.avatar_url
  from public.experience_participants p join public.experiences e on e.id=p.experience_id join public.profiles a on a.user_id=e.creator_id
  where p.user_id=auth.uid() and p.invitation_state='invited' and e.audience<>'private'
    and private.moderation_available('experience',e.id) and not public.users_are_blocked(e.creator_id)
  order by p.created_at desc,p.id;
$$;
revoke all on function public.experience_invite(uuid,uuid),public.experience_add_guest(uuid,text),public.experience_respond_invitation(uuid,text),
 public.experience_set_attendance(uuid,text),public.experience_set_guest_attendance(uuid,uuid,text),public.experience_set_favorite(uuid,uuid),
 public.experience_set_share_identity(uuid,boolean),public.experience_remove_participant(uuid) from public,anon;
grant execute on function public.experience_invite(uuid,uuid),public.experience_add_guest(uuid,text),public.experience_respond_invitation(uuid,text),
 public.experience_set_attendance(uuid,text),public.experience_set_guest_attendance(uuid,uuid,text),public.experience_set_favorite(uuid,uuid),
 public.experience_set_share_identity(uuid,boolean),public.experience_remove_participant(uuid) to authenticated;
revoke all on function public.get_experience_invitations() from public;
grant execute on function public.get_experience_invitations() to anon,authenticated;
