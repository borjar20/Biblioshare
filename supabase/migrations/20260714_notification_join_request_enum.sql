-- La migración que faltaba: los valores de notificación de las solicitudes de
-- entrada a un club.
--
-- `notify_club_join_request` (20260714_club_is_private_helper.sql) inserta una
-- notificación de tipo 'club_join_request', y `approve_club_join_request` una de
-- 'club_join_approved'. Pero NINGUNA migración del repo añadió esos dos valores
-- al enum `notification_type`: aparecieron a mano en dev, y producción se quedó
-- sin ellos. Resultado: en producción, solicitar entrada a un club privado
-- fallaba al notificar a los moderadores (invalid input value for enum), y el
-- typecheck de cualquier rama que regenerase los tipos desde prod se caía.
--
-- `add value if not exists` para que sea idempotente allí donde ya se metieron a
-- mano. Los valores de enum no se pueden añadir y usar en la misma transacción,
-- pero aquí solo se añaden: quien los consume ya está creado.
alter type public.notification_type add value if not exists 'club_join_request';
alter type public.notification_type add value if not exists 'club_join_approved';
