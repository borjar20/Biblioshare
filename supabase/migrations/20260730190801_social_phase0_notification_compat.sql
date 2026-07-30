-- Deployment bridge: the dev application still runs the pre-Phase-0 writer.
-- Keep authenticated inserts available until the server code using service
-- role has been deployed. The final notification-cutover migration revokes it.
grant insert on table public.notifications to authenticated;

-- Persist the same canonical form already produced by the server action, so
-- direct Data API writes cannot store whitespace-padded comments.
alter table public.comments
  drop constraint comments_body_nonempty,
  add constraint comments_body_canonical
  check (body = btrim(body) and char_length(body) between 1 and 2000);
