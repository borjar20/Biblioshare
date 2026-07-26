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
--
-- OJO con el `OR` de tres ramas de la primera versión de este CHECK (rev.
-- inicial de este mismo fichero): con `placement IS NULL`, las dos primeras
-- ramas valen NULL (comparar con NULL da NULL, no FALSE) y la tercera vale
-- FALSE, así que el `OR` entero sale NULL — y un CHECK solo rechaza FALSE, así
-- que la fila (`placement=NULL`, `position=7`) PASABA, cuando el invariante
-- declarado es «sin clasificar nunca lleva número». Encontrado en el review
-- final de la rama (dev ya tenía una fila así). El CASE de abajo no tiene ese
-- agujero: con `placement=NULL` la condición del WHEN también da NULL, pero
-- CASE trata un WHEN que no da TRUE (NULL incluido) como "no es esta rama" y
-- cae al ELSE — no hay tercera rama redundante que enmascare el problema.
alter table public.saga_items
  add constraint saga_items_placement_position check (
    case when placement = 'fijo' then position is not null else position is null end
  );

comment on column public.saga_items.placement is
  'Dónde se lee: fijo (tiene hueco) | libre (en varios momentos) | null (sin clasificar). Ortogonal a optional.';
comment on column public.saga_items.optional is
  'true = NO cuenta en el denominador del progreso. Ortogonal a placement y a role.';
