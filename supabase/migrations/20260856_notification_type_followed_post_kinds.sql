-- Tres tipos nuevos de aviso de seguimiento, uno por post.kind que hoy no tiene
-- el suyo (spec 2026-08-13). Los avisos followed_* pasan a emitirse al PUBLICAR
-- un post, no al ocurrir el hecho, y el tipo decide el TEXTO de la campana: por
-- eso hace falta uno por kind y no uno por categoria de suscripcion.
--
-- Los tres que ya existen se reutilizan tal cual:
--   post.kind 'finished'   -> followed_finished
--   post.kind 'progressed' -> followed_session
--   post.kind 'watched'    -> followed_episode
--
-- followed_added NO se borra: deja de emitirse (anadir a biblioteca no publica
-- post y no lo hara), pero hay filas vivas en notifications que lo usan y
-- quitar un valor de un enum con filas que lo referencian no compensa aqui.

alter type public.notification_type add value if not exists 'followed_started';
alter type public.notification_type add value if not exists 'followed_dropped';
alter type public.notification_type add value if not exists 'followed_thought';
