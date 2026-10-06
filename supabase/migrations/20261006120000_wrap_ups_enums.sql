-- Wrap-ups (spec 2026-10-06). Enums en su propia transacción: Postgres no deja
-- usar un valor recién añadido en la misma transacción que lo crea.
create type public.wrap_up_kind as enum ('week', 'month', 'year');
alter type public.post_kind add value if not exists 'wrap_up';
alter type public.post_source_kind add value if not exists 'wrap_up_share';
alter type public.post_anchor_type add value if not exists 'wrap_up';
