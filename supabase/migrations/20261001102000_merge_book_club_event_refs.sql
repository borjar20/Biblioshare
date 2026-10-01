-- #875: extend the current canonical-ISBN merge; preserve every pre-write guard.
-- No data backfill or merge is executed by this migration.
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
