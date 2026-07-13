-- EPIC-05 Bloque H4 — Reto por criterio (criteria_challenge). Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h4-criteria-challenge-design.md
--
-- Cuarto tipo del motor de actividades de club, y **primer consumidor real de
-- club_activities.config** -- el campo jsonb que SD-8 reservó y que ni H1 (buddy_read) ni H3
-- (list_challenge) llegaron a tocar. Cero tablas nuevas: el progreso es 100% derivado de
-- diary_entries, igual que en H3.


-- ── 1. La ventana deja de ser específica de un kind ──────────────────────────
--
-- list_challenge_window() (Bloque H3) calcula coalesce(starts_on, created_at) ..
-- coalesce(ends_on, hoy). H4 necesita exactamente la misma regla, así que se renombra a
-- activity_window() y la regla del coalesce sigue existiendo UNA SOLA VEZ (sin deriva).
-- H3 pasa a llamar al nombre nuevo (src/lib/clubs/activities/list-challenge.ts).
create or replace function public.activity_window(p_activity_id uuid)
returns table (window_start date, window_end date)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(starts_on, created_at::date), coalesce(ends_on, current_date)
    from public.club_activities
   where id = p_activity_id;
$$;

comment on function public.activity_window(uuid) is 'Ventana temporal efectiva de una actividad de club: coalesce(starts_on, created_at) .. coalesce(ends_on, hoy). Fuente única de la regla -- la usan get_list_challenge_progress (H3) y get_activity_diary_passes (H4).';

revoke execute on function public.activity_window(uuid) from public, anon;
grant execute on function public.activity_window(uuid) to authenticated;

-- get_list_challenge_progress (H3) referenciaba list_challenge_window por nombre: se recrea
-- apuntando al nombre nuevo. Cuerpo idéntico por lo demás.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, completed_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, i.item_type, i.item_id, min(d.finished_on) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.library_entries le
      on le.user_id = p.user_id
     and le.item_type = i.item_type
     and le.item_id = i.item_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end
   group by p.user_id, i.item_type, i.item_id;
$$;

drop function if exists public.list_challenge_window(uuid);


-- ── 2. La RPC lectora del tablero ────────────────────────────────────────────
--
-- SECURITY DEFINER a propósito, por la misma razón que en H3: la RLS de diary_entries/
-- library_entries pasa por can_view_profile(), así que un participante con PERFIL PRIVADO
-- sería invisible para sus compañeros y su fila del leaderboard saldría en 0 -- un falso
-- negativo silencioso. Esta función ES la política de lectura del tablero, y materializa Q5
-- ("unirte a una actividad = consentir compartir tu progreso DENTRO de ella").
--
-- DELIBERADAMENTE TONTA: solo LEE, no cuenta. El filtrado por tipo/género/saga y el conteo
-- se quedan en countForChallenge (src/lib/challenges/match.ts), el mismo motor ya testeado
-- que usa el reto personal (§7.10) -- sin duplicar el matcher en SQL, donde acabaría
-- separándose de la versión TS con el tiempo.
--
-- Escala: devuelve TODOS los pases de los participantes en la ventana, no solo los que casan
-- el criterio. A escala de club (decenas de participantes x decenas de pases) es trivial. Si
-- algún día se volviera caro, el camino de escalada es mover el filtro por item_type (el
-- único que no necesita joins de catálogo) al SQL -- no reescribir el matcher entero.
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, finished_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, le.item_type, le.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.library_entries le on le.user_id = p.user_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$$;

comment on function public.get_activity_diary_passes(uuid) is 'Pases de diario crudos de todos los participantes de un criteria_challenge, dentro de la ventana del reto (EPIC-05 Bloque H4). SECURITY DEFINER a propósito -- ES la política de lectura del tablero (los perfiles privados deben ser visibles a sus compañeros de actividad, Q5). Solo lee: el conteo por criterio vive en TS (countForChallenge).';

revoke execute on function public.get_activity_diary_passes(uuid) from public, anon;
grant execute on function public.get_activity_diary_passes(uuid) to authenticated;


-- ── 3. Escribir el criterio (config) ─────────────────────────────────────────
--
-- Bloque G NO dejó ninguna política UPDATE de cliente sobre club_activities ("las
-- transiciones de estado son RPC-only"), así que editar config tiene que ir por RPC, no por
-- un UPDATE gateado por RLS.
--
-- Dos condiciones, revalidadas en servidor:
--   (a) llamante = creador de la actividad O moderator+ del club;
--   (b) status = 'proposed'  -- el criterio se CONGELA al activar: si la meta cambiara a
--       mitad de reto, el progreso de todo el mundo se movería bajo sus pies.
create or replace function public.update_activity_config(p_activity_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_status public.activity_status;
begin
  select club_id, created_by, status
    into v_club_id, v_created_by, v_status
    from public.club_activities
   where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;

  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;

  if v_status <> 'proposed' then
    raise exception 'config_frozen';
  end if;

  update public.club_activities set config = p_config where id = p_activity_id;
end;
$$;

comment on function public.update_activity_config(uuid, jsonb) is 'Edita club_activities.config (EPIC-05 Bloque H4). Solo creador o moderator+, y solo mientras la actividad esté en proposed -- el criterio se congela al activar. RPC porque Bloque G no dejó política UPDATE de cliente sobre club_activities.';

revoke execute on function public.update_activity_config(uuid, jsonb) from public, anon;
grant execute on function public.update_activity_config(uuid, jsonb) to authenticated;
