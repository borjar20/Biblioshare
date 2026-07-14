-- EPIC-05 Bloque H3b — Modalidad de compleción del reto por lista (list_challenge).
--
-- H3 fijó una regla única: un ítem cuenta si tienes un PASE DE DIARIO terminado dentro de la
-- ventana del reto. Deliberado (quien ya se lo leyó no obtiene tick gratis: registra una
-- relectura), pero OBLIGA AL REVISIONADO -- y eso ahuyenta a quien se uniría a un reto del que
-- ya tiene media lista leída. Este bloque añade una SEGUNDA modalidad, opcional y por reto:
--
--   'window' (DEFAULT, comportamiento de H3) -- pase de diario dentro de la ventana.
--   'any'                                    -- basta con tener el ítem en la biblioteca con
--                                               status 'completed', sin importar cuándo ni si
--                                               hay pase de diario.
--
-- Cero tablas y cero columnas nuevas: el modo vive en club_activities.config
-- ('completionMode'), el jsonb que ya usan el criterio de H4 y los tiers de H2. Un reto ya
-- creado no tiene la clave -> se comporta como 'window' sin migración de datos.


-- ── 1. El tablero, con la regla dentro ───────────────────────────────────────
--
-- El modo se lee DENTRO de la función, no se pasa como parámetro: get_list_challenge_progress
-- es SECURITY DEFINER y ES la política de lectura del tablero (H3), así que un cliente con su
-- token no debe poder pedirse un modo que el reto no declara -- vería un tablero que no es el
-- de su reto.
--
-- DROP explícito antes del create, aunque la firma sea la misma que en H3: postgres no deja
-- que `create or replace` cambie el tipo de retorno, y no todos los entornos parten de la
-- firma de H3 -- el dev de este proyecto llegó a tener un borrador de este mismo bloque con
-- una columna `in_window` de más (descartada: un tick es un tick). Con el drop, la migración
-- converge a la firma correcta venga de donde venga. Nada depende de esta función en BD
-- (ninguna vista, ningún otro objeto), así que dropearla no arrastra nada.
drop function if exists public.get_list_challenge_progress(uuid);

create or replace function public.get_list_challenge_progress(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, completed_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id,
           w.window_start,
           w.window_end,
           coalesce(ca.config ->> 'completionMode', 'window') = 'any' as open_mode
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  -- Una sola query para los dos modos, sin ramas duplicadas que puedan derivar: el join al
  -- diario pasa a LEFT y el filtro de ventana se mueve al HAVING. En 'window' ese HAVING
  -- descarta las filas sin pase (equivale al INNER JOIN de H3); en 'any' sobreviven con
  -- completed_on nulo, que es exactamente el tick "ya lo tenías" del tablero.
  select p.user_id,
         i.item_type,
         i.item_id,
         min(d.finished_on) filter (
           where d.finished_on between a.window_start and a.window_end
         ) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.library_entries le
      on le.user_id = p.user_id
     and le.item_type = i.item_type
     and le.item_id = i.item_id
     -- En modo 'any' la condición ES el status. En 'window' la fila de biblioteca solo hace de
     -- puente hacia el diario (el pase manda, el status da igual: un pase terminado dentro de
     -- la ventana cuenta aunque la entrada esté en 'reading' por una relectura en curso).
     and (not a.open_mode or le.status = 'completed')
    left join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
   group by a.open_mode, p.user_id, i.item_type, i.item_id
  having a.open_mode
      or bool_or(d.finished_on between a.window_start and a.window_end);
$$;

comment on function public.get_list_challenge_progress(uuid) is 'Tablero de progreso de un list_challenge (EPIC-05 Bloques H3 y H3b): por participante y por ítem del pool, las celdas completadas (sparse). La regla depende de config->>completionMode: ''window'' (default) exige un pase de diario terminado dentro de la ventana del reto; ''any'' acepta cualquier ítem en status completed, sin revisionado -- y ahí completed_on es null si no hay pase en ventana. El modo se lee aquí dentro, nunca se pasa como parámetro. SECURITY DEFINER a propósito -- ES la política de lectura del tablero (los participantes de perfil privado deben ser visibles a sus compañeros de actividad, Q5).';

revoke execute on function public.get_list_challenge_progress(uuid) from public, anon;
grant execute on function public.get_list_challenge_progress(uuid) to authenticated;


-- ── 2. Cambiar el modo ───────────────────────────────────────────────────────
--
-- RPC propia en vez de relajar update_activity_config (H4): esa función solo escribe en
-- 'proposed' A PROPÓSITO, y es lo que congela el criterio de H4 y los tiers de H2 al activar.
-- Relajarla los descongelaría a todos.
--
-- Esta, en cambio, NO mira el status -- ese es justamente el punto: un moderador puede abrir la
-- modalidad con el reto ya en marcha para rescatar un reto que ahuyentó a la gente. El precio
-- (el tablero de todos se recalcula al instante) se paga en la UI, con una confirmación.
--
-- Escribe con jsonb_set: no pisa ninguna otra clave del config.
create or replace function public.set_activity_completion_mode(p_activity_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_kind public.activity_kind;
begin
  if p_mode not in ('window', 'any') then
    raise exception 'invalid_mode';
  end if;

  select club_id, created_by, kind
    into v_club_id, v_created_by, v_kind
    from public.club_activities
   where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;

  -- Acotada a list_challenge: es el único kind que declara esta clave.
  if v_kind <> 'list_challenge' then
    raise exception 'wrong_kind';
  end if;

  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;

  update public.club_activities
     set config = jsonb_set(
           coalesce(config, '{}'::jsonb),
           '{completionMode}',
           to_jsonb(p_mode),
           true
         )
   where id = p_activity_id;
end;
$$;

comment on function public.set_activity_completion_mode(uuid, text) is 'Cambia config->>completionMode de un list_challenge (EPIC-05 Bloque H3b): ''window'' | ''any''. Solo creador o moderator+, y en CUALQUIER estado -- a diferencia de update_activity_config (H4), que congela el config al activar. Deliberado: un moderador puede abrir la modalidad con el reto en marcha; la UI confirma antes, porque el tablero de todos se recalcula. jsonb_set -> no pisa el resto del config.';

revoke execute on function public.set_activity_completion_mode(uuid, text) from public, anon;
grant execute on function public.set_activity_completion_mode(uuid, text) to authenticated;
