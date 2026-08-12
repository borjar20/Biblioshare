-- Progreso de N actividades de club en UNA consulta (spec 2026-08-12).
--
-- Por qué RPC y no lectura de cliente: el progreso COLECTIVO se calcula sobre
-- los `passes` y los checkpoint_reads de TODOS los participantes, y la RLS de
-- esas tablas no deja agregarlos desde el cliente. Por qué en lote: la pestaña
-- Actividades pinta una tarjeta por actividad en curso, y una llamada por
-- actividad es justo lo que hasta hoy impedía enseñar progreso ahí.
--
-- GATE: ser miembro activo del club (is_club_member). Es MÁS ANCHO que el de
-- get_list_challenge_progress (is_activity_participant) a propósito: la tarjeta
-- la ve todo el club y el número colectivo es lo que ayuda a decidir si unirse
-- -- el mismo criterio que ya rige los checkpoints, "visibles a todo el club
-- (no solo a participantes)". Lo que NO se ensancha es el detalle: aquí solo
-- salen CONTADORES, nunca quién ha completado qué, y viewer_done es siempre del
-- propio llamante.
--
-- criteria_challenge NO está aquí a propósito: su conteo no es una consulta
-- (criterio por género/saga sobre el catálogo) y vive en countForChallenge,
-- src/lib/challenges/match.ts. Reescribirlo en SQL sería un segundo motor de
-- conteo. La capa de app lo resuelve con el motor que ya existe.
create or replace function public.get_activities_progress(p_activity_ids uuid[])
returns table (
  activity_id uuid,
  kind text,
  collective_done int,
  collective_total int,
  viewer_done int,
  viewer_total int,
  participants int
)
language sql
stable
security definer
set search_path = public
as $$
  with visibles as (
    select ca.id, ca.kind::text as kind, ca.config
      from public.club_activities ca
     where ca.id = any(p_activity_ids)
       and ca.kind <> 'evento'
       and public.is_club_member(ca.club_id)
  ),
  roster as (
    select v.id,
           (select count(*)::int
              from public.club_activity_participants p
             where p.activity_id = v.id) as participants
      from visibles v
  ),

  -- ── buddy_read ────────────────────────────────────────────────────────────
  -- El colectivo es el "hito seguro del grupo" que ya calcula
  -- getActivityCheckpoints (checkpoints.ts:112): el MÍNIMO, entre participantes,
  -- del MÁXIMO order alcanzado por cada uno. `order` es 0-based (createCheckpoint
  -- lo asigna con `count ?? 0`), así que el contador es order + 1, y -1 (nadie
  -- ha llegado a nada) da 0. Se replica esa definición, no una parecida: dos
  -- números distintos con el mismo nombre en dos pantallas es una discrepancia
  -- que alguien acabará reportando como bug.
  buddy as (
    select v.id,
           (select count(*)::int
              from public.club_activity_checkpoints c
             where c.activity_id = v.id) as total,
           (select count(*)::int
              from public.club_activity_checkpoint_reads r
              join public.club_activity_checkpoints c on c.id = r.checkpoint_id
             where c.activity_id = v.id
               and r.user_id = auth.uid()) as viewer_done,
           coalesce((
             select min(per_user.max_order)
               from (
                 select coalesce(max(c."order"), -1) as max_order
                   from public.club_activity_participants p
                   left join public.club_activity_checkpoint_reads r
                     on r.user_id = p.user_id
                   left join public.club_activity_checkpoints c
                     on c.id = r.checkpoint_id
                    and c.activity_id = v.id
                  where p.activity_id = v.id
                  group by p.user_id
               ) per_user
           ), -1) as group_safe_order
      from visibles v
     where v.kind = 'buddy_read'
  ),

  -- ── list_challenge ────────────────────────────────────────────────────────
  -- Mismo criterio de "completado" que get_list_challenge_progress: en modo
  -- 'window', un pase terminado dentro de la ventana; en modo 'any', el pase
  -- activo y completado sin mirar fechas.
  list_done as (
    select v.id, p.user_id, i.item_type, i.item_id
      from visibles v
      cross join lateral public.activity_window(v.id) w
      join public.club_activity_participants p on p.activity_id = v.id
      join public.club_activity_items i on i.activity_id = v.id
      join public.passes d
        on d.user_id = p.user_id
       and d.item_type = i.item_type
       and d.item_id = i.item_id
     where v.kind = 'list_challenge'
       and (
         case when coalesce(v.config ->> 'completionMode', 'window') = 'any'
           then d.is_active and d.status = 'completed'
           else d.finished_on between w.window_start and w.window_end
         end
       )
     group by v.id, p.user_id, i.item_type, i.item_id
  ),
  list as (
    select v.id,
           (select count(*)::int
              from public.club_activity_items i
             where i.activity_id = v.id) as total,
           (select count(distinct (ld.item_type, ld.item_id))::int
              from list_done ld
             where ld.id = v.id) as collective_done,
           (select count(*)::int
              from list_done ld
             where ld.id = v.id
               and ld.user_id = auth.uid()) as viewer_done
      from visibles v
     where v.kind = 'list_challenge'
  ),

  -- ── tierlist ──────────────────────────────────────────────────────────────
  -- "Ya ha votado" = tiene al menos UNA colocación. Colocar un solo ítem no es
  -- terminar la tierlist, pero sí es haber empezado, que es lo que la tarjeta
  -- pregunta ("4 de 6 participantes han votado").
  tier as (
    select v.id,
           (select count(distinct pl.user_id)::int
              from public.club_activity_placements pl
             where pl.activity_id = v.id) as voters,
           (select case when exists (
                     select 1 from public.club_activity_placements pl
                      where pl.activity_id = v.id and pl.user_id = auth.uid()
                   ) then 1 else 0 end) as viewer_voted
      from visibles v
     where v.kind = 'tierlist'
  )

  select v.id,
         v.kind,
         case v.kind
           when 'buddy_read'     then greatest(b.group_safe_order + 1, 0)
           when 'list_challenge' then l.collective_done
           when 'tierlist'       then t.voters
           else 0
         end as collective_done,
         case v.kind
           when 'buddy_read'     then b.total
           when 'list_challenge' then l.total
           when 'tierlist'       then r.participants
           else 0
         end as collective_total,
         case v.kind
           when 'buddy_read'     then b.viewer_done
           when 'list_challenge' then l.viewer_done
           when 'tierlist'       then t.viewer_voted
           else 0
         end as viewer_done,
         case v.kind
           when 'buddy_read'     then b.total
           when 'list_challenge' then l.total
           when 'tierlist'       then 1
           else 0
         end as viewer_total,
         r.participants
    from visibles v
    join roster r on r.id = v.id
    left join buddy b on b.id = v.id
    left join list  l on l.id = v.id
    left join tier  t on t.id = v.id;
$$;

comment on function public.get_activities_progress(uuid[]) is
  'Progreso colectivo y del llamante de N actividades de club, en una consulta (spec 2026-08-12). Gate: miembro activo del club. Devuelve SOLO contadores agregados, nunca quién ha hecho qué. criteria_challenge queda fuera: su conteo vive en countForChallenge (match.ts) y no se duplica en SQL.';

revoke execute on function public.get_activities_progress(uuid[]) from public, anon;
grant execute on function public.get_activities_progress(uuid[]) to authenticated;
