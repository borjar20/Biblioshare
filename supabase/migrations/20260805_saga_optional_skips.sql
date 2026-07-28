-- Fase 4 del timeline con los cuatro estados (spec 2026-07-28): las opcionales
-- se pueden saltar, y el lector decide si quiere verlas.
--
-- Las dos piezas viajan en la MISMA migración porque son la misma decisión: sin
-- la tabla, el interruptor solo sabe esconderlas todas o ninguna; sin el
-- interruptor, saltarlas de una en una es la única forma de quitarlas de en
-- medio. Separarlas dejaría media feature desplegada.
--
-- LO QUE ESTO NO ES: un cambio del progreso. Saltar es SOLO VISUAL. El
-- denominador lo gobierna `countedKeys` (src/lib/sagas/progress.ts) desde
-- `saga_items.optional`, y esta tabla no entra ahí. Es el límite duro de la
-- spec: reabrir el denominador es la familia de fallo del #91 y el #185.

-- Clon de saga_route_choices (20260723_saga_routes.sql): preferencia PERSONAL,
-- RLS solo-dueño y SIN gate de rol. No es curación — cualquier lector puede
-- saltarse una opcional en una saga que él no cura.
--
-- `saga_id` es la saga DUEÑA de la fila de `saga_items` (DetailMember.ownerSagaId),
-- no la ficha desde la que se pulsa: así el mismo salto se ve igual desde la
-- ficha del universo y desde la de la subsaga.
--
-- Sin FK contra `saga_items`: la PK de esa tabla es (saga_id, item_type,
-- item_id) y una FK compuesta ataría el salto al ciclo de vida de la curación,
-- de modo que retirar un miembro y volver a añadirlo borraría en silencio la
-- preferencia del lector. Un salto huérfano es INERTE: `deriveSagaMap` solo
-- marca nodos que existen, así que no se pinta en ninguna parte.
create table public.saga_optional_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  saga_id uuid not null references public.sagas (id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id, item_type, item_id)
);

alter table public.saga_optional_skips enable row level security;

create policy "saga optional skips own" on public.saga_optional_skips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Preferencia global del lector, mismo patrón que profiles.daily_goal_minutes.
-- NOT NULL con default true a propósito: el estado por defecto es VER las
-- opcionales, y con NOT NULL ningún perfil existente queda en un `null` que
-- cada lectura tendría que interpretar.
alter table public.profiles
  add column show_optional_readings boolean not null default true;
