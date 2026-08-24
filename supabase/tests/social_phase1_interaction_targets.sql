-- Regression matrix for Social Phase 1 interaction targets.
-- Run against biblioshare-dev only. Every write is rolled back.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_expected_state text, p_message text)
returns void language plpgsql as $function$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then return; end if;
    raise exception 'assertion_failed: % (expected SQLSTATE %, got %)', p_message, p_expected_state, v_state;
  end;
  raise exception 'assertion_failed: % (statement unexpectedly succeeded)', p_message;
end;
$function$;

-- Carol NO es miembro del club: existe solo para las aserciones negativas de los
-- helpers RLS (moderar / ver un comentario ajeno).
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000001a1', 'authenticated', 'authenticated', 'phase1-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000001b2', 'authenticated', 'authenticated', 'phase1-bob@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000001c3', 'authenticated', 'authenticated', 'phase1-carol@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000001a1', 'phase1_alice', 'Alice', true, 'user'),
  ('00000000-0000-4000-8000-0000000001b2', 'phase1_bob', 'Bob', true, 'user'),
  ('00000000-0000-4000-8000-0000000001c3', 'phase1_carol', 'Carol', true, 'user');
insert into public.books (id, title, author) values ('00000000-0000-4000-8000-000000000101', 'Phase 1 book', 'Test author');
insert into public.passes (id, user_id, item_type, item_id, is_active) values
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000001a1', 'book', '00000000-0000-4000-8000-000000000101', true);
insert into public.progress_sessions (id, user_id, pass_id, duration_minutes) values
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000102', 20);
insert into public.clubs (id, slug, name, visibility, owner_id) values
  ('00000000-0000-4000-8000-000000000104', 'phase1-targets', 'Phase 1 targets', 'public', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_members (club_id, user_id, role, status) values
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001a1', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001b2', 'moderator', 'active');
insert into public.club_posts (id, club_id, author_id, kind, body) values
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001a1', 'text', 'Phase 1 cleanup post');
insert into public.club_activities (id, club_id, kind, title, created_by) values
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000104', 'buddy_read', 'Phase 1 activity', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_activity_participants (activity_id, user_id) values
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_activity_checkpoints (id, activity_id, label, position, "order", created_by) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000106', 'Checkpoint', '{}'::jsonb, 1, '00000000-0000-4000-8000-0000000001b2');
insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000001a1');
-- Carol entra en la actividad, marca el checkpoint como leído y se sale. Salir NO
-- borra la fila de lectura: es exactamente el estado de un ex-participante (o de
-- un expulsado del club) y la razón por la que la visibilidad del checkpoint no
-- puede descansar solo en `has_reached_checkpoint`.
insert into public.club_activity_participants (activity_id, user_id) values
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000001c3');
insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000001c3');
delete from public.club_activity_participants
where activity_id = '00000000-0000-4000-8000-000000000106'
  and user_id = '00000000-0000-4000-8000-0000000001c3';
select pg_temp.assert_true(
  exists (
    select 1 from public.club_activity_checkpoint_reads
    where checkpoint_id = '00000000-0000-4000-8000-000000000107'
      and user_id = '00000000-0000-4000-8000-0000000001c3'
  ) and not exists (
    select 1 from public.club_activity_participants
    where activity_id = '00000000-0000-4000-8000-000000000106'
      and user_id = '00000000-0000-4000-8000-0000000001c3'
  ),
  'salir de la actividad no borra la fila de lectura del checkpoint'
);

select pg_temp.assert_true(to_regclass('public.interaction_targets') is not null, 'interaction_targets exists');
select pg_temp.assert_true(exists (select 1 from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102'), 'pass source gets canonical target');
select pg_temp.assert_true(
  (select audience_kind = 'profile' from public.interaction_targets where kind = 'diary_entry' and source_id = '00000000-0000-4000-8000-000000000102')
  and (select audience_kind = 'club_member' from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')
  and (select audience_kind = 'activity_participant' from public.interaction_targets where kind = 'club_activity' and source_id = '00000000-0000-4000-8000-000000000106')
  and (select audience_kind = 'checkpoint_reached' from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107'),
  'all four audience kinds are materialized'
);
select pg_temp.assert_true(
  (select owner_id = '00000000-0000-4000-8000-0000000001b2'
   from public.interaction_targets
   where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107'),
  'checkpoint target owner is the checkpoint creator, not the activity creator'
);

insert into public.comments (id, interaction_target_id, author_id, body) values
  (
    '00000000-0000-4000-8000-000000000108',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
    '00000000-0000-4000-8000-0000000001b2',
    'Cleanup comment'
  );
insert into public.reactions (id, interaction_target_id, user_id, kind) values
  (
    '00000000-0000-4000-8000-000000000109',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
    '00000000-0000-4000-8000-0000000001b2',
    '❤️'
  );
insert into public.notifications (id, user_id, actor_id, type, target_type, target_id) values
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2', 'club_post_commented', 'club_post', '00000000-0000-4000-8000-000000000105');
set local role service_role;
insert into public.notifications (id, user_id, actor_id, type, interaction_target_id) values
  (
    '00000000-0000-4000-8000-000000000112',
    '00000000-0000-4000-8000-0000000001a1',
    '00000000-0000-4000-8000-0000000001b2',
    'club_post_liked',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')
  );
reset role;
select pg_temp.assert_true(
  (select n.interaction_target_id = t.id
   from public.notifications n
   join public.interaction_targets t on t.kind = 'club_post' and t.source_id = '00000000-0000-4000-8000-000000000105'
   where n.id = '00000000-0000-4000-8000-000000000112'),
  'service-role canonical-only notification insert preserves interaction target'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
update public.notifications
set interaction_target_id = (
  select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102'
)
where id = '00000000-0000-4000-8000-000000000112';
reset role;
select pg_temp.assert_true(
  (select interaction_target_id is null from public.notifications where id = '00000000-0000-4000-8000-000000000112'),
  'updating canonical-only notification cannot introduce client-controlled target metadata'
);
insert into public.content_reports (id, reporter_id, target_type, target_id, reason, snapshot) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-0000000001b2', 'club_post', '00000000-0000-4000-8000-000000000105', 'spam', '{}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102')), 'public profile audience is visible');
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')), 'club member audience is visible');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'club_activity' and source_id = '00000000-0000-4000-8000-000000000106')), 'non-participant cannot view activity audience');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer who has not reached checkpoint cannot view it');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer who reached checkpoint can view it before blocking');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-0000000001a1');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'checkpoint owner blocking viewer hides checkpoint');
reset role;
delete from public.user_blocks
where blocker_id = '00000000-0000-4000-8000-0000000001b2'
  and blocked_id = '00000000-0000-4000-8000-0000000001a1';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer blocking checkpoint owner hides checkpoint');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102')), 'bidirectional block hides canonical target');
reset role;
delete from public.user_blocks
where blocker_id = '00000000-0000-4000-8000-0000000001a1'
  and blocked_id = '00000000-0000-4000-8000-0000000001b2';

-- Un cliente real solo aporta el id canónico: la política de inserción es la que
-- comprueba visibilidad y `commentable`.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
insert into public.comments (id, interaction_target_id, author_id, body) values
  (
    '00000000-0000-4000-8000-000000000113',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
    '00000000-0000-4000-8000-0000000001b2',
    'Comentario por politica canonica'
  );
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000113'),
  'un miembro del club comenta aportando solo el id canonico'
);

select pg_temp.expect_sqlstate($$insert into public.comments (interaction_target_id, author_id, body) values ('00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-0000000001b2', 'Bad target')$$, '23503', 'comment rejects unknown target UUID');
select pg_temp.expect_sqlstate($$insert into public.reactions (interaction_target_id, user_id, kind) values ('00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-0000000001b2', '❤️')$$, '23503', 'reaction rejects unknown target UUID');
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (interaction_target_id, user_id, kind)
    values ('00000000-0000-4000-8000-00000000ffff',
      '00000000-0000-4000-8000-0000000000c3', '❤️')$$,
  '23503',
  'una reacción requiere target canónico existente'
);
select pg_temp.expect_sqlstate(
  $$update public.comments set interaction_target_id = null
    where id = '00000000-0000-4000-8000-000000000108'$$,
  '23502',
  'un comentario no puede quedarse sin target canónico'
);
select pg_temp.expect_sqlstate(
  $$update public.reactions set interaction_target_id = null
    where id = '00000000-0000-4000-8000-000000000109'$$,
  '23502',
  'una reacción no puede quedarse sin target canónico'
);
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (interaction_target_id, user_id, kind)
    select id, '00000000-0000-4000-8000-0000000001b2', '❤️'
    from public.interaction_targets
    where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'$$,
  '23505',
  'la unicidad de reacción se aplica sobre el target canónico'
);

-- El CHECK reactions_kind_emoji exige al menos un carácter no ASCII: rechaza
-- texto plano, aunque parezca un "kind" razonable de la paleta vieja.
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (interaction_target_id, user_id, kind)
    values (
      (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
      '00000000-0000-4000-8000-0000000001b2', 'like')$$,
  '23514',
  'el CHECK reactions_kind_emoji rechaza texto plano'
);

-- Tope de MAX_REACTIONS_PER_TARGET (6) emojis distintos por persona y target:
-- el trigger reactions_cap_before_insert debe lanzar reaction_cap_reached
-- (mapeado a check_violation, 23514) al séptimo emoji distinto del mismo
-- (target, user). Bob ya tiene un '❤️' sobre este target por la inserción de
-- arriba, así que hacen falta 5 emojis más para llegar a 6 y un séptimo que
-- reviente el trigger.
insert into public.reactions (interaction_target_id, user_id, kind)
select
  (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
  '00000000-0000-4000-8000-0000000001b2',
  emoji
from unnest(array['📖', '😱', '🔥', '😂', '👏']) as emoji;
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (interaction_target_id, user_id, kind)
    values (
      (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
      '00000000-0000-4000-8000-0000000001b2', '🎉')$$,
  '23514',
  'el trigger reactions_cap_before_insert lanza reaction_cap_reached al séptimo emoji distinto'
);

-- Contrato: las columnas polimórficas heredadas ya no existen en comments ni
-- reactions y nadie las resuelve por compatibilidad.
select pg_temp.assert_true(
  (select count(*) = 2 from information_schema.columns
   where table_schema = 'public' and table_name in ('comments', 'reactions')
     and column_name = 'interaction_target_id' and is_nullable = 'NO'),
  'interaction_target_id es obligatorio en comments y reactions'
);
select pg_temp.assert_true(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('comments', 'reactions')
      and column_name in ('target_type', 'target_id')
  ),
  'comments y reactions ya no tienen el par polimórfico heredado'
);
select pg_temp.assert_true(
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.reactions'::regclass and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (interaction_target_id, user_id, kind)'
  ),
  'reactions es única por (interaction_target_id, user_id, kind)'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public'
      and c.relname in ('comments', 'reactions')
      and pg_get_triggerdef(t.oid) ilike '%resolve_%interaction_target%'
  ),
  'no queda trigger de compatibilidad polimórfica sobre comments ni reactions'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'resolve_comment_interaction_target',
        'resolve_reaction_interaction_target',
        'resolve_interaction_target'
      )
  ),
  'las funciones de resolución polimórfica se retiran con las columnas'
);
select pg_temp.assert_true(
  (select pg_get_functiondef(p.oid) not ilike '%public.comments%'
      and pg_get_functiondef(p.oid) not ilike '%public.reactions%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'cleanup_social_target'),
  'la limpieza polimórfica ya no borra comentarios ni reacciones: lo hace la cascada'
);
select pg_temp.assert_true(
  (select not commentable and reactable
   from public.interaction_targets
   where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000108'),
  'el target de un comentario no es comentable: no hay respuestas anidadas'
);

-- El invariante "sin respuestas anidadas" ya no es un CHECK ni depende de la
-- política RLS de inserción: lo sostiene un trigger BEFORE INSERT, así que
-- también rechaza al escritor privilegiado (service_role, postgres, fixtures e2e
-- y cualquier función `security definer`).
select pg_temp.expect_sqlstate(
  $$insert into public.comments (interaction_target_id, author_id, body)
    select t.id, '00000000-0000-4000-8000-0000000001b2', 'Respuesta anidada'
    from public.interaction_targets t
    where t.kind = 'comment' and t.source_id = '00000000-0000-4000-8000-000000000108'$$,
  '23514',
  'ni el escritor privilegiado puede responder a un comentario'
);
-- Y tampoco por la puerta de atrás: reapuntar un comentario ya escrito hacia el
-- target de otro comentario es anidar igual, así que el trigger cubre también el
-- UPDATE de `interaction_target_id`.
insert into public.comments (id, interaction_target_id, author_id, body) values
  (
    '00000000-0000-4000-8000-000000000115',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'),
    '00000000-0000-4000-8000-0000000001b2',
    'Comentario que intentara reapuntarse'
  );
select pg_temp.expect_sqlstate(
  $$update public.comments
    set interaction_target_id = (
      select t.id from public.interaction_targets t
      where t.kind = 'comment' and t.source_id = '00000000-0000-4000-8000-000000000108'
    )
    where id = '00000000-0000-4000-8000-000000000115'$$,
  '23514',
  'ni el escritor privilegiado puede reapuntar un comentario a otro comentario'
);
select pg_temp.assert_true(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public' and c.relname = 'comments'
      and t.tgname = 'trg_comments_enforce_commentable'
      and (t.tgtype & 2) = 2    -- BEFORE
      and (t.tgtype & 4) = 4    -- INSERT
      and (t.tgtype & 16) = 16  -- UPDATE
      and (t.tgtype & 1) = 1    -- FOR EACH ROW
      -- ...y el UPDATE está acotado a la columna canónica, no a la fila entera.
      and (select array_agg(a.attname::text order by a.attname::text)
           from pg_attribute a
           where a.attrelid = t.tgrelid and a.attnum = any(t.tgattr::int2[]))
          = array['interaction_target_id']
  ),
  'el no anidamiento vive en un trigger BEFORE INSERT OR UPDATE OF interaction_target_id'
);
-- El trigger debe ser ENABLE ALWAYS ('A'), no la 'O' por defecto: el CHECK que
-- sustituye sí se aplicaba con `session_replication_role = 'replica'`
-- (pg_restore --disable-triggers, restore/branching de Supabase, apply de
-- replicación lógica). Con la 'O' el invariante sería más débil que antes.
-- Se comprueba primero por comportamiento y luego por catálogo.
set local session_replication_role = replica;
select pg_temp.expect_sqlstate(
  $$insert into public.comments (interaction_target_id, author_id, body)
    select t.id, '00000000-0000-4000-8000-0000000001b2', 'Respuesta anidada bajo replica'
    from public.interaction_targets t
    where t.kind = 'comment' and t.source_id = '00000000-0000-4000-8000-000000000108'$$,
  '23514',
  'el no anidamiento se aplica tambien con session_replication_role = replica'
);
set local session_replication_role = origin;
select pg_temp.assert_true(
  (select t.tgenabled = 'A'
   from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'comments'
     and t.tgname = 'trg_comments_enforce_commentable'),
  'el trigger de no anidamiento es ENABLE ALWAYS, no ENABLE ORIGIN'
);

-- El invariante descansa en `commentable = false` para los targets `kind='comment'`,
-- así que ese flag no puede ponerse a true ni por SQL directo. El
-- `comment_notification_type` va a un valor válido a propósito, para que el check
-- de forma preexistente (`commentable = (comment_notification_type is not null)`)
-- quede satisfecho y el único que pueda rechazar sea el nuevo.
select pg_temp.expect_sqlstate(
  $$update public.interaction_targets
    set commentable = true, comment_notification_type = 'review_commented'
    where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000108'$$,
  '23514',
  'el target de un comentario no puede marcarse como comentable'
);
select pg_temp.assert_true(
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.interaction_targets'::regclass and c.contype = 'c'
      and c.conname = 'interaction_targets_comment_not_commentable'
  ),
  'existe el check que hace irrepresentable un target de comentario comentable'
);

-- Ramas `comment` de las cuatro funciones reescritas: todas resuelven el padre por
-- `interaction_targets` en vez de por el par heredado.
select pg_temp.assert_true(
  private.social_target_club_id('comment', '00000000-0000-4000-8000-000000000108')
    = '00000000-0000-4000-8000-000000000104',
  'social_target_club_id de un comentario devuelve el club del padre'
);
insert into public.content_reports (id, reporter_id, target_type, target_id, reason, snapshot) values
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-0000000001a1', 'comment', '00000000-0000-4000-8000-000000000108', 'spam', '{}'::jsonb);
select pg_temp.assert_true(
  (select cr.reported_user_id = '00000000-0000-4000-8000-0000000001b2'
      and cr.snapshot->>'body' = 'Cleanup comment'
      and cr.snapshot->>'target_type' = 'club_post'
      and cr.snapshot->>'target_id' = '00000000-0000-4000-8000-000000000105'
   from public.content_reports cr
   where cr.id = '00000000-0000-4000-8000-000000000114'),
  'el snapshot del reporte de un comentario conserva la identidad del padre'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  private.can_moderate_comment('00000000-0000-4000-8000-000000000108'),
  'el owner del club modera un comentario ajeno resolviendo el padre canonico'
);
select pg_temp.assert_true(
  public.can_view_target('comment', '00000000-0000-4000-8000-000000000108'),
  'un miembro del club ve el comentario a traves de la visibilidad del padre'
);
reset role;

-- Caso negativo de los dos helpers: sin él, una función que devolviera `true`
-- incondicionalmente pasaría las aserciones positivas de arriba. Carol está
-- autenticada pero no es miembro del club del post padre.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  not private.can_moderate_comment('00000000-0000-4000-8000-000000000108'),
  'quien no es autor ni modera el padre no puede moderar el comentario'
);
select pg_temp.assert_true(
  not public.can_view_target('comment', '00000000-0000-4000-8000-000000000108'),
  'quien no es miembro del club del padre no ve el comentario'
);
reset role;

-- ---------------------------------------------------------------------------
-- Matriz de HERENCIA de audiencia: el target `kind='comment'`, no el del padre.
--
-- `private.sync_comment_interaction_target` copia del padre `audience_kind` y
-- `audience_id`, pero pone `source_id = new.id` (el id del comentario). Hasta
-- aquí la suite solo comprobaba la visibilidad del target PROPIO de cada fuente,
-- donde `source_id = audience_id` coinciden por casualidad en el checkpoint — y
-- por eso se coló que la rama `checkpoint_reached` leyera `source_id`. Un
-- comentario en el chat de un checkpoint quedaba con la fila visible por la
-- política de `comments` pero el target canónico invisible, que es el estado que
-- `getInteractionSummary` trata como corrupción: 500 permanente en
-- `/club/<slug>/actividad/<id>` para todos los participantes.
--
-- Se cubren las cuatro audiencias sobre targets HEREDADOS, en positivo y en
-- negativo.
insert into public.comments (id, interaction_target_id, author_id, body) values
  ('00000000-0000-4000-8000-000000000116',
   (select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107'),
   '00000000-0000-4000-8000-0000000001b2', 'Comentario en el chat del checkpoint'),
  ('00000000-0000-4000-8000-000000000117',
   (select id from public.interaction_targets where kind = 'club_activity' and source_id = '00000000-0000-4000-8000-000000000106'),
   '00000000-0000-4000-8000-0000000001b2', 'Comentario en la actividad'),
  ('00000000-0000-4000-8000-000000000118',
   (select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102'),
   '00000000-0000-4000-8000-0000000001b2', 'Comentario en el pase');
select pg_temp.assert_true(
  (select count(*) = 4
   from public.interaction_targets t
   where t.kind = 'comment'
     and t.source_id in (
       '00000000-0000-4000-8000-000000000108',
       '00000000-0000-4000-8000-000000000116',
       '00000000-0000-4000-8000-000000000117',
       '00000000-0000-4000-8000-000000000118'
     )
     and t.source_id <> t.audience_id),
  'un target heredado tiene source_id propio y audience_id del padre: nunca coinciden'
);

-- Alice: dueña del pase, dueña del club, participante de la actividad y con el
-- checkpoint marcado como leído. Ve los cuatro comentarios heredados.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000118')),
  'audiencia profile heredada: el target del comentario de un pase publico es visible'
);
select pg_temp.assert_true(
  public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000108')),
  'audiencia club_member heredada: un miembro del club ve el target del comentario del post'
);
select pg_temp.assert_true(
  public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000117')),
  'audiencia activity_participant heredada: un participante ve el target del comentario de la actividad'
);
select pg_temp.assert_true(
  public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000116')),
  'audiencia checkpoint_reached heredada: quien participa Y ha leido el checkpoint ve el target del comentario'
);
reset role;

-- Bob: miembro del club, pero NI participante de la actividad NI ha leído el
-- checkpoint. Ve lo del club y lo del perfil publico, nada de la actividad.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000108')),
  'audiencia club_member heredada: otro miembro del club tambien ve el target del comentario'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000117')),
  'audiencia activity_participant heredada: quien no participa no ve el target del comentario'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000116')),
  'audiencia checkpoint_reached heredada: quien no ha leido el checkpoint no ve el target del comentario'
);
reset role;

-- Carol: EX-participante con la fila de lectura todavía viva, y ni siquiera
-- miembro del club. La rama `checkpoint_reached` tiene que exigir los DOS
-- conjuntos que exige `public.can_view_target('activity_checkpoint', …)`
-- —`is_activity_participant` Y `has_reached_checkpoint`—, no solo la lectura:
-- si no, salir de la actividad o ser expulsado del club deja acceso de lectura
-- al chat del checkpoint por la Data API.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  public.has_reached_checkpoint('00000000-0000-4000-8000-000000000107')
    and not public.is_activity_participant('00000000-0000-4000-8000-000000000106'),
  'el ex-participante conserva la lectura pero no la participacion'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')),
  'el ex-participante no ve el target propio del checkpoint aunque su fila de lectura siga viva'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000116')),
  'el ex-participante no ve el target heredado del comentario del checkpoint'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'comment' and source_id = '00000000-0000-4000-8000-000000000108')),
  'audiencia club_member heredada: quien no es miembro no ve el target del comentario'
);
reset role;
-- Y la delegación es literal: la rama `checkpoint_reached` tiene que decir lo
-- mismo que la definición canónica de "puedo ver este checkpoint".
select pg_temp.assert_true(
  (select pg_get_functiondef(p.oid) ilike '%can_view_target(''activity_checkpoint''%t.audience_id%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'can_view_interaction_target'),
  'la rama checkpoint_reached delega en can_view_target sobre audience_id, no sobre source_id'
);

delete from public.club_posts where id = '00000000-0000-4000-8000-000000000105';
select pg_temp.assert_true(not exists (select 1 from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'), 'deleting post deletes its target');
select pg_temp.assert_true(not exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000108'), 'target cascade deletes comments');
select pg_temp.assert_true(not exists (select 1 from public.reactions where id = '00000000-0000-4000-8000-000000000109'), 'target cascade deletes reactions');
select pg_temp.assert_true(not exists (select 1 from public.notifications where id = '00000000-0000-4000-8000-000000000110'), 'target cascade deletes notifications');
select pg_temp.assert_true(exists (select 1 from public.content_reports where id = '00000000-0000-4000-8000-000000000111' and target_deleted_at is not null), 'report is preserved with deletion timestamp');

rollback;
