-- Tipos de notificación de "avisos por persona". Dirección "ampliar" (inofensiva):
-- el bundle viejo no los conoce y no rompe. Aparte de cualquier uso porque un
-- valor de enum nuevo no se puede usar en la misma transacción.
alter type public.notification_type add value if not exists 'followed_finished';
alter type public.notification_type add value if not exists 'followed_session';
alter type public.notification_type add value if not exists 'followed_episode';
alter type public.notification_type add value if not exists 'followed_added';
