-- Fase «Pensamiento» follow-up (#525): permite borrar un thought a su autor
-- O a un admin global. `private.can_moderate_target('thought', id)` ya
-- resuelve admin + club-moderator; le falta la rama de dueño porque
-- `social_target_owner_id` no conocía 'thought' todavía -- la audiencia de un
-- thought es 'profile' (sin club), así que una vez añadida esta rama
-- can_moderate_target('thought', …) = autor OR admin, que es justo la regla
-- pedida.

create or replace function private.social_target_owner_id(p_target_type target_kind, p_target_id uuid)
returns uuid
language sql
stable security definer
set search_path to ''
as $function$
  select case p_target_type
    when 'diary_entry' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'pass' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'episode_watch' then (select e.user_id from public.episode_watches e where e.id = p_target_id)
    when 'progress_session' then (select s.user_id from public.progress_sessions s where s.id = p_target_id)
    when 'club_post' then (select cp.author_id from public.club_posts cp where cp.id = p_target_id)
    when 'comment' then (select c.author_id from public.comments c where c.id = p_target_id)
    when 'activity_checkpoint' then (
      select cc.created_by from public.club_activity_checkpoints cc where cc.id = p_target_id
    )
    when 'club_activity' then (
      select ca.created_by from public.club_activities ca where ca.id = p_target_id
    )
    when 'thought' then (select th.user_id from public.thoughts th where th.id = p_target_id)
  end;
$function$;

drop policy "thoughts delete own" on public.thoughts;
create policy "thoughts delete own or moderate" on public.thoughts
  for delete to authenticated
  using (private.can_moderate_target('thought', id));
