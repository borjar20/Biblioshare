-- #730 (P0, rompía producción) y #682 — `books.openlibrary_work_key` no tenía
-- ningún UNIQUE detrás, y `register_catalog_item` hace en su rama de libro:
--
--   insert into public.books (openlibrary_work_key) values (p_external_id)
--     on conflict (openlibrary_work_key) do nothing returning id into v_id;
--
-- `ON CONFLICT (col)` exige un índice ÚNICO para inferir árbitro. El único que
-- había era normal y parcial, así que Postgres lanzaba 42P10 SIEMPRE — no era una
-- carrera ni un caso borde: dar de alta un libro nuevo desde /buscar devolvía 500.
-- Películas y series no se veían afectadas porque `movies_tmdb_id_key` y
-- `series_tmdb_id_key` sí son UNIQUE.
--
-- El índice nuevo va SIN predicado a propósito. Con un único PARCIAL, cada
-- `on conflict (openlibrary_work_key)` tendría que repetir el `where` para que la
-- inferencia funcione, y ese detalle se olvida. En un índice único los NULL no
-- chocan entre sí, así que los libros de alta manual (sin work key) siguen
-- pudiendo ser muchos, igual que con el parcial. El parcial se retira: sirve para
-- lo mismo y con el único ya está cubierto.
--
-- Trampa registrada: NO vale "arreglarlo" escribiendo
-- `on conflict (openlibrary_work_key) where openlibrary_work_key is not null`.
-- Eso hace que el error cambie de forma, pero el índice sigue sin ser único, así
-- que la unicidad —que es lo que #682 pedía— seguiría sin existir.

-- ---------------------------------------------------------------------------
-- 1. Fusión de los duplicados que el defecto ya dejó
-- ---------------------------------------------------------------------------
-- Prod (2026-08-20): uno, `/works/OL453658W` — dos filas de «Mort» creadas con 5
-- minutos de diferencia; la vieja con 18 ediciones y ningún dato de usuario, la
-- nueva con pase, reseña, colección y saga colgando. Dev: ninguno.
--
-- La fusión es general, pero deliberadamente COBARDE: repunta y borra solo lo que
-- puede hacer sin destruir nada de nadie. Si mover las filas del perdedor al
-- ganador chocara con un índice único de una tabla de usuario (dos pases activos
-- del mismo usuario sobre la misma obra, la misma obra dos veces en una
-- colección...), ABORTA con el detalle en vez de elegir qué fila de un usuario
-- sobrevive. Ese caso se decide a mano, no en una migración.
do $$
declare
  v_key text;
  v_winner uuid;
  v_loser uuid;
  v_conflict text;
begin
  for v_key in
    select openlibrary_work_key
    from public.books
    where openlibrary_work_key is not null
    group by openlibrary_work_key
    having count(*) > 1
  loop
    -- Gana la fila que el usuario está usando de verdad; a igualdad, la ficha más
    -- completa; a igualdad, la más reciente. El `id` final solo está para que el
    -- orden sea total y la migración determinista.
    select b.id into v_winner
    from public.books b
    where b.openlibrary_work_key = v_key
    order by
      ( (select count(*) from public.passes t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.pass_reviews t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.collection_items t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.library_entries t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.notes t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.saga_items t where t.item_type = 'book' and t.item_id = b.id)
      + (select count(*) from public.club_activity_items t where t.item_type = 'book' and t.item_id = b.id)
      ) desc,
      ( (b.isbn is not null)::int + (b.synopsis is not null)::int
      + (b.publisher is not null)::int + (b.total_pages is not null)::int
      + (b.cover_url is not null)::int ) desc,
      b.created_at desc,
      b.id
    limit 1;

    for v_loser in
      select id from public.books
      where openlibrary_work_key = v_key and id <> v_winner
    loop
      -- Guarda. Una fila por cada índice único que lleva `item_id` dentro y
      -- cuelga de una tabla de usuario.
      select string_agg(t, ', ') into v_conflict from (
        select 'collection_items' as t where exists (
          select 1 from public.collection_items l
          join public.collection_items w
            on w.collection_id = l.collection_id and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'library_entries' where exists (
          select 1 from public.library_entries l
          join public.library_entries w
            on w.user_id = l.user_id and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'passes (dos activos del mismo usuario)' where exists (
          select 1 from public.passes l
          join public.passes w
            on w.user_id = l.user_id and w.item_type = 'book' and w.item_id = v_winner and w.is_active
          where l.item_type = 'book' and l.item_id = v_loser and l.is_active)
        union all
        select 'saga_items' where exists (
          select 1 from public.saga_items l
          join public.saga_items w
            on w.saga_id = l.saga_id and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'saga_items (dos primarias)' where exists (
          select 1 from public.saga_items l, public.saga_items w
          where l.item_type = 'book' and l.item_id = v_loser and l.is_primary
            and w.item_type = 'book' and w.item_id = v_winner and w.is_primary)
        union all
        select 'saga_optional_skips' where exists (
          select 1 from public.saga_optional_skips l
          join public.saga_optional_skips w
            on w.user_id = l.user_id and w.saga_id = l.saga_id
           and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'saga_placement_windows' where exists (
          select 1 from public.saga_placement_windows l
          join public.saga_placement_windows w
            on w.saga_id = l.saga_id and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'saga_route_entries' where exists (
          select 1 from public.saga_route_entries l
          join public.saga_route_entries w
            on w.route_id = l.route_id and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'club_activity_opinions' where exists (
          select 1 from public.club_activity_opinions l
          join public.club_activity_opinions w
            on w.activity_id = l.activity_id and w.user_id = l.user_id
           and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
        union all
        select 'club_activity_placements' where exists (
          select 1 from public.club_activity_placements l
          join public.club_activity_placements w
            on w.activity_id = l.activity_id and w.user_id = l.user_id
           and w.item_type = 'book' and w.item_id = v_winner
          where l.item_type = 'book' and l.item_id = v_loser)
      ) c;

      if v_conflict is not null then
        raise exception
          'Fusion de % abortada: repuntar la fila % al ganador % chocaria en %. Decidelo a mano antes de crear el indice unico.',
          v_key, v_loser, v_winner, v_conflict;
      end if;

      -- Ediciones. Dos trampas, en este orden:
      --   a) `book_editions_one_primary` es único por (book_id) where is_primary:
      --      si el perdedor trae su propia primaria, al mover chocarían dos. Manda
      --      la del ganador, que es la que su ficha ya está enseñando.
      --   b) `book_editions_isbn_unique` es único por (book_id, isbn): las
      --      ediciones del perdedor que repitan un ISBN que el ganador ya tiene
      --      no se mueven, se borran — son la misma tirada dos veces.
      update public.book_editions set is_primary = false where book_id = v_loser;
      delete from public.book_editions l
       where l.book_id = v_loser and l.isbn is not null
         and exists (select 1 from public.book_editions w
                     where w.book_id = v_winner and w.isbn = l.isbn);
      update public.book_editions set book_id = v_winner where book_id = v_loser;

      -- Créditos: único por (item_type, item_id, person_id, role). El mismo autor
      -- con el mismo rol ya está en el ganador; esa fila del perdedor sobra.
      delete from public.credits l
       where l.item_type = 'book' and l.item_id = v_loser
         and exists (select 1 from public.credits w
                     where w.item_type = 'book' and w.item_id = v_winner
                       and w.person_id = l.person_id and w.role = l.role);

      -- Repunte del resto. Las que no aparecen aquí (`club_rounds`, `notes`) no
      -- tienen `item_id` en ningún único, así que no pueden chocar.
      update public.credits set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.passes set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.pass_reviews set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.collection_items set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.library_entries set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.notes set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.saga_items set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.saga_optional_skips set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.saga_placement_windows set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.saga_route_entries set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.club_activity_items set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.club_activity_opinions set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.club_activity_placements set item_id = v_winner where item_type = 'book' and item_id = v_loser;
      update public.club_rounds set item_id = v_winner where item_type = 'book' and item_id = v_loser;

      delete from public.books where id = v_loser;

      raise notice 'fusionado % : % -> %', v_key, v_loser, v_winner;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. La unicidad, que es lo que faltaba
-- ---------------------------------------------------------------------------
create unique index if not exists books_openlibrary_work_key_key
  on public.books (openlibrary_work_key);

drop index if exists public.books_openlibrary_work_key_idx;
