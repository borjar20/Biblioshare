-- GIN sobre genres text[] para que `genres @> ARRAY[label]` (la consulta de
-- /genero/[slug] y del filtro de biblioteca) no haga scan completo del catálogo.
create index if not exists books_genres_gin on public.books using gin (genres);
create index if not exists movies_genres_gin on public.movies using gin (genres);
create index if not exists series_genres_gin on public.series using gin (genres);
