-- Fase 6 de Play (#931): jugadores habituales — personas persistentes del
-- entorno del usuario, sin cuenta Biblioshare. Privada total por RLS.
-- linked_user_id queda listo para la vinculación futura (acción explícita,
-- jamás matching automático); NINGUNA lógica lo lee todavía.
create table public.play_players (
  id uuid primary key,                    -- generado en cliente (crypto.randomUUID)
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_players_owner on public.play_players (owner_id);

alter table public.play_players enable row level security;

create policy "play_players_select" on public.play_players
  for select using (owner_id = (select auth.uid()));
create policy "play_players_insert" on public.play_players
  for insert with check (owner_id = (select auth.uid()));
create policy "play_players_update" on public.play_players
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_players_delete" on public.play_players
  for delete using (owner_id = (select auth.uid()));

-- Grant de TABLA ENTERA a propósito (nada de grant fino por columna, #375).
grant select, insert, update, delete on public.play_players to authenticated;
