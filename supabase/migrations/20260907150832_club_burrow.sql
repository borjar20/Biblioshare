-- S3 (#1130): membership and visibility are checked at the data boundary.
create function private.club_burrow_pets(p_club_id uuid)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, pet_level integer, total bigint
)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null or not exists (
    select 1 from public.club_members cm
    where cm.club_id = p_club_id and cm.user_id = viewer and cm.status = 'active'
  ) then
    raise exception 'club_burrow_unavailable' using errcode = '42501';
  end if;
  return query
  with visible as materialized (
    select ps.user_id, pr.username, pr.display_name, pr.avatar_url,
           ps.name as pet_name, ps.class as pet_class, ps.last_stage as pet_stage,
           ps.last_level as pet_level
    from public.club_members cm
    join public.pet_state ps on ps.user_id = cm.user_id
    join public.profiles pr on pr.user_id = cm.user_id
    where cm.club_id = p_club_id and cm.status = 'active'
      and public.can_view_profile(cm.user_id)
      and not public.users_are_blocked(cm.user_id)
  )
  select v.*, count(*) filter (where v.user_id <> viewer) over () as total
  from visible v
  order by (v.user_id = viewer) desc,
    pg_catalog.md5(viewer::text || p_club_id::text || (pg_catalog.now() at time zone 'utc')::date::text || v.user_id::text),
    v.user_id
  limit 60 + (case when exists (select 1 from visible o where o.user_id = viewer) then 1 else 0 end);
end;
$function$;
revoke all on function private.club_burrow_pets(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.club_burrow_pets(uuid) to authenticated;

create function public.get_club_burrow_pets(p_club_id uuid)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, pet_level integer, total bigint
)
language sql stable security invoker set search_path = ''
as $function$
  select * from private.club_burrow_pets(p_club_id);
$function$;
revoke all on function public.get_club_burrow_pets(uuid) from public, anon;
grant execute on function public.get_club_burrow_pets(uuid) to authenticated;
