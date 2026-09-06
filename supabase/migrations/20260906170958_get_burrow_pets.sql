-- #1083: public appearance only, for accepted follows visible to the caller.
-- No new policy or grant on pet_state. Apply in dev before production.
create or replace function private.burrow_pets(p_viewer uuid, p_limit integer)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint
)
language sql stable security definer
set search_path = ''
as $function$
  select f.followee_id, pr.username, pr.display_name, pr.avatar_url,
         ps.name, ps.class, ps.last_stage, count(*) over ()
  from public.follows f
  join public.pet_state ps on ps.user_id = f.followee_id
  join public.profiles pr on pr.user_id = f.followee_id
  where p_viewer = (select auth.uid())
    and f.follower_id = p_viewer
    and f.status = 'accepted'
    and f.followee_id <> p_viewer
    and public.can_view_profile(f.followee_id)
    and not public.users_are_blocked(f.followee_id)
  order by pg_catalog.md5(p_viewer::text || (pg_catalog.now() at time zone 'utc')::date::text || f.followee_id::text),
           f.followee_id
  limit least(greatest(coalesce(p_limit, 60), 1), 60);
$function$;

revoke all on function private.burrow_pets(uuid, integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.burrow_pets(uuid, integer) to authenticated;

create or replace function public.get_burrow_pets(p_limit integer default 60)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint
)
language sql stable security invoker
set search_path = ''
as $function$
  select * from private.burrow_pets((select auth.uid()), p_limit);
$function$;

revoke all on function public.get_burrow_pets(integer) from public, anon;
grant execute on function public.get_burrow_pets(integer) to authenticated;
