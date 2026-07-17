-- Fusión de las metas anuales en retos (plan 05, P6).
--
-- Antes: profiles.annual_goal_{books,movies,series} guardaban la meta anual por
-- tipo, un modelo aparte de los retos (challenges) pese a significar lo mismo
-- ("N ítems completados de este tipo en el año"). Ahora hay un solo modelo: cada
-- meta > 0 se convierte en un reto del año natural en curso (item_type fijado,
-- criterio vacío, target = la meta) y las tres columnas se eliminan.
--
-- El progreso se conserva: un reto item_type='book', criteria={}, rango = el año
-- cuenta exactamente lo que contaba BookGoalCard (ver src/lib/challenges/match.ts
-- y annual-goals.ts, que deriva la meta por tipo del reto correspondiente).
--
-- ⚠️ Migración DESTRUCTIVA (DROP COLUMN). Aplicada primero en dev y verificada
-- (recuento antes/después) antes de prod.

-- 1) Data migration: cada meta > 0 → un reto del año en curso.
insert into public.challenges
  (user_id, name, item_type, target_count, criteria, start_date, end_date)
select
  user_id,
  annual_goal_books
    || case when annual_goal_books = 1 then ' libro en 2026' else ' libros en 2026' end,
  'book'::item_type, annual_goal_books, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_books is not null and annual_goal_books > 0
union all
select
  user_id,
  annual_goal_movies
    || case when annual_goal_movies = 1 then ' pelicula en 2026' else ' peliculas en 2026' end,
  'movie'::item_type, annual_goal_movies, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_movies is not null and annual_goal_movies > 0
union all
select
  user_id,
  annual_goal_series
    || case when annual_goal_series = 1 then ' serie en 2026' else ' series en 2026' end,
  'series'::item_type, annual_goal_series, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_series is not null and annual_goal_series > 0;

-- 2) Retirar las columnas: el modelo único son los retos.
alter table public.profiles
  drop column annual_goal_books,
  drop column annual_goal_movies,
  drop column annual_goal_series;
