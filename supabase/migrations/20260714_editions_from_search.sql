-- Alta de edición desde la búsqueda.
--
-- Crear una edición A MANO es curación y exige colaborador+ (ver
-- 20260714_editions.sql). Pero cuando el usuario añade un libro desde la
-- búsqueda ya ha elegido un ISBN concreto en Google Books: ese dato viene de
-- una fuente de catálogo, no se lo está inventando nadie. Sin esta política,
-- añadir un libro a la biblioteca fallaría para un usuario normal.
--
-- La puerta es el ISBN: solo se puede insertar sin ser colaborador si la fila
-- lleva uno. Así no se abre la mano a ediciones inventadas.
create policy "book_editions from catalog sources"
  on public.book_editions for insert to authenticated
  with check (isbn is not null and char_length(isbn) between 10 and 20);

-- Dos usuarios añadiendo el mismo ISBN a la vez no deben crear dos filas: el
-- alta es idempotente y la app traga el 23505 como éxito.
create unique index book_editions_isbn_unique
  on public.book_editions (book_id, isbn) where isbn is not null;
