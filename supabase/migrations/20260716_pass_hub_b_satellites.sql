-- Las sesiones pasan a colgar SOLO del pase; los episodios vistos ganan
-- pass_id para que el cursor de serie sea por pase (revisionados con cursor
-- propio). pass_id null en episode_watches = visto en la era pre-pases o de
-- una serie ya quitada de la biblioteca: cuenta para "visto alguna vez",
-- no para el cursor de ningún pase.

-- 1) Sesiones huérfanas de pase → al pase activo de su entrada.
update public.progress_sessions s
set pass_id = d.id
from public.diary_entries d
where s.pass_id is null
  and d.library_entry_id = s.library_entry_id
  and d.is_active;

alter table public.progress_sessions alter column pass_id set not null;

-- 2) Episodios vistos → al pase activo de esa serie para ese usuario.
alter table public.episode_watches
  add column if not exists pass_id uuid references public.diary_entries(id) on delete cascade;

update public.episode_watches w
set pass_id = d.id
from public.diary_entries d
where w.pass_id is null
  and d.user_id = w.user_id
  and d.item_type = 'series'
  and d.item_id = w.series_id
  and d.is_active;

create index if not exists episode_watches_by_pass
  on public.episode_watches (pass_id);
