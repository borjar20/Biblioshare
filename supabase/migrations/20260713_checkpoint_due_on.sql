-- Fecha objetivo del hito (rediseño de clubes · Paper).
--
-- El feed del club muestra un calendario de "próximos hitos" con fecha ("18 jul
-- · Hito 4 · pág 420"), y hasta ahora un hito solo tenía etiqueta y posición.
-- La posición dice DÓNDE está el hito en la obra; la fecha dice CUÁNDO se
-- espera llegar. Son cosas distintas y el club necesita las dos para
-- calendarizar una lectura conjunta.
--
-- Nullable a propósito: los hitos que ya existen no tienen fecha, y una lectura
-- sin calendario (a ritmo libre) sigue siendo válida.
alter table public.club_activity_checkpoints
  add column due_on date;

comment on column public.club_activity_checkpoints.due_on is
  'Fecha en la que se espera alcanzar el hito. Nullable: una lectura conjunta puede ir a ritmo libre, sin calendario. Alimenta el bloque "próximos hitos" del feed del club.';

-- El feed pide los hitos con fecha más próximos de las actividades activas de
-- un club: se filtra por due_on y se ordena por due_on.
create index idx_checkpoints_due_on
  on public.club_activity_checkpoints (activity_id, due_on)
  where due_on is not null;
