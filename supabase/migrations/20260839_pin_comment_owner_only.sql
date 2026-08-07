-- 20260839 — Fijar comentarios pasa a ser SOLO del dueño del target, no
-- moderador/admin. Petición del dueño: «fijar un comentario de un post solo
-- debería poder hacerlo el dueño del post». Antes `pin_comment` aceptaba
-- dueño-o-moderador, y como el admin global pasa `can_moderate_comment`, podía
-- fijar en posts ajenos.
--
-- Separación de responsabilidades: FIJAR es curación del dueño sobre SU propio
-- contenido; MODERAR (borrar) sigue siendo de admin/moderador (via
-- `private.can_moderate_comment`, que NO se toca aquí ni en las policies de
-- borrado). `interaction_targets.owner_id` es NOT NULL, así que siempre hay un
-- dueño (autor de la reseña/post, creador de la actividad): no deja ningún hilo
-- sin poder fijar. `create or replace` conserva los grants existentes.
create or replace function public.pin_comment(p_comment_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_target uuid; v_owner uuid;
begin
  select c.interaction_target_id into v_target
    from public.comments c where c.id = p_comment_id;
  if not found then raise exception 'comment_not_found' using errcode = '23503'; end if;
  select t.owner_id into v_owner from public.interaction_targets t where t.id = v_target;
  if v_owner is distinct from (select auth.uid()) then
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
