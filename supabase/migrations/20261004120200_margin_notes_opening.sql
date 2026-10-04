-- Apertura de notas en el margen. Espejo SQL de src/lib/margin/threshold.ts:
-- si cambias uno, cambia el otro y sus pruebas.
create function private.margin_reached(p_reader uuid, p_note public.margin_notes) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.passes p where p.user_id=p_reader and p.item_type=p_note.item_type
      and p.item_id=p_note.item_id and p.status='completed')
    or case p_note.anchor->>'kind'
      when 'episode' then exists(select 1 from public.episode_watches w where w.user_id=p_reader
        and w.series_id=p_note.item_id and w.season_number=(p_note.anchor->>'season')::int
        and w.episode_number=(p_note.anchor->>'episode')::int)
      when 'ratio' then exists(select 1 from public.passes p
        join public.books b on b.id=p.item_id
        left join public.book_editions be on be.id=p.edition_id
        cross join lateral (select coalesce(be.total_pages, b.total_pages)::numeric as pages) t
        where p.user_id=p_reader and p.item_type='book' and p.item_id=p_note.item_id
          and t.pages > 0 and (p.position->>'page') ~ '^[0-9]+$'
          and (p.position->>'page')::numeric / t.pages
            >= (p_note.anchor->>'ratio')::numeric + greatest(0.03, 5 / t.pages))
      else false
    end;
$$;
revoke all on function private.margin_reached(uuid, public.margin_notes) from public, anon, authenticated;

create function private.open_margin_notes(p_reader uuid, p_item_type public.item_type, p_item_id uuid,
  p_via public.margin_found_via, p_note uuid default null, p_author uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare created integer;
begin
  insert into public.margin_note_encounters(note_id, reader_id, found_via)
  select n.id, p_reader, p_via from public.margin_notes n
  where n.item_type=p_item_type and n.item_id=p_item_id and n.author_id<>p_reader
    and (p_note is null or n.id=p_note) and (p_author is null or n.author_id=p_author)
    and (n.audience='followers' or n.recipient_id=p_reader)
    and exists(select 1 from public.follows f where f.follower_id=p_reader and f.followee_id=n.author_id and f.status='accepted')
    and not exists(select 1 from public.user_blocks b where (b.blocker_id=p_reader and b.blocked_id=n.author_id)
      or (b.blocker_id=n.author_id and b.blocked_id=p_reader))
    and private.margin_reached(p_reader, n)
  on conflict (note_id, reader_id) do nothing;
  get diagnostics created = row_count;
  return created;
end $$;
revoke all on function private.open_margin_notes(uuid, public.item_type, uuid, public.margin_found_via, uuid, uuid) from public, anon, authenticated;

-- Pases: cubre sesiones (mueven position), cierres (status) e importaciones.
create function private.margin_on_pass() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.position is not distinct from old.position and new.status is not distinct from old.status then
    return null;
  end if;
  perform private.open_margin_notes(new.user_id, new.item_type, new.item_id,
    case when new.status='completed' then 'finish'::public.margin_found_via else 'progress'::public.margin_found_via end);
  return null;
end $$;
revoke all on function private.margin_on_pass() from public, anon, authenticated;
create trigger margin_open_on_pass after insert or update of position, status on public.passes
  for each row execute function private.margin_on_pass();

create function private.margin_on_episode() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.open_margin_notes(new.user_id, 'series', new.series_id, 'progress');
  return null;
end $$;
revoke all on function private.margin_on_episode() from public, anon, authenticated;
create trigger margin_open_on_episode after insert on public.episode_watches
  for each row execute function private.margin_on_episode();

-- Nota nueva: llega en silencio a quien ya pasó por ese punto.
create function private.margin_on_note() returns trigger
language plpgsql security definer set search_path='' as $$
declare reader uuid;
begin
  for reader in select f.follower_id from public.follows f
    where f.followee_id=new.author_id and f.status='accepted'
      and (new.audience='followers' or f.follower_id=new.recipient_id)
      and exists(select 1 from public.passes p where p.user_id=f.follower_id and p.item_type=new.item_type and p.item_id=new.item_id)
  loop
    perform private.open_margin_notes(reader, new.item_type, new.item_id, 'retro', new.id);
  end loop;
  return null;
end $$;
revoke all on function private.margin_on_note() from public, anon, authenticated;
create trigger margin_open_on_note after insert on public.margin_notes
  for each row execute function private.margin_on_note();

-- Follow aceptado: el nuevo seguidor recibe lo que ya superó.
create function private.margin_on_follow() returns trigger
language plpgsql security definer set search_path='' as $$
declare work record;
begin
  if new.status<>'accepted' or (tg_op='UPDATE' and old.status='accepted') then return null; end if;
  for work in select distinct n.item_type, n.item_id from public.margin_notes n
    where n.author_id=new.followee_id
      and exists(select 1 from public.passes p where p.user_id=new.follower_id and p.item_type=n.item_type and p.item_id=n.item_id)
  loop
    perform private.open_margin_notes(new.follower_id, work.item_type, work.item_id, 'retro', null, new.followee_id);
  end loop;
  return null;
end $$;
revoke all on function private.margin_on_follow() from public, anon, authenticated;
create trigger margin_open_on_follow after insert or update of status on public.follows
  for each row execute function private.margin_on_follow();
