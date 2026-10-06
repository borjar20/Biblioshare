-- Announcements, catalog state and private notification consent are separate domains.
-- Every client mutation is an auth-checked private helper behind an INVOKER wrapper.
create or replace function private.release_date_valid(p_value text, p_precision text)
returns boolean language plpgsql immutable set search_path='' as $$
declare y integer; m integer; d integer;
begin
  if p_precision='unknown' then return p_value is null; end if;
  if p_value is null then return false; end if;
  if p_precision='year' and p_value ~ '^[0-9]{4}$' then
    y:=p_value::integer; return y between 1400 and 2200;
  elsif p_precision='month' and p_value ~ '^[0-9]{4}-[0-9]{2}$' then
    y:=substring(p_value,1,4)::integer; m:=substring(p_value,6,2)::integer;
    return y between 1400 and 2200 and m between 1 and 12;
  elsif p_precision='day' and p_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    y:=substring(p_value,1,4)::integer; m:=substring(p_value,6,2)::integer; d:=substring(p_value,9,2)::integer;
    if y not between 1400 and 2200 then return false; end if;
    perform make_date(y,m,d); return true;
  end if;
  return false;
exception when data_exception then return false;
end $$;
revoke all on function private.release_date_valid(text,text) from public,anon,authenticated;
grant execute on function private.release_date_valid(text,text) to service_role;

create table public.cultural_releases (
  id uuid primary key default gen_random_uuid(),
  work_key text not null check(length(work_key) between 1 and 256),
  source text not null check(source in ('tmdb','editorial')),
  source_key text not null check(length(source_key) between 1 and 256),
  item_type text not null check(item_type in ('book','movie','series')),
  modality text not null check(modality in ('cinema','digital','series','season','book','book_translation')),
  season_number integer,
  market text not null check(market in ('ES','INT')),
  language text not null default 'es' check(language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  date_value text,
  date_precision text not null default 'unknown' check(date_precision in ('day','month','year','unknown')),
  status text not null default 'draft' check(status in ('draft','published','cancelled')),
  revision integer not null default 1 check(revision>0),
  checked_at timestamptz,
  title text not null check(length(btrim(title)) between 1 and 500),
  subtitle text check(length(subtitle)<=500),
  cover_url text check(cover_url is null or cover_url ~ '^https?://'),
  synopsis text check(length(synopsis)<=20000),
  author text check(length(author)<=500),
  publisher text check(length(publisher)<=500),
  isbn text check(length(isbn)<=32),
  digital_platform text check(length(digital_platform)<=200),
  source_name text not null check(length(btrim(source_name)) between 1 and 200),
  source_url text not null check(source_url ~ '^https?://' and length(source_url)<=2048),
  tmdb_id integer check(tmdb_id>0),
  book_id uuid references public.books(id) on delete set null,
  movie_id uuid references public.movies(id) on delete set null,
  series_id uuid references public.series(id) on delete set null,
  book_edition_id uuid references public.book_editions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source,source_key),
  constraint cultural_release_date check(private.release_date_valid(date_value,date_precision)),
  constraint cultural_release_modality check(
    (item_type='book' and modality in ('book','book_translation') and season_number is null)
    or (item_type='movie' and modality in ('cinema','digital') and season_number is null)
    or (item_type='series' and ((modality='series' and season_number is null) or (modality='season' and season_number is not null and season_number>0)))
  ),
  constraint cultural_release_source check(
    (source='tmdb' and item_type in ('movie','series') and tmdb_id is not null)
    or (source='editorial' and item_type='book' and tmdb_id is null)
  ),
  constraint cultural_release_catalog check(
    (book_id is null or item_type='book') and (book_edition_id is null or book_id is not null)
    and (movie_id is null or item_type='movie') and (series_id is null or item_type='series')
  ),
  constraint cultural_release_platform check(digital_platform is null or modality='digital')
  ,constraint cultural_release_translation check(modality<>'book_translation' or language in ('es','es-ES'))
);
create index cultural_releases_calendar on public.cultural_releases(market,date_precision,date_value) where status='published';
create index cultural_releases_work on public.cultural_releases(work_key);
create index cultural_releases_books on public.cultural_releases(book_id) where book_id is not null;
create index cultural_releases_movies on public.cultural_releases(movie_id) where movie_id is not null;
create index cultural_releases_series on public.cultural_releases(series_id) where series_id is not null;
create index cultural_releases_editions on public.cultural_releases(book_edition_id) where book_edition_id is not null;

create table public.release_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.cultural_releases(id) on delete cascade,
  active boolean not null default true,
  consent_generation uuid not null default gen_random_uuid(),
  baseline_revision integer not null check(baseline_revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,release_id)
);
create index release_subscriptions_release on public.release_subscriptions(release_id) where active;

create table public.release_sync_state (
  source text primary key check(source in ('tmdb','editorial')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check(length(last_error)<=2000)
);
insert into public.release_sync_state(source) values('tmdb'),('editorial');

alter table public.cultural_releases enable row level security;
alter table public.release_subscriptions enable row level security;
alter table public.release_sync_state enable row level security;
revoke all on public.cultural_releases,public.release_subscriptions,public.release_sync_state from public,anon,authenticated;
grant select on public.cultural_releases to anon,authenticated;
grant select on public.release_subscriptions to authenticated;
grant all on public.cultural_releases,public.release_subscriptions,public.release_sync_state to service_role;
create policy release_public_read on public.cultural_releases for select to anon,authenticated
  using(status in ('published','cancelled'));
create policy release_admin_read on public.cultural_releases for select to authenticated
  using((select public.current_user_role())='admin'::public.user_role);
create policy release_consent_owner_read on public.release_subscriptions for select to authenticated
  using(user_id=(select auth.uid()));
create policy release_service_all on public.cultural_releases for all to service_role using(true) with check(true);
create policy release_consent_service_all on public.release_subscriptions for all to service_role using(true) with check(true);
create policy release_sync_service_all on public.release_sync_state for all to service_role using(true) with check(true);

create or replace function private.release_before_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.id,new.source,new.source_key,new.work_key,new.item_type,new.modality,new.season_number,new.market,new.tmdb_id)
       is distinct from (old.id,old.source,old.source_key,old.work_key,old.item_type,old.modality,old.season_number,old.market,old.tmdb_id) then
      raise exception 'release_identity_immutable' using errcode='22023';
    end if;
    new.revision:=old.revision+case when (new.date_value,new.date_precision,new.status) is distinct from (old.date_value,old.date_precision,old.status) then 1 else 0 end;
    new.created_at:=old.created_at;
  else new.revision:=1;
  end if;
  -- Editorial stale-form detection covers every write, even within one transaction.
  -- Event revision still changes only for effective date/precision/status changes.
  new.updated_at:=clock_timestamp();
  if tg_op='UPDATE' then new.updated_at:=greatest(new.updated_at,old.updated_at+interval '1 microsecond'); end if;
  if new.book_edition_id is not null and not exists(select 1 from public.book_editions e where e.id=new.book_edition_id and e.book_id=new.book_id) then
    raise exception 'release_edition_book_mismatch' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function private.release_before_write() from public,anon,authenticated;
create trigger cultural_release_before_write before insert or update on public.cultural_releases for each row execute function private.release_before_write();

create or replace function private.release_set_subscription(p_release_id uuid,p_active boolean)
returns setof public.release_subscriptions language plpgsql security definer set search_path='' as $$
declare person uuid:=auth.uid(); current_release public.cultural_releases; consent public.release_subscriptions;
begin
  if person is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_active is null then raise exception 'active_required' using errcode='22023'; end if;
  -- Same release -> consent lock order as release edits and delivery acceptance.
  select * into current_release from public.cultural_releases where id=p_release_id for update;
  if not found or (p_active and current_release.status='draft') then raise exception 'release_not_public' using errcode='22023'; end if;
  if p_active and current_release.status<>'published' then raise exception 'release_not_published' using errcode='22023'; end if;
  select * into consent from public.release_subscriptions where user_id=person and release_id=p_release_id for update;
  if not found then
    insert into public.release_subscriptions(user_id,release_id,active,baseline_revision)
      values(person,p_release_id,p_active,current_release.revision) returning * into consent;
  elsif consent.active is distinct from p_active then
    update public.release_subscriptions set active=p_active,consent_generation=gen_random_uuid(),baseline_revision=current_release.revision,updated_at=now()
      where user_id=person and release_id=p_release_id returning * into consent;
  end if;
  return next consent;
end $$;
revoke all on function private.release_set_subscription(uuid,boolean) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.release_set_subscription(uuid,boolean) to authenticated;
create or replace function public.release_set_subscription(p_release_id uuid,p_active boolean)
returns setof public.release_subscriptions language sql security invoker set search_path='' as $$
  select * from private.release_set_subscription(p_release_id,p_active);
$$;
revoke all on function public.release_set_subscription(uuid,boolean) from public,anon,authenticated;
grant execute on function public.release_set_subscription(uuid,boolean) to authenticated;

create or replace function private.release_editorial_save(p_input jsonb,p_release_id uuid default null,p_expected_revision integer default null,p_expected_updated_at timestamptz default null)
returns setof public.cultural_releases language plpgsql security definer set search_path='' as $$
declare current_release public.cultural_releases; v_id uuid:=coalesce(p_release_id,gen_random_uuid()); v_book uuid;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'editorial_input_required' using errcode='22023'; end if;
  if p_release_id is not null then
    select * into current_release from public.cultural_releases where id=p_release_id and source='editorial' for update;
    if not found then raise exception 'editorial_release_not_found' using errcode='22023'; end if;
    if p_expected_revision is null or p_expected_revision<>current_release.revision then raise exception 'release_revision_conflict' using errcode='40001'; end if;
    if p_expected_updated_at is null or p_expected_updated_at is distinct from current_release.updated_at then raise exception 'release_edit_conflict' using errcode='40001'; end if;
  end if;
  v_book:=coalesce(nullif(p_input->>'bookId','')::uuid,current_release.book_id);
  if p_input->>'status'='published' and v_book is null then
    -- This catalog RPC has no library/pass effect. Creating an editorial announcement
    -- must never invoke the UI manual-add action that also adds a personal pending pass.
    v_book:=public.register_manual_catalog_item('book',p_input->>'title',p_input->>'author',
      case when p_input->>'dateValue' ~ '^[0-9]{4}' then substring(p_input->>'dateValue',1,4)::integer else null end,
      p_input->>'coverUrl',p_input->>'publisher',null,p_input->>'isbn');
  end if;
  if p_release_id is null then
    insert into public.cultural_releases(id,work_key,source,source_key,item_type,modality,market,language,date_value,date_precision,status,checked_at,
      title,subtitle,cover_url,synopsis,author,publisher,isbn,source_name,source_url,book_id,book_edition_id)
    values(v_id,coalesce(nullif(p_input->>'workKey',''),'editorial:'||v_id::text),'editorial',v_id::text,'book',
      p_input->>'modality',p_input->>'market',p_input->>'language',p_input->>'dateValue',p_input->>'datePrecision',p_input->>'status',now(),
      p_input->>'title',p_input->>'subtitle',p_input->>'coverUrl',p_input->>'synopsis',p_input->>'author',p_input->>'publisher',p_input->>'isbn',
      p_input->>'sourceName',p_input->>'sourceUrl',v_book,nullif(p_input->>'bookEditionId','')::uuid) returning * into current_release;
  else
    update public.cultural_releases set title=p_input->>'title',subtitle=p_input->>'subtitle',cover_url=p_input->>'coverUrl',synopsis=p_input->>'synopsis',
      author=p_input->>'author',publisher=p_input->>'publisher',isbn=p_input->>'isbn',date_value=p_input->>'dateValue',date_precision=p_input->>'datePrecision',
      status=p_input->>'status',checked_at=now(),source_name=p_input->>'sourceName',source_url=p_input->>'sourceUrl',book_id=v_book,
      book_edition_id=nullif(p_input->>'bookEditionId','')::uuid,language=p_input->>'language',modality=p_input->>'modality',market=p_input->>'market'
      where id=p_release_id returning * into current_release;
  end if;
  update public.release_sync_state set last_attempt_at=now(),last_success_at=now(),last_error=null where source='editorial';
  return next current_release;
end $$;
revoke all on function private.release_editorial_save(jsonb,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function private.release_editorial_save(jsonb,uuid,integer,timestamptz) to authenticated;
create or replace function public.release_editorial_save(p_input jsonb,p_release_id uuid default null,p_expected_revision integer default null,p_expected_updated_at timestamptz default null)
returns setof public.cultural_releases language sql security invoker set search_path='' as $$
  select * from private.release_editorial_save(p_input,p_release_id,p_expected_revision,p_expected_updated_at);
$$;
revoke all on function public.release_editorial_save(jsonb,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.release_editorial_save(jsonb,uuid,integer,timestamptz) to authenticated;

create or replace function public.release_upsert_tmdb(p_rows jsonb,p_expected_attempt timestamptz)
returns setof public.cultural_releases language plpgsql security invoker set search_path='' as $$
declare input jsonb; result public.cultural_releases; current_attempt timestamptz;
begin
  -- A service-side CAS acquisition alone cannot fence a delayed provider response.
  -- Hold the source row until the whole batch commits so a new acquisition cannot interleave.
  select last_attempt_at into current_attempt from public.release_sync_state where source='tmdb' for update;
  if not found or p_expected_attempt is null or current_attempt is distinct from p_expected_attempt then
    raise exception 'release_sync_attempt_conflict' using errcode='40001';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>2000 then raise exception 'tmdb_rows_invalid' using errcode='22023'; end if;
  for input in select value from jsonb_array_elements(p_rows) loop
    if input->>'status' not in ('published','cancelled') then raise exception 'tmdb_status_invalid' using errcode='22023'; end if;
    insert into public.cultural_releases(work_key,source,source_key,item_type,modality,season_number,market,language,date_value,date_precision,status,checked_at,
      title,subtitle,cover_url,synopsis,digital_platform,source_name,source_url,tmdb_id,movie_id,series_id)
    values(input->>'work_key','tmdb',input->>'source_key',input->>'item_type',input->>'modality',(input->>'season_number')::integer,
      input->>'market',input->>'language',input->>'date_value',input->>'date_precision',input->>'status',(input->>'checked_at')::timestamptz,
      input->>'title',input->>'subtitle',input->>'cover_url',input->>'synopsis',input->>'digital_platform',input->>'source_name',input->>'source_url',
      (input->>'tmdb_id')::integer,(input->>'movie_id')::uuid,(input->>'series_id')::uuid)
    on conflict(source,source_key) do update set work_key=excluded.work_key,item_type=excluded.item_type,modality=excluded.modality,
      season_number=excluded.season_number,market=excluded.market,tmdb_id=excluded.tmdb_id,
      title=excluded.title,subtitle=excluded.subtitle,cover_url=excluded.cover_url,synopsis=excluded.synopsis,
      date_value=excluded.date_value,date_precision=excluded.date_precision,status=excluded.status,checked_at=excluded.checked_at,
      digital_platform=excluded.digital_platform,language=excluded.language,source_name=excluded.source_name,source_url=excluded.source_url,
      movie_id=coalesce(excluded.movie_id,public.cultural_releases.movie_id),series_id=coalesce(excluded.series_id,public.cultural_releases.series_id)
      returning * into result;
    return next result;
  end loop;
end $$;
revoke all on function public.release_upsert_tmdb(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.release_upsert_tmdb(jsonb,timestamptz) to service_role;

-- Existing system notices already accept actor_id=NULL. Preserve that CHECK and
-- require the new release-only types to have no human actor.
alter table public.notifications add constraint release_notifications_system_actor
  check(type not in ('release_reminder','release_updated','release_cancelled') or actor_id is null);
comment on table public.cultural_releases is 'Public published/cancelled release snapshots; drafts are admin-only. No passes or subscriptions are inferred.';
comment on table public.release_subscriptions is 'Private explicit per-release consent. Generation changes invalidate pending work; public profile does not expose it.';
