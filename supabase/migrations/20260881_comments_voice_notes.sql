-- Notas de voz como comentarios (spec 2026-08-26): 3 columnas en `comments`,
-- cuerpo texto-XOR-audio, bucket privado `voice-notes` y snapshot de reporte
-- que conserva la ruta del audio (sin esto, reportar un audio llega vacío).
--
-- Grants (issue #375): INSERT en comments sigue siendo de TABLA completa, así
-- que las columnas nuevas son insertables sin tocar nada. UPDATE es por
-- columna (body, is_spoiler, edited_at) y las de audio NO se añaden a
-- propósito: una nota de voz publicada es inmutable (el MVP no edita audio).

alter table public.comments
  add column audio_path text null,
  add column audio_duration_ms integer null,
  add column audio_peaks smallint[] null;

-- El CHECK viejo exigía texto 1..2000 siempre; ahora: o texto canónico sin
-- audio, o audio con body vacío (nunca ambos, nunca ninguno — spec §6).
alter table public.comments drop constraint comments_body_canonical;
alter table public.comments add constraint comments_body_canonical check (
  body = btrim(body)
  and (
    (audio_path is null and char_length(body) between 1 and 2000)
    or (audio_path is not null and body = '')
  )
);

alter table public.comments add constraint comments_audio_canonical check (
  (audio_path is null and audio_duration_ms is null and audio_peaks is null)
  or (
    audio_path is not null
    and audio_path = btrim(audio_path)
    and audio_duration_ms between 2000 and 60000
    and coalesce(array_length(audio_peaks, 1), 0) between 0 and 64
  )
);

-- Bucket PRIVADO: sin policy de SELECT ni de INSERT sobre storage.objects —
-- nadie salvo service-role lo toca; la reproducción va por URL firmada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 2097152, array['audio/webm', 'audio/mp4'])
on conflict (id) do nothing;

-- La rama `when 'comment'` de prepare_content_report solo copiaba `body`: con
-- un audio el moderador recibiría un snapshot vacío. Se re-crea la función
-- entera (sin cambios en el resto de ramas) con las claves de audio añadidas.
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
  end case;

  if v_reported_user_id is null or v_snapshot is null then
    raise exception 'invalid_report_target' using errcode = '23503';
  end if;

  new.reported_user_id := v_reported_user_id;
  new.snapshot := v_snapshot;
  return new;
end;
$function$;
