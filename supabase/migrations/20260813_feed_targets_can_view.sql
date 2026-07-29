-- can_view_target gana dos ramas: pass y progress_session (feed agrupado
-- 2026-07-29). Ambas delegan en can_view_profile del dueño, igual que
-- diary_entry/episode_watch. progress_sessions tiene user_id propio, así que no
-- necesita join al pase. Las 6 ramas previas se preservan VERBATIM de la
-- definición viva (no del baseline): diary_entry ya lee de `passes` (tabla
-- renombrada), existe la rama `club_activity`, y el search_path incluye
-- `pg_temp` (20260808_secdef_search_path_pg_temp).
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
    when 'club_activity' then public.is_activity_participant(p_target_id)
    when 'pass' then exists (
      select 1 from public.passes p where p.id = p_target_id and public.can_view_profile(p.user_id)
    )
    when 'progress_session' then exists (
      select 1 from public.progress_sessions s where s.id = p_target_id and public.can_view_profile(s.user_id)
    )
  end;
$function$;
