-- Information quality is a presentation concern, not publication status or consent.
-- Nullable provenance keeps existing announcement/notification snapshots compatible.
alter table public.cultural_releases add column synopsis_language text
  constraint cultural_release_synopsis_language check(synopsis_language is null or synopsis_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
comment on column public.cultural_releases.synopsis_language is 'Language of the synopsis text; independent of launch market and edition/dubbing language. NULL means not recorded.';
grant select(synopsis_language) on public.cultural_releases to anon,authenticated;
grant select(synopsis_language),insert(synopsis_language),update(synopsis_language) on public.cultural_releases to service_role;

-- Preserve the exact service-only attempt fence. Missing optional metadata must
-- not erase already known text/art after a failed supplementary provider request.
create or replace function public.release_upsert_tmdb(p_rows jsonb,p_expected_attempt timestamptz)
returns setof public.cultural_releases language plpgsql security invoker set search_path='' as $$
declare
  input jsonb; result public.cultural_releases; current_attempt timestamptz;
  cover_value text; synopsis_value text;
  -- Match String.trim() used by the provider and presentation quality checks.
  metadata_whitespace constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
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
    cover_value := nullif(btrim(input->>'cover_url',metadata_whitespace),'');
    synopsis_value := nullif(btrim(input->>'synopsis',metadata_whitespace),'');
    insert into public.cultural_releases(work_key,source,source_key,item_type,modality,season_number,market,language,date_value,date_precision,status,checked_at,
      title,subtitle,cover_url,synopsis,synopsis_language,digital_platform,source_name,source_url,tmdb_id,movie_id,series_id)
    values(input->>'work_key','tmdb',input->>'source_key',input->>'item_type',input->>'modality',(input->>'season_number')::integer,
      input->>'market',input->>'language',input->>'date_value',input->>'date_precision',input->>'status',(input->>'checked_at')::timestamptz,
      input->>'title',input->>'subtitle',cover_value,synopsis_value,
      case when synopsis_value is null then null else coalesce(nullif(input->>'synopsis_language',''),'es') end,
      input->>'digital_platform',input->>'source_name',input->>'source_url',
      (input->>'tmdb_id')::integer,(input->>'movie_id')::uuid,(input->>'series_id')::uuid)
    on conflict(source,source_key) do update set work_key=excluded.work_key,item_type=excluded.item_type,modality=excluded.modality,
      season_number=excluded.season_number,market=excluded.market,tmdb_id=excluded.tmdb_id,
      title=excluded.title,subtitle=excluded.subtitle,cover_url=coalesce(excluded.cover_url,public.cultural_releases.cover_url),
      synopsis=coalesce(excluded.synopsis,public.cultural_releases.synopsis),
      synopsis_language=case when excluded.synopsis is not null then excluded.synopsis_language else public.cultural_releases.synopsis_language end,
      date_value=excluded.date_value,date_precision=excluded.date_precision,status=excluded.status,checked_at=excluded.checked_at,
      digital_platform=excluded.digital_platform,language=excluded.language,source_name=excluded.source_name,source_url=excluded.source_url,
      movie_id=coalesce(excluded.movie_id,public.cultural_releases.movie_id),series_id=coalesce(excluded.series_id,public.cultural_releases.series_id)
      returning * into result;
    return next result;
  end loop;
end $$;
revoke all on function public.release_upsert_tmdb(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.release_upsert_tmdb(jsonb,timestamptz) to service_role;
