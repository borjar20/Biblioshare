-- La ronda: latido semanal de un club. Spec:
-- docs/superpowers/specs/2026-08-03-club-rondas-design.md
--
-- Tabla propia y NO un sexto `kind` de club_activities, a propósito y contra
-- SD-8: una ronda no se propone a moderación, no tiene ciclo de vida y no
-- tiene participación opt-in -- solo comparte la superficie de discusión, y esa
-- vive en interaction_targets desde la fase 1 social. Ver §1 de la spec.

alter type public.target_kind       add value if not exists 'club_round';
alter type public.notification_type add value if not exists 'club_round_proposed';
alter type public.notification_type add value if not exists 'club_round_commented';
alter type public.notification_type add value if not exists 'club_round_liked';

-- Postgres prohíbe USAR una etiqueta de enum en la misma transacción que la
-- crea: sin este commit, el trigger de más abajo que menciona 'club_round'
-- hace fallar la migración entera. Misma trampa que 20260712_club_posts.sql.
commit;

create table public.club_rounds (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  period_key text not null,
  -- NULL = consigna de la casa. `on delete set null` a propósito: con cascade
  -- se perdería la conversación del club al borrarse una cuenta, y sin acción
  -- explícita la cuenta no se podría borrar.
  author_id  uuid references auth.users(id) on delete set null,
  prompt     text not null,
  -- Par (tipo, id) sin FK, igual que club_activity_items: el catálogo no es
  -- una sola tabla.
  item_type  public.item_type,
  item_id    uuid,
  created_at timestamptz not null default now(),
  unique (club_id, period_key),
  constraint club_rounds_prompt_len check (char_length(prompt) between 1 and 500),
  constraint club_rounds_item_pair check (num_nonnulls(item_type, item_id) <> 1)
);

create index idx_club_rounds_club on public.club_rounds (club_id, created_at desc);

comment on table public.club_rounds is
  'Rondas semanales de club (La ronda). author_id NULL = consigna de la casa. La escritura pasa SOLO por ensure_club_round(); no hay política INSERT.';

alter table public.club_rounds enable row level security;

-- Contenido siempre solo-miembros, con independencia de clubs.visibility (SD-4).
create policy "club rounds select members" on public.club_rounds
  for select to authenticated
  using (public.is_club_member(club_id));

-- Una consigna abusiva se queda una semana entera en lo alto del club.
create policy "club rounds delete moderators" on public.club_rounds
  for delete to authenticated
  using (public.has_min_club_role(club_id, 'moderator'));

-- Sin política INSERT ni UPDATE, a propósito: el único camino de escritura es
-- ensure_club_round() (SECURITY DEFINER), y una ronda es inmutable -- sus
-- respuestas contestan a ESA pregunta.

grant select, delete on table public.club_rounds to authenticated;

-- ── Registro canónico de interacción ─────────────────────────────────
create or replace function private.sync_club_round_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_slug text; v_club_owner uuid;
begin
  select c.slug, c.owner_id into v_slug, v_club_owner
  from public.clubs c where c.id = new.club_id;
  perform private.upsert_interaction_target(
    'club_round', new.id,
    -- La casa no es un usuario, y owner_id es NOT NULL.
    coalesce(new.author_id, v_club_owner),
    'club_member', new.club_id,
    '/club/' || v_slug || '?ronda=' || new.period_key,
    true, true, 'club_round_commented', 'club_round_liked');
  return new;
end;
$function$;
revoke execute on function private.sync_club_round_interaction_target() from public, anon, authenticated;

create trigger club_rounds_sync_interaction_target
  after insert on public.club_rounds
  for each row execute function private.sync_club_round_interaction_target();

-- cleanup_social_target() es genérico y toma los kinds por trigger args: cierra
-- los reportes pendientes y barre target, comentarios, reacciones y avisos.
create trigger club_rounds_cleanup_social_target
  after delete on public.club_rounds
  for each row execute function private.cleanup_social_target('club_round');
