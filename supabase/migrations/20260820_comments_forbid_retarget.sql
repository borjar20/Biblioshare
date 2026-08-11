-- #339 — Reapuntar un comentario a otro padre dejaba su target canónico con la
-- audiencia y el href del padre VIEJO: `private.sync_comment_interaction_target`
-- es AFTER INSERT y no tiene equivalente en UPDATE.
--
-- De las dos opciones de la issue se toma la 2 (prohibir el reapuntado): mover un
-- comentario de padre no es una operación legítima —`addComment` inserta y nunca
-- reapunta— y así el derivado no puede quedar obsoleto por construcción, sin
-- añadir una segunda copia de la lógica de sincronización.
--
-- El guard vive dentro de `enforce_comment_target_commentable` porque su trigger
-- (`trg_comments_enforce_commentable`) ya es BEFORE INSERT OR UPDATE OF
-- interaction_target_id: no hace falta un trigger nuevo.

create or replace function private.enforce_comment_target_commentable()
returns trigger
language plpgsql
security definer set search_path = ''
as $function$
declare v_commentable boolean;
begin
  -- Un id nulo lo rechaza el `not null` de la columna con su propio 23502: no lo
  -- adelantamos aquí para no cambiar el error que ve el cliente.
  if new.interaction_target_id is null then
    return new;
  end if;
  -- #339: el target de un comentario deriva de su padre y solo se calcula en el
  -- AFTER INSERT. Permitir el reapuntado dejaría audiencia y href obsoletos
  -- (visibilidad y deep link del padre anterior), así que se rechaza.
  if tg_op = 'UPDATE' and new.interaction_target_id is distinct from old.interaction_target_id then
    raise exception 'comment_retarget_forbidden' using errcode = '23514';
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
