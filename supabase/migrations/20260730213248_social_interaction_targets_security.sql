-- Keep the public visibility API invoker-safe while the private helper reads
-- the registry under a fixed, non-mutable search path for RLS policies.
create or replace function private.can_view_interaction_target(p_interaction_target_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.interaction_targets t
    where t.id = p_interaction_target_id
      and not public.users_are_blocked(t.owner_id)
      and case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.has_reached_checkpoint(t.source_id)
      end
  );
$function$;
revoke execute on function private.can_view_interaction_target(uuid) from public;
-- Required by the public SECURITY INVOKER wrapper; private is not exposed by
-- the Data API and no client-facing RPC is granted here.
grant execute on function private.can_view_interaction_target(uuid) to anon, authenticated;

create or replace function public.can_view_interaction_target(p_interaction_target_id uuid)
returns boolean
language sql stable security invoker set search_path = '' as $function$
  select private.can_view_interaction_target(p_interaction_target_id);
$function$;
revoke execute on function public.can_view_interaction_target(uuid) from public;
grant execute on function public.can_view_interaction_target(uuid) to anon, authenticated;
