-- Advisor findings introduced by experiences; preserve the permission model.
create index experience_attendance_moment_root on public.experience_moment_participants(moment_id,experience_id);
alter policy experience_photos_group_read on public.experience_photos using(
  author_id=(select auth.uid()) or (private.can_contribute_experience(experience_id) and not public.users_are_blocked(author_id)));
create policy experience_photo_cleanup_no_client_access on private.experience_photo_cleanup using(false);
