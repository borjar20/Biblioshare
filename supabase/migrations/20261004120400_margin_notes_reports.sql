-- Notas en el margen: denunciar una nota desde su hilo (target 'margin_encounter').
-- La política de insert de content_reports ya admite el tipo (can_view_target y
-- social_target_owner_id, migración 120300), pero el trigger BEFORE INSERT no tenía
-- rama para él: el CASE sin ELSE fallaba con "case not found". Esta migración
-- redefine private.prepare_content_report copiando la definición vigente
-- (20261004100400, verificada con pg_get_functiondef) y añadiendo SOLO esa rama.
-- Las acciones de moderación del panel de admin (moderation_state, borrar/ocultar
-- la nota) siguen fuera: las rastrea #1384.

CREATE OR REPLACE FUNCTION private.prepare_content_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reported_user_id uuid;
  v_snapshot jsonb;
begin
  case new.target_type
    when 'experience' then
      select e.creator_id,private.experience_evidence(e.id) into v_reported_user_id,v_snapshot from public.experiences e where e.id=new.target_id;
    when 'post' then
      select p.author_id,to_jsonb(p)||case when p.anchor_type='experience' then jsonb_build_object('experience',private.experience_evidence(p.anchor_id)) else '{}'::jsonb end
        into v_reported_user_id,v_snapshot from public.posts p where p.id=new.target_id;
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
      -- El snapshot conserva la identidad del padre (registro canónico) y,
      -- desde las notas de voz, la ruta del audio: el moderador necesita
      -- poder escucharlo aunque el autor borre el comentario después.
      select c.author_id, jsonb_build_object(
        'body', c.body,
        'audio_path', c.audio_path,
        'audio_duration_ms', c.audio_duration_ms,
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
    when 'experience_review' then
      select r.author_id, jsonb_build_object('rating',r.rating,'body',r.body,'experience_id',r.experience_id,'moment_id',r.moment_id,'created_at',r.created_at)
        into v_reported_user_id, v_snapshot
      from public.experience_moment_reviews r where r.id = new.target_id;
    when 'margin_encounter' then
      -- La nota denunciada es la del AUTOR (quien la dejó), no la de quien la lee:
      -- el usuario denunciado es margin_notes.author_id. El snapshot conserva el
      -- texto y el ancla por si el autor la borra después, más el id del encuentro.
      select n.author_id, jsonb_build_object(
        'body', n.body,
        'chapter_label', n.chapter_label,
        'item_type', n.item_type,
        'item_id', n.item_id,
        'anchor', n.anchor,
        'encounter_id', e.id,
        'created_at', n.created_at
      ) into v_reported_user_id, v_snapshot
      from public.margin_note_encounters e
      join public.margin_notes n on n.id = e.note_id
      where e.id = new.target_id;
  end case;

  if v_reported_user_id is null or v_snapshot is null then
    raise exception 'invalid_report_target' using errcode = '23503';
  end if;

  new.reported_user_id := v_reported_user_id;
  new.snapshot := v_snapshot;
  return new;
end;
$function$;
