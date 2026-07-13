-- EPIC-05 Bloque H2 — Tierlist de club. Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h2-tierlist-design.md
--
-- Cuarto y último tipo de actividad de club: cierra el Bloque H.
--
-- Es el ÚNICO tipo del bloque con tabla nueva -- y precisamente por eso es el único que NO
-- necesita ninguna función SECURITY DEFINER. H3 y H4 la necesitaron porque leían
-- diary_entries/library_entries, cuya RLS pasa por can_view_profile(): un participante con
-- perfil privado habría salido vacío para sus compañeros (falso negativo silencioso). Aquí la
-- colocación vive en tabla propia, así que basta acotar su RLS con is_activity_participant()
-- -- el patrón exacto de club_activity_opinions (Bloque G).
--
-- Los tiers viven en club_activities.config (segundo consumidor de ese campo, tras H4) y se
-- congelan al activar reutilizando la RPC update_activity_config, sin cambios.


-- ── 1. Las colocaciones ──────────────────────────────────────────────────────
create table public.club_activity_placements (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  tier text not null,          -- la ETIQUETA del tier ("S"), no un índice: config es opaco a
                                -- SQL, así que la BD no puede validar contra la lista de tiers.
                                -- Lo valida la app al escribir, y al leer una colocación con un
                                -- tier desconocido se trata como "sin colocar" -- ningún dato
                                -- raro puede romper el tablero.
  position smallint not null,  -- orden dentro de la fila del tier
  created_at timestamptz not null default now(),
  -- La PK compuesta ES la unicidad que pedía el backlog: una colocación por ítem y persona.
  primary key (activity_id, user_id, item_type, item_id)
);

create index idx_club_activity_placements_activity on public.club_activity_placements (activity_id);

comment on table public.club_activity_placements is 'Colocación de cada participante en la tierlist de una actividad (EPIC-05 Bloque H2). Una fila por (actividad, persona, ítem). Visible entre participantes; cada cual solo escribe las suyas. Sin SECURITY DEFINER: al ser tabla propia no hay que saltarse la RLS de perfil, a diferencia de H3/H4.';

alter table public.club_activity_placements enable row level security;

-- Todos los participantes ven las tierlists de todos -- la gracia del bloque es comparar y
-- discutir (mismo criterio que club_activity_opinions, Bloque G).
create policy "club_activity_placements select participant" on public.club_activity_placements
  for select to authenticated
  using (public.is_activity_participant(activity_id));

-- Pero cada cual solo escribe LA SUYA. El caso de riesgo de este bloque es colar el user_id
-- de otro: el `with check` lo corta.
create policy "club_activity_placements insert own" on public.club_activity_placements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

create policy "club_activity_placements update own" on public.club_activity_placements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "club_activity_placements delete own" on public.club_activity_placements
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ── 2. El gate de curación del pool se extiende a tierlist ───────────────────
--
-- El pool ES el enunciado de la tierlist: si cualquier participante lo hace crecer a mitad,
-- las tierlists ya hechas quedan incompletas y hay que volver a colocar. Mismo razonamiento
-- que el reto por lista (H3).
--
-- La política que escribió H3 es kind-scoped ("when ca.kind = 'list_challenge' then ... else
-- is_activity_participant"), así que hay que REESCRIBIRLA para meter tierlist en la rama de
-- curadores. El resto de kinds (buddy_read, criteria_challenge) conserva la semántica de G.
--
-- Recordatorio de por qué es RLS y no un trigger (ver H3): un trigger solo puede RECHAZAR lo
-- que la RLS ya dejó pasar, nunca RELAJAR -- y aquí hace falta relajar, porque la condición de
-- G exige is_activity_participant() y solo puedes unirte a una actividad ya 'active'; sin esta
-- rama, quien propone no podría curar su propio pool en 'proposed'.

drop policy "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and case
          when ca.kind in ('list_challenge', 'tierlist') then
            ca.created_by = (select auth.uid())
            or public.has_min_club_role(ca.club_id, 'moderator')
          else public.is_activity_participant(ca.id)
        end
    )
  );

drop policy "club_activity_items delete own or moderate or curator" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind in ('list_challenge', 'tierlist') and ca.created_by = (select auth.uid()))
        )
    )
  );
