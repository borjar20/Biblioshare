-- El pase pasa a ser el hub: absorbe estado, cursor, cola y fijados de
-- library_entries. library_entries NO se toca aún (queda como red de revert;
-- se congela en la migración C). Ver docs/superpowers/specs/2026-07-15-pase-hub-design.md.

-- 1) Columnas nuevas.
alter table public.diary_entries
  add column if not exists item_type public.item_type,
  add column if not exists item_id uuid,
  add column if not exists status public.media_status not null default 'planned',
  add column if not exists is_active boolean not null default false,
  add column if not exists position jsonb not null default '{}'::jsonb,
  add column if not exists queue_id uuid references public.queues(id) on delete set null,
  add column if not exists queue_order integer,
  add column if not exists pinned_order integer;

-- 2) Toda entrada sin ningún pase engendra uno, para que "en mi biblioteca"
--    pueda pasar a significar "existe pase activo". Idempotente.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, is_public)
select
  le.id,
  le.user_id,
  case when le.status <> 'planned'
       then coalesce(le.started_at::date, le.updated_at::date) end,
  case when le.status in ('completed', 'dropped') then le.updated_at::date end,
  true
from public.library_entries le
where not exists (
  select 1 from public.diary_entries d where d.library_entry_id = le.id
);

-- 3) La obra, en todos los pases (aún vía library_entry_id; la columna se
--    volverá not null al final de este fichero).
update public.diary_entries d
set item_type = le.item_type, item_id = le.item_id
from public.library_entries le
where d.library_entry_id = le.id
  and (d.item_type is null or d.item_id is null);

-- 4) Estado provisional derivado de finished_on. El histórico no distinguía
--    completado de abandonado: los cerrados no-activos quedan como
--    'completed' (es lo que la media de comunidad asumía de facto).
update public.diary_entries set status = 'completed'
where finished_on is not null and status = 'planned';
update public.diary_entries set status = 'in_progress'
where finished_on is null and status = 'planned' and started_on is not null;

-- 5) El pase activo de cada entrada (el abierto si lo hay; si no, el último
--    cerrado) hereda el estado REAL y el contexto de biblioteca.
with actives as (
  select distinct on (d.library_entry_id) d.id, d.library_entry_id
  from public.diary_entries d
  order by d.library_entry_id,
           (d.finished_on is null) desc,
           d.finished_on desc,
           d.created_at desc
)
update public.diary_entries d
set is_active   = true,
    status      = le.status,
    position    = le.position,
    queue_id    = le.queue_id,
    queue_order = le.queue_order,
    pinned_order = le.pinned_order
from actives a
join public.library_entries le on le.id = a.library_entry_id
where d.id = a.id;

-- 6) Coherencia estado ↔ fechas en los activos (deriva histórica posible):
--    cerrado sin fecha gana la fecha; abierto con fecha la pierde. El índice
--    diary_entries_one_open_pass no puede chocar: si hubiera habido un pase
--    abierto, ESE habría sido elegido activo en el paso 5.
update public.diary_entries
set finished_on = coalesce(finished_on, updated_at::date)
where is_active and status in ('completed', 'dropped') and finished_on is null;
update public.diary_entries
set finished_on = null
where is_active and status in ('planned', 'in_progress') and finished_on is not null;

-- 7) Cierres e índices.
alter table public.diary_entries
  alter column item_type set not null,
  alter column item_id set not null;

create unique index if not exists passes_one_active
  on public.diary_entries (user_id, item_type, item_id)
  where is_active;
create index if not exists passes_active_by_user
  on public.diary_entries (user_id)
  where is_active;
create index if not exists passes_by_item
  on public.diary_entries (item_type, item_id);

-- 8) Grants por columna: el SELECT de tabla se quitó en
--    20260714_passes_review_privacy.sql; cada columna nueva necesita el suyo.
grant select (item_type, item_id, status, is_active, position,
              queue_id, queue_order, pinned_order)
  on public.diary_entries to anon, authenticated;

-- 9) La vista de reseñas gana las columnas nuevas (mismo WHERE de privacidad).
--    El literal 'diary_entries' de is_visible_via_club_share es la etiqueta
--    almacenada en las comparticiones de club: NO cambia aunque la tabla se
--    renombre después (dato, no nombre de tabla).
drop view if exists public.pass_reviews;
create view public.pass_reviews as
select
  d.id, d.library_entry_id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.diary_entries d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;
