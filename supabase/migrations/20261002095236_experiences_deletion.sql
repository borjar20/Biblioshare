-- Deletion authenticates and locks before any write; removal remains possible
-- after exhausting creation/edit quotas. Task 5 extends the evidence trigger.
create function public.experience_delete(p_id uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; photos jsonb; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into e from public.experiences where id=p_id for update;
  if not found or e.creator_id<>auth.uid() or not private.can_view_experience(p_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_confirmation is null or btrim(p_confirmation)<>e.title then raise exception 'invalid confirmation' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',storage_path)), '[]'::jsonb) into photos from public.experience_photos where experience_id=p_id;
  delete from public.posts where anchor_type='experience' and anchor_id=p_id;
  delete from public.notifications where target_type='experience' and target_id=p_id;
  delete from public.interaction_targets where kind='experience' and source_id=p_id;
  delete from public.experiences where id=p_id;
  return jsonb_build_object('photos',photos);
end $$;
revoke all on function public.experience_delete(uuid,text) from public,anon;
grant execute on function public.experience_delete(uuid,text) to authenticated;
