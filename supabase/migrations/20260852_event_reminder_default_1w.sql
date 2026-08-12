-- El recordatorio predeterminado de un evento pasa de 24 horas antes (1440) a
-- UNA SEMANA antes (10080). Petición del dueño: 24 h no da margen para
-- reorganizar la agenda, que es para lo que sirve seguir un evento.
--
-- 10080 ya era un valor válido (`private.valid_event_reminder` lo acepta desde
-- 20260823) y ya se ofrecía en el selector, así que esto NO amplía el conjunto
-- de valores: solo cambia cuál se elige cuando nadie elige.
--
-- Hay que tocar DOS sitios, y el segundo es el que se olvida:
--   1. el default del parámetro de follow_club_event;
--   2. el auto-seguimiento del ORGANIZADOR dentro de create_club_event, que
--      inserta su fila directamente y nunca pasa por follow_club_event.
-- El tercero, `DEFAULT_REMINDER_MINUTES` en src/lib/clubs/activities/event-state.ts,
-- es el que gobierna en la práctica: la capa TS SIEMPRE manda el valor explícito,
-- así que el default de (1) no llega a ejercitarse desde la app. Se cambia igual
-- para que el esquema no mienta al siguiente que lea la firma.
--
-- CONSECUENCIA que se acepta a propósito: seguir un evento que cae dentro de la
-- próxima semana deja el recordatorio ya vencido, y §9.1 lo entrega en el acto.
-- Con 24 h pasaba lo mismo en una ventana más corta; ahora es más frecuente. La
-- UI ya lo dice antes de guardar (`reminderTooLate`).
--
-- No se toca ninguna fila existente: quien ya sigue un evento con su 1440
-- guardado se queda como está. Cambiar preferencias ya elegidas por debajo sería
-- decidir por el usuario.

create or replace function public.follow_club_event(
  p_activity_id uuid,
  p_remind_minutes_before integer default 10080
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.valid_event_reminder(p_remind_minutes_before) then
    raise exception 'invalid_reminder';
  end if;
  perform private.assert_can_follow_event(p_activity_id);

  insert into public.club_event_followers (activity_id, user_id, remind_minutes_before)
  values (p_activity_id, auth.uid(), p_remind_minutes_before)
  on conflict (activity_id, user_id)
    do update set remind_minutes_before = excluded.remind_minutes_before;
end;
$$;

-- Copia literal de la versión de 20260842 (la de tipos de evento, que es la
-- viva) con UN cambio: el 1440 del auto-seguimiento pasa a 10080. Se replica
-- entera porque cambiar una constante dentro del cuerpo obliga a reemplazar la
-- función; si se edita esta función en el futuro, este fichero es el que manda.
create or replace function public.create_club_event(
  p_club_id     uuid,
  p_title       text,
  p_description text default null,
  p_starts_on   date default null,
  p_starts_time time default null,
  p_ends_time   time default null,
  p_timezone    text default 'Europe/Madrid',
  p_location    text default null,
  p_modality    public.event_modality default null,
  p_online_url  text default null,
  p_event_type  public.club_event_type default 'encuentro',
  p_config      jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_online_url text := nullif(trim(coalesce(p_online_url, '')), '');
  -- Sin hora: encuentro asume las 19:00 (heredado); los demás tipos, 00:00 (todo el día).
  v_starts_time time := coalesce(p_starts_time, case when p_event_type = 'encuentro' then time '19:00' else time '00:00' end);
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if coalesce(v_title, '') = '' then raise exception 'title_required'; end if;
  if char_length(v_title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(coalesce(v_description, '')) > 2000 then raise exception 'description_too_long'; end if;
  if p_starts_on is null then raise exception 'starts_on_required'; end if;

  perform private.validate_event_fields(
    p_timezone, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp at time zone p_timezone;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp at time zone p_timezone;
  end if;

  insert into public.club_activities (
    club_id, kind, event_type, title, description, status, created_by,
    starts_at, ends_at, event_timezone, location, modality, online_url, config
  ) values (
    p_club_id, 'evento', p_event_type, v_title, v_description, 'active', auth.uid(),
    v_starts_at, v_ends_at, p_timezone, v_location, p_modality, v_online_url,
    nullif(p_config, '{}'::jsonb)
  ) returning id into v_id;

  insert into public.club_event_followers (activity_id, user_id, remind_minutes_before)
  values (v_id, auth.uid(), 10080)
  on conflict (activity_id, user_id) do nothing;

  return v_id;
end;
$$;
