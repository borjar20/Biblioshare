-- Global place catalog for experience moments (spec 2026-10-05-experiencias-lugares).
-- Written only through place_upsert (service_role) after the app verifies a signed
-- Photon suggestion; clients just read it.
create table public.places(
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('osm')),
  provider_ref text not null check (provider_ref ~ '^[NWR][0-9]+$'),
  name text not null check (char_length(name) between 1 and 240),
  category text not null check (char_length(category) between 3 and 120),
  layer text not null check (layer in ('poi','city','region','country')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  city text check (char_length(city) <= 240),
  region text check (char_length(region) <= 240),
  country text check (char_length(country) <= 240),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  wikidata_qid text check (wikidata_qid ~ '^Q[0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
alter table public.places enable row level security;
revoke all on public.places from public, anon, authenticated;
grant select on public.places to anon, authenticated;
create policy places_read on public.places for select to anon, authenticated using (true);

alter table public.experience_moments add column place_id uuid references public.places(id) on delete set null;
create index experience_moments_place on public.experience_moments(place_id) where place_id is not null;

create function public.place_upsert(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid' using errcode='22023'; end if;
  insert into public.places(provider,provider_ref,name,category,layer,lat,lng,city,region,country,country_code,wikidata_qid)
  values(p_input->>'provider',p_input->>'providerRef',btrim(p_input->>'name'),p_input->>'category',p_input->>'layer',
    (p_input->>'lat')::double precision,(p_input->>'lng')::double precision,
    nullif(btrim(p_input->>'city'),''),nullif(btrim(p_input->>'region'),''),nullif(btrim(p_input->>'country'),''),
    p_input->>'countryCode',p_input->>'wikidataQid')
  on conflict (provider,provider_ref) do update set name=excluded.name,category=excluded.category,layer=excluded.layer,
    lat=excluded.lat,lng=excluded.lng,city=excluded.city,region=excluded.region,country=excluded.country,
    country_code=excluded.country_code,wikidata_qid=coalesce(excluded.wikidata_qid,places.wikidata_qid),updated_at=now()
  returning id into r;
  return r;
end $$;
revoke all on function public.place_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.place_upsert(jsonb) to service_role;

-- Resolves the place of a moment input: placeId wins (label = official name); otherwise free text.
create function private.experience_input_place(p jsonb) returns table(out_id uuid, out_label text)
language plpgsql stable set search_path='' as $$
declare pid uuid; begin
  if p ? 'placeId' then
    begin pid:=(p->>'placeId')::uuid; exception when invalid_text_representation then raise exception 'invalid place' using errcode='22023'; end;
    return query select pl.id, pl.name from public.places pl where pl.id=pid;
    if not found then raise exception 'invalid place' using errcode='22023'; end if;
    return;
  end if;
  return query select null::uuid, nullif(btrim(p->>'placeLabel'),'');
end $$;
revoke all on function private.experience_input_place(jsonb) from public, anon, authenticated;

create or replace function public.experience_create(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; m uuid; member uuid; pid uuid; plabel text; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform private.require_request_quota('experience_write');
  perform private.experience_validate_input(p_input,array['title','state','kind','placeLabel','placeId','startsOn','endsOn']);
  if coalesce(p_input->>'state','') not in ('planned','lived') or not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid' using errcode='22023'; end if;
  select x.out_id, x.out_label into pid, plabel from private.experience_input_place(p_input) x;
  insert into public.experiences(creator_id,title,state,starts_on,ends_on)
    values(auth.uid(),btrim(p_input->>'title'),p_input->>'state',(p_input->>'startsOn')::date,(p_input->>'endsOn')::date) returning id into e;
  insert into public.experience_moments(experience_id,title,kind,place_id,place_label,starts_on,ends_on,position)
    values(e,btrim(p_input->>'title'),p_input->>'kind',pid,plabel,(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,0) returning id into m;
  insert into public.experience_participants(experience_id,user_id,invitation_state) values(e,auth.uid(),'accepted') returning id into member;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state)
    values(e,m,member,case when p_input->>'state'='lived' then 'attended' else 'planned' end);
  return jsonb_build_object('id',e);
end $$;

create or replace function public.experience_save_moment(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m uuid; n integer; keep boolean; pid uuid; plabel text; begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['id','title','kind','placeLabel','placeId','keepPlace','startsOn','endsOn']);
  if not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid kind' using errcode='22023'; end if;
  if p_input ? 'keepPlace' and jsonb_typeof(p_input->'keepPlace')<>'boolean' then raise exception 'invalid keepPlace' using errcode='22023'; end if;
  keep:=coalesce((p_input->>'keepPlace')::boolean,false);
  if keep and (p_input ? 'placeId' or not p_input ? 'id') then raise exception 'invalid keepPlace' using errcode='22023'; end if;
  if not keep then select x.out_id, x.out_label into pid, plabel from private.experience_input_place(p_input) x; end if;
  if p_input ? 'id' then
    begin m:=(p_input->>'id')::uuid; exception when invalid_text_representation then raise exception 'invalid id' using errcode='22023'; end;
    if m is null or not exists(select 1 from public.experience_moments where id=m and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
    update public.experience_moments set title=btrim(p_input->>'title'),kind=p_input->>'kind',
      place_id=case when keep then place_id else pid end,place_label=case when keep then place_label else plabel end,
      starts_on=(p_input->>'startsOn')::date,ends_on=(p_input->>'endsOn')::date,updated_at=now() where id=m;
  else
    select count(*) into n from public.experience_moments where experience_id=p_id;
    if n>=50 then raise exception 'moment limit' using errcode='PT429'; end if;
    insert into public.experience_moments(experience_id,title,kind,place_id,place_label,starts_on,ends_on,position)
      values(p_id,btrim(p_input->>'title'),p_input->>'kind',pid,plabel,(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,(select coalesce(max(position),-1)+1 from public.experience_moments where experience_id=p_id)) returning id into m;
    -- Propose attendance only; an account confirms its own attended/skipped state.
    insert into public.experience_moment_participants(experience_id,moment_id,participant_id)
      select p_id,m,id from public.experience_participants where experience_id=p_id and invitation_state='accepted';
    if n>=1 then update public.experiences set shape='trip' where id=p_id; end if;
  end if;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',m,'revision',p_revision+1);
end $$;
