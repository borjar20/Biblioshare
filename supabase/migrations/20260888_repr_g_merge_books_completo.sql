-- Task 4 del plan «obra/edición/representación» (spec 2026-08-26 §6) — REVISIÓN.
-- Redefine `merge_book_into` corrigiendo los hallazgos de la revisión de
-- `20260887`. NO se edita `20260887`, que ya está aplicada en dev.
--
-- LA CAUSA RAÍZ DE TODO LO QUE SE ARREGLA AQUÍ
-- --------------------------------------------
-- `20260887` copió su lista de tablas de `20260870_books_openlibrary_work_key_unique.sql`
-- sin verificarla contra el esquema real. ESA LISTA NO ES AUTORITATIVA: solo
-- cubre las 13 tablas cuyas columnas se llaman literalmente `item_type`/`item_id`,
-- y el esquema tiene referencias polimórficas a libro con OTROS nombres. Como
-- `passes` y compañía son polimórficas SIN FK real, ningún constraint detecta la
-- omisión: una tabla que falte deja filas de usuario apuntando a una obra
-- inexistente y la app las descarta en silencio.
--
-- ENUMERACIÓN COMPLETA VERIFICADA CONTRA EL ESQUEMA REAL DE DEV (2026-08-27)
-- --------------------------------------------------------------------------
-- Método: `pg_attribute` × `pg_type` para toda columna de un enum que contenga
-- la etiqueta 'book' (`item_type`, `post_anchor_type`, `thought_anchor_type`),
-- más columnas `*_type` de texto, más toda columna jsonb, más `pg_constraint`
-- para las FK reales a `books`.
--
-- (A) REFERENCIAS POLIMÓRFICAS A LIBRO QUE HAY QUE REPUNTAR — 17, no 13:
--     Las 13 de `20260870` (`item_type`/`item_id`): credits, passes,
--     collection_items, library_entries, notes, saga_items,
--     saga_optional_skips, saga_placement_windows.item_id, saga_route_entries,
--     club_activity_items, club_activity_opinions, club_activity_placements,
--     club_rounds.
--     + LAS 4 QUE FALTABAN:
--       · posts.anchor_type/anchor_id            (enum `post_anchor_type`)
--       · saga_placement_windows.after_item_*    (mismo enum, otro nombre)
--       · saga_placement_windows.before_item_*   (mismo enum, otro nombre)
--       · club_activities.spawned_from_item_*    (mismo enum, otro nombre)
--
-- (B) FK REAL A `books`: solo una — `book_editions.book_id` (on delete cascade).
--
-- (C) CANDIDATAS DESCARTADAS, verificadas una a una para que nadie las
--     re-investigue:
--       · `challenges.item_type`         — NO tiene `item_id`; es un filtro
--         («reto de libros»), no una referencia. `criteria` jsonb: sin ids.
--       · `pending_import_rows.item_type`— NO tiene `item_id`; `payload` es la
--         fila CRUDA del CSV (title/author/isbn), previa al catálogo.
--       · `notifications.target_type`    — texto libre; valores reales
--         club/club_activity/club_event/club_post/club_round. Nunca 'book'.
--       · `content_reports.target_type`  — enum `target_kind`, SIN etiqueta 'book'.
--       · `interaction_targets.kind`     — enum `target_kind`, ídem.
--       · `posts.source_kind`/`source_id`— apunta a `passes`, no a `books`.
--       · enum `thought_anchor_type`     — CONTIENE 'book' pero NINGUNA columna
--         del esquema lo usa: es un tipo muerto. No hay nada que repuntar.
--       · jsonb sin ids de libro: books.repr_meta, notes.meta/position,
--         user_celebrations.payload, content_reports.snapshot, club_posts.ref,
--         library_entries.position, passes.position, progress_sessions.position.
--       · `pass_reviews` es una VISTA de solo lectura sobre `passes` (20260862,
--         #690): no se escribe.
--
-- (D) ÚNICA REFERENCIA A LIBRO QUE ESTA FUNCIÓN **NO** ARREGLA:
--     `club_activities.config->'item'->>'itemId'` (jsonb, ver
--     `src/lib/clubs/activities/event-release-types.ts`). Referencia real pero
--     por JSONB; hoy latente (en producción los 20 eventos con ítem son
--     películas/series, cero libros). Se deja fuera a propósito y vive como
--     issue: arreglarlo en SQL exige reescribir jsonb a ciegas sin constraint
--     que lo respalde.
--
-- QUÉ CAMBIA RESPECTO A `20260887`
-- ---------------------------------
--  1. `posts` se repunta (68 filas expuestas en prod). Sin él, el post queda
--     apuntando a un libro borrado y `src/lib/social/feed.ts` lo descarta del
--     feed PARA SIEMPRE (`if (!anchor) continue;`), incluida la reseña de un
--     `kind='finished'`. Verificado: `posts` NO tiene ningún índice único que
--     involucre `anchor_id` (el único es `posts_source_kind_uidx` sobre
--     source_kind/source_id/kind), así que no puede chocar y NO necesita guarda.
--  2. `saga_placement_windows.after_*` y `before_*` se repuntan. Sin ellos, la
--     restricción de colocación escrita a mano por el usuario se queda muda
--     (`src/lib/sagas/get-saga-detail.ts` degrada a null). Tampoco tienen
--     índice único propio: sin guarda.
--  3. `club_activities.spawned_from_item_id` se repunta (se lee en
--     `src/lib/clubs/activities/core.ts` para el título de origen de la
--     tierlist). Su único índice único es sobre `spawned_from_activity_id`.
--  4. `edition_in_use` pasa a la GUARDA PREVIA. Antes reventaba crudo desde
--     dentro del `delete` de ediciones duplicadas —con un mensaje que no nombra
--     ni la tabla ni la fusión— y, peor, DESPUÉS de haber hecho ya el
--     `update … is_primary = false`. Ahora la función no escribe NADA antes de
--     decidir si aborta.
--  5. Tras mover las ediciones, si el ganador tiene ediciones y NINGUNA
--     primaria, se promociona una. Antes podía quedar `ediciones=1 primarias=0`
--     (ganador sin ediciones + perdedor con ellas), rompiendo la invariante que
--     sostienen `books_create_primary_edition` y `ensure_primary_book_edition`
--     —este último es BEFORE INSERT, así que el `update … set book_id` NO la
--     restablece—. Criterio idéntico al de `promote_primary_edition_after_delete`:
--     `order by published_year desc nulls last, created_at desc limit 1`.
--  6. El comentario sobre sobrevivir a la Task 16 decía una mentira. Ver abajo.
--
-- QUIÉN GANA NO SE DECIDE AQUÍ. La función recibe perdedor y ganador ya
-- elegidos; el criterio vive en el barrido que la llama.
--
-- LA FUSIÓN ES DELIBERADAMENTE COBARDE, Y DISTINGUE DOS CLASES DE FILA
--  a) DATO DE USUARIO: si repuntarlo chocara con un único, se ABORTA nombrando
--     la tabla. Nadie decide por el usuario cuál de sus dos pases sobrevive.
--  b) DATO DERIVADO del proveedor (`credits`, `book_editions`): la fila
--     duplicada del perdedor SOBRA — se borra y se repunta el resto. Abortar
--     aquí haría IMPOSIBLE toda fusión útil: dos shells de la misma obra creadas
--     por la ficha de autor llevan AMBAS su `credits (person_id, role='author')`.
--
-- LA TASK 16 (muerte de `is_primary`) NECESITA MÁS QUE BORRAR LA COLUMNA
-- ---------------------------------------------------------------------
-- `20260887` afirmaba que la función «sigue siendo correcta antes y después» de
-- que muera `is_primary`. ERA FALSO y aquí no se repite: las ramas que tocan
-- `is_primary` van condicionadas y por `execute` dinámico, sí, pero eso solo
-- protege a ESTA función. El día que la columna desaparezca, la rama de ISBN
-- duplicado seguirá reventando en OTRO objeto: el trigger AFTER DELETE
-- `book_editions_promote_primary_after_delete` lee `old.is_primary` y falla con
-- `record "old" has no field "is_primary"`. La Task 16 debe eliminar TAMBIÉN
-- los triggers `book_editions_promote_primary_after_delete` y
-- `book_editions_ensure_primary` (y sus funciones), no solo la columna.
--
-- SOLO `service_role`. La fusión borra una fila de catálogo: la dispara un
-- barrido de mantenimiento, jamás un cliente.
--
-- Migración RE-EJECUTABLE: `drop function if exists` + `create` + `revoke`.

drop function if exists public.merge_book_into(uuid, uuid);

create function public.merge_book_into(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
         and exists (select 1 from public.book_editions w
                      where w.book_id = p_winner and w.isbn = l.isbn))
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
     and exists (select 1 from public.book_editions w
                 where w.book_id = p_winner and w.isbn = l.isbn);

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

  -- `pass_reviews` NO se toca: es una VISTA de solo lectura sobre `passes`
  -- (20260862, #690). En `20260870` había un `update pass_reviews` que corría
  -- DESPUÉS del de `passes`, así que ya no encontraba filas: un no-op sobre un
  -- objeto en el que está prohibido escribir. No se porta.

  delete from public.books where id = p_loser;
end;
$fn$;

comment on function public.merge_book_into(uuid, uuid) is
  'Fusión COBARDE de dos filas de books (spec 2026-08-26 §6): repunta al ganador las 17 referencias polimórficas a libro verificadas contra el esquema real —las 13 de item_type/item_id MÁS posts.anchor_id, saga_placement_windows.after_/before_item_id y club_activities.spawned_from_item_id— y borra el perdedor. Aborta SIN ESCRIBIR NADA, nombrando la tabla, si el movimiento chocara con un único de DATO DE USUARIO o si un pase usa una edición que habría que borrar; en cambio borra el duplicado sobrante de DATO DERIVADO (credits, book_editions). Mantiene la invariante «con ediciones ⇒ exactamente una primaria». NO cubre club_activities.config->item->>itemId (jsonb, latente). Quién gana lo decide el llamador. Solo service_role.';

revoke all on function public.merge_book_into(uuid, uuid) from public, anon, authenticated;
