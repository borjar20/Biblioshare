-- #1345: updatePass reads the previous review through pass_reviews, never passes.
-- Raw review SELECT is intentionally revoked; private reviews must stay private.
-- Disposable/local or dev only. Synthetic fixtures, rollback; no schema/ACL changes.
-- Run with psql -v ON_ERROR_STOP=1.
begin;
set local statement_timeout = '20s';

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_movie uuid := gen_random_uuid();
  v_owner_pass uuid := gen_random_uuid();
  v_member_pass uuid := gen_random_uuid();
  v_solo_pass uuid := gen_random_uuid();
  v_joint uuid;
  v_joint_post uuid;
  r record;
  n integer;
  denied boolean;
begin
  insert into auth.users(id) values (v_owner), (v_member), (v_outsider);
  insert into public.profiles(user_id, username, is_public) values
    (v_owner, 'preperm_' || left(replace(v_owner::text, '-', ''), 16), true),
    (v_member, 'preperm_' || left(replace(v_member::text, '-', ''), 16), true),
    (v_outsider, 'preperm_' || left(replace(v_outsider::text, '-', ''), 16), true);
  insert into public.movies(id, title)
    values (v_movie, '[TEST] pass_review_edit_permissions');
  insert into public.follows(follower_id, followee_id, status) values
    (v_owner, v_member, 'accepted'), (v_member, v_owner, 'accepted');
  insert into public.passes(id, user_id, item_type, item_id, status, started_on,
    finished_on, review, is_public) values
    (v_owner_pass, v_owner, 'movie', v_movie, 'completed', '2026-09-29',
      '2026-10-01', '[TEST] owner private', false),
    (v_member_pass, v_member, 'movie', v_movie, 'completed', '2026-09-29',
      '2026-10-01', '[TEST] member private', false),
    (v_solo_pass, v_owner, 'movie', v_movie, 'completed', '2026-09-29',
      '2026-10-01', '[TEST] solo private', false);

  -- Three effective ACL assertions, including inherited grants.
  if has_column_privilege('authenticated', 'public.passes', 'review', 'SELECT') then
    raise exception 'FAIL: authenticated can SELECT raw passes.review';
  end if;
  if has_column_privilege('anon', 'public.passes', 'review', 'SELECT') then
    raise exception 'FAIL: anon can SELECT raw passes.review';
  end if;
  if not has_table_privilege('authenticated', 'public.pass_reviews', 'SELECT') then
    raise exception 'FAIL: authenticated cannot SELECT pass_reviews';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_joint := (public.create_joint_viewing(v_owner_pass, array[v_member])->>'viewing_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform public.respond_joint_viewing(v_joint, true, v_member_pass);
  execute 'reset role';

  -- Two fixture assertions: both accepted links and the actual joint post.
  select count(*) into n from public.joint_viewing_members
    where viewing_id = v_joint and status = 'accepted';
  if n <> 2 then raise exception 'FAIL: fixture has % accepted members', n; end if;
  select id into v_joint_post from public.posts
    where kind = 'joint' and source_kind = 'joint_viewing' and source_id = v_joint;
  if v_joint_post is null then raise exception 'FAIL: fixture joint post missing'; end if;

  -- Five assertions each for creator, participant, and independent solo pass.
  for r in select * from (values
    (v_owner, v_owner_pass, 'owner', 7, false),
    (v_member, v_member_pass, 'member', 8, true),
    (v_owner, v_solo_pass, 'solo', 6, false)
  ) as cases(actor_id, pass_id, label, rating, spoiler) loop
    perform set_config('request.jwt.claim.sub', r.actor_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', r.actor_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    denied := false;
    begin
      perform review from public.passes where id = r.pass_id and user_id = r.actor_id;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: % raw review SELECT did not raise 42501', r.label; end if;
    if (select review from public.pass_reviews where id = r.pass_id and user_id = r.actor_id)
      is distinct from '[TEST] ' || r.label || ' private' then
      raise exception 'FAIL: % cannot read their own previous private review', r.label;
    end if;
    if not exists (select 1 from public.passes where id = r.pass_id and user_id = r.actor_id
      and started_on = '2026-09-29' and finished_on = '2026-10-01' and status = 'completed') then
      raise exception 'FAIL: % cannot read the dates needed by savePassFields', r.label;
    end if;

    -- Exact savePassFields payload, without its optional started_on correction.
    update public.passes set finished_on = '2026-10-02', rating = r.rating,
      review = '[TEST] ' || r.label || ' edited', review_is_spoiler = r.spoiler,
      is_public = false, dropped_reason = null, dropped_reason_note = null
      where id = r.pass_id and user_id = r.actor_id;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: % update affected % rows', r.label, n; end if;
    if not exists (select 1 from public.pass_reviews where id = r.pass_id
      and review = '[TEST] ' || r.label || ' edited' and rating = r.rating
      and finished_on = '2026-10-02' and started_on = '2026-09-29'
      and review_is_spoiler = r.spoiler and not is_public
      and dropped_reason is null and dropped_reason_note is null) then
      raise exception 'FAIL: % edit payload was not preserved', r.label;
    end if;
    execute 'reset role';
  end loop;

  -- Four assertions: the edits preserve membership, post identity, metadata,
  -- and the solo pass's independence.
  select count(*) into n from public.joint_viewing_members m where m.viewing_id = v_joint
    and m.status = 'accepted' and ((m.user_id = v_owner and m.pass_id = v_owner_pass)
      or (m.user_id = v_member and m.pass_id = v_member_pass));
  if n <> 2 then raise exception 'FAIL: editing removed an original accepted link'; end if;
  if not exists (select 1 from public.posts where id = v_joint_post
    and source_id = v_joint and kind = 'joint') then
    raise exception 'FAIL: editing replaced or removed the joint post';
  end if;
  if not exists (select 1 from public.joint_viewings v where v.id = v_joint
    and v.item_type = 'movie' and v.item_id = v_movie and v.created_by = v_owner
    and v.watched_on = '2026-10-01') then
    raise exception 'FAIL: editing changed joint viewing metadata';
  end if;
  if exists (select 1 from public.joint_viewing_members where pass_id = v_solo_pass) then
    raise exception 'FAIL: editing attached the solo pass to a joint viewing';
  end if;

  -- Two outsider assertions: public profiles do not expose private reviews,
  -- and a write without an owner filter still cannot change any foreign pass.
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.pass_reviews where id in (v_owner_pass, v_member_pass, v_solo_pass)) then
    raise exception 'FAIL: outsider received a private review through pass_reviews';
  end if;
  update public.passes set review = '[TEST] outsider forged'
    where id in (v_owner_pass, v_member_pass, v_solo_pass);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: outsider wrote % foreign passes', n; end if;
  execute 'reset role';

  -- Two anonymous assertions: neither the view nor raw review can leak text.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  if exists (select 1 from public.pass_reviews where id in (v_owner_pass, v_member_pass, v_solo_pass)) then
    raise exception 'FAIL: anon received a private review through pass_reviews';
  end if;
  denied := false;
  begin
    perform review from public.passes where id = v_owner_pass;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon raw review SELECT did not raise 42501'; end if;
  execute 'reset role';

  -- One final privileged assertion catches any silent forged update.
  select count(*) into n from public.passes p where
    (p.id = v_owner_pass and p.review = '[TEST] owner edited' and p.rating = 7)
    or (p.id = v_member_pass and p.review = '[TEST] member edited' and p.rating = 8)
    or (p.id = v_solo_pass and p.review = '[TEST] solo edited' and p.rating = 6);
  if n <> 3 then raise exception 'FAIL: a stored review changed after foreign writes'; end if;
end;
$test$;
rollback;

-- Unique fixture markers are absent after rollback.
do $cleanup$
begin
  if exists (select 1 from public.profiles where username like 'preperm\_%' escape '\')
    or exists (select 1 from public.movies where title = '[TEST] pass_review_edit_permissions') then
    raise exception 'FAIL cleanup: a pass review permission fixture survived rollback';
  end if;
end;
$cleanup$;
select 'PASS: 29 pass review permission/edit assertions; fixtures rolled back' as result;
