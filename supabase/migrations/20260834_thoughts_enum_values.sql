-- Fase 2 «Pensamiento»: nuevos valores de enum, en su propia migración porque
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que consume
-- el valor nuevo (create table/trigger que lo referencian iría en la siguiente
-- migración/transacción).
alter type public.target_kind add value if not exists 'thought';
alter type public.notification_type add value if not exists 'thought_commented';
alter type public.notification_type add value if not exists 'thought_liked';
