-- Deep-link a nivel de comentario (posts Spec 2b): el target `kind='comment'`
-- pasa a llevar `#c-<id>` en su href, heredando la ruta del padre. Así una
-- notificación que apunte al target del comentario (una RESPUESTA a tu
-- comentario, o un like sobre él) aterriza en el SUBHILO —`/post/<id>#c-<cid>`—
-- en vez de en la cabecera genérica del post. `listNotifications` y el push
-- leen `interaction_targets.href` tal cual, así que ganan el ancla sin cambios
-- de código en esas capas.
--
-- El href del padre (post/club/checkpoint) NO tiene hash hoy; el `case` es una
-- guarda por si algún padre ya lo tuviera (no duplicar `#`). El ancla es inerte
-- en superficies sin scroll-a-hash: la ruta base no cambia, así que no rompe el
-- enrutado; simplemente no hay elemento al que saltar.

create or replace function private.sync_comment_interaction_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_parent public.interaction_targets%rowtype;
begin
  select * into v_parent from public.interaction_targets where id = new.interaction_target_id;
  if not found then raise exception 'invalid_interaction_target' using errcode = '23503'; end if;
  perform private.upsert_interaction_target('comment', new.id, new.author_id,
    v_parent.audience_kind, v_parent.audience_id,
    case when v_parent.href like '%#%' then v_parent.href
         else v_parent.href || '#c-' || new.id::text end,
    false, true, null, 'comment_liked');
  return new;
end;
$function$;

-- Backfill de los targets de comentario ya materializados (no-op en dev: 0
-- filas; real en prod). Solo los que aún no llevan ancla.
update public.interaction_targets it
set href = it.href || '#c-' || it.source_id::text
where it.kind = 'comment' and it.href not like '%#%';
