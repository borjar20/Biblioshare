-- Logros por familias (spec 2026-09-02-mascota-logros-niveles §2). Las claves
-- planas de la fase 2 (pet_achievement:finished_10…) pasan a familia:nivel.
-- Los primeros pasos de cada escalera coinciden con los umbrales viejos, así
-- que ninguna fecha se pierde ni nada se vuelve a animar. Aditiva sobre datos:
-- no toca esquema ni grants.
--
-- Idempotente frente a un replay tardío: si el usuario YA tiene la clave nueva
-- (la app con familias escribió antes de aplicar esto), renombrar la vieja
-- chocaría con el UNIQUE (user_id, event_type, event_key). Se borra primero la
-- vieja cuyo destino exista.
--
-- La fila que sobrevive (la nueva, familia:nivel) es la POSTERIOR: la escribió
-- la app cuando ya usaba claves de familia, DESPUÉS de la fecha real de
-- desbloqueo que quedó en la vieja. Sin este update, al borrar la vieja sin
-- más, el first_triggered_at de la superviviente se queda con esa fecha
-- posterior y la fecha de desbloqueo SE ADELANTA (avanza respecto a la real).
update public.user_celebrations n
set first_triggered_at = least(n.first_triggered_at, o.first_triggered_at),
    displayed_at = case
      when n.displayed_at is null and o.displayed_at is not null then o.displayed_at
      else n.displayed_at
    end
from public.user_celebrations o,
  (values
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
where n.event_type = 'pet_achievement'
  and n.event_key = 'pet_achievement:' || m.new_key
  and o.event_type = 'pet_achievement'
  and o.user_id = n.user_id
  and o.event_key = 'pet_achievement:' || m.old_key;

delete from public.user_celebrations c
using (values
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
  and c.event_key = 'pet_achievement:' || m.old_key
  and exists (
    select 1 from public.user_celebrations n
    where n.user_id = c.user_id
      and n.event_type = 'pet_achievement'
      and n.event_key = 'pet_achievement:' || m.new_key
  );

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
