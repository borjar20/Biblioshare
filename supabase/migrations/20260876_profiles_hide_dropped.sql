-- Preferencia de biblioteca: ocultar de las rejillas las obras abandonadas.
-- Spec: docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md
--
-- `not null default false` conserva el comportamiento de hoy: nadie se
-- encuentra media biblioteca escondida tras desplegar. Mismo patrón que
-- profiles.show_optional_readings (20260728).
--
-- Sin `grant` explícito A PROPÓSITO: `profiles` tiene grant de TABLA para anon
-- y authenticated (verificado en dev y prod el 2026-08-24), no `revoke all` +
-- grant por columna, así que la columna nueva lo hereda. Si algún día se
-- endurece a grants finos, esta columna necesitará el suyo (issue #375).
alter table public.profiles
  add column if not exists hide_dropped boolean not null default false;

comment on column public.profiles.hide_dropped is
  'Si true, las rejillas de biblioteca del usuario (y su perfil público) omiten las obras cuyo pase activo está en dropped. No afecta a /estadisticas ni al export CSV.';
