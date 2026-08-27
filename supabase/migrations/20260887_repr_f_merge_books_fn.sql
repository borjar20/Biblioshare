-- Task 4 del plan «obra/edición/representación» (spec 2026-08-26 §6).
--
-- POR QUÉ EXISTE
-- --------------
-- OpenLibrary cataloga cada traducción como una obra DISTINTA («Words of
-- Radiance» y «Palabras Radiantes» son dos `work` con su propia work key), así
-- que el catálogo acumula filas de `books` que son la misma obra. `20260870` ya
-- tuvo que fusionar duplicados a mano, inline, para poder crear el único de
-- `openlibrary_work_key`. Esta función generaliza ESA MISMA lógica —tabla por
-- tabla, sin inventar ninguna— para que el barrido de mantenimiento pueda
-- fusionar dos obras cualesquiera, no solo las que comparten work key.
--
-- QUIÉN GANA NO SE DECIDE AQUÍ. La función recibe perdedor y ganador ya
-- elegidos; el criterio (más rastro de usuario, ficha más completa, más
-- reciente) vive en el barrido que la llama. Aquí solo se ejecuta la fusión.
--
-- LA FUSIÓN ES DELIBERADAMENTE COBARDE, Y DISTINGUE DOS CLASES DE FILA
-- -------------------------------------------------------------------
-- a) DATO DE USUARIO (`passes`, `collection_items`, `saga_items`, `notes`,
--    `club_*`…): si repuntarlo al ganador chocara con un índice único, se
--    ABORTA nombrando la tabla. Nadie decide por el usuario cuál de sus dos
--    pases sobrevive; ese caso se resuelve a mano.
-- b) DATO DERIVADO del proveedor (`credits`, `book_editions`): la fila
--    duplicada del perdedor SOBRA — se borra y se repunta el resto. Abortar
--    aquí haría IMPOSIBLE toda fusión útil: dos shells de la misma obra creadas
--    por la ficha de autor llevan AMBAS su `credits (person_id, role='author')`,
--    así que el choque es la norma, no la excepción.
--
-- SOLO `service_role`. La fusión borra una fila de catálogo: la dispara un
-- barrido de mantenimiento, jamás un cliente. Sin grant a `authenticated`.
--
-- Idempotente / re-ejecutable: `create or replace` + `revoke` (revocar un
-- privilegio ya revocado no falla).

create or replace function public.merge_book_into(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_conflict text;
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

  -- ── Guarda: datos de usuario que NO se pueden repuntar sin destruir nada ──
  -- Una rama por cada índice único que lleva `item_id` dentro y cuelga de una
  -- tabla de usuario. Portado tal cual de `20260870`; su lista manda.
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
  ) c;

  if v_conflict is not null then
    raise exception
      'merge_book_into abortada: repuntar la obra % al ganador % chocaria en %. Decidelo a mano: nadie elige por el usuario que fila suya sobrevive.',
      p_loser, p_winner, v_conflict;
  end if;

  -- ── Ediciones (dato derivado). Dos trampas, en este orden ────────────────
  --   a) `book_editions_one_primary` es único por (book_id) where is_primary:
  --      si el perdedor trae su propia primaria, al mover chocarían dos. Manda
  --      la del ganador, que es la que su ficha ya está enseñando.
  --   b) `book_editions_isbn_unique` es único por (book_id, isbn): las
  --      ediciones del perdedor que repitan un ISBN del ganador no se mueven,
  --      se borran — son la misma tirada dos veces.
  --
  -- (a) va CONDICIONADA y por `execute` dinámico a propósito: la columna
  -- `is_primary` muere en la fase C del plan (Task 16) y esta función tiene que
  -- seguir funcionando después. Sin el `execute`, plpgsql resolvería la columna
  -- al primer uso y la función reventaría el día que la columna desaparezca.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_editions' and column_name = 'is_primary'
  ) then
    execute 'update public.book_editions set is_primary = false where book_id = $1' using p_loser;
  end if;

  delete from public.book_editions l
   where l.book_id = p_loser and l.isbn is not null
     and exists (select 1 from public.book_editions w
                 where w.book_id = p_winner and w.isbn = l.isbn);

  update public.book_editions set book_id = p_winner where book_id = p_loser;

  -- ── Créditos (dato derivado) ─────────────────────────────────────────────
  -- Único por (item_type, item_id, person_id, role). El mismo autor con el
  -- mismo rol ya está en el ganador; esa fila del perdedor sobra. ESTE DELETE
  -- ES EL QUE HACE POSIBLE LA FUSIÓN NORMAL: sin él, dos shells creadas por la
  -- misma ficha de autor no se podrían fusionar nunca.
  delete from public.credits l
   where l.item_type = 'book' and l.item_id = p_loser
     and exists (select 1 from public.credits w
                 where w.item_type = 'book' and w.item_id = p_winner
                   and w.person_id = l.person_id and w.role = l.role);

  -- ── Repunte del resto ────────────────────────────────────────────────────
  -- Las que aparecen sin guarda arriba (`notes`, `club_activity_items`,
  -- `club_rounds`) no tienen `item_id` en ningún único, así que no pueden
  -- chocar.
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

  -- ÚNICA desviación respecto a la lista de `20260870`: allí había además un
  -- `update public.pass_reviews set item_id = ...`. `pass_reviews` NO es una
  -- tabla, es una VISTA sobre `passes` declarada de SOLO LECTURA (20260862,
  -- #690) — y en el original ese update corría DESPUÉS del de `passes`, así que
  -- ya no encontraba ninguna fila: era un no-op sobre un objeto en el que está
  -- prohibido escribir. No se porta.

  delete from public.books where id = p_loser;
end;
$fn$;

comment on function public.merge_book_into(uuid, uuid) is
  'Fusión COBARDE de dos filas de books (spec 2026-08-26 §6, patrón 20260870): repunta lo del perdedor al ganador y borra el perdedor. Aborta nombrando la tabla si el movimiento chocara con un único de DATO DE USUARIO; en cambio borra el duplicado sobrante de DATO DERIVADO (credits, book_editions). Quién gana lo decide el llamador. Solo service_role.';

revoke all on function public.merge_book_into(uuid, uuid) from public, anon, authenticated;
