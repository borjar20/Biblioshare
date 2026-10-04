-- One source of truth for moment kinds; RPCs used to repeat the literal list.
-- coalesce keeps a missing kind invalid (the old "coalesce(kind,'') not in (...)" did).
create function private.is_experience_kind(p_kind text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_kind in ('concert','show','exhibition','museum','walk','food','festival','sport','nature','other'),false);
$$;
revoke all on function private.is_experience_kind(text) from public;
grant execute on function private.is_experience_kind(text) to anon,authenticated;

alter table public.experience_moments drop constraint experience_moments_kind_check;
alter table public.experience_moments add constraint experience_moments_kind_check
  check (kind in ('concert','show','exhibition','museum','walk','food','festival','sport','nature','other'));

create or replace function public.experience_create(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; m uuid; member uuid; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform private.require_request_quota('experience_write');
  perform private.experience_validate_input(p_input,array['title','state','kind','placeLabel','startsOn','endsOn']);
  if coalesce(p_input->>'state','') not in ('planned','lived') or not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid' using errcode='22023'; end if;
  insert into public.experiences(creator_id,title,state,starts_on,ends_on)
    values(auth.uid(),btrim(p_input->>'title'),p_input->>'state',(p_input->>'startsOn')::date,(p_input->>'endsOn')::date) returning id into e;
  insert into public.experience_moments(experience_id,title,kind,place_label,starts_on,ends_on,position)
    values(e,btrim(p_input->>'title'),p_input->>'kind',nullif(btrim(p_input->>'placeLabel'),''),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,0) returning id into m;
  insert into public.experience_participants(experience_id,user_id,invitation_state) values(e,auth.uid(),'accepted') returning id into member;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state)
    values(e,m,member,case when p_input->>'state'='lived' then 'attended' else 'planned' end);
  return jsonb_build_object('id',e);
end $$;

create or replace function public.experience_save_moment(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m uuid; n integer; begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['id','title','kind','placeLabel','startsOn','endsOn']);
  if not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid kind' using errcode='22023'; end if;
  if p_input ? 'id' then
    begin m:=(p_input->>'id')::uuid; exception when invalid_text_representation then raise exception 'invalid id' using errcode='22023'; end;
    if m is null or not exists(select 1 from public.experience_moments where id=m and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
    update public.experience_moments set title=btrim(p_input->>'title'),kind=p_input->>'kind',place_label=nullif(btrim(p_input->>'placeLabel'),''),starts_on=(p_input->>'startsOn')::date,ends_on=(p_input->>'endsOn')::date,updated_at=now() where id=m;
  else
    select count(*) into n from public.experience_moments where experience_id=p_id;
    if n>=50 then raise exception 'moment limit' using errcode='PT429'; end if;
    insert into public.experience_moments(experience_id,title,kind,place_label,starts_on,ends_on,position)
      values(p_id,btrim(p_input->>'title'),p_input->>'kind',nullif(btrim(p_input->>'placeLabel'),''),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,(select coalesce(max(position),-1)+1 from public.experience_moments where experience_id=p_id)) returning id into m;
    -- Propose attendance only; an account confirms its own attended/skipped state.
    insert into public.experience_moment_participants(experience_id,moment_id,participant_id)
      select p_id,m,id from public.experience_participants where experience_id=p_id and invitation_state='accepted';
    if n>=1 then update public.experiences set shape='trip' where id=p_id; end if;
  end if;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',m,'revision',p_revision+1);
end $$;

create or replace function public.get_profile_experiences(p_user_id uuid,p_state text default 'all',p_kind text default null,p_after_created timestamptz default null,p_after_id uuid default null)
returns setof public.experiences language plpgsql stable security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and not private.is_experience_kind(p_kind)) or ((p_after_created is null)<>(p_after_id is null)) then raise exception 'invalid filters' using errcode='22023'; end if;
  if not public.can_view_profile(p_user_id) or public.users_are_blocked(p_user_id) then return; end if;
  return query select e.* from public.experiences e join public.experience_participants own on own.experience_id=e.id and own.user_id=p_user_id and own.invitation_state='accepted'
    where private.can_view_experience(e.id) and (p_user_id=auth.uid() or (e.audience='profile' and (e.creator_id=p_user_id or (own.share_identity and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.creator_id and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=e.creator_id))))))
      and (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended')) or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_after_created is null or (e.created_at,e.id)<(p_after_created,p_after_id))
    order by e.created_at desc,e.id desc limit 21;
end $$;
