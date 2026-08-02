-- Restore the single necessary ACL after compatibility hardening. The public
-- wrapper is SECURITY INVOKER; it cannot call this private helper without it.
revoke execute on function private.can_view_interaction_target(uuid) from public;
grant execute on function private.can_view_interaction_target(uuid) to anon, authenticated;
