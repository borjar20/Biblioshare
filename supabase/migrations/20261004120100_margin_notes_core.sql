-- Notas en el margen (#1380). Spec: docs/superpowers/specs/2026-10-04-notas-en-el-margen-design.md
-- Invariante: una nota la ve su autor, o un lector con encuentro que siga al autor
-- (follow accepted) sin bloqueo entre ambos. Los encuentros solo los escribe
-- private.open_margin_notes (migración siguiente).
create type public.margin_audience as enum ('followers','person');
create type public.margin_found_via as enum ('progress','finish','retro');

create function private.margin_anchor_valid(p_item_type public.item_type, p_anchor jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_anchor) <> 'object' then return false; end if;
  case p_anchor->>'kind'
    when 'finish' then return p_anchor = '{"kind":"finish"}'::jsonb;
    when 'ratio' then
      if p_item_type <> 'book' or (select count(*) from jsonb_object_keys(p_anchor)) <> 4
        or jsonb_typeof(p_anchor->'ratio') <> 'number' or jsonb_typeof(p_anchor->'page') <> 'number'
        or jsonb_typeof(p_anchor->'pages') <> 'number' then return false; end if;
      return (p_anchor->>'ratio')::numeric > 0 and (p_anchor->>'ratio')::numeric <= 1
        and (p_anchor->>'page') ~ '^[0-9]+$' and (p_anchor->>'pages') ~ '^[0-9]+$'
        and (p_anchor->>'page')::int between 1 and (p_anchor->>'pages')::int;
    when 'episode' then
      if p_item_type <> 'series' or (select count(*) from jsonb_object_keys(p_anchor)) <> 3
        or jsonb_typeof(p_anchor->'season') <> 'number' or jsonb_typeof(p_anchor->'episode') <> 'number' then return false; end if;
      return (p_anchor->>'season') ~ '^[0-9]+$' and (p_anchor->>'episode') ~ '^[0-9]+$'
        and (p_anchor->>'episode')::int >= 1;
    else return false;
  end case;
end $$;
revoke all on function private.margin_anchor_valid(public.item_type, jsonb) from public, anon, authenticated;
-- La CHECK la evalúa el rol que escribe: necesita execute (como las funciones de política).
grant execute on function private.margin_anchor_valid(public.item_type, jsonb) to authenticated;

create table public.margin_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  anchor jsonb not null,
  chapter_label text,
  body text not null,
  is_spoiler boolean not null default false,
  audience public.margin_audience not null,
  recipient_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint margin_notes_anchor check (private.margin_anchor_valid(item_type, anchor)),
  constraint margin_notes_body check (body = btrim(body) and char_length(body) between 1 and 2000),
  constraint margin_notes_chapter check (case when item_type = 'book'
    then chapter_label is not null and chapter_label = btrim(chapter_label) and char_length(chapter_label) between 1 and 80
    else chapter_label is null end),
  constraint margin_notes_recipient check ((audience = 'person') = (recipient_id is not null)
    and recipient_id is distinct from author_id)
);
create index margin_notes_item_idx on public.margin_notes(item_type, item_id);
create index margin_notes_author_idx on public.margin_notes(author_id, created_at desc);
create index margin_notes_recipient_idx on public.margin_notes(recipient_id) where recipient_id is not null;

create table public.margin_note_encounters (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.margin_notes(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  found_at timestamptz not null default now(),
  found_via public.margin_found_via not null,
  seen_at timestamptz,
  notified_at timestamptz,
  unique (note_id, reader_id)
);
create index margin_note_encounters_reader_idx on public.margin_note_encounters(reader_id, found_at desc);

-- Escritura de la nota: dedicada solo a quien te sigue y sin bloqueo; episodio
-- emitido; edited_at lo pone el servidor. «Autor = quien llama» lo impone la
-- política de insert (dentro de esta función SECURITY DEFINER current_user es el
-- dueño, no 'authenticated', así que aquí no se puede comprobar el rol).
create function private.guard_margin_note() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    if new.audience = 'person' and (
      not exists(select 1 from public.follows f where f.follower_id=new.recipient_id and f.followee_id=new.author_id and f.status='accepted')
      or exists(select 1 from public.user_blocks b where (b.blocker_id=new.author_id and b.blocked_id=new.recipient_id)
        or (b.blocker_id=new.recipient_id and b.blocked_id=new.author_id))) then
      raise exception 'recipient must follow author' using errcode='42501';
    end if;
    if new.anchor->>'kind' = 'episode' and not exists(select 1 from public.series_episodes e
      where e.series_id=new.item_id and e.season_number=(new.anchor->>'season')::int and e.episode_number=(new.anchor->>'episode')::int
        and e.air_date is not null and e.air_date <= current_date) then
      raise exception 'episode not aired' using errcode='22023';
    end if;
    new.created_at := now();
    new.edited_at := null;
  elsif (new.body, new.chapter_label, new.is_spoiler) is distinct from (old.body, old.chapter_label, old.is_spoiler) then
    -- Una fusión de libros (merge_book_into) solo cambia item_id: no es una edición.
    new.edited_at := now();
  end if;
  return new;
end $$;
revoke all on function private.guard_margin_note() from public, anon, authenticated;
create trigger margin_notes_guard before insert or update on public.margin_notes
  for each row execute function private.guard_margin_note();

create function private.can_read_margin_note(p_note_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.margin_notes n where n.id=p_note_id and (
    n.author_id = auth.uid()
    or (exists(select 1 from public.margin_note_encounters e where e.note_id=n.id and e.reader_id=auth.uid())
      and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=n.author_id and f.status='accepted')
      and not public.users_are_blocked(n.author_id))));
$$;
revoke all on function private.can_read_margin_note(uuid) from public, anon, authenticated;
grant execute on function private.can_read_margin_note(uuid) to authenticated;

-- El autor ve el encuentro (y su hilo) mientras el lector le siga y no haya bloqueo:
-- el hilo desaparece para los dos a la vez.
create function private.can_read_margin_encounter(p_encounter_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
    where e.id=p_encounter_id
      and exists(select 1 from public.follows f where f.follower_id=e.reader_id and f.followee_id=n.author_id and f.status='accepted')
      and ((n.author_id=auth.uid() and not public.users_are_blocked(e.reader_id))
        or (e.reader_id=auth.uid() and not public.users_are_blocked(n.author_id))));
$$;
revoke all on function private.can_read_margin_encounter(uuid) from public, anon, authenticated;
grant execute on function private.can_read_margin_encounter(uuid) to authenticated;

alter table public.margin_notes enable row level security;
alter table public.margin_note_encounters enable row level security;
revoke all on public.margin_notes, public.margin_note_encounters from public, anon, authenticated;
grant all on public.margin_notes, public.margin_note_encounters to service_role;

grant select, delete on public.margin_notes to authenticated;
grant insert (author_id, item_type, item_id, anchor, chapter_label, body, is_spoiler, audience, recipient_id)
  on public.margin_notes to authenticated;
-- Ancla, obra y audiencia son inmutables: sin grant de update.
grant update (body, chapter_label, is_spoiler) on public.margin_notes to authenticated;

create policy margin_notes_select on public.margin_notes for select to authenticated
  using (private.can_read_margin_note(id));
create policy margin_notes_insert on public.margin_notes for insert to authenticated
  with check (author_id = auth.uid());
create policy margin_notes_update on public.margin_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy margin_notes_delete on public.margin_notes for delete to authenticated
  using (author_id = auth.uid());

grant select on public.margin_note_encounters to authenticated;
grant update (seen_at) on public.margin_note_encounters to authenticated;
create policy margin_encounters_select on public.margin_note_encounters for select to authenticated
  using (private.can_read_margin_encounter(id));
create policy margin_encounters_seen on public.margin_note_encounters for update to authenticated
  using (reader_id = auth.uid()) with check (reader_id = auth.uid());

-- Referencia polimórfica al catálogo (#708): bloquea borrar la obra y bloquea
-- referencias a obras inexistentes.
create or replace function private.catalog_reference_rules()
returns table(table_name text, type_column text, id_column text, delete_policy text)
language sql immutable set search_path = '' as $$
  values
    ('passes','item_type','item_id','restrict'),
    ('credits','item_type','item_id','cascade'),
    ('club_activity_items','item_type','item_id','restrict'),
    ('club_activity_opinions','item_type','item_id','restrict'),
    ('club_activity_placements','item_type','item_id','restrict'),
    ('club_rounds','item_type','item_id','restrict'),
    ('collection_items','item_type','item_id','restrict'),
    ('library_entries','item_type','item_id','restrict'),
    ('notes','item_type','item_id','restrict'),
    ('margin_notes','item_type','item_id','restrict'),
    ('saga_items','item_type','item_id','restrict'),
    ('saga_optional_skips','item_type','item_id','restrict'),
    ('saga_placement_windows','item_type','item_id','restrict'),
    ('saga_placement_windows','after_item_type','after_item_id','restrict'),
    ('saga_placement_windows','before_item_type','before_item_id','restrict'),
    ('saga_route_entries','item_type','item_id','restrict');
$$;
revoke all on function private.catalog_reference_rules() from public, anon, authenticated;
create trigger trg_catalog_reference_item_type before insert or update of item_type, item_id on public.margin_notes
  for each row execute function private.lock_catalog_reference('item_type','item_id');

-- merge_book_into: copia de 20261001102000 + la superficie margin_notes.
CREATE OR REPLACE FUNCTION public.merge_book_into(p_loser uuid, p_winner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_conflict       text;
  v_has_is_primary boolean;
  v_needs_promote  boolean;
begin
  if p_loser is null or p_winner is null then
    raise exception 'merge_book_into: perdedor y ganador son obligatorios (loser=%, winner=%)', p_loser, p_winner;
  end if;
  if p_loser = p_winner then
    raise exception 'merge_book_into: loser = winner (%)', p_loser;
  end if;
  if not exists (select 1 from public.books where id = p_winner) then
    raise exception 'merge_book_into: el ganador % no existe', p_winner;
  end if;
  if not exists (select 1 from public.books where id = p_loser) then
    raise exception 'merge_book_into: el perdedor % no existe', p_loser;
  end if;

  -- ¿Sigue viva `is_primary`? Se resuelve UNA vez y se reutiliza. Toda la
  -- lógica que la toca va detrás de esta bandera y por `execute` dinámico,
  -- porque plpgsql resolvería la columna al primer uso y la función reventaría
  -- el día que la Task 16 la borre.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_editions' and column_name = 'is_primary'
  ) into v_has_is_primary;

  -- ── GUARDA PREVIA ────────────────────────────────────────────────────────
  -- TODO conflicto de DATO DE USUARIO se decide aquí, ANTES de escribir nada.
  -- Una rama por cada índice único que lleva la referencia al libro dentro y
  -- cuelga de una tabla de usuario, MÁS la edición en uso por un pase.
  select string_agg(t, ', ') into v_conflict from (
    select 'collection_items' as t where exists (
      select 1 from public.collection_items l
      join public.collection_items w
        on w.collection_id = l.collection_id and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'library_entries' where exists (
      select 1 from public.library_entries l
      join public.library_entries w
        on w.user_id = l.user_id and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'passes (dos activos del mismo usuario)' where exists (
      select 1 from public.passes l
      join public.passes w
        on w.user_id = l.user_id and w.item_type = 'book' and w.item_id = p_winner and w.is_active
      where l.item_type = 'book' and l.item_id = p_loser and l.is_active)
    union all
    select 'saga_items' where exists (
      select 1 from public.saga_items l
      join public.saga_items w
        on w.saga_id = l.saga_id and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'saga_items (dos primarias)' where exists (
      select 1 from public.saga_items l, public.saga_items w
      where l.item_type = 'book' and l.item_id = p_loser and l.is_primary
        and w.item_type = 'book' and w.item_id = p_winner and w.is_primary)
    union all
    select 'saga_optional_skips' where exists (
      select 1 from public.saga_optional_skips l
      join public.saga_optional_skips w
        on w.user_id = l.user_id and w.saga_id = l.saga_id
       and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'saga_placement_windows' where exists (
      select 1 from public.saga_placement_windows l
      join public.saga_placement_windows w
        on w.saga_id = l.saga_id and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'saga_route_entries' where exists (
      select 1 from public.saga_route_entries l
      join public.saga_route_entries w
        on w.route_id = l.route_id and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'club_activity_opinions' where exists (
      select 1 from public.club_activity_opinions l
      join public.club_activity_opinions w
        on w.activity_id = l.activity_id and w.user_id = l.user_id
       and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    select 'club_activity_placements' where exists (
      select 1 from public.club_activity_placements l
      join public.club_activity_placements w
        on w.activity_id = l.activity_id and w.user_id = l.user_id
       and w.item_type = 'book' and w.item_id = p_winner
      where l.item_type = 'book' and l.item_id = p_loser)
    union all
    -- La edición del perdedor que duplica un ISBN del ganador se BORRARÍA (es
    -- dato derivado), pero si un pase la referencia deja de serlo: ese pase
    -- está anclado a una tirada concreta que el usuario eligió. El trigger
    -- BEFORE DELETE `book_editions_block_delete` lo impediría de todos modos,
    -- pero lanzando un `edition_in_use` crudo que no nombra ni la tabla ni la
    -- fusión, y ya con escrituras hechas. Se decide aquí.
    -- (`passes.edition_id` NO tiene FK a `book_editions`: ese trigger es la
    -- única protección que existe.)
    select 'book_editions (edicion en uso por un pase)' where exists (
      select 1
        from public.book_editions l
        join public.passes p on p.edition_id = l.id
       where l.book_id = p_loser and l.isbn is not null
         and (
           (public.canonical_isbn13(l.isbn) is not null and (
             exists (select 1 from public.book_editions w
                     where w.book_id = p_winner
                       and public.canonical_isbn13(w.isbn) = public.canonical_isbn13(l.isbn))
             or exists (select 1 from public.book_editions earlier
                        where earlier.book_id = p_loser
                          and public.canonical_isbn13(earlier.isbn) = public.canonical_isbn13(l.isbn)
                          and (earlier.created_at, earlier.id) < (l.created_at, l.id))
           ))
           or (public.canonical_isbn13(l.isbn) is null and exists (
             select 1 from public.book_editions w
              where w.book_id = p_winner and w.isbn = l.isbn
           ))
         ))
  ) c;

  if v_conflict is not null then
    raise exception
      'merge_book_into abortada: repuntar la obra % al ganador % chocaria en %. Decidelo a mano: nadie elige por el usuario que fila suya sobrevive.',
      p_loser, p_winner, v_conflict;
  end if;

  -- ── A partir de aquí SÍ se escribe ───────────────────────────────────────

  -- Ediciones (dato derivado). Dos trampas, en este orden:
  --   a) `book_editions_one_primary` es único por (book_id) where is_primary:
  --      si el perdedor trae su propia primaria, al mover chocarían dos. Manda
  --      la del ganador, que es la que su ficha ya está enseñando.
  --   b) `book_editions_isbn_unique` es único por (book_id, isbn): las
  --      ediciones del perdedor que repitan un ISBN del ganador no se mueven,
  --      se borran — son la misma tirada dos veces.
  if v_has_is_primary then
    execute 'update public.book_editions set is_primary = false where book_id = $1' using p_loser;
  end if;

  delete from public.book_editions l
   where l.book_id = p_loser and l.isbn is not null
     and (
           (public.canonical_isbn13(l.isbn) is not null and (
             exists (select 1 from public.book_editions w
                     where w.book_id = p_winner
                       and public.canonical_isbn13(w.isbn) = public.canonical_isbn13(l.isbn))
             or exists (select 1 from public.book_editions earlier
                        where earlier.book_id = p_loser
                          and public.canonical_isbn13(earlier.isbn) = public.canonical_isbn13(l.isbn)
                          and (earlier.created_at, earlier.id) < (l.created_at, l.id))
           ))
           or (public.canonical_isbn13(l.isbn) is null and exists (
             select 1 from public.book_editions w
              where w.book_id = p_winner and w.isbn = l.isbn
           ))
         );

  update public.book_editions set book_id = p_winner where book_id = p_loser;

  -- El ganador no puede quedarse con ediciones y CERO primarias: si el ganador
  -- no tenía ninguna edición y el perdedor sí, arriba se apagaron todas las
  -- primarias del perdedor y luego se movieron, dejando `ediciones=N
  -- primarias=0`. `ensure_primary_book_edition` NO lo arregla (es BEFORE
  -- INSERT, y esto fue un UPDATE). Mismo criterio de desempate que
  -- `promote_primary_edition_after_delete`.
  if v_has_is_primary then
    execute '
      select exists (select 1 from public.book_editions where book_id = $1)
         and not exists (select 1 from public.book_editions where book_id = $1 and is_primary)'
      into v_needs_promote using p_winner;

    if v_needs_promote then
      execute '
        update public.book_editions set is_primary = true
         where id = (select id from public.book_editions
                      where book_id = $1
                      order by published_year desc nulls last, created_at desc
                      limit 1)'
        using p_winner;
    end if;
  end if;

  -- ── Créditos (dato derivado) ─────────────────────────────────────────────
  -- Único por (item_type, item_id, person_id, role). El mismo autor con el
  -- mismo rol ya está en el ganador; esa fila del perdedor sobra. ESTE DELETE
  -- ES EL QUE HACE POSIBLE LA FUSIÓN NORMAL.
  delete from public.credits l
   where l.item_type = 'book' and l.item_id = p_loser
     and exists (select 1 from public.credits w
                 where w.item_type = 'book' and w.item_id = p_winner
                   and w.person_id = l.person_id and w.role = l.role);

  -- ── Repunte: las 13 columnas `item_type`/`item_id` ───────────────────────
  update public.credits                  set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.passes                   set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.collection_items         set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.library_entries          set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.notes                    set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.margin_notes             set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.saga_items               set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.saga_optional_skips      set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.saga_placement_windows   set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.saga_route_entries       set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.club_activity_items      set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.club_activity_opinions   set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.club_activity_placements set item_id = p_winner where item_type = 'book' and item_id = p_loser;
  update public.club_rounds              set item_id = p_winner where item_type = 'book' and item_id = p_loser;

  -- ── Repunte: las 4 referencias con OTRO nombre que `20260870` no cubría ──
  -- Ninguna tiene índice único propio sobre su columna de libro, así que no
  -- pueden chocar y no necesitan guarda.

  -- El post del usuario: sin esto queda huérfano y el feed lo descarta en
  -- silencio para siempre (`src/lib/social/feed.ts`), reseñas incluidas.
  update public.posts
     set anchor_id = p_winner
   where anchor_type = 'book' and anchor_id = p_loser;

  -- Los DOS extremos de la ventana de colocación, además del sujeto de arriba:
  -- «este libro va DESPUÉS/ANTES del perdedor». Sin esto la restricción que el
  -- usuario escribió a mano se queda muda (`get-saga-detail.ts` la degrada a
  -- null al no resolver el título).
  update public.saga_placement_windows
     set after_item_id = p_winner
   where after_item_type = 'book' and after_item_id = p_loser;

  update public.saga_placement_windows
     set before_item_id = p_winner
   where before_item_type = 'book' and before_item_id = p_loser;

  -- El ítem que originó la tierlist del club (`clubs/activities/core.ts`).
  update public.club_activities
     set spawned_from_item_id = p_winner
   where spawned_from_item_type = 'book' and spawned_from_item_id = p_loser;

  -- #875: dos formatos JSON del contrato de eventos, no del origen tierlist.
  -- Config sigue siendo opaco/tolerante; solo se cambia una referencia book
  -- existente, nunca se interpreta un array u otro tipo como objeto de evento.
  update public.club_activities
     set config = jsonb_set(config, '{item,itemId}', to_jsonb(p_winner::text), false)
   where kind = 'evento' and event_type = 'lanzamiento'
     and jsonb_typeof(config->'item') = 'object'
     and config->'item'->>'itemType' = 'book'
     and config->'item'->>'itemId' = p_loser::text;

  update public.club_activities a
     set config = jsonb_set(a.config, '{relations}', (
       select jsonb_agg(
         case when r.value->>'kind' = 'item'
                   and r.value->>'itemType' = 'book'
                   and r.value->>'itemId' = p_loser::text
              then jsonb_set(r.value, '{itemId}', to_jsonb(p_winner::text), false)
              else r.value end
         order by r.ordinality)
       from jsonb_array_elements(
         case when jsonb_typeof(a.config->'relations') = 'array'
              then a.config->'relations' else '[]'::jsonb end
       ) with ordinality as r(value, ordinality)
     ), false)
   where a.kind = 'evento' and a.event_type = 'fecha_destacada'
     and exists (
       select 1 from jsonb_array_elements(
         case when jsonb_typeof(a.config->'relations') = 'array'
              then a.config->'relations' else '[]'::jsonb end
       ) r(value)
       where r.value->>'kind' = 'item'
         and r.value->>'itemType' = 'book'
         and r.value->>'itemId' = p_loser::text
     );

  -- ── Repunte 18: el id DENTRO de una URL de texto ─────────────────────────
  -- `interaction_targets.href` = `/libro/<uuid>` (`private.item_interaction_href`).
  -- Ningún barrido por TIPO de columna lo encuentra; ver la cabecera.
  --
  -- Va DESPUÉS del `update public.passes` a propósito: ese update ya disparó
  -- `trg_passes_sync_interaction_targets` y regeneró solos los targets `pass` y
  -- `diary_entry`, que por eso ya no casan el `like`. Lo que queda aquí son los
  -- `progress_session` y los `comment`, cuyos triggers no reaccionan al cambio
  -- de ítem del pase (issue #879).
  --
  -- SIN GUARDA, y está verificado, no supuesto: los únicos índices únicos de la
  -- tabla son `(id)` y `(kind, source_id)`. `href` no entra en ninguno, así que
  -- reescribirlo no puede chocar con otra fila. Idempotente: tras el `replace`
  -- ya no queda ninguna fila que case el `like`.
  update public.interaction_targets
     set href = replace(href, p_loser::text, p_winner::text)
   where href like '%' || p_loser::text || '%';

  -- `pass_reviews` NO se toca: es una VISTA de solo lectura sobre `passes`
  -- (20260862, #690). En `20260870` había un `update pass_reviews` que corría
  -- DESPUÉS del de `passes`, así que ya no encontraba filas: un no-op sobre un
  -- objeto en el que está prohibido escribir. No se porta.

  -- La portada del perdedor en Storage (bucket `covers`, ruta
  -- `book/<book_id>.webp`) queda huérfana: `merge_book_into` no toca Storage y
  -- no puede hacerlo con integridad transaccional. No rompe nada visible
  -- (`cover_url` nunca apunta al id de otro libro: 0 filas en prod), es fuga de
  -- almacenamiento que crece con cada fusión. Issue #880.

  delete from public.books where id = p_loser;
end;
$function$;

comment on function public.merge_book_into(uuid, uuid) is
  'Fusión conservadora de books: conserva guardas de datos de usuario y deduplicación canónica de ISBN; repunta las 18 superficies tipadas/href y los dos formatos de referencias de evento (lanzamiento.config.item, fecha_destacada.config.relations). Conserva orden y claves ajenas del JSON, no cambia otras clases de actividad/medio y tolera config malformado. Storage queda fuera (#880). El llamador elige ganador. Solo service_role.';
revoke all on function public.merge_book_into(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_book_into(uuid, uuid) to service_role;
