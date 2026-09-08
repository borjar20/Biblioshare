-- #1142: decisions are durable, owned and applied through the same importer.
create function private.archive_resolve(p_job uuid,p_ordinal integer,p_decision text,p_movie uuid default null,p_source text default null,p_review text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; r public.archive_import_items; c jsonb; v_pass jsonb; v_payload jsonb; n integer; match_id uuid;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or auth.uid() is null or j.user_id <> auth.uid() then raise exception 'forbidden'; end if;
  if j.state not in ('running','done') then raise exception 'invalid_state'; end if;
  select * into r from public.archive_import_items where job_id=p_job and ordinal=p_ordinal for update;
  if not found then raise exception 'missing_row'; end if;
  if p_decision='dismiss' then
    update public.archive_import_items set state='dismissed',payload=jsonb_set(payload,'{reviewConflicts}','[]') where job_id=p_job and ordinal=p_ordinal;
    return;
  elsif p_decision='choose' then
    if p_movie is null or not exists(select 1 from public.movies where id=p_movie) then raise exception 'missing_movie'; end if;
    if r.state not in ('ambiguous','unmatched','error','pending') then raise exception 'invalid_state'; end if;
    update public.archive_import_items set item_id=p_movie where job_id=p_job and ordinal=p_ordinal;
  elsif p_decision='separate' then
    if r.state <> 'conflict' then raise exception 'invalid_state'; end if;
    update public.archive_import_items set payload=jsonb_set(jsonb_set(payload,'{importSeparately}','true'),'{passes}',
      (select coalesce(jsonb_agg(value || jsonb_build_object('sourceKey',encode(sha256(convert_to('separate:'||p_job::text||':'||(value->>'sourceKey'),'UTF8')),'hex'))),'[]') from jsonb_array_elements(payload->'passes')))
      where job_id=p_job and ordinal=p_ordinal;
  elsif p_decision='accept' then
    if r.state <> 'conflict' then raise exception 'invalid_state'; end if;
    -- Explicit acceptance updates the provenance baseline, never someone else's row.
    update public.archive_import_sources s set snapshot=to_jsonb(p)
      from public.passes p where s.user_id=j.user_id and p.id=s.pass_id and p.user_id=j.user_id
      and s.source_key in(select value->>'sourceKey' from jsonb_array_elements(r.payload->'passes'));
    for c in select value from jsonb_array_elements(r.payload->'passes') loop
      if not exists(select 1 from public.archive_import_sources where user_id=j.user_id and source_key=c->>'sourceKey') then
        select id into match_id from public.passes where user_id=j.user_id and item_type='movie' and item_id=r.item_id
          and finished_on is not distinct from (c->>'finishedOn')::date and status='completed'
          and not exists(select 1 from public.archive_import_sources z where z.pass_id=passes.id)
          and 1=(select count(*) from public.passes q where q.user_id=j.user_id and q.item_type='movie' and q.item_id=r.item_id and q.finished_on is not distinct from (c->>'finishedOn')::date and q.status='completed');
        if match_id is not null then
          insert into public.archive_import_sources(user_id,source_key,pass_id,snapshot)
            select j.user_id,c->>'sourceKey',id,to_jsonb(p) from public.passes p where id=match_id;
        end if;
      end if;
    end loop;
  elsif p_decision='review' then
    select value into c from jsonb_array_elements(coalesce(r.payload->'reviewConflicts','[]')) where value->>'sourceKey'=p_review;
    if c is null then raise exception 'missing_review'; end if;
    v_payload := r.payload;
    if p_source='new' then
      v_pass := jsonb_build_object('sourceKey',p_review,'finishedOn',c->'finishedOn','rating',c->'rating','review',c->'review');
      v_payload := jsonb_set(v_payload,'{passes}',(v_payload->'passes') || jsonb_build_array(v_pass));
    else
      select ordinality::integer-1,value into n,v_pass from jsonb_array_elements(r.payload->'passes') with ordinality where value->>'sourceKey'=p_source;
      if v_pass is null then raise exception 'missing_pass'; end if;
      v_payload := jsonb_set(v_payload,array['passes',n::text,'review'],c->'review');
      if v_pass->>'rating' is null then
        v_payload := jsonb_set(v_payload,array['passes',n::text,'rating'],coalesce(c->'rating','null'));
      end if;
    end if;
    v_payload := jsonb_set(v_payload,'{reviewConflicts}',coalesce((select jsonb_agg(value) from jsonb_array_elements(r.payload->'reviewConflicts') where value->>'sourceKey'<>p_review),'[]'));
    update public.archive_import_items set payload=v_payload where job_id=p_job and ordinal=p_ordinal;
  elsif p_decision <> 'retry' then raise exception 'invalid_decision';
  end if;
  update public.archive_import_items set state='pending',message=null where job_id=p_job and ordinal=p_ordinal;
  update public.archive_imports set state='running' where id=p_job;
end $$;
create function public.archive_resolve(p_job uuid,p_ordinal integer,p_decision text,p_movie uuid default null,p_source text default null,p_review text default null) returns void
language sql security invoker set search_path='' as $$select private.archive_resolve(p_job,p_ordinal,p_decision,p_movie,p_source,p_review)$$;
revoke all on function private.archive_resolve(uuid,integer,text,uuid,text,text),public.archive_resolve(uuid,integer,text,uuid,text,text) from public,anon;
grant execute on function private.archive_resolve(uuid,integer,text,uuid,text,text),public.archive_resolve(uuid,integer,text,uuid,text,text) to authenticated;
create or replace function private.archive_create(p_analysis jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_analysis->'movies') is distinct from 'array'
    or jsonb_array_length(p_analysis->'movies') not between 1 and 3000
    or coalesce(p_analysis->>'fingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_archive'; end if;
  perform private.require_request_quota('import_parse');
  insert into public.archive_imports(user_id, fingerprint, analysis)
    values(v_user, p_analysis->>'fingerprint', p_analysis)
    on conflict(user_id,fingerprint) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.archive_imports where user_id=v_user and fingerprint=p_analysis->>'fingerprint';
    return v_id;
  end if;
  insert into public.archive_import_items(job_id,ordinal,user_id,payload)
    select v_id, n::integer-1, v_user, value || jsonb_build_object('reviewConflicts',coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(p_analysis->'conflicts','[]')) c where c->>'movieKey'=x.value->>'sourceKey'),'[]')) from jsonb_array_elements(p_analysis->'movies') with ordinality as x(value,n);
  return v_id;
end $$;
