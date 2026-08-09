-- Backfill de `posts` + promoción IN-PLACE de los interaction_targets históricos.
-- Objetivo: que cada acción histórica compartible tenga su fila `posts`, y que el
-- target social de esa acción pase a kind='post' CONSERVANDO su id -> los
-- comentarios/reacciones/notificaciones (que apuntan por interaction_target_id)
-- quedan INTACTOS, sin re-apuntar.
--
-- TRAMPA (bug del plan corregido antes de ejecutar): el trigger AFTER INSERT
-- `posts_sync_interaction_target` crearía un target 'post' fresco en CADA insert
-- de backfill, colisionando con unique(kind, source_id) contra la promoción
-- in-place de abajo. Por eso: se DESACTIVA el trigger mientras se inserta y
-- promueve, y se REACTIVA al final con un fallback que materializa el target solo
-- para los posts cuyo target fuente no existía (dato viejo sin target).

-- 0) Desactivar el trigger de sync: durante el backfill el target lo aporta la
--    PROMOCIÓN in-place (preserva comentarios/reacciones), no el trigger.
alter table public.posts disable trigger posts_sync_interaction_target;

-- 1) Un post 'finished' por cada pase terminado.
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, created_at)
select gen_random_uuid(), p.user_id, 'finished', p.item_type::text::public.post_anchor_type,
       p.item_id, 'pass', p.id, p.updated_at
from public.passes p
where p.finished_on is not null
on conflict do nothing;

-- 1b) Promover el target 'diary_entry' de ese pase -> 'post' (in-place: los
--     comentarios/reacciones conservan su interaction_target_id).
update public.interaction_targets it
set kind = 'post', source_id = np.id, href = '/post/' || np.id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
from public.posts np
where np.kind = 'finished' and np.source_kind = 'pass'
  and it.kind = 'diary_entry' and it.source_id = np.source_id;

-- 2) Absorber `thoughts` -> post 'thought'. Reusar el MISMO id evita re-apuntar:
--    el target 'thought' tiene source_id = thought.id = post.id.
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, body, is_spoiler, created_at, updated_at)
select t.id, t.user_id, 'thought', t.anchor_type::text::public.post_anchor_type,
       t.anchor_id, t.body, t.is_spoiler, t.created_at, t.updated_at
from public.thoughts t
on conflict do nothing;

update public.interaction_targets it
set kind = 'post', href = '/post/' || it.source_id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
where it.kind = 'thought'
  and exists (select 1 from public.posts p where p.id = it.source_id and p.kind = 'thought');

-- 3) Sesiones de progreso con nota pública -> post 'progressed'.
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at)
select gen_random_uuid(), s.user_id, 'progressed', pa.item_type::text::public.post_anchor_type,
       pa.item_id, 'progress_session', s.id, n.body, n.is_spoiler, s.created_at
from public.progress_sessions s
join public.passes pa on pa.id = s.pass_id
join lateral (
  select body, is_spoiler from public.notes
  where session_id = s.id and is_public = true
  order by created_at desc limit 1
) n on true
on conflict do nothing;

update public.interaction_targets it
set kind = 'post', source_id = np.id, href = '/post/' || np.id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
from public.posts np
where np.kind = 'progressed' and np.source_kind = 'progress_session'
  and it.kind = 'progress_session' and it.source_id = np.source_id;

-- 3b) Reactivar el trigger y materializar los targets que faltasen. Cualquier
--     post backfilleado cuyo target fuente NO existía (dato viejo sin target) se
--     crea ahora con el MISMO helper que usa el trigger. Orden de args:
--     (kind, source_id, owner_id, audience_kind, audience_id, href,
--      commentable, reactable, comment_notification_type, reaction_notification_type)
alter table public.posts enable trigger posts_sync_interaction_target;

select private.upsert_interaction_target(
  'post', p.id, p.author_id, 'profile', p.author_id,
  '/post/' || p.id::text, true, true, 'post_commented', 'post_liked')
from public.posts p
where not exists (
  select 1 from public.interaction_targets it
  where it.kind = 'post' and it.source_id = p.id);
