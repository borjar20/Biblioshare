-- #133: validación floja y gating incompleto en la capa de RPC de eventos de club.
--
-- Cuatro huecos de la misma capa, arreglados juntos porque se pisan entre sí:
--   1. Las RPCs no acotaban la longitud de título/descripción.
--   2. `p_description` sin DEFAULT obligaba a un `as string` en cada call site
--      para colar un null que la función sí acepta.
--   3. Los errores de dominio de estas dos RPCs usaban frases con espacios
--      ('title required') mientras el cliente y `spawn_linked_activity` ya
--      usaban snake_case ('title_required').
--   4. `finish_club_activity` no excluía `kind = 'evento'`, así que el
--      invariante que el comentario de `update_club_event` daba por cierto
--      ("un evento nunca pasa a finished") no lo forzaba nadie.

-- (1) NOTA sobre el diagnóstico de la issue: daba por hipótesis ("si
-- club_activities tiene un check de longitud...") algo que YA existe --
-- `club_activities_title_len` (1..120) y `club_activities_description_len`
-- (<=2000), puestos en `20260715_text_length_limits.sql`, y presentes tanto en
-- dev como en prod. Así que el hueco no era la falta de techo en la tabla: era
-- que las RPCs de evento no lo comprobaban y dejaban que el CHECK saltara como
-- un 23514 crudo que el cliente no traduce. Los números de aquí abajo son
-- EXACTAMENTE los del CHECK a propósito: si divergieran, volvería a haber un
-- rango de longitudes que pasa la RPC y muere en Postgres.

-- (1 y 2 y 3) create_club_event: mismos límites que el CHECK de la tabla, para
-- que el camino de evento devuelva SIEMPRE un error de dominio traducible y
-- nunca un 23514 crudo de Postgres. `p_description` gana `default null`: sin él
-- el generador de tipos de Supabase lo marcaba no-nulable y cada call site
-- necesitaba un `as string` mintiendo sobre el tipo.
--
-- `p_starts_on` también gana `default null`, y no por gusto: Postgres exige que
-- todo parámetro POSTERIOR a uno con default tenga default. Reordenarlos para
-- evitarlo cambiaría la firma (uuid,text,text,date -> uuid,text,date,text) y
-- dejaría dos sobrecargas conviviendo. El coste es que el tipo generado lo
-- marca opcional; se compensa con el guard `starts_on_required` de aquí abajo y
-- con la validación de cliente en `createClubEvent`/`updateClubEvent`.
create or replace function public.create_club_event(
  p_club_id uuid,
  p_title text,
  p_description text default null,
  p_starts_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;
  if coalesce(v_title, '') = '' then
    raise exception 'title_required';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'title_too_long';
  end if;
  if char_length(coalesce(v_description, '')) > 2000 then
    raise exception 'description_too_long';
  end if;

  insert into public.club_activities
    (club_id, kind, title, description, status, created_by, starts_on)
  values
    (p_club_id, 'evento', v_title, v_description, 'active', auth.uid(), p_starts_on)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.create_club_event(uuid, text, text, date) to authenticated;

-- update_club_event: el UPDATE que club_activities no tiene -- Bloque G dejó la
-- tabla sin política UPDATE a propósito, con las transiciones encapsuladas en RPCs.
--
-- OJO: el `and kind = 'evento'` del UPDATE es OBLIGATORIO, no defensivo. Sin él,
-- esta función -- SECURITY DEFINER y gateada solo por rol -- deja a un moderador
-- reescribir título, descripción y fechas de cualquier buddy_read o
-- list_challenge por la puerta de atrás.
--
-- Mismo motivo para `and status = 'active'`: un evento nace 'active' y solo puede
-- pasar a 'archived'. Eso ya NO es solo un comentario: desde esta migración
-- `finish_club_activity` rechaza los eventos (ver abajo), así que el invariante
-- lo fuerza el esquema y no la buena voluntad del llamante.
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title text,
  p_description text default null,
  p_starts_on date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  select club_id, kind, status into v_club_id, v_kind, v_status
  from public.club_activities where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not_found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  if v_status <> 'active' then
    raise exception 'event_not_active';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;
  if coalesce(v_title, '') = '' then
    raise exception 'title_required';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'title_too_long';
  end if;
  if char_length(coalesce(v_description, '')) > 2000 then
    raise exception 'description_too_long';
  end if;

  update public.club_activities
  set title = v_title,
      description = v_description,
      starts_on = p_starts_on
  where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;

revoke execute on function public.update_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.update_club_event(uuid, text, text, date) to authenticated;

comment on function public.create_club_event(uuid, text, text, date) is
  'Crea un evento de club (kind=evento, status=active) saltando la RLS de INSERT que fuerza proposed. Moderador+. Errores de dominio en snake_case.';
comment on function public.update_club_event(uuid, text, text, date) is
  'Edita título/descripción/fecha de un EVENTO. Moderador+. Restringida a kind=evento y status=active a propósito. Errores de dominio en snake_case.';

-- (4) finish_club_activity: un evento NO se termina, se archiva. Sin este
-- filtro, cualquier creador o moderador podía mover un evento a 'finished'
-- llamando a la RPC con su uuid, sin ningún error -- y `update_club_event`
-- dejaba de aceptarlo para siempre (solo edita 'active') sin que nadie
-- entendiera por qué. Hoy no se ve en la UI porque `groupActivities` mete
-- 'finished' y 'archived' en el mismo grupo "Finalizadas"; el arreglo es para
-- que el invariante exista de verdad, no solo en un comentario.
create or replace function public.finish_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
  v_kind public.activity_kind;
  v_created_by uuid;
begin
  select club_id, status, kind, created_by into v_club_id, v_status, v_kind, v_created_by
    from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_kind = 'evento' then
    raise exception 'events cannot be finished';
  end if;
  if v_status <> 'active' then
    raise exception 'activity is not active';
  end if;
  update public.club_activities set status = 'finished' where id = p_activity_id;
end;
$$;

revoke execute on function public.finish_club_activity(uuid) from public, anon;
grant execute on function public.finish_club_activity(uuid) to authenticated;

comment on function public.finish_club_activity(uuid) is
  'Termina una actividad (creador o moderador+). Rechaza kind=evento: un evento solo pasa a archived (#133).';
