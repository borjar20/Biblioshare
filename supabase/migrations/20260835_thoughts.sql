-- Fase 2 «Pensamiento»: tabla thoughts + clase 'thought' de interaction_targets.
-- Espejo exacto del patrón de club_rounds/passes/progress_sessions (fuente
-- autoral personal, audiencia 'profile', trigger AFTER INSERT que materializa
-- el target canónico vía private.upsert_interaction_target).

create type public.thought_anchor_type as enum ('book', 'movie', 'series', 'saga', 'person');

create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anchor_type public.thought_anchor_type not null,
  anchor_id uuid not null,
  body text not null check (char_length(body) <= 2000 and char_length(btrim(body)) > 0),
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- anchor_id es polimórfico (books/movies/series/sagas/people): sin FK SQL,
-- igual renuncia pragmática que saga_items. La integridad la garantiza
-- createThought resolviendo el ancla antes del insert (Fase 4).
create index thoughts_user_id_created_at_idx on public.thoughts (user_id, created_at desc);
create index thoughts_anchor_idx on public.thoughts (anchor_type, anchor_id);

alter table public.thoughts enable row level security;

create policy "thoughts select visible" on public.thoughts for select
  using (public.can_view_profile(user_id));
create policy "thoughts insert own" on public.thoughts for insert
  with check ((select auth.uid()) = user_id);
create policy "thoughts update own" on public.thoughts for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "thoughts delete own" on public.thoughts for delete
  using ((select auth.uid()) = user_id);

create trigger thoughts_set_updated_at before update on public.thoughts
  for each row execute function public.set_updated_at();

-- Resolutor: mismo patrón que private.sync_club_round_interaction_target /
-- sync_pass_interaction_targets. href apunta a la ficha del ancla (un
-- pensamiento no tiene página propia, igual que progress_session usa la
-- página del item): /libro|/pelicula|/serie|/saga|/persona + id.
create or replace function private.sync_thought_interaction_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_href text;
begin
  v_href := (case new.anchor_type
    when 'book' then '/libro/'
    when 'movie' then '/pelicula/'
    when 'series' then '/serie/'
    when 'saga' then '/saga/'
    when 'person' then '/persona/'
  end) || new.anchor_id::text;

  perform private.upsert_interaction_target(
    'thought', new.id, new.user_id, 'profile', new.user_id,
    v_href, true, true, 'thought_commented', 'thought_liked');
  return new;
end;
$function$;

create trigger thoughts_sync_interaction_target
  after insert on public.thoughts
  for each row execute function private.sync_thought_interaction_target();

create trigger thoughts_cleanup_social_target
  after delete on public.thoughts
  for each row execute function private.cleanup_social_target('thought');

-- Grants por columna (#375, DRIFT-CHECK superficie 6): id/created_at/updated_at
-- generadas; user_id/anchor_type/anchor_id inmutables tras el insert.
revoke all on table public.thoughts from authenticated;
grant select (id, user_id, anchor_type, anchor_id, body, is_spoiler, created_at, updated_at)
  on public.thoughts to authenticated;
grant insert (user_id, anchor_type, anchor_id, body, is_spoiler)
  on public.thoughts to authenticated;
grant update (body, is_spoiler)
  on public.thoughts to authenticated;
grant delete on public.thoughts to authenticated;
