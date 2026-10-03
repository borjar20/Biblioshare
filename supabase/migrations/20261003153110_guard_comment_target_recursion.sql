-- PostgreSQL may reorder WHERE predicates and evaluate recursion on a comment's
-- own interaction target before the comment lookup or parent join has matched.
-- Guard the call itself with CASE; both row checks must precede recursion.
-- CREATE OR REPLACE preserves this function's signature, attributes and ACL.
CREATE OR REPLACE FUNCTION public.can_view_target(p_target_type target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case p_target_type
    when 'experience' then private.can_view_experience(p_target_id)
    when 'post' then exists(select 1 from public.posts p where p.id=p_target_id and public.can_view_profile(p.author_id) and not public.users_are_blocked(p.author_id)
      and (p.anchor_type<>'experience' or exists(select 1 from public.experiences e where e.id=p.anchor_id and e.audience='profile' and private.can_view_experience(e.id))))
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
      select 1 from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = p_target_id
        and case when c.id = p_target_id and t.id = c.interaction_target_id
          then public.can_view_target(t.kind, t.source_id)
          else false
        end
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
