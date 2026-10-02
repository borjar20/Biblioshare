-- #1299: reconstruct the mention notification contract on an empty database.
-- Dev and production already have this historical value (pg_enum, 2026-10-02).
-- Commit this migration before SQL consumers use the newly added enum value.
alter type public.notification_type
  add value if not exists 'mentioned' after 'club_event_created';
