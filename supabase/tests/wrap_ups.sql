begin;
create or replace function pg_temp.assert_true(p boolean, m text) returns void language plpgsql as $f$
begin if not coalesce(p, false) then raise exception 'assertion_failed: %', m; end if; end $f$;

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'authenticated', 'authenticated', 'wrap-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000a002', 'authenticated', 'authenticated', 'wrap-bob@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000a003', 'authenticated', 'authenticated', 'wrap-carol@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-00000000a001', 'wrap_alice', 'Alice', false, 'user'),
  ('00000000-0000-4000-8000-00000000a002', 'wrap_bob', 'Bob', false, 'user'),
  ('00000000-0000-4000-8000-00000000a003', 'wrap_carol', 'Carol', false, 'user');
insert into public.follows (follower_id, followee_id, status) values
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'accepted');
insert into public.wrap_ups (user_id, kind, period_start, period_end, intensity, payload) values
  ('00000000-0000-4000-8000-00000000a001', 'month', '2026-09-01', '2026-09-30', 'full',
   '{"v":1,"share":{"minutes":120,"finished":2}}');

-- Alice ve su fila; Bob no.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}';
select pg_temp.assert_true((select count(*) from public.wrap_ups) = 0, 'bob no lee wrap_ups ajenos');
select pg_temp.assert_true((select count(*) from public.wrap_ups where user_id = '00000000-0000-4000-8000-00000000a001') = 0, 'ni filtrando');

-- Bob no puede insertar ni actualizar.
do $$ begin
  begin
    insert into public.wrap_ups (user_id, kind, period_start, period_end, intensity, payload)
    values ('00000000-0000-4000-8000-00000000a002', 'week', '2026-09-28', '2026-10-04', 'full', '{"v":1}');
    raise exception 'assertion_failed: insert de cliente permitido';
  exception when insufficient_privilege then null; end;
end $$;

-- Bob no puede insertar un post wrap_up a mano.
do $$ begin
  begin
    insert into public.posts (author_id, kind, anchor_type, anchor_id)
    values ('00000000-0000-4000-8000-00000000a002', 'wrap_up', 'wrap_up', gen_random_uuid());
    raise exception 'assertion_failed: post wrap_up manual permitido';
  exception when others then
    if sqlerrm like 'assertion_failed%' then raise; end if;
  end;
end $$;

-- Alice publica.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}';
select pg_temp.assert_true(public.publish_wrap_up('month') is not null, 'alice publica');
select pg_temp.assert_true((select published_post_id is not null from public.wrap_ups where kind = 'month'), 'enlace al post');
select pg_temp.assert_true(public.publish_wrap_up('month') = (select published_post_id from public.wrap_ups where kind = 'month'), 'idempotente');

-- Bob (seguidor) ve share y post; Carol no.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}';
select pg_temp.assert_true((select count(*) from public.wrap_up_shares) = 1, 'seguidor ve el share');
select pg_temp.assert_true((select (summary->>'minutes')::int from public.wrap_up_shares) = 120, 'el share es el resumen');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000a003","role":"authenticated"}';
select pg_temp.assert_true((select count(*) from public.wrap_up_shares) = 0, 'tercero no ve el share');

-- Alice borra el post: se lleva el share y suelta el enlace; puede republicar.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}';
delete from public.posts where kind = 'wrap_up';
select pg_temp.assert_true((select count(*) from public.wrap_up_shares) = 0, 'borrar el post borra el share');
select pg_temp.assert_true((select published_post_id is null from public.wrap_ups where kind = 'month'), 'enlace suelto');
select pg_temp.assert_true(public.publish_wrap_up('month') is not null, 'republica');

-- Despublicar se lleva share y post.
select public.unpublish_wrap_up('month');
select pg_temp.assert_true((select count(*) from public.posts where kind = 'wrap_up') = 0, 'despublicar borra el post');
select pg_temp.assert_true((select published_post_id is null from public.wrap_ups where kind = 'month'), 'despublicar suelta el enlace');
select pg_temp.assert_true(public.publish_wrap_up('month') is not null, 'publica otra vez');

-- Sustituir el periodo borra share y post.
reset role;
update public.wrap_ups set period_start = '2026-10-01', period_end = '2026-10-31'
 where user_id = '00000000-0000-4000-8000-00000000a001' and kind = 'month';
select pg_temp.assert_true((select count(*) from public.wrap_up_shares where user_id = '00000000-0000-4000-8000-00000000a001') = 0, 'share borrado');
select pg_temp.assert_true((select count(*) from public.posts where author_id = '00000000-0000-4000-8000-00000000a001' and kind = 'wrap_up') = 0, 'post borrado');

rollback;
