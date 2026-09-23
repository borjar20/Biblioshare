-- Regresión de #1187 (`private.cleanup_contradicted_posts`, trigger
-- passes_cleanup_contradicted_posts) y #1188 (`posts insert own` exige que la
-- fuente sea del autor). Spec:
-- docs/superpowers/specs/2026-09-23-posts-hitos-coherentes-design.md.
-- Disposable/local o dev only: filas sintéticas, rollback incluso si pasa.
-- Ejecutar con psql -v ON_ERROR_STOP=1.
begin;
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  bk1 uuid := gen_random_uuid();
  bk2 uuid := gen_random_uuid();
  bk3 uuid := gen_random_uuid();
  bk4 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();  -- completed → dropped → completed
  p2 uuid := gen_random_uuid();  -- dropped → in_progress («continuar»)
  p3 uuid := gen_random_uuid();  -- in_progress → planned
  p4 uuid := gen_random_uuid();  -- update sin cambio de status
  s1 uuid := gen_random_uuid();
  n int;
  err text;
begin
  insert into auth.users(id) values (a), (b);
  insert into public.profiles(user_id, username, is_public) values
    (a, 'coh_a_' || left(replace(a::text, '-', ''), 10), true),
    (b, 'coh_b_' || left(replace(b::text, '-', ''), 10), true);
  insert into public.books(id, title) values
    (bk1, '[TEST] coh 1'), (bk2, '[TEST] coh 2'), (bk3, '[TEST] coh 3'), (bk4, '[TEST] coh 4');

  insert into public.passes(id, user_id, item_type, item_id, status, is_active, started_on, finished_on) values
    (p1, a, 'book', bk1, 'completed',   true, '2026-09-01', '2026-09-02'),
    (p2, a, 'book', bk2, 'dropped',     true, '2026-09-01', '2026-09-02'),
    (p3, a, 'book', bk3, 'in_progress', true, '2026-09-01', null),
    (p4, a, 'book', bk4, 'completed',   true, '2026-09-01', '2026-09-02');
  insert into public.progress_sessions(id, user_id, pass_id) values (s1, a, p3);

  insert into public.posts(author_id, kind, anchor_type, anchor_id, source_kind, source_id) values
    (a, 'started',  'book', bk1, 'pass', p1),
    (a, 'finished', 'book', bk1, 'pass', p1),
    (a, 'started',  'book', bk2, 'pass', p2),
    (a, 'dropped',  'book', bk2, 'pass', p2),
    (a, 'started',  'book', bk3, 'pass', p3),
    (a, 'finished', 'book', bk4, 'pass', p4);

  -- ── #1187 ──────────────────────────────────────────────────────────────
  -- Terminado → Abandonado (mismo pase): se va `finished`, se queda `started`.
  update public.passes set status = 'dropped' where id = p1;
  if exists (select 1 from public.posts where source_id = p1 and kind = 'finished') then
    raise exception 'FAIL: completed→dropped dejó el post finished';
  end if;
  if not exists (select 1 from public.posts where source_id = p1 and kind = 'started') then
    raise exception 'FAIL: completed→dropped borró el post started';
  end if;

  -- Abandonado → Terminado: se va `dropped`.
  insert into public.posts(author_id, kind, anchor_type, anchor_id, source_kind, source_id)
    values (a, 'dropped', 'book', bk1, 'pass', p1);
  update public.passes set status = 'completed' where id = p1;
  if exists (select 1 from public.posts where source_id = p1 and kind = 'dropped') then
    raise exception 'FAIL: dropped→completed dejó el post dropped';
  end if;

  -- Abandonado → Leyendo («continuar»): se va `dropped`, se queda `started`.
  update public.passes set status = 'in_progress', finished_on = null where id = p2;
  if exists (select 1 from public.posts where source_id = p2 and kind = 'dropped') then
    raise exception 'FAIL: dropped→in_progress dejó el post dropped';
  end if;
  if not exists (select 1 from public.posts where source_id = p2 and kind = 'started') then
    raise exception 'FAIL: dropped→in_progress borró el post started';
  end if;

  -- Leyendo → Pendiente: se va `started`.
  update public.passes set status = 'planned', started_on = null where id = p3;
  if exists (select 1 from public.posts where source_id = p3) then
    raise exception 'FAIL: in_progress→planned dejó el post started';
  end if;

  -- UPDATE sin cambio de status: no toca nada.
  update public.passes set rating = 8 where id = p4;
  update public.passes set status = 'completed' where id = p4;
  if not exists (select 1 from public.posts where source_id = p4 and kind = 'finished') then
    raise exception 'FAIL: un update sin cambio real de status borró el post';
  end if;

  -- ── #1188 ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- B no puede colgar un post suyo del pase de A…
  err := null;
  begin
    insert into public.posts(author_id, kind, anchor_type, anchor_id, source_kind, source_id)
      values (b, 'started', 'book', bk4, 'pass', p4);
  exception when others then err := sqlstate;
  end;
  if err is distinct from '42501' then
    raise exception 'FAIL: B insertó (o falló con %) un post en el pase de A', coalesce(err, 'nada');
  end if;
  -- …ni de su sesión…
  err := null;
  begin
    insert into public.posts(author_id, kind, anchor_type, anchor_id, source_kind, source_id)
      values (b, 'progressed', 'book', bk3, 'progress_session', s1);
  exception when others then err := sqlstate;
  end;
  if err is distinct from '42501' then
    raise exception 'FAIL: B insertó (o falló con %) un post en la sesión de A', coalesce(err, 'nada');
  end if;
  -- …ni con una fuente sin tipo.
  err := null;
  begin
    insert into public.posts(author_id, kind, anchor_type, anchor_id, source_id)
      values (b, 'started', 'book', bk4, p4);
  exception when others then err := sqlstate;
  end;
  if err is null then
    raise exception 'FAIL: se aceptó un source_id sin source_kind';
  end if;
  -- Un pensamiento (sin fuente) sí.
  insert into public.posts(author_id, kind, anchor_type, anchor_id, body)
    values (b, 'thought', 'book', bk4, '[TEST] pensamiento');
  execute 'reset role';

  -- A sí puede con su propio pase.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.posts(author_id, kind, anchor_type, anchor_id, source_kind, source_id)
    values (a, 'started', 'book', bk4, 'pass', p4);
  execute 'reset role';

  select count(*) into n from public.posts where author_id = b;
  if n <> 1 then raise exception 'FAIL: B tiene % posts, se esperaba 1 (el pensamiento)', n; end if;
end;
$test$;
rollback;
