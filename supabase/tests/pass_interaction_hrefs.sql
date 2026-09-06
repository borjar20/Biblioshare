-- Functional regression #879. Disposable/local or dev only: synthetic rows,
-- rolled back even on success. Run with psql -v ON_ERROR_STOP=1.
begin;
do $test$
declare
  u uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  target_id uuid;
  comment_id uuid := gen_random_uuid();
  review_comment_id uuid := gen_random_uuid();
  reply_id uuid := gen_random_uuid();
  post_id uuid := gen_random_uuid();
  post_target uuid;
  review_target uuid;
  old_href text;
  new_href text;
begin
  insert into auth.users(id) values (u);
  insert into public.profiles(user_id, username) values (u, 'href_' || left(replace(u::text, '-', ''), 12));
  insert into public.books(id, title) values (a, '[TEST] href A'), (b, '[TEST] href B');
  insert into public.passes(id, user_id, item_type, item_id, is_active) values (p, u, 'book', a, true);
  insert into public.progress_sessions(id, user_id, pass_id) values (session_id, u, p);
  select id, href into target_id, old_href from public.interaction_targets
    where kind = 'progress_session' and source_id = session_id;
  if old_href is distinct from '/libro/' || a::text then
    raise exception 'invalid fixture: progress session href %', old_href;
  end if;
  insert into public.comments(id, author_id, interaction_target_id, body)
    values (comment_id, u, target_id, '[TEST] comment');
  select id into review_target from public.interaction_targets where kind = 'diary_entry' and source_id = p;
  insert into public.comments(id, author_id, interaction_target_id, body)
    values (review_comment_id, u, review_target, '[TEST] review comment');
  -- Replies share the original target; parent_id expresses the thread.
  insert into public.comments(id, author_id, interaction_target_id, parent_id, body)
    values (reply_id, u, target_id, comment_id, '[TEST] reply');
  insert into public.posts(id, author_id, kind, anchor_type, anchor_id)
    values (post_id, u, 'thought', 'book', a);
  select id into post_target from public.interaction_targets where kind = 'post' and source_id = post_id;
  update public.passes set item_id = b where id = p;
  select href into new_href from public.interaction_targets where id = target_id;
  if new_href is distinct from '/libro/' || b::text then
    raise exception 'FAIL #879: session href did not follow pass: %', new_href;
  end if;
  select href into new_href from public.interaction_targets where kind = 'comment' and source_id = comment_id;
  if new_href is distinct from '/libro/' || b::text || '#c-' || comment_id::text then
    raise exception 'FAIL #879: comment href/anchor did not follow pass: %', new_href;
  end if;
  select href into new_href from public.interaction_targets where kind = 'comment' and source_id = review_comment_id;
  if new_href is distinct from '/libro/' || b::text || '?tab=community#c-' || review_comment_id::text then
    raise exception 'FAIL #879: community query/anchor lost: %', new_href;
  end if;
  select href into new_href from public.interaction_targets where kind = 'comment' and source_id = reply_id;
  if new_href is distinct from '/libro/' || b::text || '#c-' || reply_id::text then
    raise exception 'FAIL #879: reply lost its anchor: %', new_href;
  end if;
  if (select href from public.interaction_targets where id = post_target) <> '/post/' || post_id::text then
    raise exception 'FAIL #879: unrelated post changed';
  end if;
  -- The migration's repair also fixes descendants whose root is already correct.
  update public.interaction_targets set href = '/libro/' || a::text
    where kind = 'comment' and source_id = comment_id;
  perform private.refresh_pass_interaction_hrefs(p);
  select href into new_href from public.interaction_targets where kind = 'comment' and source_id = comment_id;
  if new_href is distinct from '/libro/' || b::text || '#c-' || comment_id::text then
    raise exception 'FAIL #879: historical stale comment not repaired: %', new_href;
  end if;
  -- A real type change follows the new route, not a UUID-only replacement.
  insert into public.movies(id, title) values (b, '[TEST] movie B');
  update public.passes set item_type = 'movie' where id = p;
  select href into new_href from public.interaction_targets where id = target_id;
  if new_href is distinct from '/pelicula/' || b::text then
    raise exception 'FAIL #879: route did not follow item_type: %', new_href;
  end if;
  if exists (select 1 from public.interaction_targets where id = target_id and
      (owner_id <> u or audience_kind <> 'profile' or audience_id <> u)) then
    raise exception 'FAIL #879: audience/owner changed';
  end if;
  if has_function_privilege('authenticated', 'private.refresh_pass_interaction_hrefs(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'private.refresh_pass_interaction_hrefs(uuid)', 'EXECUTE') then
    raise exception 'FAIL #879: private repair exposed';
  end if;
end $test$;
rollback;
