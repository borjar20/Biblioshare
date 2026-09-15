-- #1145: one opt-in thought describing the import, never synthetic watch events.
alter table public.archive_imports add column announcement_snapshot jsonb;
create or replace function private.archive_finish(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; first_movie uuid; imported integer; post_row jsonb;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or (j.user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then raise exception 'forbidden'; end if;
  if j.state <> 'running' or exists(select 1 from public.archive_import_items where job_id=p_job and state='pending') then return; end if;
  select count(*),min(item_id::text)::uuid into imported,first_movie from public.archive_import_items where job_id=p_job and state='imported';
  if j.announce and j.is_public and first_movie is not null and j.announcement_snapshot is null then
    insert into public.posts(id,author_id,kind,anchor_type,anchor_id,body)
      values(j.id,j.user_id,'thought','movie',first_movie,'He importado mi historial de Letterboxd: '||imported||' películas incorporadas a Biblioshare.')
      on conflict(id) do nothing;
    select to_jsonb(p) into post_row from public.posts p where id=j.id and author_id=j.user_id;
  end if;
  update public.archive_imports set state='done',announcement_snapshot=coalesce(announcement_snapshot,post_row) where id=p_job;
end $$;

alter table public.archive_imports drop constraint archive_imports_user_id_fingerprint_key;
create unique index archive_live_fingerprint on public.archive_imports(user_id,fingerprint) where state <> 'undone';

-- Confirmation charges the entire job before any background/service work starts.
create or replace function private.archive_confirm(p_job uuid,p_public boolean,p_announce boolean) returns void
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; cost integer;
begin
  select * into j from public.archive_imports where id=p_job and user_id=auth.uid() for update;
  if not found or auth.uid() is null then raise exception 'forbidden'; end if;
  if j.state <> 'draft' then return; end if;
  select coalesce(sum(jsonb_array_length(payload->'passes') + case when (payload->>'planned')::boolean then 1 else 0 end),0) into cost from public.archive_import_items where job_id=p_job;
  if cost > 6000 then raise exception 'archiveTooLarge'; end if;
  if not public.consume_request_quota('import_rows',greatest(cost,1)) then raise exception 'request quota exceeded' using errcode='PT429'; end if;
  update public.archive_imports set state='running',is_public=p_public,announce=(p_announce and p_public) where id=p_job;
end $$;
create or replace function private.archive_undo(p_job uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare j public.archive_imports; effect_row public.archive_import_effects; current_row jsonb; old public.passes; blocked uuid[] := '{}'; count_blocked integer;
begin
  select * into j from public.archive_imports where id=p_job for update;
  if not found or auth.uid() is null or j.user_id <> auth.uid() then raise exception 'forbidden'; end if;
  if j.state='undone' then return 0; end if;
  if j.state='draft' then
    update public.archive_imports set state='undone' where id=p_job;
    return 0;
  end if;
  -- Lock all affected rows first. Subsequent edits cannot race the comparison.
  perform 1 from public.passes p where p.user_id=j.user_id and p.id in(select pass_id from public.archive_import_effects where job_id=p_job) order by p.id for update;
  for effect_row in select * from public.archive_import_effects where job_id=p_job and not reverted loop
    select to_jsonb(p) into current_row from public.passes p where id=effect_row.pass_id and user_id=j.user_id;
    if current_row is distinct from effect_row.after_row or (effect_row.before_row is null and exists(select 1 from public.progress_sessions where pass_id=effect_row.pass_id)) then blocked := array_append(blocked,effect_row.pass_id); end if;
  end loop;
  -- Active-pass dependencies are reversed together or preserved together per movie.
  for effect_row in select * from public.archive_import_effects where job_id=p_job and not reverted and not(pass_id=any(blocked)) loop
    if exists(select 1 from public.archive_import_effects b where b.job_id=p_job and b.pass_id=any(blocked)
      and b.after_row->>'item_id'=effect_row.after_row->>'item_id') then blocked := array_append(blocked,effect_row.pass_id); end if;
    if effect_row.before_row->>'is_active'='true' and exists(select 1 from public.passes p where p.user_id=j.user_id and p.item_id=(effect_row.before_row->>'item_id')::uuid and p.item_type='movie' and p.is_active and p.id<>effect_row.pass_id
      and not exists(select 1 from public.archive_import_effects x where x.job_id=p_job and x.pass_id=p.id and not x.reverted and not(x.pass_id=any(blocked)))) then blocked := array_append(blocked,effect_row.pass_id); end if;
  end loop;
  -- Propagate newly blocked active dependencies to the whole affected movie.
  select coalesce(array_agg(distinct a.pass_id),'{}') into blocked from public.archive_import_effects a where a.job_id=p_job and exists(
    select 1 from public.archive_import_effects b where b.job_id=p_job and b.pass_id=any(blocked) and b.after_row->>'item_id'=a.after_row->>'item_id');
  -- Delete new rows before restoring former active passes.
  delete from public.passes p using public.archive_import_effects fx where fx.job_id=p_job and fx.user_id=j.user_id and p.id=fx.pass_id and p.user_id=j.user_id and fx.before_row is null and not fx.reverted and not(fx.pass_id=any(blocked));
  for effect_row in select * from public.archive_import_effects where job_id=p_job and before_row is not null and not reverted and not(pass_id=any(blocked)) order by before_row->>'is_active' loop
    old := jsonb_populate_record(null::public.passes,effect_row.before_row);
    update public.passes set status=old.status,is_active=old.is_active,finished_on=old.finished_on,started_on=old.started_on,rating=old.rating,review=old.review,is_public=old.is_public,position=old.position
      where id=effect_row.pass_id and user_id=j.user_id;
  end loop;
  -- A removed source can be imported again after an explicit undo, but not after a local deletion.
  delete from public.archive_import_sources s using public.archive_import_effects fx where fx.job_id=p_job and fx.user_id=j.user_id and fx.before_row is null and not(fx.pass_id=any(blocked)) and (s.pass_id=fx.pass_id or (s.pass_id is null and s.snapshot->>'id'=fx.pass_id::text));
  update public.archive_import_sources s set snapshot=to_jsonb(p) from public.passes p, public.archive_import_effects fx
    where fx.job_id=p_job and fx.pass_id=s.pass_id and p.id=s.pass_id and s.user_id=j.user_id and not(fx.pass_id=any(blocked));
  update public.archive_import_effects set reverted=true where job_id=p_job and not(pass_id=any(blocked));
  count_blocked := cardinality(blocked);
  if j.announcement_snapshot is not null then
    select to_jsonb(p) into current_row from public.posts p where id=j.id and author_id=j.user_id for update;
    if current_row=j.announcement_snapshot then delete from public.posts where id=j.id and author_id=j.user_id;
    elsif current_row is not null then count_blocked := count_blocked+1;
    end if;
  end if;
  update public.archive_import_items r set state=case when exists(select 1 from public.archive_import_effects fx where fx.job_id=p_job and fx.pass_id=any(blocked) and fx.after_row->>'item_id'=r.item_id::text) then 'conflict' else 'dismissed' end,
    message='undoLocalChanges' where job_id=p_job;
  update public.archive_imports set state=case when count_blocked=0 then 'undone' else 'done' end,undo_conflicts=count_blocked where id=p_job;
  return count_blocked;
end $$;
create or replace function private.archive_create(p_analysis jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_analysis->'movies') is distinct from 'array'
    or jsonb_array_length(p_analysis->'movies') not between 1 and 3000
    or coalesce(p_analysis->>'fingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_archive'; end if;
  perform pg_advisory_xact_lock(hashtextextended('archive-create:'||v_user::text,0));
  if (select count(*) from public.archive_imports where user_id=v_user and created_at>now()-interval '1 hour') >= 6 then raise exception 'request quota exceeded' using errcode='PT429'; end if;
  insert into public.archive_imports(user_id, fingerprint, analysis)
    values(v_user, p_analysis->>'fingerprint', p_analysis)
    on conflict(user_id,fingerprint) where state <> 'undone' do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.archive_imports where user_id=v_user and fingerprint=p_analysis->>'fingerprint' and state <> 'undone';
    return v_id;
  end if;
  insert into public.archive_import_items(job_id,ordinal,user_id,payload)
    select v_id, n::integer-1, v_user, value || jsonb_build_object('reviewConflicts',coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(p_analysis->'conflicts','[]')) c where c->>'movieKey'=x.value->>'sourceKey'),'[]')) from jsonb_array_elements(p_analysis->'movies') with ordinality as x(value,n);
  return v_id;
end $$;
