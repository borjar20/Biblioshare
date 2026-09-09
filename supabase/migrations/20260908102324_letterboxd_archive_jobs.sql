-- #1138: durable provenance and atomic dated-pass import. No remote application.
create table public.archive_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  fingerprint text not null,
  analysis jsonb not null,
  state text not null default 'draft' check (state in ('draft','running','done','undone')),
  is_public boolean not null default false,
  announce boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, fingerprint),
  check (octet_length(analysis::text) <= 24000000)
);
create table public.archive_import_items (
  job_id uuid not null references public.archive_imports(id) on delete cascade,
  ordinal integer not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','imported','conflict','unmatched','ambiguous','error','dismissed')),
  item_id uuid references public.movies(id),
  candidates jsonb not null default '[]',
  message text,
  primary key(job_id, ordinal)
);
create table public.archive_import_sources (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  source_key text not null,
  pass_id uuid references public.passes(id) on delete set null,
  snapshot jsonb not null,
  primary key(user_id, source_key)
);
create table public.archive_import_effects (
  job_id uuid not null references public.archive_imports(id) on delete cascade,
  pass_id uuid not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  before_row jsonb,
  after_row jsonb not null,
  reverted boolean not null default false,
  primary key(job_id, pass_id)
);
alter table public.archive_imports enable row level security;
alter table public.archive_import_items enable row level security;
alter table public.archive_import_sources enable row level security;
alter table public.archive_import_effects enable row level security;
revoke all on public.archive_imports, public.archive_import_items, public.archive_import_sources, public.archive_import_effects from anon, authenticated;
grant select on public.archive_imports, public.archive_import_items, public.archive_import_sources, public.archive_import_effects to authenticated;
grant all on public.archive_imports, public.archive_import_items, public.archive_import_sources, public.archive_import_effects to service_role;
create policy archive_own_jobs on public.archive_imports for select to authenticated using (user_id = (select auth.uid()));
create policy archive_own_items on public.archive_import_items for select to authenticated using (user_id = (select auth.uid()));
create policy archive_own_sources on public.archive_import_sources for select to authenticated using (user_id = (select auth.uid()));
create policy archive_own_effects on public.archive_import_effects for select to authenticated using (user_id = (select auth.uid()));
create index archive_pending_jobs on public.archive_imports(created_at) where state = 'running';

create function private.archive_create(p_analysis jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_analysis->'movies') is distinct from 'array'
    or jsonb_array_length(p_analysis->'movies') not between 1 and 3000
    or coalesce(p_analysis->>'fingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_archive'; end if;
  insert into public.archive_imports(user_id, fingerprint, analysis)
    values(v_user, p_analysis->>'fingerprint', p_analysis)
    on conflict(user_id,fingerprint) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.archive_imports where user_id=v_user and fingerprint=p_analysis->>'fingerprint';
    return v_id;
  end if;
  insert into public.archive_import_items(job_id,ordinal,user_id,payload)
    select v_id, n::integer-1, v_user, value from jsonb_array_elements(p_analysis->'movies') with ordinality as x(value,n);
  return v_id;
end $$;

create function private.archive_confirm(p_job uuid, p_public boolean, p_announce boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  update public.archive_imports set state='running',is_public=p_public,announce=p_announce
    where id=p_job and user_id=auth.uid() and state='draft';
  if not found and not exists(select 1 from public.archive_imports where id=p_job and user_id=auth.uid()) then raise exception 'forbidden'; end if;
end $$;

-- Records original state once, latest state after every write in this job.
create function private.archive_effect(p_job uuid, p_user uuid, p_pass uuid, p_before jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.archive_import_effects(job_id,user_id,pass_id,before_row,after_row)
    select p_job,p_user,p_pass,p_before,to_jsonb(p) from public.passes p where id=p_pass and user_id=p_user
  on conflict(job_id,pass_id) do update set after_row=excluded.after_row;
$$;

create function private.archive_apply(p_job uuid, p_ordinal integer, p_movie uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  j public.archive_imports; r public.archive_import_items; s public.archive_import_sources;
  p jsonb; before_row jsonb; current_row jsonb; active_row jsonb; v_id uuid; v_key text;
  v_date date; v_rating smallint; v_status public.media_status; v_active boolean;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or (j.user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then raise exception 'forbidden'; end if;
  if j.state <> 'running' then raise exception 'not_running'; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal for update;
  if not found then raise exception 'missing_row'; end if;
  if r.state in ('imported','dismissed') then return r.state; end if;
  if not exists(select 1 from public.movies where id=p_movie) then raise exception 'missing_movie'; end if;
  -- Serialize jobs for the same account/movie, including distinct archives.
  perform pg_advisory_xact_lock(hashtextextended(j.user_id::text || p_movie::text,0));
  begin
    for p in select value from jsonb_array_elements(r.payload->'passes') order by value->>'finishedOn' nulls first loop
      v_key := p->>'sourceKey'; v_date := (p->>'finishedOn')::date; v_rating := (p->>'rating')::smallint;
      v_status := 'completed';
      if v_key is null or length(v_key) <> 64 or v_date is null then raise exception 'invalid_pass'; end if;
      select * into s from public.archive_import_sources where user_id=j.user_id and source_key=v_key for update;
      if found then
        select to_jsonb(x) into current_row from public.passes x where id=s.pass_id and user_id=j.user_id for update;
        if current_row is null or current_row->>'item_id' <> p_movie::text then raise exception 'archive_conflict'; end if;
        -- A later local rating/review/date edit must never be silently replaced.
        if (current_row - 'updated_at' - 'is_active') is distinct from (s.snapshot - 'updated_at' - 'is_active') then raise exception 'archive_conflict'; end if;
        before_row := current_row; v_id := s.pass_id;
        update public.passes set rating=coalesce(v_rating,rating), review=coalesce(nullif(p->>'review',''),review)
          where id=v_id and (rating is distinct from coalesce(v_rating,rating) or review is distinct from coalesce(nullif(p->>'review',''),review));
        if found then perform private.archive_effect(p_job,j.user_id,v_id,before_row); end if;
      else
        if exists(select 1 from public.passes x where x.user_id=j.user_id and x.item_type='movie' and x.item_id=p_movie and x.finished_on=v_date
          and not exists(select 1 from public.archive_import_sources z where z.pass_id=x.id)) then raise exception 'archive_conflict'; end if;
        select to_jsonb(x) into active_row from public.passes x where x.user_id=j.user_id and x.item_type='movie' and x.item_id=p_movie and x.is_active for update;
        v_active := active_row is null or (active_row->>'status' in ('completed','dropped') and coalesce(active_row->>'finished_on','') <= v_date::text);
        if v_active and active_row is not null then
          update public.passes set is_active=false where id=(active_row->>'id')::uuid;
          perform private.archive_effect(p_job,j.user_id,(active_row->>'id')::uuid,active_row);
        end if;
        insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating,review,is_public,created_at)
          values(j.user_id,'movie',p_movie,v_status,v_active,v_date,v_rating,nullif(p->>'review',''),j.is_public,v_date::timestamptz) returning id into v_id;
        perform private.archive_effect(p_job,j.user_id,v_id,null);
      end if;
      insert into public.archive_import_sources(user_id,source_key,pass_id,snapshot)
        select j.user_id,v_key,v_id,to_jsonb(x) from public.passes x where id=v_id
        on conflict(user_id,source_key) do update set snapshot=excluded.snapshot;
    end loop;
    update public.archive_import_items set state='imported',item_id=p_movie,message=null where job_id=p_job and ordinal=p_ordinal;
  exception when raise_exception then
    if sqlerrm <> 'archive_conflict' then raise; end if;
    update public.archive_import_items set state='conflict',item_id=p_movie,message='localChanges' where job_id=p_job and ordinal=p_ordinal;
    return 'conflict';
  end;
  return 'imported';
end $$;

create function private.archive_result(p_job uuid,p_ordinal integer,p_state text,p_candidates jsonb default '[]') returns void
language plpgsql security definer set search_path = '' as $$
declare j public.archive_imports;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or (j.user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then raise exception 'forbidden'; end if;
  if j.state <> 'running' or p_state not in ('error','unmatched','ambiguous','dismissed','pending') then raise exception 'invalid_state'; end if;
  update public.archive_import_items set state=p_state,candidates=p_candidates where job_id=p_job and ordinal=p_ordinal and state = 'pending';
end $$;

create function private.archive_finish(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.archive_imports j set state='done' where id=p_job and state='running'
    and (user_id=auth.uid() or coalesce(auth.role(),'')='service_role')
    and not exists(select 1 from public.archive_import_items r where r.job_id=j.id and r.state in ('pending','error'));
end $$;

-- Narrow public entrypoints; ownership is checked inside the private functions.
create function public.archive_create(p_analysis jsonb) returns uuid language sql security invoker set search_path='' as $$select private.archive_create(p_analysis)$$;
create function public.archive_confirm(p_job uuid,p_public boolean,p_announce boolean) returns void language sql security invoker set search_path='' as $$select private.archive_confirm(p_job,p_public,p_announce)$$;
create function public.archive_apply(p_job uuid,p_ordinal integer,p_movie uuid) returns text language sql security invoker set search_path='' as $$select private.archive_apply(p_job,p_ordinal,p_movie)$$;
create function public.archive_result(p_job uuid,p_ordinal integer,p_state text,p_candidates jsonb default '[]') returns void language sql security invoker set search_path='' as $$select private.archive_result(p_job,p_ordinal,p_state,p_candidates)$$;
create function public.archive_finish(p_job uuid) returns void language sql security invoker set search_path='' as $$select private.archive_finish(p_job)$$;
revoke all on function private.archive_create(jsonb),private.archive_confirm(uuid,boolean,boolean),private.archive_apply(uuid,integer,uuid),private.archive_result(uuid,integer,text,jsonb),private.archive_finish(uuid),private.archive_effect(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.archive_create(jsonb),public.archive_confirm(uuid,boolean,boolean),public.archive_apply(uuid,integer,uuid),public.archive_result(uuid,integer,text,jsonb),public.archive_finish(uuid) from public,anon;
grant usage on schema private to authenticated,service_role;
grant execute on function private.archive_create(jsonb),private.archive_confirm(uuid,boolean,boolean),private.archive_apply(uuid,integer,uuid),private.archive_result(uuid,integer,text,jsonb),private.archive_finish(uuid) to authenticated,service_role;
grant execute on function public.archive_create(jsonb),public.archive_confirm(uuid,boolean,boolean),public.archive_apply(uuid,integer,uuid),public.archive_result(uuid,integer,text,jsonb),public.archive_finish(uuid) to authenticated,service_role;
