-- Private durable cleanup survives deletion of the metadata/root and upload races.
create table private.experience_photo_cleanup(storage_path text primary key,queued_at timestamptz not null default now());
alter table private.experience_photo_cleanup enable row level security;
revoke all on private.experience_photo_cleanup from public,anon,authenticated;
grant all on private.experience_photo_cleanup to service_role;
create function private.queue_deleted_experience_photo() returns trigger
language plpgsql security definer set search_path='' as $$
begin insert into private.experience_photo_cleanup(storage_path) values(old.storage_path) on conflict do nothing; return old; end $$;
revoke all on function private.queue_deleted_experience_photo() from public,anon,authenticated;
create trigger experience_photo_cleanup after delete on public.experience_photos for each row execute function private.queue_deleted_experience_photo();
create function public.moderation_photo_is_evidence(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.moderation_history h where jsonb_path_exists(h.snapshot,'$.**.storage_path ? (@ == $path)',jsonb_build_object('path',p_path)))
    or exists(select 1 from public.content_reports r where jsonb_path_exists(r.snapshot,'$.**.storage_path ? (@ == $path)',jsonb_build_object('path',p_path)));
$$;
create function public.experience_queue_photo_cleanup(p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_path is null or p_path!~*'^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'invalid storage path' using errcode='22023'; end if;
  insert into private.experience_photo_cleanup(storage_path) select p_path where not exists(select 1 from public.experience_photos where storage_path=p_path) on conflict do nothing;
end $$;
create function public.experience_photo_cleanup_candidate(p_path text) returns boolean
language sql stable security definer set search_path='' as $$select not exists(select 1 from public.experience_photos where storage_path=p_path)$$;
create function public.experience_ack_photo_cleanup(p_path text) returns void
language sql security definer set search_path='' as $$delete from private.experience_photo_cleanup where storage_path=p_path and not exists(select 1 from public.experience_photos where storage_path=p_path)$$;
create function public.get_experience_photo_cleanup(p_before timestamptz,p_limit integer default 100) returns table(storage_path text)
language sql stable security definer set search_path='' as $$select storage_path from private.experience_photo_cleanup where queued_at<p_before order by queued_at,storage_path limit greatest(0,least(p_limit,100))$$;
create function public.experience_cleanup_pending_photos(p_before timestamptz,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_before is null or p_before>now()-interval '1 hour' then raise exception 'unsafe age' using errcode='22023'; end if;
  with candidates as (select id from public.experience_photos where status='pending' and created_at<p_before order by created_at,id limit greatest(0,least(p_limit,100)) for update skip locked),
  removed as (delete from public.experience_photos p using candidates c where p.id=c.id and p.status='pending' returning p.storage_path)
  select coalesce(jsonb_agg(storage_path),'[]'::jsonb) into result from removed;
  return result;
end $$;
revoke all on function public.moderation_photo_is_evidence(text),public.experience_queue_photo_cleanup(text),public.experience_photo_cleanup_candidate(text),
 public.experience_ack_photo_cleanup(text),public.get_experience_photo_cleanup(timestamptz,integer),public.experience_cleanup_pending_photos(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.moderation_photo_is_evidence(text),public.experience_queue_photo_cleanup(text),public.experience_photo_cleanup_candidate(text),
 public.experience_ack_photo_cleanup(text),public.get_experience_photo_cleanup(timestamptz,integer),public.experience_cleanup_pending_photos(timestamptz,integer) to service_role;

drop policy experience_photos_group_read on public.experience_photos;
create policy experience_photos_group_read on public.experience_photos for select using(
  private.moderation_available('experience',experience_id) and
  (author_id=auth.uid() or (private.can_contribute_experience(experience_id) and not public.users_are_blocked(author_id))));

create function public.experience_reserve_photo(p_id uuid,p_moment_id uuid default null,p_mime text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare photo uuid:=gen_random_uuid(); path text; ext text;
begin
  perform private.experience_lock(p_id);
  if not private.can_contribute_experience(p_id) then raise exception 'member required' using errcode='42501'; end if;
  ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if ext is null or (p_moment_id is not null and not exists(select 1 from public.experience_moments where id=p_moment_id and experience_id=p_id)) then raise exception 'invalid image' using errcode='22023'; end if;
  if (select count(*) from public.experience_photos where experience_id=p_id)>=40 then raise exception 'photo limit' using errcode='PT429'; end if;
  path:=p_id::text||'/'||auth.uid()::text||'/'||photo::text||'.'||ext;
  insert into public.experience_photos(id,experience_id,moment_id,author_id,storage_path,mime_type) values(photo,p_id,p_moment_id,auth.uid(),path,p_mime);
  return jsonb_build_object('id',photo,'path',path,'experienceId',p_id);
end $$;
create function public.experience_finish_photo(p_photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_photos;
begin
  select * into p from public.experience_photos where id=p_photo_id;
  if not found or p.author_id is distinct from auth.uid() then raise exception 'own photo required' using errcode='42501'; end if;
  perform private.experience_lock(p.experience_id);
  if not private.can_contribute_experience(p.experience_id) then raise exception 'member required' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='experience-photos' and o.name=p.storage_path
    and o.metadata->>'mimetype'=p.mime_type and jsonb_typeof(o.metadata->'size')='number'
    and (o.metadata->>'size')::bigint between 1 and 2097152) then raise exception 'image not stored' using errcode='22023'; end if;
  update public.experience_photos set status='ready' where id=p_photo_id and author_id=auth.uid();
  if not found then raise exception 'photo missing' using errcode='42501'; end if;
  return jsonb_build_object('experienceId',p.experience_id);
end $$;
create function public.experience_cancel_photo(p_photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_photos;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  select * into p from public.experience_photos where id=p_photo_id and author_id=auth.uid() for update;
  if not found then return '{}'::jsonb; end if;
  if p.status<>'pending' then raise exception 'ready photo cannot be cancelled' using errcode='42501'; end if;
  delete from public.experience_photos where id=p.id;
  return jsonb_build_object('path',p.storage_path,'experienceId',p.experience_id);
end $$;
create function public.experience_set_photo_sharing(p_photo_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_photos;
begin
  select * into p from public.experience_photos where id=p_photo_id;
  if not found or p.author_id is distinct from auth.uid() then raise exception 'own photo required' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'invalid consent' using errcode='22023'; end if;
  -- Revocation is still possible after leaving; granting requires current access.
  if p_enabled then
    perform private.experience_lock(p.experience_id);
    if not private.can_contribute_experience(p.experience_id) then raise exception 'member required' using errcode='42501'; end if;
  else perform 1 from public.experiences where id=p.experience_id for update; end if;
  update public.experience_photos set share_with_profile=p_enabled where id=p_photo_id and author_id=auth.uid() and status='ready';
  if not found then raise exception 'photo not ready' using errcode='22023'; end if;
  return jsonb_build_object('experienceId',p.experience_id);
end $$;
create function public.experience_set_cover(p_id uuid,p_photo_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id<>auth.uid() then raise exception 'owner required' using errcode='42501'; end if;
  if p_photo_id is not null and not exists(select 1 from public.experience_photos where id=p_photo_id and experience_id=p_id and author_id=auth.uid() and status='ready') then raise exception 'own cover required' using errcode='42501'; end if;
  update public.experiences set cover_photo_id=p_photo_id,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('experienceId',p_id);
end $$;
create function public.experience_delete_photo(p_photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.experience_photos; e public.experiences;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  select * into p from public.experience_photos where id=p_photo_id;
  if not found then raise exception 'own photo required' using errcode='42501'; end if;
  select * into e from public.experiences where id=p.experience_id for update;
  if p.author_id<>auth.uid() and (e.creator_id<>auth.uid() or not private.can_view_experience(e.id)) then raise exception 'photo ownership required' using errcode='42501'; end if;
  update public.experiences set cover_photo_id=null,revision=revision+1,updated_at=now() where id=e.id and cover_photo_id=p_photo_id;
  delete from public.experience_photos where id=p_photo_id;
  return jsonb_build_object('path',p.storage_path,'experienceId',p.experience_id);
end $$;
create function public.experience_can_read_photo(p_photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$select private.can_view_experience_photo(p_photo_id)$$;
create function public.get_experience_visible_photos(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'momentId',p.moment_id,'mimeType',p.mime_type,'createdAt',p.created_at,'shareWithProfile',p.share_with_profile,
    'authorId',case when private.can_contribute_experience(p_id) or exists(select 1 from public.experience_participants m where m.experience_id=p_id and m.user_id=p.author_id and private.can_view_experience_participant(m.id)) then p.author_id end,
    'authorName',case when private.can_contribute_experience(p_id) or exists(select 1 from public.experience_participants m where m.experience_id=p_id and m.user_id=p.author_id and private.can_view_experience_participant(m.id)) then coalesce(a.display_name,a.username) end,
    'canManage',p.author_id=auth.uid() or e.creator_id=auth.uid(),'isAuthor',p.author_id=auth.uid()) order by p.created_at,p.id),'[]'::jsonb)
  from public.experience_photos p join public.experiences e on e.id=p.experience_id left join public.profiles a on a.user_id=p.author_id
  where p.experience_id=p_id and private.can_view_experience_photo(p.id);
$$;
create function public.get_experience_orphan_photos() returns table(id uuid,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select p.id,p.created_at from public.experience_photos p where p.author_id=auth.uid() and p.status='ready'
    and private.moderation_available('experience',p.experience_id) and not private.can_contribute_experience(p.experience_id)
  order by p.created_at desc,p.id;
$$;
create function public.get_experience_cover_photos(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_ids is null or cardinality(p_ids)>100 then raise exception 'invalid batch' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('experienceId',e.id,'id',e.cover_photo_id)),'[]'::jsonb) into result from public.experiences e
    where e.id=any(p_ids) and private.can_view_experience_photo(e.cover_photo_id);
  return result;
end $$;
revoke all on function public.experience_reserve_photo(uuid,uuid,text),public.experience_finish_photo(uuid),public.experience_cancel_photo(uuid),
 public.experience_set_photo_sharing(uuid,boolean),public.experience_set_cover(uuid,uuid),public.experience_delete_photo(uuid),public.get_experience_orphan_photos() from public,anon;
grant execute on function public.experience_reserve_photo(uuid,uuid,text),public.experience_finish_photo(uuid),public.experience_cancel_photo(uuid),
 public.experience_set_photo_sharing(uuid,boolean),public.experience_set_cover(uuid,uuid),public.experience_delete_photo(uuid),public.get_experience_orphan_photos() to authenticated;
revoke all on function public.experience_can_read_photo(uuid),public.get_experience_visible_photos(uuid),public.get_experience_cover_photos(uuid[]) from public;
grant execute on function public.experience_can_read_photo(uuid),public.get_experience_visible_photos(uuid),public.get_experience_cover_photos(uuid[]) to anon,authenticated;
