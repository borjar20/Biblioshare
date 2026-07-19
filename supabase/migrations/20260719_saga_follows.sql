-- Sagas v2 fase 1 (spec §1.4): seguimiento explícito de sagas. Alimenta el
-- botón «Seguir esta saga» del hero (fase 1) y la pestaña Sagas de Mi
-- Biblioteca (fase 4). RLS solo-dueño, patrón collections.

create table public.saga_follows (
  user_id    uuid not null references auth.users(id) on delete cascade,
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id)
);
create index saga_follows_saga_idx on public.saga_follows (saga_id);

alter table public.saga_follows enable row level security;
create policy saga_follows_owner on public.saga_follows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
