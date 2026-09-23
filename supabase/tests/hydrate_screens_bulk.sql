-- Regresión de #1201: `hydrate_screens_bulk` rellena huecos SIN marcar
-- `hydrated_at` (si lo marcara, la ficha nunca completaría director/duración),
-- no pisa lo que ya hay y no revienta con `genres` null.
-- Disposable/local o dev only: filas sintéticas, rollback incluso si pasa.
-- Ejecutar con psql -v ON_ERROR_STOP=1.
begin;
do $test$
declare
  u uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  mr record;
  sr record;
begin
  insert into auth.users(id) values (u);
  insert into public.movies(id, tmdb_id, title) values (m, -1201, '[TEST] curado');
  insert into public.series(id, tmdb_id) values (s, -1201);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  perform public.hydrate_screens_bulk('movie', jsonb_build_array(jsonb_build_object(
    'item_id', m, 'title', 'NO DEBE PISAR', 'synopsis', 'sinopsis', 'genres', null, 'release_year', 1999)));
  perform public.hydrate_screens_bulk('series', jsonb_build_array(jsonb_build_object(
    'item_id', s, 'title', 'Serie', 'genres', jsonb_build_array('Drama'))));

  select title, synopsis, genres, release_year, hydrated_at into mr from public.movies where id = m;
  select title, genres, hydrated_at into sr from public.series where id = s;

  if mr.title <> '[TEST] curado' then raise exception 'pisó un título existente: %', mr.title; end if;
  if mr.synopsis is distinct from 'sinopsis' or mr.release_year is distinct from 1999 then
    raise exception 'no rellenó huecos: % %', mr.synopsis, mr.release_year;
  end if;
  if coalesce(cardinality(mr.genres), 0) <> 0 then raise exception 'genres null no debía escribir nada: %', mr.genres; end if;
  if sr.title is distinct from 'Serie' or sr.genres is distinct from array['Drama'] then
    raise exception 'serie mal hidratada: % %', sr.title, sr.genres;
  end if;
  if mr.hydrated_at is not null or sr.hydrated_at is not null then
    raise exception 'el lote marcó hydrated_at (#1201)';
  end if;
  if current_setting('app.hydrating', true) is distinct from 'off' then
    raise exception 'app.hydrating quedó encendido';
  end if;
end
$test$;
rollback;
