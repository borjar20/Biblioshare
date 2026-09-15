-- Server-verified TMDB data for a confirmed import, never client metadata.
create function private.archive_register_movie(p_job uuid,p_ordinal integer,p_tmdb bigint,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; r public.archive_import_items; v_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into j from public.archive_imports where id=p_job for update;
  if not found or j.state <> 'running' then raise exception 'invalid_state'; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal for update;
  if not found or r.state <> 'pending' then raise exception 'invalid_state'; end if;
  if p_tmdb is null or p_tmdb <= 0 or nullif(btrim(p_data->>'title'),'') is null then raise exception 'invalid_metadata'; end if;
  if r.item_id is not null and not exists(select 1 from public.movies where id=r.item_id and tmdb_id=p_tmdb) then raise exception 'identity_changed'; end if;
  insert into public.movies(tmdb_id) values(p_tmdb) on conflict(tmdb_id) do nothing;
  select id into v_id from public.movies where tmdb_id=p_tmdb;
  perform set_config('app.hydrating','on',true);
  update public.movies set
    title=coalesce(nullif(title,''),left(p_data->>'title',500)),
    original_title=coalesce(nullif(original_title,''),p_data->>'originalTitle'),
    director=coalesce(nullif(director,''),p_data->>'director'),
    synopsis=coalesce(nullif(synopsis,''),left(p_data->>'synopsis',5000)),
    cover_url=coalesce(nullif(cover_url,''),p_data->>'coverUrl'),
    release_year=coalesce(release_year,(p_data->>'year')::integer),
    duration_minutes=coalesce(duration_minutes,(p_data->>'durationMinutes')::integer),
    genres=case when cardinality(genres)>0 then genres else array(select jsonb_array_elements_text(coalesce(nullif(p_data->'genres','null'),'[]'))) end,
    hydrated_at=now() where id=v_id;
  perform set_config('app.hydrating','off',true);
  update public.archive_import_items set item_id=v_id where job_id=p_job and ordinal=p_ordinal;
  return v_id;
end $$;
create function public.archive_register_movie(p_job uuid,p_ordinal integer,p_tmdb bigint,p_data jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.archive_register_movie(p_job,p_ordinal,p_tmdb,p_data)$$;
revoke all on function private.archive_register_movie(uuid,integer,bigint,jsonb),public.archive_register_movie(uuid,integer,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.archive_register_movie(uuid,integer,bigint,jsonb),public.archive_register_movie(uuid,integer,bigint,jsonb) to service_role;

alter table public.archive_import_items add column attempts integer not null default 0 check(attempts between 0 and 3);
alter table public.archive_imports drop constraint archive_imports_state_check;
alter table public.archive_imports add constraint archive_imports_state_check check(state in ('draft','running','partial','done','undone'));

create function private.archive_error(p_job uuid,p_ordinal integer,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or (j.user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then raise exception 'forbidden'; end if;
  if j.state <> 'running' then return; end if;
  update public.archive_import_items set state='error',attempts=least(attempts+1,3),
    message=case when p_code in ('provider_temporary','provider_missing','provider_configuration','temporary','invalid_metadata') then p_code else 'unknown' end
    where job_id=p_job and ordinal=p_ordinal and state='pending';
end $$;
create function public.archive_error(p_job uuid,p_ordinal integer,p_code text) returns void
language sql security invoker set search_path='' as $$select private.archive_error(p_job,p_ordinal,p_code)$$;
revoke all on function private.archive_error(uuid,integer,text),public.archive_error(uuid,integer,text) from public,anon;
grant execute on function private.archive_error(uuid,integer,text),public.archive_error(uuid,integer,text) to authenticated,service_role;

alter function private.archive_finish(uuid) rename to archive_finish_before_recovery;
revoke all on function private.archive_finish_before_recovery(uuid) from public,anon,authenticated,service_role;
create function private.archive_finish(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or (j.user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then raise exception 'forbidden'; end if;
  if j.state not in ('running','partial','done') then return; end if;
  if exists(select 1 from public.archive_import_items where job_id=p_job and state='pending') then return; end if;
  if exists(select 1 from public.archive_import_items where job_id=p_job and (state not in ('imported','dismissed') or jsonb_array_length(coalesce(payload->'reviewConflicts','[]'))>0)) then
    update public.archive_imports set state='partial' where id=p_job;
  else
    update public.archive_imports set state='running' where id=p_job;
    perform private.archive_finish_before_recovery(p_job);
  end if;
end $$;
revoke all on function private.archive_finish(uuid) from public,anon;
grant execute on function private.archive_finish(uuid) to authenticated,service_role;

alter function private.archive_resolve(uuid,integer,text,uuid,text,text) rename to archive_resolve_before_recovery;
revoke all on function private.archive_resolve_before_recovery(uuid,integer,text,uuid,text,text) from public,anon,authenticated,service_role;
create function private.archive_resolve(p_job uuid,p_ordinal integer,p_decision text,p_movie uuid default null,p_source text default null,p_review text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; r public.archive_import_items;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or auth.uid() is null or j.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  if j.state not in ('running','partial','done') then raise exception 'invalid_state'; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal for update;
  if not found then raise exception 'missing_row'; end if;
  if p_decision in ('accept','separate') then raise exception 'comparison_required'; end if;
  if p_decision='retry' and (r.state not in ('error','unmatched','ambiguous') or r.attempts>=3 or coalesce(r.message,'') in ('provider_missing','provider_configuration','invalid_metadata')) then raise exception 'not_retryable'; end if;
  if p_decision='dismiss' and r.state='imported' then raise exception 'invalid_state'; end if;
  update public.archive_imports set state='running' where id=p_job;
  perform private.archive_resolve_before_recovery(p_job,p_ordinal,p_decision,p_movie,p_source,p_review);
  perform private.archive_finish(p_job);
end $$;
revoke all on function private.archive_resolve(uuid,integer,text,uuid,text,text) from public,anon;
grant execute on function private.archive_resolve(uuid,integer,text,uuid,text,text) to authenticated;

-- Comparison is read-only, including its version. No preview tables or catalog hydration.
create function private.archive_review_row(p_job uuid,p_ordinal integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.archive_imports; r public.archive_import_items; p jsonb; local_row jsonb; source_row jsonb;
  all_passes jsonb; all_sources jsonb; catalog jsonb; comparisons jsonb := '[]'; n integer; linked boolean;
begin
  select * into j from public.archive_imports where id=p_job;
  if not found or auth.uid() is null or j.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal;
  if not found then raise exception 'missing_row'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into all_passes from public.passes x where user_id=j.user_id and item_type='movie' and item_id=r.item_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.source_key),'[]') into all_sources from public.archive_import_sources x where user_id=j.user_id and (pass_id in(select (value->>'id')::uuid from jsonb_array_elements(all_passes)) or source_key=r.payload->>'sourceKey' or source_key in(select value->>'sourceKey' from jsonb_array_elements(r.payload->'passes')));
  select jsonb_build_object('id',id,'title',title,'cover',cover_url,'hydrated',hydrated_at,'tmdb',tmdb_id) into catalog from public.movies where id=r.item_id;
  for p in select value from jsonb_array_elements(r.payload->'passes') loop
    select value into source_row from jsonb_array_elements(all_sources) where value->>'source_key'=p->>'sourceKey';
    linked := source_row is not null;
    local_row := null;
    if linked then
      select value into local_row from jsonb_array_elements(all_passes) where value->>'id'=source_row->>'pass_id';
    elsif p->>'finishedOn' is not null then
      select count(*),jsonb_agg(value)->0 into n,local_row from jsonb_array_elements(all_passes) where value->>'finished_on'=p->>'finishedOn' and value->>'status'='completed';
      if n<>1 or exists(select 1 from jsonb_array_elements(all_sources) where value->>'pass_id'=local_row->>'id')
        or (select count(*) from jsonb_array_elements(r.payload->'passes') where value->>'finishedOn'=p->>'finishedOn')<>1 then local_row:=null; end if;
    end if;
    comparisons := comparisons || jsonb_build_array(jsonb_build_object('incoming',p,'current',case when local_row is not null then jsonb_build_object('id',local_row->'id','finishedOn',local_row->'finished_on','rating',local_row->'rating','review',local_row->'review') else null end,
      'linked',linked,'unrepresented',not linked and p->>'finishedOn' is not null and not exists(select 1 from jsonb_array_elements(all_passes) where value->>'finished_on'=p->>'finishedOn'),
      'proposed',not linked and local_row is not null and local_row->>'rating' is not distinct from p->>'rating'));
  end loop;
  return jsonb_build_object('ordinal',r.ordinal,'title',r.payload->>'title','state',r.state,'message',r.message,'attempts',r.attempts,
    'version',encode(sha256(convert_to(jsonb_build_array(to_jsonb(r),all_passes,all_sources,catalog)::text,'UTF8')),'hex'),
    'comparisons',comparisons,'catalogIncomplete',r.item_id is not null and catalog->>'tmdb' is not null and (nullif(btrim(catalog->>'title'),'') is null or catalog->>'hydrated' is null),
    'plannedAction',case when not coalesce((r.payload->>'planned')::boolean,false) then 'none'
      when exists(select 1 from jsonb_array_elements(all_sources) where value->>'source_key'=r.payload->>'sourceKey') or exists(select 1 from jsonb_array_elements(all_passes) where value->>'is_active'='true' and value->>'status'='planned') then 'keep'
      when exists(select 1 from jsonb_array_elements(all_passes) where value->>'is_active'='true' and value->>'status'='in_progress') then 'blocked' else 'add' end,
    'reviewConflicts',coalesce(r.payload->'reviewConflicts','[]'));
end $$;
create function public.archive_review_row(p_job uuid,p_ordinal integer) returns jsonb language sql stable security invoker set search_path='' as $$select private.archive_review_row(p_job,p_ordinal)$$;
revoke all on function private.archive_review_row(uuid,integer),public.archive_review_row(uuid,integer) from public,anon;
grant execute on function private.archive_review_row(uuid,integer),public.archive_review_row(uuid,integer) to authenticated;

alter table public.archive_import_sources add column fill_only boolean not null default false;
alter table public.archive_import_sources add column association_job uuid references public.archive_imports(id);
create table public.archive_import_decisions (
  job_id uuid not null references public.archive_imports(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  ordinal integer not null, version text not null, decision text not null, result jsonb not null,
  primary key(job_id,ordinal,version,decision)
);
alter table public.archive_import_decisions enable row level security;
revoke all on public.archive_import_decisions from anon,authenticated;
grant select on public.archive_import_decisions to authenticated;
grant all on public.archive_import_decisions to service_role;
create policy archive_own_decisions on public.archive_import_decisions for select to authenticated using(user_id=(select auth.uid()));

create table private.archive_source_effects (
  job_id uuid not null references public.archive_imports(id) on delete cascade,
  user_id uuid not null, source_key text not null, pass_id uuid not null,
  before_row jsonb, after_row jsonb, reverted boolean not null default false,
  primary key(job_id,source_key)
);
alter table private.archive_source_effects enable row level security;
revoke all on private.archive_source_effects from public,anon,authenticated,service_role;

create function private.archive_decide(p_job uuid,p_ordinal integer,p_decision text,p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; r public.archive_import_items; preview jsonb; c jsonb; original jsonb; result jsonb; v_id uuid;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or auth.uid() is null or j.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  if j.state not in ('running','partial','done') then raise exception 'invalid_state'; end if;
  select d.result into result from public.archive_import_decisions d where d.job_id=p_job and d.ordinal=p_ordinal and d.version=p_version and d.decision=p_decision;
  if result is not null then return result; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal for update;
  if not found then raise exception 'missing_row'; end if;
  perform pg_advisory_xact_lock(hashtextextended(j.user_id::text || r.item_id::text,0));
  perform 1 from public.passes where user_id=j.user_id and item_type='movie' and item_id=r.item_id order by id for update;
  preview := private.archive_review_row(p_job,p_ordinal);
  if preview->>'version' is distinct from p_version then return jsonb_build_object('state','stale'); end if;
  if p_decision in ('retry','dismiss') then
    if p_decision='retry' and r.state<>'error' then return jsonb_build_object('state','ineligible'); end if;
    perform private.archive_resolve(p_job,p_ordinal,p_decision);
  elsif p_decision in ('associate','fill','accept') then
    if r.state<>'conflict' or jsonb_array_length(preview->'comparisons')=0 or jsonb_array_length(preview->'reviewConflicts')>0 then return jsonb_build_object('state','ineligible'); end if;
    if exists(select 1 from jsonb_array_elements(preview->'comparisons') x where (x->'current'='null' and not (p_decision='accept' and (x->>'unrepresented')::boolean)) or (p_decision in ('associate','fill') and not ((x->>'linked')::boolean or (x->>'proposed')::boolean))) then return jsonb_build_object('state','ineligible'); end if;
    for c in select value from jsonb_array_elements(preview->'comparisons') loop
      if c->'current'='null' then continue; end if;
      v_id := (c->'current'->>'id')::uuid;
      select to_jsonb(x) into original from public.passes x where id=v_id;
      -- Even association without field changes has a provenance effect to undo.
      perform private.archive_effect(p_job,j.user_id,v_id,original);
      insert into private.archive_source_effects(job_id,user_id,source_key,pass_id,before_row)
        values(p_job,j.user_id,c->'incoming'->>'sourceKey',v_id,(select to_jsonb(s) from public.archive_import_sources s where user_id=j.user_id and source_key=c->'incoming'->>'sourceKey'))
        on conflict(job_id,source_key) do nothing;
      insert into public.archive_import_sources(user_id,source_key,pass_id,snapshot,fill_only,association_job)
        values(j.user_id,c->'incoming'->>'sourceKey',v_id,original,p_decision<>'accept',p_job)
        on conflict(user_id,source_key) do update set snapshot=excluded.snapshot,fill_only=excluded.fill_only;
    end loop;
    update public.archive_import_items set state='pending' where job_id=p_job and ordinal=p_ordinal;
    update public.archive_imports set state='running' where id=p_job;
    perform private.archive_apply(p_job,p_ordinal,r.item_id);
    update private.archive_source_effects e set after_row=to_jsonb(s) from public.archive_import_sources s
      where e.job_id=p_job and e.user_id=s.user_id and e.source_key=s.source_key and not e.reverted
        and e.source_key in(select value->'incoming'->>'sourceKey' from jsonb_array_elements(preview->'comparisons'));
  elsif p_decision='separate' then
    if r.state<>'conflict' then return jsonb_build_object('state','ineligible'); end if;
    update public.archive_imports set state='running' where id=p_job;
    perform private.archive_resolve_before_recovery(p_job,p_ordinal,'separate');
    perform private.archive_apply(p_job,p_ordinal,r.item_id);
  elsif p_decision='catalog' then
    if r.state<>'imported' or not (preview->>'catalogIncomplete')::boolean then return jsonb_build_object('state','ineligible'); end if;
    update public.archive_import_items set state='pending',payload=jsonb_set(payload,'{catalogOnly}','true') where job_id=p_job and ordinal=p_ordinal;
    update public.archive_imports set state='running' where id=p_job;
  else return jsonb_build_object('state','ineligible');
  end if;
  perform private.archive_finish(p_job);
  select jsonb_build_object('state',state) into result from public.archive_import_items where job_id=p_job and ordinal=p_ordinal;
  insert into public.archive_import_decisions(job_id,user_id,ordinal,version,decision,result) values(p_job,j.user_id,p_ordinal,p_version,p_decision,result);
  return result;
end $$;
create function public.archive_decide(p_job uuid,p_ordinal integer,p_decision text,p_version text) returns jsonb
language sql security invoker set search_path='' as $$select private.archive_decide(p_job,p_ordinal,p_decision,p_version)$$;
revoke all on function private.archive_decide(uuid,integer,text,text),public.archive_decide(uuid,integer,text,text) from public,anon;
grant execute on function private.archive_decide(uuid,integer,text,text),public.archive_decide(uuid,integer,text,text) to authenticated;
create function private.archive_review_normalized(p_text text) returns text
language sql immutable set search_path='' as $$
  select regexp_replace(regexp_replace(regexp_replace(btrim(replace(p_text,E'\r\n',E'\n')), '<(/?)(b|strong)>','<\1strong>','gi'),'<(/?)(i|em)>','<\1em>','gi'),'^<p>([^<>]*)</p>$','\1','i')
$$;
revoke all on function private.archive_review_normalized(text) from public,anon,authenticated;

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
  if r.state <> 'pending' then return r.state; end if;
  if r.item_id is not null and r.item_id <> p_movie then return r.state; end if;
  if not exists(select 1 from public.movies where id=p_movie) then raise exception 'missing_movie'; end if;
  if r.payload->>'catalogOnly'='true' then
    update public.archive_import_items set state='imported',payload=payload-'catalogOnly',message=null where job_id=p_job and ordinal=p_ordinal;
    return 'imported';
  end if;
  -- Serialize jobs for the same account/movie, including distinct archives.
  perform pg_advisory_xact_lock(hashtextextended(j.user_id::text || p_movie::text,0));
  begin
    for p in select value from jsonb_array_elements((r.payload->'passes') || case when (r.payload->>'planned')::boolean then jsonb_build_array(jsonb_build_object('sourceKey',r.payload->>'sourceKey','status','planned')) else '[]'::jsonb end) with ordinality as source(value, sequence) order by coalesce(value->>'status','completed'),value->>'finishedOn' nulls first, sequence loop
      v_key := p->>'sourceKey'; v_date := (p->>'finishedOn')::date; v_rating := (p->>'rating')::smallint;
      v_status := coalesce(p->>'status','completed')::public.media_status;
      if v_key is null or length(v_key) <> 64  then raise exception 'invalid_pass'; end if;
      select * into s from public.archive_import_sources where user_id=j.user_id and source_key=v_key for update;
      if found then
        select to_jsonb(x) into current_row from public.passes x where id=s.pass_id and user_id=j.user_id for update;
        if current_row is null or current_row->>'item_id' <> p_movie::text then raise exception 'archive_conflict'; end if;
        -- A later local rating/review/date edit must never be silently replaced.
        if (current_row - 'updated_at' - 'is_active') is distinct from (s.snapshot - 'updated_at' - 'is_active') then raise exception 'archive_conflict'; end if;
        before_row := current_row; v_id := s.pass_id;
        update public.passes set finished_on=case when s.fill_only then coalesce(finished_on,v_date) else coalesce(v_date,finished_on) end, rating=case when s.fill_only then coalesce(rating,v_rating) else coalesce(v_rating,rating) end, review=case when private.archive_review_normalized(review)=private.archive_review_normalized(p->>'review') then review when s.fill_only then coalesce(nullif(review,''),nullif(p->>'review','')) else coalesce(nullif(p->>'review',''),review) end
          where id=v_id and (finished_on is distinct from v_date or rating is distinct from coalesce(v_rating,rating) or review is distinct from coalesce(nullif(p->>'review',''),review));
        if found then perform private.archive_effect(p_job,j.user_id,v_id,before_row); end if;
      else
        if not coalesce((r.payload->>'importSeparately')::boolean,false) and exists(select 1 from public.passes x where x.user_id=j.user_id and x.item_type='movie' and x.item_id=p_movie and x.finished_on=v_date
          and not exists(select 1 from public.archive_import_sources z where z.pass_id=x.id)) then raise exception 'archive_conflict'; end if;
        select to_jsonb(x) into active_row from public.passes x where x.user_id=j.user_id and x.item_type='movie' and x.item_id=p_movie and x.is_active for update;
        if v_status='planned' and active_row->>'status'='in_progress' then raise exception 'archive_conflict'; end if;
        if v_status='planned' and active_row->>'status'='planned' then
          insert into public.archive_import_sources(user_id,source_key,pass_id,snapshot) values(j.user_id,v_key,(active_row->>'id')::uuid,active_row);
          continue;
        end if;
        v_active := v_status='planned' or active_row is null or (active_row->>'status' in ('completed','dropped') and coalesce(active_row->>'finished_on','') <= coalesce(v_date::text,''));
        if v_active and active_row is not null then
          update public.passes set is_active=false where id=(active_row->>'id')::uuid;
          perform private.archive_effect(p_job,j.user_id,(active_row->>'id')::uuid,active_row);
        end if;
        insert into public.passes(user_id,item_type,item_id,status,is_active,finished_on,rating,review,is_public,created_at)
          values(j.user_id,'movie',p_movie,v_status,v_active,v_date,v_rating,nullif(p->>'review',''),j.is_public,clock_timestamp()) returning id into v_id;
        perform private.archive_effect(p_job,j.user_id,v_id,null);
      end if;
      insert into public.archive_import_sources(user_id,source_key,pass_id,snapshot)
        select j.user_id,v_key,v_id,to_jsonb(x) from public.passes x where id=v_id
        on conflict(user_id,source_key) do update set snapshot=excluded.snapshot;
    end loop;
    -- A corrected source date can change which closed pass is current.
    select to_jsonb(x) into active_row from public.passes x where user_id=j.user_id and item_type='movie' and item_id=p_movie and is_active for update;
    if active_row->>'status' in ('completed','dropped') then
      select to_jsonb(x) into current_row from public.passes x where user_id=j.user_id and item_type='movie' and item_id=p_movie and status in ('completed','dropped') order by finished_on desc nulls last,created_at desc,id desc limit 1;
      if current_row->>'id' <> active_row->>'id' then
        update public.passes set is_active=false where id=(active_row->>'id')::uuid;
        perform private.archive_effect(p_job,j.user_id,(active_row->>'id')::uuid,active_row);
        update public.passes set is_active=true where id=(current_row->>'id')::uuid;
        perform private.archive_effect(p_job,j.user_id,(current_row->>'id')::uuid,current_row);
      end if;
    end if;
    update public.archive_import_items set state='imported',item_id=p_movie,message=null where job_id=p_job and ordinal=p_ordinal;
  exception when raise_exception then
    if sqlerrm <> 'archive_conflict' then raise; end if;
    update public.archive_import_items set state='conflict',item_id=p_movie,message='localChanges' where job_id=p_job and ordinal=p_ordinal;
    return 'conflict';
  end;
  return 'imported';
end $$;

create function private.archive_review_job(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.archive_imports where id=p_job and user_id=auth.uid()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(private.archive_review_row(p_job,ordinal) order by ordinal),'[]') from public.archive_import_items where job_id=p_job);
end $$;
create function public.archive_review_job(p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.archive_review_job(p_job)$$;
revoke all on function private.archive_review_job(uuid),public.archive_review_job(uuid) from public,anon;
grant execute on function private.archive_review_job(uuid),public.archive_review_job(uuid) to authenticated;

alter function private.archive_undo(uuid) rename to archive_undo_before_recovery;
revoke all on function private.archive_undo_before_recovery(uuid) from public,anon,authenticated,service_role;
create function private.archive_undo(p_job uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare conflicts integer; j public.archive_imports; source_effect private.archive_source_effects;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or auth.uid() is null or j.user_id<>auth.uid() then raise exception 'forbidden'; end if;
  perform 1 from public.passes where user_id=j.user_id and id in(select pass_id from public.archive_import_effects where job_id=p_job) order by id for update;
  perform 1 from public.archive_import_sources where user_id=j.user_id and source_key in(select source_key from private.archive_source_effects where job_id=p_job) order by source_key for update;
  select count(*) into conflicts from private.archive_source_effects e where e.job_id=p_job and not e.reverted and
    e.after_row is distinct from (select to_jsonb(s) from public.archive_import_sources s where s.user_id=e.user_id and s.source_key=e.source_key);
  if conflicts>0 then
    update public.archive_imports set state='partial',undo_conflicts=conflicts where id=p_job;
    return conflicts;
  end if;
  conflicts := private.archive_undo_before_recovery(p_job);
  for source_effect in select s.* from private.archive_source_effects s join public.archive_import_effects e on e.job_id=s.job_id and e.pass_id=s.pass_id where s.job_id=p_job and not s.reverted and e.reverted loop
    if source_effect.before_row is null then
      delete from public.archive_import_sources where user_id=source_effect.user_id and source_key=source_effect.source_key;
    else
      update public.archive_import_sources set fill_only=(source_effect.before_row->>'fill_only')::boolean,association_job=(source_effect.before_row->>'association_job')::uuid
        where user_id=source_effect.user_id and source_key=source_effect.source_key;
    end if;
    update private.archive_source_effects set reverted=true where job_id=p_job and source_key=source_effect.source_key;
  end loop;
  return conflicts;
end $$;
revoke all on function private.archive_undo(uuid) from public,anon;
grant execute on function private.archive_undo(uuid) to authenticated;

create function private.archive_summary(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
  select user_id into actor from public.archive_imports where id=p_job;
  if actor is null or auth.uid() is null or actor<>auth.uid() then raise exception 'forbidden'; end if;
  select jsonb_build_object('passes',count(distinct p.id) filter(where p.status='completed'),'planned',count(distinct p.id) filter(where p.status='planned')) into result
    from public.archive_import_items r
    cross join lateral jsonb_array_elements((r.payload->'passes') || case when (r.payload->>'planned')::boolean then jsonb_build_array(jsonb_build_object('sourceKey',r.payload->>'sourceKey')) else '[]'::jsonb end) origin
    join public.archive_import_sources s on s.user_id=actor and s.source_key=origin->>'sourceKey'
    join public.passes p on p.id=s.pass_id and p.user_id=actor
    where r.job_id=p_job and r.state='imported';
  return result || jsonb_build_object('catalogIncomplete',(select count(*) from public.archive_import_items r join public.movies m on m.id=r.item_id where r.job_id=p_job and r.state='imported' and m.tmdb_id is not null and (nullif(btrim(m.title),'') is null or m.hydrated_at is null)));
end $$;
create function public.archive_summary(p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.archive_summary(p_job)$$;
revoke all on function private.archive_summary(uuid),public.archive_summary(uuid) from public,anon;
grant execute on function private.archive_summary(uuid),public.archive_summary(uuid) to authenticated;
