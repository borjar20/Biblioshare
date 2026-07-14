-- La work key de OpenLibrary, que es lo que hace falta para pedir las ediciones
-- de una obra (/works/OL...W/editions.json).
--
-- Hoy se guarda —a medias— en `books.google_books_id`, una columna cuyo nombre
-- miente: el proyecto migró de Google Books a OpenLibrary y la columna se quedó
-- con el nombre viejo. En producción hay 80 libros con una work key ahí dentro,
-- 146 con IDs antiguos de Google Books y 10 sin nada. Así que se separa en una
-- columna honesta y se hace backfill de los que ya la tienen; para el resto, la
-- work key se resolverá por ISBN la primera vez que alguien abra su ficha.
--
-- `editions_synced_at` es la marca del cache-as-you-go: si está puesta, ya se
-- preguntó por las ediciones de este libro y no se vuelve a preguntar — ni
-- siquiera si la respuesta fue "no hay ninguna". Sin esa marca, una obra sin
-- ediciones en OpenLibrary pagaría una llamada en cada visita a su ficha.
alter table public.books
  add column openlibrary_work_key text,
  add column editions_synced_at timestamptz;

update public.books
   set openlibrary_work_key = google_books_id
 where google_books_id like '/works/%';

create index books_openlibrary_work_key_idx
  on public.books (openlibrary_work_key) where openlibrary_work_key is not null;

-- La app escribe ambas columnas al sincronizar (cache-as-you-go con la sesión
-- del usuario que navega, como el resto del enriquecimiento de catálogo).
grant update (openlibrary_work_key, editions_synced_at)
  on public.books to authenticated;
