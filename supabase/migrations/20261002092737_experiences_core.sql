-- Experiences are a collaborative domain, independent from passes/catalog.
-- All writes go through authenticated RPCs; clients cannot choose ownership.
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (title=btrim(title) and char_length(title) between 1 and 160),
  shape text not null default 'single' check (shape in ('single','trip')),
  state text not null default 'planned' check (state in ('planned','lived','cancelled')),
  audience text not null default 'private' check (audience in ('private','participants','profile')),
  starts_on date, ends_on date,
  cover_photo_id uuid,
  revision bigint not null default 0 check (revision>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or starts_on<=ends_on)
);
create index experiences_creator_page on public.experiences(creator_id,created_at desc,id desc);
create index experiences_public_page on public.experiences(created_at desc,id desc) where audience='profile';
create table public.experience_moments (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  title text not null check (title=btrim(title) and char_length(title) between 1 and 160),
  kind text not null check (kind in ('concert','show','exhibition','museum','walk','other')),
  place_label text check (char_length(place_label)<=240),
  starts_on date, ends_on date,
  position integer not null check(position>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,experience_id),
  constraint experience_moments_position unique(experience_id,position) deferrable initially immediate,
  check (starts_on is null or ends_on is null or starts_on<=ends_on)
);
create table public.experience_participants (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  guest_name text check (guest_name=btrim(guest_name) and char_length(guest_name) between 1 and 80),
  invitation_state text not null default 'invited' check(invitation_state in ('invited','accepted','declined')),
  share_identity boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((user_id is null) <> (guest_name is null)),
  check (user_id is not null or (invitation_state='accepted' and not share_identity)),
  unique(id,experience_id), unique(experience_id,user_id)
);
create index experience_participants_user on public.experience_participants(user_id,invitation_state,experience_id);
create table public.experience_moment_participants (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  moment_id uuid not null, participant_id uuid not null,
  attendance_state text not null default 'planned' check(attendance_state in ('planned','attended','skipped')),
  primary key(moment_id,participant_id),
  foreign key(moment_id,experience_id) references public.experience_moments(id,experience_id) on delete cascade,
  foreign key(participant_id,experience_id) references public.experience_participants(id,experience_id) on delete cascade
);
create index experience_moment_participants_person on public.experience_moment_participants(participant_id,experience_id);
create index experience_moment_participants_root on public.experience_moment_participants(experience_id);
create table public.experience_favorites (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_id uuid not null,
  primary key(experience_id,user_id),
  foreign key(moment_id,experience_id) references public.experience_moments(id,experience_id) on delete cascade,
  foreign key(experience_id,user_id) references public.experience_participants(experience_id,user_id) on delete cascade
);
create index experience_favorites_moment on public.experience_favorites(moment_id,experience_id);
create index experience_favorites_user on public.experience_favorites(user_id);
create table public.experience_photos (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  moment_id uuid,
  author_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  status text not null default 'pending' check(status in ('pending','ready')),
  share_with_profile boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id,experience_id),
  foreign key(moment_id,experience_id) references public.experience_moments(id,experience_id) on delete cascade
);
create index experience_photos_root on public.experience_photos(experience_id,created_at,id);
create index experience_photos_moment on public.experience_photos(moment_id,experience_id);
create index experience_photos_author on public.experience_photos(author_id);
alter table public.experiences add constraint experiences_cover_same_root foreign key(cover_photo_id,id)
  references public.experience_photos(id,experience_id) deferrable initially deferred;
create index experiences_cover_photo on public.experiences(cover_photo_id,id) where cover_photo_id is not null;

-- Helpers read tables as their owner, avoiding recursive membership policies.
create function private.can_view_experience(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experiences e where e.id=p_id
    and private.moderation_available('experience',e.id) and not public.users_are_blocked(e.creator_id)
    and (e.creator_id=auth.uid() or (e.audience<>'private' and exists(
      select 1 from public.experience_participants m where m.experience_id=e.id and m.user_id=auth.uid() and m.invitation_state='accepted'))
      or (e.audience='profile' and public.can_view_profile(e.creator_id))));
$$;
create function private.can_contribute_experience(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_view_experience(p_id) and exists(select 1 from public.experiences e where e.id=p_id
    and (e.creator_id=auth.uid() or exists(select 1 from public.experience_participants m
      where m.experience_id=p_id and m.user_id=auth.uid() and m.invitation_state='accepted')));
$$;
create function private.can_view_experience_participant(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_participants p where p.id=p_id
    and private.can_view_experience(p.experience_id)
    and (p.user_id is null or not public.users_are_blocked(p.user_id))
    and (private.can_contribute_experience(p.experience_id) or
      (p.invitation_state='accepted' and p.share_identity and p.user_id is not null and public.can_view_profile(p.user_id))));
$$;
create function private.can_view_experience_photo(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_photos p where p.id=p_id and p.status='ready'
    and private.can_view_experience(p.experience_id) and not public.users_are_blocked(p.author_id)
    and (private.can_contribute_experience(p.experience_id) or p.share_with_profile));
$$;
revoke all on function private.can_view_experience(uuid),private.can_contribute_experience(uuid),
  private.can_view_experience_participant(uuid),private.can_view_experience_photo(uuid) from public;
grant execute on function private.can_view_experience(uuid),private.can_contribute_experience(uuid),
  private.can_view_experience_participant(uuid),private.can_view_experience_photo(uuid) to anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['experiences','experience_moments','experience_participants','experience_moment_participants','experience_favorites','experience_photos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
create policy experiences_read on public.experiences for select using(private.can_view_experience(id));
create policy experience_moments_read on public.experience_moments for select using(private.can_view_experience(experience_id));
create policy experience_participants_read on public.experience_participants for select using(private.can_view_experience_participant(id));
create policy experience_attendance_read on public.experience_moment_participants for select
  using(private.can_view_experience_participant(participant_id));
create policy experience_favorites_read on public.experience_favorites for select using(
  private.can_view_experience(experience_id) and not public.users_are_blocked(user_id) and exists(
    select 1 from public.experience_participants p where p.experience_id=experience_favorites.experience_id
      and p.user_id=experience_favorites.user_id and p.invitation_state='accepted'));
-- Raw paths/author IDs never go to profile visitors, even when the photo is public.
create policy experience_photos_group_read on public.experience_photos for select using(
  author_id=auth.uid() or (private.can_contribute_experience(experience_id) and not public.users_are_blocked(author_id)));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('experience-photos','experience-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Validate even callers bypassing the web action. JSON accepts only named fields.
create function private.experience_validate_input(p jsonb,allowed text[]) returns void
language plpgsql set search_path='' as $$
declare k text; d text; s date; e date; begin
  if p is null or jsonb_typeof(p)<>'object' then raise exception 'invalid' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p) loop
    if not k=any(allowed) then raise exception 'invalid field' using errcode='22023'; end if;
  end loop;
  if coalesce(jsonb_typeof(p->'title'),'null')<>'string' or char_length(btrim(p->>'title')) not between 1 and 160 then raise exception 'invalid title' using errcode='22023'; end if;
  if p ? 'placeLabel' and jsonb_typeof(p->'placeLabel') not in ('string','null') then raise exception 'invalid place' using errcode='22023'; end if;
  if char_length(p->>'placeLabel')>240 then raise exception 'invalid place' using errcode='22023'; end if;
  foreach k in array array['startsOn','endsOn'] loop
    d:=p->>k;
    if d is not null then
      if jsonb_typeof(p->k)<>'string' or d!~'^\d{4}-\d{2}-\d{2}$' or left(d,4)='0000' then raise exception 'invalid date' using errcode='22023'; end if;
      begin
        if (d::date)::text<>d then raise exception 'invalid date' using errcode='22023'; end if;
      exception when datetime_field_overflow or invalid_datetime_format then raise exception 'invalid date' using errcode='22023'; end;
    end if;
  end loop;
  s:=(p->>'startsOn')::date; e:=(p->>'endsOn')::date;
  if s>e then raise exception 'invalid dates' using errcode='22023'; end if;
end $$;
revoke all on function private.experience_validate_input(jsonb,text[]) from public,anon,authenticated;

-- Add one operation to the existing atomic fixed-window quota, preserving its body/ACL.
do $$ declare body text; begin
  select prosrc into body from pg_proc where oid='public.consume_request_quota(text,integer)'::regprocedure;
  if body not like '%experience_write%' then
    if body not like '%(''saga_sequence'', 30, interval ''1 minute'')%' then raise exception 'quota contract changed'; end if;
    body:=replace(body,'(''saga_sequence'', 30, interval ''1 minute'')','(''saga_sequence'', 30, interval ''1 minute''), (''experience_write'', 60, interval ''1 minute'')');
    execute 'create or replace function public.consume_request_quota(p_operation text,p_cost integer default 1) returns boolean language plpgsql volatile security definer set search_path='''' as '||quote_literal(body);
  end if;
end $$;
create function private.experience_owner_lock(p_id uuid,p_revision bigint default null) returns public.experiences
language plpgsql security definer set search_path='' as $$
declare e public.experiences; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into e from public.experiences where id=p_id for update;
  if not found or e.creator_id<>auth.uid() or not private.can_view_experience(p_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_revision is not null and e.revision<>p_revision then raise exception 'conflict' using errcode='PT409'; end if;
  perform private.require_request_quota('experience_write');
  return e;
end $$;
revoke all on function private.experience_owner_lock(uuid,bigint) from public,anon,authenticated;
create function public.experience_create(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; m uuid; member uuid; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform private.require_request_quota('experience_write');
  perform private.experience_validate_input(p_input,array['title','state','kind','placeLabel','startsOn','endsOn']);
  if coalesce(p_input->>'state','') not in ('planned','lived') or coalesce(p_input->>'kind','') not in ('concert','show','exhibition','museum','walk','other') then raise exception 'invalid' using errcode='22023'; end if;
  insert into public.experiences(creator_id,title,state,starts_on,ends_on)
    values(auth.uid(),btrim(p_input->>'title'),p_input->>'state',(p_input->>'startsOn')::date,(p_input->>'endsOn')::date) returning id into e;
  insert into public.experience_moments(experience_id,title,kind,place_label,starts_on,ends_on,position)
    values(e,btrim(p_input->>'title'),p_input->>'kind',nullif(btrim(p_input->>'placeLabel'),''),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,0) returning id into m;
  insert into public.experience_participants(experience_id,user_id,invitation_state) values(e,auth.uid(),'accepted') returning id into member;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state)
    values(e,m,member,case when p_input->>'state'='lived' then 'attended' else 'planned' end);
  return jsonb_build_object('id',e);
end $$;
create function public.experience_update(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['title','shape','state','audience','startsOn','endsOn']);
  if coalesce(p_input->>'shape','') not in ('single','trip') or coalesce(p_input->>'state','') not in ('planned','lived','cancelled') or coalesce(p_input->>'audience','') not in ('private','participants','profile') then raise exception 'invalid' using errcode='22023'; end if;
  if p_input->>'shape'='single' and (select count(*) from public.experience_moments where experience_id=p_id)>1 then raise exception 'single with multiple moments' using errcode='22023'; end if;
  update public.experiences set title=btrim(p_input->>'title'),shape=p_input->>'shape',state=p_input->>'state',audience=p_input->>'audience',starts_on=(p_input->>'startsOn')::date,ends_on=(p_input->>'endsOn')::date,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('revision',p_revision+1);
end $$;
create function public.experience_save_moment(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m uuid; n integer; begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['id','title','kind','placeLabel','startsOn','endsOn']);
  if coalesce(p_input->>'kind','') not in ('concert','show','exhibition','museum','walk','other') then raise exception 'invalid kind' using errcode='22023'; end if;
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
create function public.experience_remove_moment(p_id uuid,p_revision bigint,p_moment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  if not exists(select 1 from public.experience_moments where id=p_moment_id and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
  if (select count(*) from public.experience_moments where experience_id=p_id)<=1 then raise exception 'last moment' using errcode='22023'; end if;
  update public.experience_photos set moment_id=null where moment_id=p_moment_id and experience_id=p_id;
  delete from public.experience_moments where id=p_moment_id and experience_id=p_id;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('revision',p_revision+1);
end $$;
create function public.experience_reorder_moments(p_id uuid,p_revision bigint,p_ordered_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  if p_ordered_ids is null or cardinality(p_ordered_ids)<>(select count(*) from public.experience_moments where experience_id=p_id)
    or cardinality(p_ordered_ids)<>(select count(distinct u.id) from unnest(p_ordered_ids) u(id))
    or exists(select 1 from unnest(p_ordered_ids) u(id) where not exists(select 1 from public.experience_moments m where m.id=u.id and m.experience_id=p_id)) then raise exception 'invalid ordering' using errcode='22023'; end if;
  set constraints public.experience_moments_position deferred;
  update public.experience_moments m set position=u.n-1 from unnest(p_ordered_ids) with ordinality u(id,n) where m.id=u.id and m.experience_id=p_id;
  set constraints public.experience_moments_position immediate;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('revision',p_revision+1);
end $$;
revoke all on function public.experience_create(jsonb),public.experience_update(uuid,bigint,jsonb),
 public.experience_save_moment(uuid,bigint,jsonb),public.experience_remove_moment(uuid,bigint,uuid),public.experience_reorder_moments(uuid,bigint,uuid[]) from public,anon;
grant execute on function public.experience_create(jsonb),public.experience_update(uuid,bigint,jsonb),
 public.experience_save_moment(uuid,bigint,jsonb),public.experience_remove_moment(uuid,bigint,uuid),public.experience_reorder_moments(uuid,bigint,uuid[]) to authenticated;

