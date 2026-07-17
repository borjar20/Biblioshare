-- Memorizar: notas y citas (plan 05, P7).
--
-- Hasta ahora una nota vivía suelta en dos sitios: progress_sessions.note (la
-- nota de una sesión, con su página en `position`) y library_entries.notes (una
-- nota de biblioteca sin sesión). Memorizar las unifica en una entidad propia,
-- privada, que además distingue nota de CITA y permite marcarla favorita.
--
-- Las columnas viejas se DEJAN en su sitio esta fase (el código lee de `notes`,
-- no las borra); se retiran en una limpieza posterior cuando la migración esté
-- verificada en prod.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  -- Opcionales: una cita puede venir de una sesión (libro) o no (una película
  -- no tiene sesión). Si el pase/sesión se borra, la nota sobrevive huérfana.
  pass_id uuid references public.passes(id) on delete set null,
  session_id uuid references public.progress_sessions(id) on delete set null,
  kind text not null check (kind in ('note', 'quote')),
  body text not null check (char_length(body) between 1 and 5000),
  -- Página / posición, mismo formato jsonb que progress_sessions.position.
  position jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notes_user on public.notes (user_id, created_at desc);

comment on table public.notes is 'Notas y citas de Memorizar (§P7). Privadas: solo el dueño, como challenges/queues.';

-- Privada, solo el dueño (mismo patrón que challenges).
alter table public.notes enable row level security;

create policy "own notes select" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notes insert" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own notes update" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own notes delete" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ── Migración de datos ───────────────────────────────────────────────────────

-- Notas de sesión: llevan su sesión y su página (position). El tipo y la obra
-- salen del pase.
insert into public.notes
  (user_id, item_type, item_id, pass_id, session_id, kind, body, position, created_at)
select ps.user_id, p.item_type, p.item_id, ps.pass_id, ps.id, 'note',
       ps.note, ps.position, ps.created_at
from public.progress_sessions ps
join public.passes p on p.id = ps.pass_id
where ps.note is not null and btrim(ps.note) <> '';

-- Notas de biblioteca: sin sesión ni pase; la obra sale de la propia entrada.
insert into public.notes
  (user_id, item_type, item_id, kind, body, created_at)
select le.user_id, le.item_type, le.item_id, 'note', le.notes, le.created_at
from public.library_entries le
where le.notes is not null and btrim(le.notes) <> '';
