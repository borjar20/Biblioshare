-- Avisos por persona (EPIC-05): categorías de evento por las que el follower
-- quiere aviso in-app + push del followee. Vacío = campana apagada.
-- La escritura la hace la app por service-role (la RLS de follows solo deja al
-- followee hacer UPDATE), así que NO se añade política de UPDATE para el follower.
alter table public.follows
  add column notify_events text[] not null default '{}';

comment on column public.follows.notify_events is
  'Categorías de evento del followee por las que el follower pidió aviso (finished|session|episode|added). Vacío = sin avisos. Escrito por service-role desde setFollowNotify.';
