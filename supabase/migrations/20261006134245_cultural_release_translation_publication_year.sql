-- Forward-only correction: the preceding four migrations are already applied in dev.
-- Preserve the function signature, ACL, auth checks and editorial concurrency tokens.
-- Only ordinary book announcements may supply their date as the first publication year;
-- a first Spanish translation keeps that work-level year unknown unless linked to a book.
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
    -- A translation release date cannot establish the work's first publication year.
    -- Unlinked translations create a catalog work with that year still unknown.
    v_book:=public.register_manual_catalog_item('book',p_input->>'title',p_input->>'author',
      case when p_input->>'modality'='book' and p_input->>'dateValue' ~ '^[0-9]{4}'
        then substring(p_input->>'dateValue',1,4)::integer else null end,
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
