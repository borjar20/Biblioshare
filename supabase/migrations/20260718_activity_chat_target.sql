-- Chat general de actividad (cambios de actividades, 2026-07-18): las actividades
-- se vuelven comentables/reaccionables reutilizando el sistema de interacciones
-- (Bloque B/F), con un target nuevo. Gateado a participantes -- espejo de
-- 'activity_checkpoint' pero por actividad entera, sin el spoiler-guard por hito.
-- La lectura con hitos NO usa este chat (conserva sus chats por checkpoint); el
-- gateo aquí es solo is_activity_participant, sin has_reached_checkpoint.

alter type public.target_kind add value 'club_activity';

-- Postgres (55P04): el valor nuevo debe estar COMMITted antes de poder usarse
-- como literal en can_view_target() de abajo. Mismo idiom que
-- 20260713_activity_checkpoints.sql (commit sin BEGIN explícito; Postgres reabre
-- una transacción implícita para el resto del script).
commit;

-- can_view_target() gana una rama. Las 5 ramas existentes se preservan VERBATIM
-- desde su definición VIGENTE en 20260717_pass_hub_c_rename.sql -- OJO: tras el
-- hub, la rama 'diary_entry' apunta a public.passes (NO a diary_entries, que se
-- renombró). Copiar de 20260713 aquí revertiría ese rename y rompería las
-- interacciones de diario. Solo se añade la rama 'club_activity'.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
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
  end;
$$;
