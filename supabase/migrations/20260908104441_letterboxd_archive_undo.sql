-- #1144: reverse only effects still identical to the state written by the job.
alter table public.archive_imports add column undo_conflicts integer not null default 0;
create function private.archive_undo(p_job uuid) returns integer
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
  update public.archive_import_items r set state=case when exists(select 1 from public.archive_import_effects fx where fx.job_id=p_job and fx.pass_id=any(blocked) and fx.after_row->>'item_id'=r.item_id::text) then 'conflict' else 'dismissed' end,
    message='undoLocalChanges' where job_id=p_job;
  update public.archive_imports set state=case when count_blocked=0 then 'undone' else 'done' end,undo_conflicts=count_blocked where id=p_job;
  return count_blocked;
end $$;
create function public.archive_undo(p_job uuid) returns integer language sql security invoker set search_path='' as $$select private.archive_undo(p_job)$$;
revoke all on function private.archive_undo(uuid),public.archive_undo(uuid) from public,anon;
grant execute on function private.archive_undo(uuid),public.archive_undo(uuid) to authenticated;
