-- experience_reviewed goes only to members with CURRENT access to the experience (final branch
-- review I2). An accepted row is not enough: a private audience lets only the creator in, a
-- block with the creator hides the experience, and a removed experience is visible to nobody.
-- notify() inserts with the service role and sends the push without a visibility check, so the
-- recipient list itself must apply the access rule (same block pattern as
-- private.can_view_experience_participant, 20261002132635).
-- Body = definition from 20261004100400 with ONLY the recipients query changed.
-- create or replace keeps the existing grants (authenticated only).
CREATE OR REPLACE FUNCTION public.experience_save_moment_review(p_moment_id uuid, p_rating smallint, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare root uuid; person uuid; body text:=nullif(btrim(coalesce(p_body,'')),''); existing uuid; saved uuid; recipients uuid[];
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  if root is null then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  if p_rating is not null and p_rating not between 1 and 10 then raise exception 'invalid rating' using errcode='22023'; end if;
  if char_length(body)>4000 then raise exception 'invalid body' using errcode='22023'; end if;
  select p.id into person from public.experience_participants p
    join public.experience_moment_participants a on a.participant_id=p.id and a.moment_id=p_moment_id and a.attendance_state='attended'
    join public.experiences e on e.id=p.experience_id and e.state='lived'
    where p.experience_id=root and p.user_id=auth.uid() and p.invitation_state='accepted';
  if person is null then raise exception 'attended lived member required' using errcode='42501'; end if;
  select id into existing from public.experience_moment_reviews where moment_id=p_moment_id and participant_id=person;
  if existing is not null and not private.moderation_available('experience_review',existing) then raise exception 'review unavailable' using errcode='42501'; end if;
  if p_rating is null and body is null then
    delete from public.experience_moment_reviews where id=existing;
    return jsonb_build_object('id',null,'experienceId',root,'created',false,'notifyUserIds','[]'::jsonb);
  end if;
  insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating,body)
    values(root,p_moment_id,person,auth.uid(),p_rating,body)
    on conflict(moment_id,participant_id) do update set rating=excluded.rating,body=excluded.body
    returning id into saved;
  if existing is null then
    select coalesce(array_agg(p.user_id),'{}') into recipients from public.experience_participants p
      join public.experiences e on e.id=p.experience_id
      where p.experience_id=root and p.invitation_state='accepted' and p.user_id is not null
        and p.user_id<>auth.uid() and not public.users_are_blocked(p.user_id)
        and (e.audience<>'private' or p.user_id=e.creator_id)
        and not exists(select 1 from public.user_blocks b
          where (b.blocker_id=e.creator_id and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=e.creator_id))
        and private.moderation_available('experience',e.id);
  end if;
  return jsonb_build_object('id',saved,'experienceId',root,'created',existing is null,'notifyUserIds',to_jsonb(coalesce(recipients,'{}')));
end $function$;
