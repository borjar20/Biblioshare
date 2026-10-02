-- #1237: bound new Google Books-only shells without charging catalog reuse.
-- Limits remain server-owned. Keep every pre-existing operation and signature.
create or replace function public.consume_request_quota(p_operation text, p_cost integer default 1)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  capacity integer;
  duration interval;
  consumed integer;
  instant timestamptz := statement_timestamp();
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select limits.n, limits.window_size into capacity, duration from (values
    ('catalog_request', 60, interval '1 minute'),
    ('catalog_create', 6000, interval '1 hour'),
    ('catalog_google_volume_create', 60, interval '1 hour'),
    ('import_parse', 6, interval '1 hour'),
    ('import_rows', 6000, interval '1 hour'),
    ('pending_imports', 6000, interval '1 hour'),
    ('social_posts', 20, interval '1 minute'),
    ('social_comments', 60, interval '1 minute'),
    ('social_reactions', 120, interval '1 minute'),
    ('social_follows', 30, interval '1 minute'),
    ('push_devices', 20, interval '10 minutes'),
    ('activity_progress', 120, interval '1 minute'),
    ('club_round_state', 120, interval '1 minute'),
    ('saga_sequence', 30, interval '1 minute')
  ) as limits(operation, n, window_size) where limits.operation = p_operation;
  if capacity is null or p_cost is null or p_cost < 1 or p_cost > capacity then
    raise exception 'invalid quota operation or cost' using errcode = '22023';
  end if;
  insert into private.request_quotas as quota(user_id, operation, window_started_at, used)
    values (actor, p_operation, instant, p_cost)
  on conflict (user_id, operation) do update set
    used = case when quota.window_started_at + duration <= instant then p_cost
      else least(capacity + 1, quota.used + p_cost) end,
    window_started_at = case when quota.window_started_at + duration <= instant
      then instant else quota.window_started_at end
  returning used into consumed;
  return consumed <= capacity;
end;
$$;

-- Preserve the general BEFORE INSERT quota for every other kind of book.
-- Google-volume registration uses ON CONFLICT DO NOTHING: a BEFORE trigger
-- would charge attempts that reuse an existing shared catalog row.
drop trigger request_quota on public.books;
create trigger request_quota before insert on public.books
  for each row
  when (not (new.google_books_volume_id is not null and new.openlibrary_work_key is null))
  execute function private.enforce_write_quota('catalog_create');

-- The unique volume index decides which concurrent insert actually creates
-- the row. Only that winner runs this AFTER ROW trigger; reused UUIDs are free.
-- Exceeding capacity raises PT429 through the existing helper and rolls back
-- both the shell (including automatic editions) and its quota increment.
create trigger google_volume_creation_quota after insert on public.books
  for each row
  when (new.google_books_volume_id is not null and new.openlibrary_work_key is null)
  execute function private.enforce_write_quota('catalog_google_volume_create');
