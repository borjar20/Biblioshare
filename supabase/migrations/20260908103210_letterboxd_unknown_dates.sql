-- #1139: completed passes can have unknown dates. Open state is explicit.
alter table public.passes drop constraint passes_status_dates;
alter table public.passes add constraint passes_status_dates check (
  (status in ('planned','in_progress') and finished_on is null)
  or status='completed'
  or (status='dropped' and finished_on is not null)
);
comment on constraint passes_status_dates on public.passes is 'Open is planned/in_progress; completed may have an unknown finished_on (#1139).';
create or replace function private.archive_apply(p_job uuid, p_ordinal integer, p_movie uuid) returns text
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
      if v_key is null or length(v_key) <> 64  then raise exception 'invalid_pass'; end if;
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
        v_active := active_row is null or (active_row->>'status' in ('completed','dropped') and coalesce(active_row->>'finished_on','') <= coalesce(v_date::text,''));
        if v_active and active_row is not null then
          update public.passes set is_active=false where id=(active_row->>'id')::uuid;
          perform private.archive_effect(p_job,j.user_id,(active_row->>'id')::uuid,active_row);
        end if;
        insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating,review,is_public,created_at)
          values(j.user_id,'movie',p_movie,v_status,v_active,v_date,v_rating,nullif(p->>'review',''),j.is_public,coalesce(v_date::timestamptz,now())) returning id into v_id;
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
