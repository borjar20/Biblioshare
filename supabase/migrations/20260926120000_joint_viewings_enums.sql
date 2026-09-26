-- Visionados conjuntos (#1220), paso 1 de 2: valores de enum.
--
-- Van en su propia migración porque Postgres no deja USAR un valor de enum en la
-- misma transacción que lo añade (`unsafe use of new value`), y la migración
-- siguiente los usa en funciones y en el índice parcial.
--
--   post_kind 'joint'                 — el post del visionado conjunto (uno por
--                                       visionado, lo publica la base al primer
--                                       «aceptar»; ver 20260926120100).
--   post_source_kind 'joint_viewing'  — su fuente: la fila de joint_viewings.
--   notification_type 'joint_viewing_invite'   — «X dice que visteis Y juntos».
--   notification_type 'joint_viewing_accepted' — «Z confirmó que visteis Y juntos».
alter type public.post_kind add value if not exists 'joint';
alter type public.post_source_kind add value if not exists 'joint_viewing';
alter type public.notification_type add value if not exists 'joint_viewing_invite';
alter type public.notification_type add value if not exists 'joint_viewing_accepted';
