-- issue #361: columna hito planned_on en passes.
-- Marca cuándo un pase ENTRÓ en la pila (estado planned). Solo captura datos
-- hacia delante: las server actions del pase-hub (planTransition) la fijan en
-- cada transición a planned. El historial ya importado nace como pases cerrados
-- que nunca pasaron por planned, así que se queda en NULL a propósito.
--
-- started_on ya existía (marca cuándo se empezó a leer/ver); esta migración solo
-- añade planned_on. Ver docs/requirements/data-model.md.
alter table public.passes add column if not exists planned_on date;

comment on column public.passes.planned_on is
  'Fecha en que el pase entró en la pila (estado planned). Solo forward-only: NULL para el historial importado. issue #361.';
