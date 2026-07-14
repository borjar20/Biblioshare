-- El "pase" (una lectura, un visionado) pasa a ser el dueño de la nota y la
-- reseña.
--
-- Hasta ahora se podía puntuar en dos sitios (library_entries.rating, que daba
-- la media de la comunidad, y diary_entries.rating, que daba las reseñas) y
-- escribir texto en tres (library_entries.notes, progress_sessions.note y
-- diary_entries.review). Nadie sabía dónde iba cada cosa.
--
-- La tabla sigue llamándose diary_entries: nada la referencia por clave ajena,
-- pero renombrarla obligaría a tocar RLS, feed, notificaciones e interacciones
-- de reseña sin ganar nada funcional. En la app (src/lib/passes/) y en la
-- interfaz se habla de pases y de diario.

-- Las reseñas que YA existían en el diario eran públicas por definición: se
-- veían en la pestaña Comunidad. Esto va ANTES de los backfills a propósito:
-- así solo toca filas viejas y no hay que distinguirlas por su fecha de alta.
alter table public.diary_entries
  add column is_public boolean not null default false;

update public.diary_entries set is_public = true where review is not null;

alter table public.diary_entries
  alter column finished_on drop not null,
  add column edition_id uuid;

-- Un pase abierto (finished_on null) = "lo estoy leyendo ahora". Como mucho uno
-- por entrada, y esto lo garantiza la base de datos, no la app: los cambios de
-- estado pueden llegar en paralelo desde dos pestañas.
create unique index diary_entries_one_open_pass
  on public.diary_entries (library_entry_id) where finished_on is null;

alter table public.progress_sessions
  add column pass_id uuid references public.diary_entries(id) on delete cascade;

-- Backfill 1: pase CERRADO para las entradas completadas que aún no tienen
-- ninguno. Las que ya tienen diary_entries se quedan como están: ya son pases.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, coalesce(le.updated_at::date, current_date),
       le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status = 'completed'
  and not exists (select 1 from public.diary_entries d where d.library_entry_id = le.id);

-- Backfill 2: pase ABIERTO para lo que se está leyendo/viendo ahora mismo.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, null, le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status = 'in_progress'
  and not exists (
    select 1 from public.diary_entries d
    where d.library_entry_id = le.id and d.finished_on is null
  );

-- Backfill 3: las entradas planificadas o abandonadas con nota o notas no
-- encajan en ninguno de los dos anteriores, pero su nota no puede evaporarse.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, coalesce(le.updated_at::date, current_date),
       le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status in ('planned', 'dropped')
  and (le.rating is not null or nullif(le.notes, '') is not null)
  and not exists (select 1 from public.diary_entries d where d.library_entry_id = le.id);

-- Backfill 4: las sesiones existentes cuelgan del pase abierto de su entrada; y
-- si la entrada ya está cerrada, del pase cerrado más reciente.
update public.progress_sessions ps
set pass_id = coalesce(
  (select d.id from public.diary_entries d
   where d.library_entry_id = ps.library_entry_id and d.finished_on is null
   limit 1),
  (select d.id from public.diary_entries d
   where d.library_entry_id = ps.library_entry_id
   order by d.finished_on desc
   limit 1)
)
where ps.pass_id is null;

-- Las notas privadas migradas (library_entries.notes) son reseñas privadas: el
-- backfill ya las inserta con is_public = false. La columna vieja se queda
-- huérfana a propósito, para poder revertir sin pérdida; se limpiará después.

grant insert (library_entry_id, user_id, started_on, finished_on, rating, review, is_public, edition_id)
  on public.diary_entries to authenticated;
grant update (started_on, finished_on, rating, review, is_public, edition_id)
  on public.diary_entries to authenticated;
grant insert (library_entry_id, user_id, session_date, duration_minutes, position, note, pass_id)
  on public.progress_sessions to authenticated;
