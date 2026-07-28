-- Metadatos del HUECO compartido (spec 2026-07-28, fase 2). Lo que esta tabla
-- NO hace: decir quién está en el tándem. Eso lo dice —y lo seguirá diciendo—
-- el empate de `position` en `saga_items`. Aquí solo se guarda QUÉ CLASE de
-- tándem es ese hueco y por qué.
--
-- ⚠️ Descartado a sabiendas: `tandem_id` en `saga_items`. Daría identidad
-- estable, pero deja DOS fuentes de verdad sobre la pertenencia (mismo
-- `position` y mismo `tandem_id`) que pueden contradecirse, y ningún CHECK
-- puede atarlas porque cruzan filas. Es la familia del #91, el #185 y el #203.
-- Si alguna vez se propone, hay que decirlo en voz alta.
create type public.saga_tandem_mode as enum ('simultaneo', 'indistinto');

create table public.saga_tandems (
  saga_id uuid not null references public.sagas(id) on delete cascade,
  -- El hueco. No hay FK posible contra `saga_items` (la pertenencia es un
  -- empate entre N filas, no una fila), y por eso el RPC es el único que
  -- escribe aquí: reescribe la secuencia y estos metadatos en la MISMA
  -- transacción, así que renumerar no puede dejar la fila apuntando a un hueco
  -- que ya no existe.
  position integer not null,
  modo public.saga_tandem_mode,
  nota text,
  created_at timestamptz not null default now(),
  primary key (saga_id, position),
  -- Una fila que no dice NADA no debe existir: es ruido que sobrevive a
  -- renumeraciones y confunde al siguiente que mire la tabla.
  constraint saga_tandems_says_something check (modo is not null or nota is not null),
  -- La nota es una línea, no un ensayo: la fila del timeline la pinta entera.
  constraint saga_tandems_nota_len check (nota is null or char_length(nota) <= 200)
);

create index saga_tandems_saga_idx on public.saga_tandems (saga_id);

alter table public.saga_tandems enable row level security;

-- Forma calcada de `saga_placement_windows` (20260727_saga_placement_windows.sql):
-- lectura pública para anon+authenticated, escritura solo para collaborator+.
create policy "saga tandems readable by all" on public.saga_tandems
  for select to anon, authenticated using (true);
create policy "saga tandems writable by collaborators" on public.saga_tandems
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
