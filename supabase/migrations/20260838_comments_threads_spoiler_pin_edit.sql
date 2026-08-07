-- 20260838 — Hilos (respuestas), spoilers, fijado y edición de comentarios.
-- Diseño: docs/superpowers/specs/2026-08-07-chats-comments-restructure-design.md
-- Las respuestas cuelgan del MISMO interaction_target que su raíz (el post), con
-- parent_id para el contexto; el trigger commentable=false NO se toca (una
-- respuesta apunta al post, que es commentable). Profundidad libre en datos; la
-- UI aplana a dos niveles.

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade,
  add column if not exists is_spoiler boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists edited_at timestamptz;

create index if not exists comments_parent_idx on public.comments (parent_id);

-- Un padre debe existir y compartir hilo (mismo interaction_target). Sin límite de
-- profundidad. Trigger dedicado (el de commentable es BEFORE UPDATE OF
-- interaction_target_id y no cubre parent_id).
create or replace function private.enforce_comment_parent_same_target()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_parent_target uuid;
begin
  if new.parent_id is null then return new; end if;
  select c.interaction_target_id into v_parent_target
    from public.comments c where c.id = new.parent_id;
  if not found then
    raise exception 'comment_parent_not_found' using errcode = '23503';
  end if;
  if v_parent_target is distinct from new.interaction_target_id then
    raise exception 'comment_parent_other_thread' using errcode = '23514';
  end if;
  return new;
end;
$fn$;
revoke execute on function private.enforce_comment_parent_same_target() from public, anon, authenticated;
drop trigger if exists trg_comments_enforce_parent on public.comments;
create trigger trg_comments_enforce_parent
  before insert or update of parent_id on public.comments
  for each row execute function private.enforce_comment_parent_same_target();
alter table public.comments enable always trigger trg_comments_enforce_parent;

-- Editar el propio comentario (cuerpo/spoiler/edited_at). Hoy NO existe policy de
-- UPDATE (así que nada puede actualizar comments todavía). `comments` tiene un
-- grant UPDATE de TABLA por defecto de Supabase: hay que REVOCARLO antes de
-- conceder por columna, porque los grants por columna no estrechan uno de tabla.
-- Así el autor solo puede cambiar body/is_spoiler/edited_at; NO author_id,
-- parent_id ni pinned. pinned se cambia solo por pin_comment (SECURITY DEFINER,
-- corre como owner y no le afecta el revoke).
revoke update on public.comments from anon, authenticated;
grant update (body, is_spoiler, edited_at) on public.comments to authenticated;
create policy "comments update own canonical" on public.comments
  for update to authenticated
  using ((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id))
  with check ((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id));

-- Fijar: dueño del target o moderador. SECURITY DEFINER (corre como owner,
-- salta RLS/grants), así que 'pinned' no necesita grant para authenticated.
-- Invariante: uno fijado por hilo.
create or replace function public.pin_comment(p_comment_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_target uuid; v_owner uuid;
begin
  select c.interaction_target_id into v_target
    from public.comments c where c.id = p_comment_id;
  if not found then raise exception 'comment_not_found' using errcode = '23503'; end if;
  select t.owner_id into v_owner from public.interaction_targets t where t.id = v_target;
  if not (v_owner = (select auth.uid()) or private.can_moderate_comment(p_comment_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_pinned then
    update public.comments set pinned = false
      where interaction_target_id = v_target and pinned and id <> p_comment_id;
    update public.comments set pinned = true where id = p_comment_id;
  else
    update public.comments set pinned = false where id = p_comment_id;
  end if;
end;
$fn$;
revoke execute on function public.pin_comment(uuid, boolean) from public, anon, authenticated;
grant execute on function public.pin_comment(uuid, boolean) to authenticated;

-- CRITICAL fix (post-review): self-pin via INSERT bypassed pin_comment entirely —
-- the table-wide INSERT grant was untouched by the UPDATE revoke above, and the
-- insert policy never constrained `pinned`, so `insert into comments (..., pinned)
-- values (..., true)` let any author pin their own comment (and stack N pinned
-- rows in one thread) without ever going through pin_comment's owner/moderator
-- gate. Close it at the policy (pinned must start false) AND with a DB-level
-- backstop (partial unique index) so the one-pin-per-thread invariant holds even
-- if some future path forgets the policy. pin_comment stays compatible: it
-- unsets the previous pinned row and sets the new one in two separate
-- statements, never both pinned=true in the same row/moment.
drop policy if exists "comments insert own canonical" on public.comments;
create policy "comments insert own canonical" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_view_interaction_target(interaction_target_id)
    and exists (select 1 from public.interaction_targets t
                where t.id = interaction_target_id and t.commentable)
    and pinned = false
  );

create unique index if not exists comments_one_pinned_per_thread
  on public.comments (interaction_target_id) where pinned;
