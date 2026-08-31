-- Fase 5 de Play (#931): partidas guardadas. Una fila por partida, log íntegro
-- en JSONB (sin tabla de eventos por filas hasta el multiplayer de fase 9).
-- Privada total: RLS por ownership, sin acceso anon ni lectura de terceros.
create table public.play_games (
  id uuid primary key,                    -- gameId del cliente (= committed[0].id)
  owner_id uuid not null references auth.users (id) on delete cascade,
  tool_id text not null,                  -- "mtg" | "score"; sin enum, las herramientas crecen
  started_at timestamptz not null,
  finished_at timestamptz not null,
  saved_at timestamptz not null,
  summary jsonb not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_games_owner_saved on public.play_games (owner_id, saved_at desc);

alter table public.play_games enable row level security;

create policy "play_games_select" on public.play_games
  for select using (owner_id = (select auth.uid()));
create policy "play_games_insert" on public.play_games
  for insert with check (owner_id = (select auth.uid()));
create policy "play_games_update" on public.play_games
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_games_delete" on public.play_games
  for delete using (owner_id = (select auth.uid()));

-- Grant de TABLA ENTERA a propósito (nada de grant fino por columna, #375).
grant select, insert, update, delete on public.play_games to authenticated;
