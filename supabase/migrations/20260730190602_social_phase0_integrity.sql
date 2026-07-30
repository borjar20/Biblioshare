-- The application currently exposes one reaction semantic. Keep the database
-- contract aligned so direct Data API writes cannot invent unsupported kinds.
alter table public.reactions
  add constraint reactions_kind_like
  check (kind = 'like');

-- Replace the older upper-bound-only check with the complete body contract.
alter table public.comments
  drop constraint comments_body_len,
  add constraint comments_body_nonempty
  check (char_length(btrim(body)) between 1 and 2000);

-- Notification fan-out is a trusted server-side effect. Recipients retain the
-- existing privileges needed to read, mark and clean up their own rows via RLS.
revoke insert on table public.notifications from anon, authenticated;
