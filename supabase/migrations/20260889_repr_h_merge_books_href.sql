-- Task 4 del plan «obra/edición/representación» (spec 2026-08-26 §6) — TERCERA
-- Y ÚLTIMA OLA. Redefine `merge_book_into` partiendo de la versión VIVA
-- (`20260888`, leída de `pg_proc`, no del fichero). NO se editan `20260887` ni
-- `20260888`, que ya están aplicadas en dev.
--
-- LO QUE FALTABA, Y POR QUÉ NINGÚN BARRIDO ANTERIOR LO ENCONTRÓ
-- -------------------------------------------------------------
-- `interaction_targets.href` es `text` y lleva el id del libro INCRUSTADO en
-- una URL (`/libro/<uuid>`), escrito por `private.item_interaction_href()`
-- (`20260730212803_social_interaction_targets_expand.sql:44-58`).
--
-- Las dos revisiones anteriores barrieron POR TIPO DE COLUMNA: enums con la
-- etiqueta 'book', columnas `*_type` de texto, columnas jsonb, y `pg_constraint`
-- para las FK reales. Ese método tiene un PUNTO CIEGO estructural: **un id
-- incrustado dentro de una cadena no tiene tipo que lo delate**. La revisión de
-- `20260888` llegó a mirar `interaction_targets`, descartó `kind`/`source_id`
-- con razón (el enum `target_kind` no tiene etiqueta 'book') y no volvió a
-- mirar la tabla. La referencia estaba dos columnas más allá.
--
-- EL BARRIDO QUE SÍ LO ENCUENTRA: GUIADO POR DATOS, NO POR TIPOS
-- ---------------------------------------------------------------
-- Para cada tabla, serializar la fila entera (`to_jsonb(t)`), extraer por regex
-- TODOS los uuid que aparezcan en cualquier valor, y cruzarlos contra
-- `books.id`. No pregunta «¿qué columna PARECE una referencia a libro?» sino
-- «¿qué columna CONTIENE hoy un id de libro?», así que atrapa uuid en texto
-- libre, dentro de URLs y dentro de jsonb. La consulta completa vive en
-- `docs/requirements/data-model.md` §2.2 para que la próxima persona no repita
-- el barrido incompleto: es la tercera vez que esta lista se queda corta.
--
-- Su límite, que hay que decir en voz alta: está guiado por DATOS, así que solo
-- ve lo que tiene filas hoy. No sustituye al barrido por tipos — lo COMPLETA.
-- Se corren los dos.
--
-- Corrido contra producción (2026-08-27) devuelve 18 columnas que hoy llevan un
-- id de libro, entre ellas la que faltaba:
--     interaction_targets.href .......... 232 filas  ← LA QUE FALTABA
--     books.cover_url ................... 158 filas  (su propio id, no otro)
--     books.id .......................... 268 filas  (la propia PK)
--     book_editions.book_id ............. 372 filas  (la única FK real)
--     …y las 14 columnas `_id` polimórficas con datos, ya cubiertas.
--
-- REPARTO MEDIDO DE LAS 232 FILAS, Y POR QUÉ SOLO 74 SE ROMPEN
-- ------------------------------------------------------------
-- `trg_passes_sync_interaction_targets` dispara con `UPDATE OF user_id,
-- item_type, item_id`, así que al repuntar `passes` (más arriba en esta misma
-- función) los targets que nacen del pase SE REGENERAN SOLOS con el href del
-- ganador:
--     kind='pass' ............... 106 filas → se auto-curan
--     kind='diary_entry' ......... 52 filas → se auto-curan
-- Los otros dos NO tienen quien los regenere:
--     kind='progress_session' .... 67 filas → NO se cura
--         `trg_progress_sessions_sync_interaction_target` es
--         `AFTER INSERT OR UPDATE OF user_id, pass_id`: toma el href del pase
--         en el momento del insert y no reacciona a que cambie el ítem.
--     kind='comment' .............. 7 filas → NO se cura
--         `trg_comments_sync_interaction_target` es `AFTER INSERT` a secas;
--         hereda el href del padre y nunca lo revisa.
--
-- Esas 74 filas quedarían apuntando a `/libro/<id-borrado>`, y
-- `src/app/libro/[id]/page.tsx:140` hace `notFound()`: la notificación «X
-- comentó tu sesión» llevaría a un 404 permanente.
--
-- OJO: esto parchea el href DESDE LA FUSIÓN. El modo de fallo de fondo sigue
-- vivo — cualquier otra cosa que cambie el ítem de un pase deja los targets
-- `progress_session` y `comment` apuntando al ítem viejo. Issue #879.
--
-- NUEVA CANDIDATA DESCARTADA (verificada, para que nadie la re-investigue)
-- -----------------------------------------------------------------------
--   · `profiles.interests` (`item_type[]`) — el array CONTIENE la etiqueta
--     'book', pero es un filtro de intereses del perfil («me interesan los
--     libros»); no hay `item_id` ni ninguna columna que lo acompañe. No es una
--     referencia y no hay nada que repuntar. 2 perfiles la usan en prod.
--
-- El resto de descartes se mantiene tal cual: ver la cabecera de `20260888`.
--
-- Re-ejecutable: `create or replace` + `revoke` nombrando los roles (#831).

create or replace function public.merge_book_into(p_loser uuid, p_winner uuid)
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
$fn$;

comment on function public.merge_book_into(uuid, uuid) is
  'Fusión COBARDE de dos filas de books (spec 2026-08-26 §6): repunta al ganador las 18 referencias a libro verificadas contra el esquema real —las 13 de item_type/item_id, MÁS posts.anchor_id, saga_placement_windows.after_/before_item_id y club_activities.spawned_from_item_id, MÁS interaction_targets.href, que lleva el id INCRUSTADO en una URL de texto (/libro/<uuid>) y por eso ningún barrido por tipo de columna encuentra— y borra el perdedor. Aborta SIN ESCRIBIR NADA, nombrando la tabla, si el movimiento chocara con un único de DATO DE USUARIO o si un pase usa una edición que habría que borrar; en cambio borra el duplicado sobrante de DATO DERIVADO (credits, book_editions). Mantiene la invariante «con ediciones ⇒ exactamente una primaria». NO cubre club_activities.config->item->>itemId (jsonb, latente, #875) ni la portada huérfana en Storage (#880). Quién gana lo decide el llamador. Solo service_role.';

revoke all on function public.merge_book_into(uuid, uuid) from public, anon, authenticated;
