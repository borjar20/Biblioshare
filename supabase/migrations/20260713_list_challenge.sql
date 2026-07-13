-- EPIC-05 Bloque H3 — Reto por lista de ítems (list_challenge). Ver
-- docs/requirements/social-epic.md. Segundo tipo real del motor de actividades de club
-- (Bloque G) sobre el registro por kind (Bloque H1). **Cero tablas nuevas**: la lista vive
-- en club_activity_items (pool genérico de G), las opiniones por ítem en
-- club_activity_opinions (ya completas desde G), y el progreso es 100% DERIVADO de
-- diary_entries -- no se persiste en ningún sitio.
--
-- Este bloque aporta tres cosas a nivel de BD:
--   1. Q8 (auto-añadir a la biblioteca) -- decidido en el backlog hace tiempo, nunca escrito.
--   2. El gate de curación de la lista (creador + moderator+), acotado a list_challenge.
--   3. La lectura del progreso, que NO puede hacerse con el cliente normal (ver más abajo).


-- ── 1. Q8: auto-añadir los ítems del pool a la biblioteca ────────────────────
--
-- Va en TRIGGERS, no en la capa de app (src/lib/clubs/activities/core.ts), por tres razones:
--
--   (a) El backfill inserta filas de library_entries **para OTROS usuarios** (un moderador
--       añade un ítem -> hay que crear la fila de cada participante). El INSERT de
--       library_entries es self-only por RLS ("library entries insert own"), así que
--       cualquier camino desde el cliente sería rechazado -- un objeto SECURITY DEFINER es
--       obligatorio de todas formas. La única pregunta era quién lo llama.
--   (b) Un trigger es ATÓMICO con el insert que lo dispara. Una RPC llamada después desde
--       core.ts puede dejar medio estado si la petición muere entre las dos escrituras.
--   (c) Cubre TODOS los caminos de escritura (kinds futuros, seeds, consola SQL, tests), no
--       solo las dos funciones de core.ts que existen hoy. Consecuencia: core.ts no cambia.
--
-- El invariante que pidió el usuario -- "NUNCA tocar una fila existente" -- no se implementa
-- con lógica de app (read-then-write, con su carrera) sino con el UNIQUE que library_entries
-- ya tiene sobre (user_id, item_type, item_id): `on conflict do nothing`. Si ya tienes el
-- ítem en CUALQUIER estado (incluido 'completed'), la fila queda intacta -- ni el status ni
-- el rating ni updated_at se tocan, y el trigger de updated_at ni siquiera llega a dispararse.
--
-- `tierlist` queda EXCLUIDA (decisión del usuario): una tierlist va de ORDENAR cosas que ya
-- conoces, no es una lista de pendientes -- no debe ensuciar tu biblioteca con 15 películas
-- que solo ibas a puntuar. El resto de kinds sí (buddy_read, list_challenge, y por defecto
-- los futuros).

create or replace function public.autoadd_library_on_activity_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;
  if v_kind = 'tierlist' then
    return new;
  end if;

  insert into public.library_entries (user_id, item_type, item_id, status)
  select new.user_id, i.item_type, i.item_id, 'planned'
    from public.club_activity_items i
   where i.activity_id = new.activity_id
  on conflict (user_id, item_type, item_id) do nothing;  -- Q8: nunca pisa una fila existente

  return new;
end;
$$;

comment on function public.autoadd_library_on_activity_join() is 'AFTER INSERT en club_activity_participants (EPIC-05 Bloque H3, Q8): al unirte a una actividad, los ítems de su pool que no tengas ya en tu biblioteca se añaden como planned. Nunca modifica una fila existente (on conflict do nothing). No actúa en tierlist.';

-- Fan-out: el pool crece DESPUÉS de que la gente se uniera (caso propio de list_challenge,
-- donde un moderador puede seguir curando la lista con el reto ya en marcha) -> backfill a
-- todos los participantes actuales. Este es el caso cross-user que obliga a SECURITY DEFINER.
create or replace function public.autoadd_library_on_activity_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;
  if v_kind = 'tierlist' then
    return new;
  end if;

  insert into public.library_entries (user_id, item_type, item_id, status)
  select p.user_id, new.item_type, new.item_id, 'planned'
    from public.club_activity_participants p
   where p.activity_id = new.activity_id
  on conflict (user_id, item_type, item_id) do nothing;

  return new;
end;
$$;

comment on function public.autoadd_library_on_activity_item() is 'AFTER INSERT en club_activity_items (EPIC-05 Bloque H3, Q8): al añadir un ítem al pool, se crea la fila planned de cada participante que no lo tenga. Cross-user -> de ahí SECURITY DEFINER. No actúa en tierlist.';

-- AFTER INSERT y nunca fallan (`do nothing`) -> jamás hacen fallar un join ni un alta de
-- ítem. enforce_buddy_read_item_rules (Bloque H1) es BEFORE, así que no hay interacción de
-- orden entre ambos. Sin contrapartida en el DELETE de participantes: salir de una actividad
-- NO borra nada de tu biblioteca (no destructivo -- puede que ya hayas empezado el ítem).
create trigger trg_autoadd_library_on_activity_join
  after insert on public.club_activity_participants
  for each row execute function public.autoadd_library_on_activity_join();

create trigger trg_autoadd_library_on_activity_item
  after insert on public.club_activity_items
  for each row execute function public.autoadd_library_on_activity_item();


-- ── 2. Gate de curación de la lista (solo list_challenge) ────────────────────
--
-- La lista ES el enunciado del reto: si cualquier participante la hace crecer a mitad de
-- camino, la meta se mueve bajo los pies de quien ya iba por la mitad. Solo el creador de la
-- actividad y moderator+ del club la curan.
--
-- OJO -- se implementa REESCRIBIENDO la política RLS, no con un trigger (deliberadamente
-- distinto del idiom de enforce_buddy_read_item_rules en Bloque H1): un trigger solo puede
-- RECHAZAR lo que la RLS ya dejó pasar, nunca RELAJAR. Y aquí hace falta relajar, porque la
-- política de G exige is_activity_participant() y solo puedes unirte a una actividad ya
-- 'active' ("club_activity_participants insert self") -- es decir, HOY quien propone una
-- actividad NO PUEDE curar su propia lista hasta que un moderador se la active y él se una.
-- Para list_challenge la condición de participación se SUSTITUYE (no se añade) por
-- creador-o-moderador, lo que además arregla ese agujero: se cura en 'proposed', antes de que
-- exista ningún participante.
--
-- Todos los demás kinds conservan la semántica exacta de G (rama `else`).

drop policy "club_activity_items insert participant" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and case
          when ca.kind = 'list_challenge' then
            ca.created_by = (select auth.uid())
            or public.has_min_club_role(ca.club_id, 'moderator')
          else public.is_activity_participant(ca.id)
        end
    )
  );

-- El DELETE reescrito añade una rama: el creador de un list_challenge puede quitar de SU
-- lista un ítem que metió un moderador. El resto (quien lo añadió, o moderator+) es idéntico
-- a G.
drop policy "club_activity_items delete own or moderate" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind = 'list_challenge' and ca.created_by = (select auth.uid()))
        )
    )
  );


-- ── 3. Ventana del reto ──────────────────────────────────────────────────────
--
-- club_activities.starts_on/ends_on son NULLABLE, a diferencia de challenges.start_date/
-- end_date (§7.10), que son not null -- por eso get-challenge-progress.ts puede hacer gte/lte
-- directo y aquí hace falta una regla de coalesce explícita:
--
--   inicio = coalesce(starts_on, created_at::date)
--            Un pase anterior a la EXISTENCIA del reto no puede contar -- es justo el punto
--            de la decisión de diseño (ver abajo).
--   fin    = coalesce(ends_on, current_date)
--            Reto abierto = sigue contando.
--
-- SECURITY INVOKER a propósito: la política SELECT de club_activities (solo miembros del
-- club, Bloque G) es exactamente el gate que queremos. La RPC de progreso la reutiliza, así
-- que la regla del coalesce existe UNA SOLA VEZ (sin deriva entre SQL y TS).
create or replace function public.list_challenge_window(p_activity_id uuid)
returns table (window_start date, window_end date)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(starts_on, created_at::date), coalesce(ends_on, current_date)
    from public.club_activities
   where id = p_activity_id;
$$;

comment on function public.list_challenge_window(uuid) is 'Ventana temporal efectiva de una actividad (EPIC-05 Bloque H3): coalesce(starts_on, created_at) .. coalesce(ends_on, hoy). Fuente única de la regla -- get_list_challenge_progress la reutiliza.';

revoke execute on function public.list_challenge_window(uuid) from public, anon;
grant execute on function public.list_challenge_window(uuid) to authenticated;


-- ── 4. Progreso del reto ─────────────────────────────────────────────────────
--
-- DECISIÓN DE DISEÑO (supersede el texto original del backlog en E5.H3a, que decía
-- "derivado de library_entries status completed"): un ítem cuenta como hecho para un
-- participante si existe un PASE DE DIARIO suyo (diary_entries) sobre ese ítem con
-- finished_on DENTRO de la ventana del reto -- no basta con tener el ítem en 'completed'.
-- Consecuencia querida: quien ya se leyó el libro el año pasado NO obtiene un tick gratis;
-- registra una relectura (un pase nuevo) durante el reto. Su biblioteca NUNCA se muta: el
-- status sigue 'completed' y solo suma un pase más a su contador de relecturas. Es el mismo
-- mecanismo que el motor de challenges (§7.10, src/lib/challenges/get-challenge-progress.ts),
-- expresado aquí en SQL porque debe correr cross-user (ver abajo).
--
-- SECURITY DEFINER a propósito, y esto es lo importante: diary_entries y library_entries solo
-- son legibles vía can_view_profile(), así que un participante con PERFIL PRIVADO sería
-- INVISIBLE para el resto y su fila del tablero saldría vacía -- un falso negativo silencioso
-- (parecería que no ha completado nada). Esta función ES la política de lectura del tablero:
-- reimplementa la autorización explícitamente (is_activity_participant), materializando en BD
-- la promesa de Q5 -- "unirte a una actividad = consentir compartir tu progreso DENTRO de
-- ella, aunque tu perfil sea privado fuera".
--
-- Devuelve solo las celdas COMPLETADAS (sparse): en una rejilla de 20x8 la mayoría son
-- 'pendiente', y el cliente materializa la matriz completa cruzando el pool con el roster.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, completed_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.list_challenge_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, i.item_type, i.item_id, min(d.finished_on) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.library_entries le
      on le.user_id = p.user_id
     and le.item_type = i.item_type
     and le.item_id = i.item_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end
   group by p.user_id, i.item_type, i.item_id;
$$;

comment on function public.get_list_challenge_progress(uuid) is 'Tablero de progreso de un list_challenge (EPIC-05 Bloque H3): por participante y por ítem del pool, la fecha del primer pase de diario terminado dentro de la ventana del reto. SECURITY DEFINER a propósito -- ES la política de lectura del tablero (participantes de perfil privado deben ser visibles a sus compañeros de actividad, Q5). Solo devuelve celdas completadas (sparse).';

revoke execute on function public.get_list_challenge_progress(uuid) from public, anon;
grant execute on function public.get_list_challenge_progress(uuid) to authenticated;
