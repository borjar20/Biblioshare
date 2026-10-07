-- Local/dev only: all synthetic releases and source attempts roll back.
begin;
set local role service_role;
do $$
declare
  attempt timestamptz := clock_timestamp();
  payload jsonb;
  original public.cultural_releases;
  result public.cultural_releases;
begin
  update public.release_sync_state set last_attempt_at=attempt where source='tmdb';
  payload := jsonb_build_object('work_key','tmdb:movie:97939999','source_key','quality:test:97939999',
    'item_type','movie','modality','cinema','market','ES','language','es',
    'date_value','2027-10-09','date_precision','day','status','published','checked_at',attempt,
    'title','[TEST] Information quality','tmdb_id',97939999,'source_name','TMDB',
    'source_url','https://www.themoviedb.org/movie/97939999',
    'cover_url','https://image.tmdb.org/t/p/w342/known.jpg','synopsis','Known English synopsis','synopsis_language','en');
  select * into original from public.release_upsert_tmdb(jsonb_build_array(payload),attempt);
  if original.synopsis_language is distinct from 'en' or original.language is distinct from 'es' then
    raise exception 'FAIL synopsis and launch language are independent';
  end if;
  select * into result from public.release_upsert_tmdb(jsonb_build_array(payload ||
    jsonb_build_object('synopsis',E'\t\n','cover_url',E'\t\r','synopsis_language',null)),attempt);
  if result.synopsis is distinct from original.synopsis or result.cover_url is distinct from original.cover_url
    or result.synopsis_language is distinct from original.synopsis_language then
    raise exception 'FAIL blank optional metadata erased known text/art';
  end if;
  select * into result from public.release_upsert_tmdb(jsonb_build_array(payload ||
    jsonb_build_object('synopsis',null,'cover_url',null,'synopsis_language',null)),attempt);
  if result.synopsis is distinct from original.synopsis or result.cover_url is distinct from original.cover_url
    or result.synopsis_language is distinct from original.synopsis_language then
    raise exception 'FAIL missing optional metadata erased known text/art';
  end if;
  select * into result from public.release_upsert_tmdb(jsonb_build_array((payload - 'synopsis_language') ||
    jsonb_build_object('synopsis','Sinopsis disponible en castellano')),attempt);
  if result.synopsis_language is distinct from 'es' or result.synopsis is distinct from 'Sinopsis disponible en castellano' then
    raise exception 'FAIL legacy Spanish input or replacement language';
  end if;
  if result.revision <> original.revision then raise exception 'FAIL metadata-only change revised the launch'; end if;
  if exists(select 1 from public.release_deliveries where release_id=result.id) then raise exception 'FAIL metadata-only notice'; end if;
  update public.release_sync_state set last_attempt_at=attempt + interval '1 second' where source='tmdb';
  begin
    perform public.release_upsert_tmdb(jsonb_build_array(payload),attempt);
    raise exception 'FAIL stale source attempt accepted';
  exception when serialization_failure then null;
  end;
end $$;
reset role;
-- Surface 6: inspect the new column's actual writers, not only table ACLs.
do $$ declare actor text; begin
  foreach actor in array array['anon','authenticated'] loop
    if not has_column_privilege(actor,'public.cultural_releases','synopsis_language','SELECT')
      or has_column_privilege(actor,'public.cultural_releases','synopsis_language','INSERT')
      or has_column_privilege(actor,'public.cultural_releases','synopsis_language','UPDATE') then
      raise exception 'FAIL public metadata grants: %',actor;
    end if;
    if has_function_privilege(actor,'public.release_upsert_tmdb(jsonb,timestamptz)','EXECUTE') then
      raise exception 'FAIL client metadata synchronization: %',actor;
    end if;
  end loop;
  if not has_column_privilege('service_role','public.cultural_releases','synopsis_language','SELECT')
    or not has_column_privilege('service_role','public.cultural_releases','synopsis_language','INSERT')
    or not has_column_privilege('service_role','public.cultural_releases','synopsis_language','UPDATE') then
    raise exception 'FAIL service metadata grants';
  end if;
end $$;
set local role anon;
do $$ begin
  if (select synopsis_language from public.cultural_releases where source_key='quality:test:97939999') is distinct from 'es' then
    raise exception 'FAIL anonymous synopsis language read';
  end if;
end $$;
reset role;
rollback;