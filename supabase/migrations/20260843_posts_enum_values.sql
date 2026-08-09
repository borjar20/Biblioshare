-- ALTER TYPE ... ADD VALUE no puede ir en la misma transacción que consume el
-- valor (lección de 20260834_thoughts_enum_values.sql), por eso migración aparte.
alter type public.target_kind add value if not exists 'post';
alter type public.notification_type add value if not exists 'post_commented';
alter type public.notification_type add value if not exists 'post_liked';
