-- Fase 1 social — migración de contrato.
--
-- `public.interaction_targets` pasa a ser la identidad obligatoria de comentarios
-- y reacciones: su columna canónica se vuelve `not null`, la unicidad de reacción
-- se apoya en ella y el par polimórfico heredado (`target_type`/`target_id`)
-- desaparece de esas dos tablas.
--
-- `notifications` CONSERVA su par heredado nullable: los avisos de club, invitación
-- y evento no tienen fila en el registro canónico y siguen resolviéndose por ahí.

-- ATOMICIDAD: todo el contrato debe aplicarse en una única transacción — si la
-- guarda de backfill falla, no puede quedar ni un `not null` puesto ni una
-- columna borrada a medias. NO se abre aquí un `begin`/`commit` explícito: la CLI
-- (`supabase db push`) ya envuelve cada migración en su propia transacción, y un
-- `commit` aquí dentro cerraría la transacción externa a mitad del lote (Fase 1
-- se despliega como cadena expansiva → hardening → writer-fix → contrato),
-- confirmando las migraciones anteriores y dejando el apunte del ledger fuera de
-- toda transacción. Si se aplica a mano, hacerlo con:
--     psql --single-transaction -f <este fichero>

-- 1. Guarda de backfill: no seguimos si la migración expansiva dejó filas huérfanas.
do $$ begin
  if exists (select 1 from public.comments where interaction_target_id is null)
     or exists (select 1 from public.reactions where interaction_target_id is null) then
    raise exception 'interaction_target_backfill_incomplete';
  end if;
end $$;

-- 2. Fuera la compatibilidad expand/migrate: ya nadie deriva el id canónico del par
--    heredado, así que los triggers de resolución y su función auxiliar sobran.
drop trigger if exists trg_comments_resolve_interaction_target on public.comments;
drop trigger if exists trg_reactions_resolve_interaction_target on public.reactions;
drop function if exists private.resolve_comment_interaction_target();
drop function if exists private.resolve_reaction_interaction_target();
drop function if exists private.resolve_interaction_target(public.target_kind, uuid);

-- 3. El id canónico es obligatorio.
alter table public.comments alter column interaction_target_id set not null;
alter table public.reactions alter column interaction_target_id set not null;

-- 4. Una reacción por (target canónico, usuario, tipo).
alter table public.reactions
  drop constraint if exists reactions_target_type_target_id_user_id_kind_key;
alter table public.reactions
  add constraint reactions_interaction_target_id_user_id_kind_key
  unique (interaction_target_id, user_id, kind);
-- El índice único nuevo empieza por interaction_target_id, así que cubre las
-- búsquedas y las cascadas que servía el índice suelto.
drop index if exists public.reactions_interaction_target_idx;

-- 5. Funciones que aún leían el par heredado de `comments`. Todas resuelven ahora
--    el padre de un comentario a través del registro canónico.

create or replace function private.cleanup_social_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_target_type text;
begin
  foreach v_target_type in array tg_argv loop
    update public.content_reports cr
      set status = 'actioned',
          target_deleted_at = coalesce(cr.target_deleted_at, now()),
          reviewed_at = coalesce(cr.reviewed_at, now())
      where cr.target_type::text = v_target_type
        and cr.target_id = old.id
        and cr.target_deleted_at is null;
    -- Borrar el target canónico arrastra comentarios, reacciones y avisos por FK
    -- en cascada: ya no hace falta limpiarlos por el par polimórfico.
    delete from public.interaction_targets t
      where t.kind::text = v_target_type and t.source_id = old.id;
    -- Avisos que nombran la fuente por el par heredado (club, invitación, evento
    -- y cualquier aviso cuyo id canónico apunte a otro sitio). Sin filtrar por
    -- `interaction_target_id is null`: el borrado del target canónico de arriba ya
    -- se lleva por cascada los que sí lo referencian, así que esta sentencia solo
    -- añade los que la cascada no cubre. Nunca deja huérfano un aviso de una
    -- fuente que acaba de desaparecer.
    delete from public.notifications n
      where n.target_type = v_target_type
        and n.target_id = old.id;
  end loop;
  return old;
end;
$function$;

create or replace function private.can_moderate_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.comments c
    where c.id = p_comment_id
      and (
        c.author_id = (select auth.uid())
        or exists (
          select 1
          from public.interaction_targets t
          where t.id = c.interaction_target_id
            and private.can_moderate_target(t.kind, t.source_id)
        )
      )
  );
$function$;

create or replace function private.social_target_club_id(p_target_type public.target_kind, p_target_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_parent_type public.target_kind;
  v_parent_id uuid;
  v_club_id uuid;
begin
  case p_target_type
    when 'club_post' then
      select cp.club_id into v_club_id
      from public.club_posts cp where cp.id = p_target_id;
    when 'club_activity' then
      select ca.club_id into v_club_id
      from public.club_activities ca where ca.id = p_target_id;
    when 'activity_checkpoint' then
      select ca.club_id into v_club_id
      from public.club_activity_checkpoints cc
      join public.club_activities ca on ca.id = cc.activity_id
      where cc.id = p_target_id;
    when 'comment' then
      select t.kind, t.source_id into v_parent_type, v_parent_id
      from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = p_target_id;
      if v_parent_type is not null then
        v_club_id := private.social_target_club_id(v_parent_type, v_parent_id);
      end if;
    else
      v_club_id := null;
  end case;
  return v_club_id;
end;
$function$;

create or replace function private.prepare_content_report()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reported_user_id uuid;
  v_snapshot jsonb;
begin
  case new.target_type
    when 'diary_entry' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'pass' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'episode_watch' then
      select e.user_id, jsonb_build_object(
        'review', e.review,
        'series_id', e.series_id,
        'created_at', e.created_at
      ) into v_reported_user_id, v_snapshot
      from public.episode_watches e where e.id = new.target_id;
    when 'progress_session' then
      select s.user_id, jsonb_build_object(
        'note', s.note,
        'pass_id', s.pass_id,
        'created_at', s.created_at
      ) into v_reported_user_id, v_snapshot
      from public.progress_sessions s where s.id = new.target_id;
    when 'club_post' then
      select cp.author_id, jsonb_build_object(
        'body', cp.body,
        'kind', cp.kind,
        'club_id', cp.club_id,
        'created_at', cp.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_posts cp where cp.id = new.target_id;
    when 'comment' then
      -- El snapshot conserva la identidad del padre, ahora leída del registro
      -- canónico en vez del par polimórfico.
      select c.author_id, jsonb_build_object(
        'body', c.body,
        'target_type', t.kind,
        'target_id', t.source_id,
        'created_at', c.created_at
      ) into v_reported_user_id, v_snapshot
      from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = new.target_id;
    when 'activity_checkpoint' then
      select cc.created_by, jsonb_build_object(
        'label', cc.label,
        'position', cc.position,
        'activity_id', cc.activity_id,
        'created_at', cc.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activity_checkpoints cc where cc.id = new.target_id;
    when 'club_activity' then
      select ca.created_by, jsonb_build_object(
        'title', ca.title,
        'description', ca.description,
        'kind', ca.kind,
        'club_id', ca.club_id,
        'created_at', ca.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activities ca where ca.id = new.target_id;
  end case;

  if v_reported_user_id is null or v_snapshot is null then
    raise exception 'invalid_report_target' using errcode = '23503';
  end if;

  new.reported_user_id := v_reported_user_id;
  new.snapshot := v_snapshot;
  return new;
end;
$function$;

create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = p_target_id
        and public.can_view_target(t.kind, t.source_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
    when 'club_activity' then public.is_activity_participant(p_target_id)
    when 'pass' then exists (
      select 1 from public.passes p where p.id = p_target_id and public.can_view_profile(p.user_id)
    )
    when 'progress_session' then exists (
      select 1 from public.progress_sessions s where s.id = p_target_id and public.can_view_profile(s.user_id)
    )
  end;
$function$;

-- 6. El invariante "sin respuestas anidadas" deja de vivir en `comments_no_nesting`
--    (que se apoyaba en el par heredado) y pasa a un trigger que valida el flag
--    `commentable` del target canónico. A diferencia de la política RLS de
--    inserción, esto también se aplica a `service_role`, `postgres`, fixtures e2e
--    y a cualquier escritor `security definer`. Y generaliza: cubre cualquier
--    target no comentable, no solo los de `kind = 'comment'`.
--    Cubre INSERT y UPDATE de `interaction_target_id`: reapuntar un comentario ya
--    escrito hacia el target de otro comentario anida igual que insertarlo así.
create or replace function private.enforce_comment_target_commentable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_commentable boolean;
begin
  -- Un id nulo lo rechaza el `not null` de la columna con su propio 23502: no lo
  -- adelantamos aquí para no cambiar el error que ve el cliente.
  if new.interaction_target_id is null then
    return new;
  end if;
  select t.commentable into v_commentable
  from public.interaction_targets t
  where t.id = new.interaction_target_id;
  if not found then
    raise exception 'invalid_interaction_target' using errcode = '23503';
  end if;
  if not v_commentable then
    raise exception 'target_not_commentable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke execute on function private.enforce_comment_target_commentable() from public, anon, authenticated;

drop trigger if exists trg_comments_enforce_commentable on public.comments;
create trigger trg_comments_enforce_commentable
before insert or update of interaction_target_id on public.comments
for each row execute function private.enforce_comment_target_commentable();
-- ENABLE ALWAYS y no la 'O' por defecto: un trigger `origin` no dispara con
-- `session_replication_role = 'replica'` (pg_restore --disable-triggers,
-- restore/branching de Supabase, apply de replicación lógica), y el CHECK
-- `comments_no_nesting` que sustituye sí se aplicaba en esos caminos. Sin esto el
-- invariante quedaría más débil que antes de la migración.
alter table public.comments enable always trigger trg_comments_enforce_commentable;

-- El invariante descansa además en que el target de un comentario nunca sea
-- comentable. Se hace irrepresentable en la tabla: sin este check, un
-- `update public.interaction_targets set commentable = true where kind = 'comment'`
-- reabriría el anidamiento por debajo del trigger. Compone con
-- `interaction_targets_commentable_shape` (commentable = comment_notification_type
-- is not null): juntos obligan a que un target `comment` tenga además
-- `comment_notification_type is null`, que es justo lo que escribe
-- `private.sync_comment_interaction_target`.
alter table public.interaction_targets
  add constraint interaction_targets_comment_not_commentable
  check (kind <> 'comment' or not commentable);

-- 7. Fuera el par polimórfico heredado de comentarios y reacciones. El `drop
--    column` se lleva por delante `idx_comments_target` e `idx_reactions_target`,
--    que sólo indexaban ese par.
alter table public.comments drop constraint if exists comments_no_nesting;
alter table public.comments drop column if exists target_type, drop column if exists target_id;
alter table public.reactions drop column if exists target_type, drop column if exists target_id;
