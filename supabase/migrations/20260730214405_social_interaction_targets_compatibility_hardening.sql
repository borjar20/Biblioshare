-- Fase 1 hardening: the legacy pair is always authoritative, including when a
-- client tries to update only the canonical id.
drop trigger trg_comments_resolve_interaction_target on public.comments;
drop trigger trg_reactions_resolve_interaction_target on public.reactions;
drop trigger trg_notifications_resolve_interaction_target on public.notifications;
create trigger trg_comments_resolve_interaction_target before insert or update of target_type, target_id, interaction_target_id on public.comments for each row execute function private.resolve_comment_interaction_target();
create trigger trg_reactions_resolve_interaction_target before insert or update of target_type, target_id, interaction_target_id on public.reactions for each row execute function private.resolve_reaction_interaction_target();
create trigger trg_notifications_resolve_interaction_target before insert or update of target_type, target_id, interaction_target_id on public.notifications for each row execute function private.resolve_notification_interaction_target();

revoke execute on function private.upsert_interaction_target(public.target_kind, uuid, uuid, public.interaction_audience_kind, uuid, text, boolean, boolean, public.notification_type, public.notification_type) from public, anon, authenticated;
revoke execute on function private.sync_pass_interaction_targets() from public, anon, authenticated;
revoke execute on function private.sync_episode_watch_interaction_target() from public, anon, authenticated;
revoke execute on function private.sync_progress_session_interaction_target() from public, anon, authenticated;
revoke execute on function private.sync_club_post_interaction_target() from public, anon, authenticated;
revoke execute on function private.sync_club_activity_interaction_target() from public, anon, authenticated;
revoke execute on function private.sync_checkpoint_interaction_target() from public, anon, authenticated;
revoke execute on function private.sync_comment_interaction_target() from public, anon, authenticated;
revoke execute on function private.resolve_interaction_target(public.target_kind, uuid) from public, anon, authenticated;
revoke execute on function private.resolve_comment_interaction_target() from public, anon, authenticated;
revoke execute on function private.resolve_reaction_interaction_target() from public, anon, authenticated;
revoke execute on function private.resolve_notification_interaction_target() from public, anon, authenticated;
revoke execute on function private.cleanup_social_target() from public, anon, authenticated;
revoke execute on function private.can_view_interaction_target(uuid) from public, anon, authenticated;
-- Necessary for public.can_view_interaction_target (SECURITY INVOKER) to
-- execute the private RLS helper. All other new SECURITY DEFINER functions
-- remain non-executable by client roles.
grant execute on function private.can_view_interaction_target(uuid) to anon, authenticated;
