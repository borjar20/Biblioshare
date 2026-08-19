-- Issue #609 — créditos huérfanos: filas de `credits` apuntando a obras que ya
-- no existen dejan la ficha de persona VACÍA.
--
-- `credits` referencia el ítem de forma POLIMÓRFICA (`item_type` + `item_id`),
-- igual que `passes`, así que tampoco hay FK que lo impida. #272 puso un guard
-- de borrado para `passes` (`private.forbid_delete_with_passes`) y `credits` se
-- quedó fuera.
--
-- El modo de fallo es el peor de todos: no revienta, MIENTE. `getPersonProfile`
-- descarta el crédito huérfano a propósito (`if (!meta) continue`), así que una
-- persona con cientos de créditos enseña «Aún no hay obras de esta persona en el
-- catálogo» como si el problema fuera la ficha.
--
-- ── Medición (2026-08-19) ───────────────────────────────────────────────────
-- Lo primero que pedía la issue era medir en PROD, porque de estar igual que dev
-- habría fichas vacías en producción ahora mismo. NO las hay:
--
--   dev   → movie 1380 huérfanos (115 ids), series 1512 (126), book 633 (508)
--           = 3525 de 4436 filas de `credits`, el 79 %
--   prod  → movie 0, series 0, book 0, sobre 3272 filas
--
-- O sea: el daño es de DEV, y lo explica el ciclo de vida de dev (limpiezas de
-- catálogo privilegiadas y fixtures de e2e), no un camino de la app. Ningún
-- camino de aplicación borra catálogo: `books`/`movies`/`series` no tienen
-- policy de DELETE alguna. Aun así el agujero es real y hay que taparlo: en
-- cuanto alguien limpie catálogo en prod, prod queda como dev.
--
-- ── Política: aquí SÍ se cascadea (al revés que con `passes`) ───────────────
-- En #272 se decidió BLOQUEAR el borrado en vez de cascadear porque un pase
-- guarda datos del usuario (nota, reseña, fechas) y destruirlos en una limpieza
-- de catálogo sería silencioso e irreparable. Un crédito NO contiene nada del
-- usuario: es un hecho derivado del proveedor (TMDB/OpenLibrary) y se vuelve a
-- hidratar solo. Borrarlo con su obra es exactamente lo que haría una FK con
-- `on delete cascade`, que es lo que habría si la referencia no fuera
-- polimórfica.
--
-- El trigger se llama `cascade` y el de pases `forbid`: para el mismo evento,
-- Postgres los dispara por orden alfabético de nombre, así que el cascadeo corre
-- primero. No importa — si el guard de pases aborta después, la transacción
-- entera se deshace y los créditos vuelven.

create or replace function private.cascade_delete_credits()
returns trigger
language plpgsql
security definer set search_path = ''
as $function$
begin
  delete from public.credits c
  where c.item_type = tg_argv[0]::public.item_type
    and c.item_id = old.id;
  return old;
end;
$function$;

revoke execute on function private.cascade_delete_credits() from public, anon, authenticated;

drop trigger if exists trg_books_cascade_credits on public.books;
drop trigger if exists trg_movies_cascade_credits on public.movies;
drop trigger if exists trg_series_cascade_credits on public.series;

create trigger trg_books_cascade_credits
  before delete on public.books for each row
  execute function private.cascade_delete_credits('book');
create trigger trg_movies_cascade_credits
  before delete on public.movies for each row
  execute function private.cascade_delete_credits('movie');
create trigger trg_series_cascade_credits
  before delete on public.series for each row
  execute function private.cascade_delete_credits('series');

comment on function private.cascade_delete_credits() is
  '#609: borra los `credits` de una obra al borrarla del catálogo. La referencia es polimórfica y no admite FK; un crédito no guarda nada del usuario, así que aquí se cascadea (al contrario que con `passes`, #272, que se bloquea).';

-- ── Limpieza de los huérfanos que ya hay ────────────────────────────────────
-- Idempotente y sin efecto en prod (0 filas allí al 2026-08-19). En dev quita
-- las 3525 que dejan fichas de persona vacías.
delete from public.credits c
where (c.item_type = 'movie'  and not exists (select 1 from public.movies  m where m.id = c.item_id))
   or (c.item_type = 'series' and not exists (select 1 from public.series  s where s.id = c.item_id))
   or (c.item_type = 'book'   and not exists (select 1 from public.books   b where b.id = c.item_id));

-- Verificación (contra las tablas reales):
--   select c.item_type, count(*) from public.credits c
--   where (c.item_type='movie'  and not exists (select 1 from public.movies  m where m.id=c.item_id))
--      or (c.item_type='series' and not exists (select 1 from public.series  s where s.id=c.item_id))
--      or (c.item_type='book'   and not exists (select 1 from public.books   b where b.id=c.item_id))
--   group by 1;   -- esperado: cero filas
