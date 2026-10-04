-- Moment reviews can be published to activity as posts (kind 'experience_review').
-- One post per review; only the RPC creates it; consent withdrawal or deletion removes it.
create unique index posts_one_experience_review on public.posts(source_id) where kind='experience_review';

-- Review posts are anchored to the memory and sourced from the review; only the RPC creates them.
create or replace function private.guard_experience_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='experience_review' then
    if tg_op='INSERT' and not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'publication RPC required' using errcode='42501'; end if;
    -- body stays null: the text lives in the review, under its own limits and consent.
    if new.anchor_type<>'experience' or new.source_kind is distinct from 'experience_review' or new.source_id is null or new.body is not null
      or not exists(select 1 from public.experience_moment_reviews r join public.experiences e on e.id=r.experience_id
        where r.id=new.source_id and r.author_id=new.author_id and r.experience_id=new.anchor_id and r.share_with_profile
          and e.audience='profile' and e.state='lived' and private.moderation_available('experience_review',r.id))
      then raise exception 'invalid experience review publication' using errcode='23514'; end if;
    -- An admin-moderated publication stays down: neither republishing after a delete nor
    -- unpublishing a removed post and publishing again recreates it. moderation_state has no
    -- FK to posts, so a removal stays live after the author withdraws the post.
    if tg_op='INSERT' and exists(select 1 from private.moderation_history h where h.kind='post' and h.action in ('remove','delete')
      and h.snapshot->>'kind'='experience_review' and h.snapshot->>'source_id'=new.source_id::text
      and (h.action='delete' or exists(select 1 from private.moderation_state s where s.kind='post' and s.target_id=h.target_id and s.removed_at is not null)))
      then raise exception 'publication unavailable' using errcode='42501'; end if;
    return new;
  end if;
  if new.kind='experience' or new.anchor_type='experience' then
    if tg_op='INSERT' and not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'publication RPC required' using errcode='42501'; end if;
    if new.kind<>'experience' or new.anchor_type<>'experience' or new.source_kind is not null or new.source_id is not null
      or not exists(select 1 from public.experiences e where e.id=new.anchor_id and e.creator_id=new.author_id and e.audience='profile' and private.moderation_available('experience',e.id))
      then raise exception 'invalid experience publication' using errcode='23514'; end if;
    if exists(select 1 from private.moderation_history h where h.kind='post' and h.action='delete' and h.snapshot->>'anchor_type'='experience' and h.snapshot->>'anchor_id'=new.anchor_id::text)
      then raise exception 'publication unavailable' using errcode='42501'; end if;
  end if;
  return new;
end $$;

drop policy posts_experience_visible on public.posts;
create policy posts_experience_visible on public.posts as restrictive for select to anon,authenticated using(
  anchor_type<>'experience' or (exists(select 1 from public.experiences e where e.id=anchor_id and e.audience='profile' and private.can_view_experience(e.id))
    and (kind<>'experience_review' or private.can_view_experience_review(source_id))));

-- Same definition as 20261003153110; only the 'post' branch adds the review gate.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 set search_path=''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case p_target_type
    when 'experience' then private.can_view_experience(p_target_id)
    when 'post' then exists(select 1 from public.posts p where p.id=p_target_id and public.can_view_profile(p.author_id) and not public.users_are_blocked(p.author_id)
      and (p.anchor_type<>'experience' or (exists(select 1 from public.experiences e where e.id=p.anchor_id and e.audience='profile' and private.can_view_experience(e.id))
        and (p.kind<>'experience_review' or private.can_view_experience_review(p.source_id)))))
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

-- Withdrawal must remove the post even while the post or its memory is moderated: the
-- moderation write guard would otherwise skip (nested trigger) or reject the delete. Same
-- trusted marker as private.cleanup_experience_social, taken only when needed and removed
-- only if this call added it (an admin moderation cascade keeps its own).
create function private.delete_experience_review_post(p_review_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare post uuid; added integer:=0;
begin
  select id into post from public.posts where kind='experience_review' and source_id=p_review_id;
  if post is null then return; end if;
  if not private.moderation_available('post',post) then
    insert into private.moderation_operations values(txid_current()) on conflict do nothing;
    get diagnostics added=row_count;
  end if;
  delete from public.posts where id=post;
  if added>0 then delete from private.moderation_operations where transaction_id=txid_current(); end if;
end $$;
revoke all on function private.delete_experience_review_post(uuid) from public,anon,authenticated;

create function public.experience_publish_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews; post uuid; target uuid; created boolean:=false;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() or not r.share_with_profile or not exists(select 1 from public.experiences e where e.id=r.experience_id and e.audience='profile' and e.state='lived')
    then raise exception 'shared review required' using errcode='42501'; end if;
  select id into post from public.posts where kind='experience_review' and source_id=p_review_id;
  if post is not null and not private.moderation_available('post',post) then raise exception 'publication unavailable' using errcode='42501'; end if;
  if post is null then
    insert into private.moderation_operations values(txid_current()) on conflict do nothing;
    insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
      values(auth.uid(),'experience_review','experience',r.experience_id,'experience_review',p_review_id) returning id into post;
    delete from private.moderation_operations where transaction_id=txid_current();
    created:=true;
  end if;
  select id into target from public.interaction_targets where kind='post' and source_id=post;
  return jsonb_build_object('id',post,'experienceId',r.experience_id,'reviewId',p_review_id,'actorId',auth.uid(),'targetId',target,'created',created);
end $$;

-- Unpublishing is a withdrawal: like turning sharing off, it works under blocks and moderation.
create function public.experience_unpublish_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_withdrawal_lock(r.experience_id);
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  perform private.delete_experience_review_post(p_review_id);
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

create function public.get_experience_review_publications(p_ids uuid[]) returns table(review_id uuid,post_id uuid)
language sql stable security definer set search_path='' as $$
  select p.source_id,p.id from public.posts p join public.experience_moment_reviews r on r.id=p.source_id
  where p.kind='experience_review' and p.source_id=any(p_ids[1:200]) and r.author_id=auth.uid();
$$;

revoke all on function public.experience_publish_review(uuid),public.experience_unpublish_review(uuid),public.get_experience_review_publications(uuid[]) from public,anon;
grant execute on function public.experience_publish_review(uuid),public.experience_unpublish_review(uuid),public.get_experience_review_publications(uuid[]) to authenticated;

-- Consent withdrawal or deletion removes the publication with it.
create function private.cleanup_experience_review_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or (old.share_with_profile and not new.share_with_profile) then
    perform private.delete_experience_review_post(old.id);
  end if;
  return null;
end $$;
revoke all on function private.cleanup_experience_review_post() from public,anon,authenticated;
create trigger experience_review_cleanup_post after delete or update of share_with_profile on public.experience_moment_reviews
  for each row execute function private.cleanup_experience_review_post();
