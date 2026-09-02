-- Logros por familias (spec 2026-09-02-mascota-logros-niveles §2). Las claves
-- planas de la fase 2 (pet_achievement:finished_10…) pasan a familia:nivel.
-- Los primeros pasos de cada escalera coinciden con los umbrales viejos, así
-- que ninguna fecha se pierde ni nada se vuelve a animar. Aditiva sobre datos:
-- no toca esquema ni grants.
update public.user_celebrations c
set event_key = 'pet_achievement:' || m.new_key,
    payload = c.payload || jsonb_build_object('key', m.new_key)
from (values
  ('finished_10', 'finished:1'),
  ('finished_50', 'finished:2'),
  ('finished_100', 'finished:3'),
  ('sessions_100', 'sessions:1'),
  ('episodes_100', 'episodes:1'),
  ('notes_50', 'notes:1'),
  ('reviews_10', 'reviews:1'),
  ('genres_10', 'genres:1'),
  ('streak_30', 'streak:1'),
  ('streak_100', 'streak:2'),
  ('posts_50', 'posts:1'),
  ('sagas_3', 'sagas:1'),
  ('missions_50', 'missions:1'),
  ('adult', 'stage:1'),
  ('veteran', 'stage:2')
) as m(old_key, new_key)
where c.event_type = 'pet_achievement'
  and c.event_key = 'pet_achievement:' || m.old_key;
