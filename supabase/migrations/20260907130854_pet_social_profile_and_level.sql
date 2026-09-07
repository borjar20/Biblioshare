-- Additive social reads: keep the original S1 RPC for older clients.
create function private.burrow_pets_with_level(p_viewer uuid, p_limit integer)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint, pet_level integer
)
language sql stable security definer set search_path = ''
as $function$
  select b.*, ps.last_level
  from private.burrow_pets(p_viewer, p_limit) b
  join public.pet_state ps on ps.user_id = b.user_id
  where p_viewer = (select auth.uid())
  order by pg_catalog.md5(p_viewer::text || (pg_catalog.now() at time zone 'utc')::date::text || b.user_id::text), b.user_id;
$function$;
revoke all on function private.burrow_pets_with_level(uuid, integer) from public, anon;
grant execute on function private.burrow_pets_with_level(uuid, integer) to authenticated;

create function public.get_burrow_pets_with_level(p_limit integer default 60)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint, pet_level integer
)
language sql stable security invoker set search_path = ''
as $function$
  select * from private.burrow_pets_with_level((select auth.uid()), p_limit);
$function$;
revoke all on function public.get_burrow_pets_with_level(integer) from public, anon;
grant execute on function public.get_burrow_pets_with_level(integer) to authenticated;

-- The target is an owner, never a caller-supplied viewer. Visibility uses auth.uid().
create function private.profile_pet(p_user_id uuid)
returns table (pet_name text, pet_class text, pet_stage text)
language sql stable security definer set search_path = ''
as $function$
  select ps.name, ps.class, ps.last_stage
  from public.pet_state ps
  where ps.user_id = p_user_id
    and public.can_view_profile(p_user_id)
    and not public.users_are_blocked(p_user_id);
$function$;
revoke all on function private.profile_pet(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.profile_pet(uuid) to anon, authenticated;

create function public.get_profile_pet(p_user_id uuid)
returns table (pet_name text, pet_class text, pet_stage text)
language sql stable security invoker set search_path = ''
as $function$
  select * from private.profile_pet(p_user_id);
$function$;
revoke all on function public.get_profile_pet(uuid) from public;
grant execute on function public.get_profile_pet(uuid) to anon, authenticated;
