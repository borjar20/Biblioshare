-- Notas en el margen · Tarea 4: hilo privado por encuentro y reclamación de avisos.

-- (a) Cada encuentro es su propio target de interacción.
create function private.sync_margin_encounter_target() returns trigger
language plpgsql security definer set search_path='' as $$
declare author uuid;
begin
  if tg_op='DELETE' then
    -- comments/reactions/notifications caen por ON DELETE CASCADE sobre interaction_target_id.
    delete from public.interaction_targets where kind='margin_encounter' and source_id=old.id;
    return null;
  end if;
  select n.author_id into author from public.margin_notes n where n.id=new.note_id;
  perform private.upsert_interaction_target('margin_encounter', new.id, author, 'profile', new.reader_id,
    '/margen/'||new.id, true, true, 'margin_commented', 'margin_liked');
  return null;
end $$;
revoke all on function private.sync_margin_encounter_target() from public, anon, authenticated;
create trigger margin_encounters_sync_target after insert or delete on public.margin_note_encounters
  for each row execute function private.sync_margin_encounter_target();

-- (b) private.can_view_interaction_target (base: 20261002120712_experiences_social_visibility.sql)
CREATE OR REPLACE FUNCTION private.can_view_interaction_target(p_interaction_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.interaction_targets t
    where t.id = p_interaction_target_id and private.moderation_available(t.kind::text,t.source_id)
      and not public.users_are_blocked(t.owner_id)
      and case when t.kind='experience' then private.can_view_experience(t.source_id)
        when t.kind='margin_encounter' then private.can_read_margin_encounter(t.source_id)
        when t.kind in ('post','comment') then public.can_view_target(t.kind,t.source_id)
        else case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.can_view_target('activity_checkpoint'::public.target_kind, t.audience_id)
      end end
  );
$function$;

-- (c) public.can_view_target (base: 20261004100400_experience_reviews_moderation.sql)
CREATE OR REPLACE FUNCTION public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case p_target_type
    when 'experience' then private.can_view_experience(p_target_id)
    when 'margin_encounter' then private.can_read_margin_encounter(p_target_id)
    when 'post' then exists(select 1 from public.posts p where p.id=p_target_id and public.can_view_profile(p.author_id) and not public.users_are_blocked(p.author_id)
      and (p.anchor_type<>'experience' or (exists(select 1 from public.experiences e where e.id=p.anchor_id and e.audience='profile' and private.can_view_experience(e.id))
        and (p.kind<>'experience_review' or private.can_view_experience_review(p.source_id)))))
    when 'experience_review' then private.can_view_experience_review(p_target_id)
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

-- (d) private.social_target_owner_id (base: 20261004100400_experience_reviews_moderation.sql)
CREATE OR REPLACE FUNCTION private.social_target_owner_id(p_target_type public.target_kind, p_target_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_target_type
    when 'experience' then (select creator_id from public.experiences where id=p_target_id)
    -- El autor solo es "dueño" (y por tanto moderador) mientras la relación se mantiene:
    -- follow aceptado del lector y ningún bloqueo en ningún sentido.
    when 'margin_encounter' then (select n.author_id from public.margin_note_encounters e
      join public.margin_notes n on n.id=e.note_id
      where e.id=p_target_id
        and exists(select 1 from public.follows f where f.follower_id=e.reader_id and f.followee_id=n.author_id and f.status='accepted')
        and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.reader_id and b.blocked_id=n.author_id)
          or (b.blocker_id=n.author_id and b.blocked_id=e.reader_id)))
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
    when 'post' then (select po.author_id from public.posts po where po.id = p_target_id)
    when 'experience_review' then (select r.author_id from public.experience_moment_reviews r where r.id = p_target_id)
  end;
$function$;

-- (e) Reclamación de avisos de notas dedicadas.
create function public.margin_claim_notices()
returns table(encounter_id uuid, reader_id uuid, author_id uuid, target_id uuid,
  item_type public.item_type, item_id uuid, chapter_label text)
language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  return query
  with claimed as (
    update public.margin_note_encounters e set notified_at = now()
    from public.margin_notes n
    where n.id=e.note_id and n.audience='person' and e.notified_at is null
      and (e.reader_id=auth.uid() or n.author_id=auth.uid())
      and exists(select 1 from public.follows f where f.follower_id=e.reader_id and f.followee_id=n.author_id and f.status='accepted')
      and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.reader_id and b.blocked_id=n.author_id)
        or (b.blocker_id=n.author_id and b.blocked_id=e.reader_id))
    returning e.id as eid, e.reader_id as rid, n.author_id as aid, n.item_type as it, n.item_id as iid, n.chapter_label as ch
  )
  select c.eid, c.rid, c.aid, t.id, c.it, c.iid, c.ch
  from claimed c left join public.interaction_targets t on t.kind='margin_encounter' and t.source_id=c.eid;
end $$;
revoke all on function public.margin_claim_notices() from public, anon;
grant execute on function public.margin_claim_notices() to authenticated;

-- (f) Relleno de encuentros anteriores a este trigger.
insert into public.interaction_targets(kind,source_id,owner_id,audience_kind,audience_id,href,commentable,reactable,comment_notification_type,reaction_notification_type)
select 'margin_encounter', e.id, n.author_id, 'profile', e.reader_id, '/margen/'||e.id, true, true, 'margin_commented', 'margin_liked'
from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
on conflict (kind, source_id) do nothing;
