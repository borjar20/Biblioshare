-- Objetivos anuales por tipo de ítem + duración de episodio en el catálogo.
--
-- Contexto (§7.14 revisado): el objetivo anual era un único escalar global
-- (`annual_goal_items`), que mezclaba libros, películas y series. Se segrega en
-- tres, uno por tipo. Se mantienen como columnas de `profiles` —y no como una
-- tabla `user_goals` aparte— por coherencia con la decisión ya documentada en
-- §8-G: los objetivos son escalares del perfil, cubiertos por la RLS de
-- "editar tu perfil".
--
-- El objetivo DIARIO (`daily_goal_minutes`) no se segrega: pasa a significar
-- explícitamente minutos de LECTURA. Las películas no registran sesiones y las
-- series dejan de registrar minutos (ver más abajo), así que un objetivo de
-- minutos solo es medible sobre libros.

alter table public.profiles
  add column annual_goal_books integer,
  add column annual_goal_movies integer,
  add column annual_goal_series integer;

-- El valor global existente contaba ítems de cualquier tipo. No hay forma de
-- repartirlo entre los tres tipos, así que se conserva sobre libros (el caso de
-- uso dominante de la app) y los otros dos quedan sin objetivo. Es una
-- migración con pérdida de intención, no de datos: el usuario reajusta desde
-- /  (formulario de objetivos) si su meta era otra.
update public.profiles
  set annual_goal_books = annual_goal_items
  where annual_goal_items is not null;

alter table public.profiles drop column annual_goal_items;

comment on column public.profiles.daily_goal_minutes is 'Objetivo diario en minutos de LECTURA (solo sesiones de libro; §7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_books is 'Objetivo anual de libros completados (§7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_movies is 'Objetivo anual de películas completadas (§7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_series is 'Objetivo anual de series completadas (§7.14). NULL = sin objetivo.';

-- Duración media de episodio, de TMDB (`episode_run_time`). Sustituye a la
-- estimación de ritmo por sesiones para series (§7.22): las sesiones de serie
-- dejan de registrar minutos, así que la estimación de la cola pasa a ser
-- determinista —episodios × duración de episodio— igual que ya lo era la de
-- películas con `duration_minutes`. Se rellena con el mismo backfill perezoso
-- que `total_episodes` (src/lib/queue/backfill-queue-sizes.ts).
alter table public.series add column episode_runtime_minutes integer;

comment on column public.series.episode_runtime_minutes is 'Duración media de un episodio en minutos, de TMDB (episode_run_time). NULL = desconocida; se rellena con backfill perezoso al entrar en una cola.';
