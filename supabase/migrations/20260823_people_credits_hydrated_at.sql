-- Marca de "ya traje la obra completa de esta persona desde su API externa"
-- (TMDB combined_credits / Open Library author works). Con valor, la ficha no
-- vuelve a llamar a la API: lee de `credits` y punto.
--
-- El GRANT va en la MISMA migración a propósito: el UPDATE de `authenticated`
-- sobre `people` está acotado por columnas (bio, birth_date, death_date,
-- photo_url, place_of_birth antes de esto), y una columna nueva sin su grant
-- rompe la escritura ENTERA de la tabla (issue #375, superficie 6 de
-- docs/DRIFT-CHECK.md), no solo el campo nuevo: enrichTmdbBio dejaría de
-- guardar biografías. Compila, pasa typecheck, pasa los unitarios y revienta
-- en producción.
alter table public.people
  add column if not exists credits_hydrated_at timestamptz;

grant update (credits_hydrated_at) on public.people to authenticated;
