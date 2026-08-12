-- Editar la cabecera de una actividad ya creada: título, descripción y las dos
-- fechas (spec 2026-08-12, issue #596).
--
-- Por qué RPC y no una política UPDATE de cliente: `club_activities` no tiene
-- ninguna, y eso es una decisión del Bloque G, no un olvido
-- (20260713_club_activities.sql:196). Las escrituras con autorización no trivial
-- se revalidan en servidor. Esta es la PRIMERA escritura de cliente sobre la
-- cabecera de esa tabla: cualquier campo que se le añada después tiene que
-- volver a pasar por las preguntas de abajo, sobre todo quién y hasta cuándo.
--
-- QUIÉN: moderator+ siempre; el creador SOLO mientras sea una propuesta.
-- Mientras nadie la ha aprobado, la actividad es de quien la propuso. En cuanto
-- el club la activa hay gente apuntada y progreso contándose, así que pasa a ser
-- un compromiso del club y la gobierna la moderación. Consecuencia asumida: un
-- creador que no modera no puede corregir ni una errata de su propio título una
-- vez activa.
--
-- HASTA CUÁNDO: proposed y active. Finalizada y archivada quedan CONGELADAS --
-- la ventana starts_on..ends_on alimenta activity_window, que decide qué
-- lecturas cuentan en los retos: moverla en algo terminado reescribiría el
-- historial de quién lo completó.
--
-- Los EVENTOS quedan fuera: ya tienen update_club_event, que además maneja hora,
-- zona, modalidad y enlace. Dos RPC escribiendo los mismos campos divergen, y la
-- que se quede atrás lo hará en silencio.
create or replace function public.update_activity_details(
  p_activity_id uuid,
  p_title       text,
  p_description text,
  p_starts_on   date,
  p_ends_on     date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id    uuid;
  v_created_by uuid;
  v_status     public.activity_status;
  v_kind       text;
  v_title      text := btrim(coalesce(p_title, ''));
  v_is_mod     boolean;
begin
  select club_id, created_by, status, kind::text
    into v_club_id, v_created_by, v_status, v_kind
    from public.club_activities
   where id = p_activity_id;

  -- No se distingue "no existe" de "la RLS no te la deja ver", a propósito: la
  -- diferencia le diría a un extraño que ese id existe.
  if v_club_id is null then
    raise exception 'not_found';
  end if;

  if v_kind = 'evento' then
    raise exception 'use_update_club_event';
  end if;

  v_is_mod := public.has_min_club_role(v_club_id, 'moderator');

  if v_created_by <> auth.uid() and not v_is_mod then
    raise exception 'forbidden';
  end if;

  -- El creador que no modera manda solo mientras sea propuesta. Este gate va
  -- ANTES que el de estado: si no, un creador intentando editar una finalizada
  -- recibiría 'dates_frozen' y creería que el problema es el momento, cuando
  -- también le faltaría el permiso.
  if not v_is_mod and v_status <> 'proposed' then
    raise exception 'forbidden';
  end if;

  if v_status not in ('proposed', 'active') then
    raise exception 'dates_frozen';
  end if;

  if v_title = '' then
    raise exception 'title_required';
  end if;

  -- Solo se rechaza la ventana INVERTIDA. Una fecha de fin en el pasado es
  -- legítima: cerrar hoy una lectura poniéndole la fecha en que de verdad
  -- terminó es un uso normal.
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'invalid_range';
  end if;

  update public.club_activities
     set title       = v_title,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         starts_on   = p_starts_on,
         ends_on     = p_ends_on
   where id = p_activity_id;
end;
$$;

comment on function public.update_activity_details(uuid, text, text, date, date) is
  'Edita título, descripción y fechas de una actividad de club (spec 2026-08-12, #596). Moderator+ siempre; el creador solo mientras esté en proposed. Finalizada/archivada congeladas: la ventana alimenta activity_window y moverla reescribiría el progreso histórico. Los eventos van por update_club_event.';

revoke execute on function public.update_activity_details(uuid, text, text, date, date) from public, anon;
grant execute on function public.update_activity_details(uuid, text, text, date, date) to authenticated;
