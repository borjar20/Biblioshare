-- Colas múltiples nombradas (§7.22 ampliado).
--
-- Contexto: la cola era implícita —"todo lo planificado", ordenado por
-- library_entries.queue_order—. Ahora el usuario puede tener varias colas
-- nombradas y decidir en cuál guarda cada ítem. Modelo elegido: una cola por
-- ítem (columna FK), no una tabla M:N. Un ítem planificado con queue_id NULL es
-- legítimo: "planificado, sin cola asignada" (bucket "Sin cola" en la UI).

create table public.queues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index idx_queues_user on public.queues (user_id, position);

comment on table public.queues is 'Colas de prioridad nombradas por usuario (§7.22). Un library_entry planificado apunta a una vía queue_id (o a ninguna).';

-- Organización personal: solo el dueño ve/gestiona sus colas. No forma parte
-- de la vitrina pública del perfil, misma lógica que el dashboard de
-- estadísticas privado (§8-G). Por eso NO se replica el patrón de tablas
-- "públicas si is_public": una cola nunca es pública.
alter table public.queues enable row level security;

create policy "own queues select" on public.queues
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own queues insert" on public.queues
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own queues update" on public.queues
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own queues delete" on public.queues
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Pertenencia. on delete set null: borrar una cola no borra los ítems, solo los
-- devuelve al bucket "Sin cola".
alter table public.library_entries
  add column queue_id uuid references public.queues(id) on delete set null;

comment on column public.library_entries.queue_id is 'Cola a la que pertenece este ítem planificado (§7.22). NULL = planificado sin cola. Solo tiene sentido con status=planned; se limpia junto a queue_order al salir de planned.';

-- El orden ahora es denso 0..N-1 DENTRO de cada cola, no global. El índice
-- parcial pasa a incluir queue_id.
drop index if exists idx_library_entries_queue_order;
create index idx_library_entries_queue_order
  on public.library_entries (user_id, queue_id, queue_order)
  where status = 'planned';

-- Backfill: cada usuario con ítems planificados conserva su cola actual como
-- una cola llamada "Mi cola". Los ítems planificados apuntan a ella.
insert into public.queues (user_id, name, position)
select distinct user_id, 'Mi cola', 0
from public.library_entries
where status = 'planned';

update public.library_entries le
set queue_id = q.id
from public.queues q
where q.user_id = le.user_id
  and q.name = 'Mi cola'
  and le.status = 'planned'
  and le.queue_id is null;
