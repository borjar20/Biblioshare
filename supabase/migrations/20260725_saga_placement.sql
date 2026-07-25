-- Colocación y opcionalidad de un miembro de saga (spec 2026-07-25).
--
-- DOS EJES ORTOGONALES, y ésta es la confusión que la feature deshace:
--   placement = DÓNDE se lee (fijo | libre | null = sin clasificar)
--   optional  = si NO cuenta en el progreso
-- Una obra puede ser libre y contar (Nueva Primavera), o fija y no contar
-- (un spin-off con hueco propio que no quieres exigir).
--
-- `role` (issue #167) es un TERCER eje ya existente: qué ES la obra.
create type public.saga_placement as enum ('fijo', 'libre');

alter table public.saga_items
  add column placement public.saga_placement,
  add column optional boolean not null default false;

-- Backfill honesto: tener número ES estar colocado. A diferencia de `role`
-- (issue #167, sin backfill porque el rol es genuinamente desconocido), la
-- colocación de una obra numerada no lo es.
--
-- Las filas SIN position quedan en null = "sin clasificar", que es deuda de
-- curación visible, no una tercera semántica: entre ellas está «Antes de que
-- los Cuelguen», que es el libro 2 de La Primera Ley y está sin numerar por
-- descuido, hoy indistinguible de «Esquirla del Amanecer», que es un relato
-- sin hueco a propósito.
update public.saga_items set placement = 'fijo' where position is not null;

-- El CHECK va DESPUÉS del backfill: antes, las 342 filas con position y
-- placement null lo violarían.
alter table public.saga_items
  add constraint saga_items_placement_position check (
    (placement = 'fijo'  and position is not null) or
    (placement = 'libre' and position is null)     or
    (placement is null   and position is null)
  );

comment on column public.saga_items.placement is
  'Dónde se lee: fijo (tiene hueco) | libre (en varios momentos) | null (sin clasificar). Ortogonal a optional.';
comment on column public.saga_items.optional is
  'true = NO cuenta en el denominador del progreso. Ortogonal a placement y a role.';
