-- #674 catálogo server-authoritative — parte A: preparar las columnas de la shell.
--
-- La shell nace SIN canónicos (todos NULL) y los rellena la hidratación al abrir
-- la ficha. `title` era NOT NULL en las tres tablas, lo que impedía la shell
-- vacía; se hace nullable. La UI muestra un placeholder mientras hydrated_at IS
-- NULL (ver find-or-create y los renders de obra).
alter table public.movies alter column title drop not null;
alter table public.series alter column title drop not null;
alter table public.books  alter column title drop not null;

-- Guard de hidratación, hermano de books.hydrated_at (20260715_book_hydration):
-- si está puesto, no se vuelve a preguntar al proveedor por esta obra.
alter table public.movies add column hydrated_at timestamptz;
alter table public.series add column hydrated_at timestamptz;

-- La hidratación la dispara la ficha con la sesión del visitante (no colaborador),
-- igual que books.hydrated_at. Sin este grant, un authenticated no puede marcar la
-- fila y la escritura de la RPC fill-only fallaría en silencio (#375).
grant update (hydrated_at) on public.movies to authenticated;
grant update (hydrated_at) on public.series to authenticated;
