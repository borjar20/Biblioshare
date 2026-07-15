-- Migración C del hub del pase: la tabla del pase deja de llamarse como el
-- diario. `diary_entries` era ya el hub del registro personal (item/estado/
-- cola/cursor, con sesiones y episodios colgando de pass_id); este rename hace
-- que el repositorio diga la verdad y corta el último lazo con library_entries.
--
-- Distinción CLAVE que gobierna toda la migración:
--   * Un `FROM diary_entries` en el cuerpo de una función ES una referencia de
--     TABLA y hay que reescribirla a `passes` (plpgsql resuelve el nombre en
--     tiempo de ejecución: una función que siga diciendo diary_entries fallaría).
--   * La CADENA 'diary_entries' / 'diary_entry' almacenada en comparticiones de
--     club (club_posts.ref->>'sourceTable') e interacciones (target_type) es un
--     DATO (una etiqueta), NO un nombre de tabla: NO se toca, o romperíamos las
--     comparticiones e interacciones existentes.

-- 1) El rename. FKs e índices cuelgan de la tabla por OID, así que las FKs que
--    APUNTAN a diary_entries (episode_watches.pass_id, progress_sessions.pass_id)
--    siguen la tabla sin tocar nada. Los triggers también.
alter table public.diary_entries rename to passes;

-- 2) Reescritura de TODA función cuyo cuerpo nombraba diary_entries como tabla.
--    Enumeradas exhaustivamente con `select proname from pg_proc where prosrc
--    ilike '%diary_entries%'` (6 funciones) — no por adivinanza.

-- 2a) block_edition_delete_if_used: cuenta pases que usan una edición. Simple
--     rename de tabla.
create or replace function public.block_edition_delete_if_used()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pases integer;
begin
  select count(*) into v_pases
  from public.passes d
  where d.edition_id = old.id;

  if v_pases > 0 then
    raise exception 'edition_in_use'
      using hint = format('%s pases usan esta edicion', v_pases);
  end if;

  return old;
end;
$function$;

-- 2b) can_view_target: el `when 'diary_entry'` es la etiqueta de datos del enum
--     target_kind (NO se toca); el `from diary_entries` sí es tabla → passes.
create or replace function public.can_view_target(p_target_type target_kind, p_target_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
  end;
$function$;

-- 2c) get_activity_diary_passes: antes puenteaba participante → library_entries
--     → diary_entries por library_entry_id. En el hub el pase YA lleva
--     item_type/item_id, así que se une passes directamente (esto además
--     ARREGLA un hueco: los pases nacidos en el hub tienen library_entry_id nulo
--     y quedaban fuera del join antiguo).
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
 returns TABLE(user_id uuid, item_type item_type, item_id uuid, finished_on date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, d.item_type, d.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.passes d
      on d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$function$;

-- 2d) get_list_challenge_progress: misma migración de puente a passes directo.
--     Antes: library_entries (INNER, con el status) + diary_entries (LEFT, para
--     completed_on). En el hub, passes lleva status Y finished_on, así que un
--     único INNER a passes cubre ambos: en modo 'any' el filtro pide el PASE
--     ACTIVO con status 'completed' (el le.status='completed' de antes era el
--     estado ACTUAL de la entrada = el del pase activo del hub; sin el is_active
--     un pase histórico archivado, siempre 'completed', haría contar un ítem que
--     estás releyendo ahora — hallazgo de revisión Tarea 10) y completed_on
--     puede quedar nulo (el tick "ya lo tenías"); en modo 'window' el join no
--     filtra status y el HAVING exige un pase terminado dentro de la ventana.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
 returns TABLE(user_id uuid, item_type item_type, item_id uuid, completed_on date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
  select p.user_id,
         i.item_type,
         i.item_id,
         min(d.finished_on) filter (
           where d.finished_on between a.window_start and a.window_end
         ) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.passes d
      on d.user_id = p.user_id
     and d.item_type = i.item_type
     and d.item_id = i.item_id
     and (not a.open_mode or (d.is_active and d.status = 'completed'))
   group by a.open_mode, p.user_id, i.item_type, i.item_id
  having a.open_mode
      or bool_or(d.finished_on between a.window_start and a.window_end);
$function$;

-- 2e) resolve_pending_import: la cola de revisión (un colaborador resuelve una
--     fila de importación sin match, a nombre de su DUEÑO). El cuerpo antiguo
--     insertaba en library_entries + diary_entries(library_entry_id), un patrón
--     que ya estaba ROTO tras el hub (item_type/item_id son NOT NULL sin default
--     y no se aportaban). Se reescribe para insertar pases directamente,
--     espejando commit-row.ts: un pase ACTIVO (el estado/nota del shelf de
--     origen) más un pase histórico CERRADO por cada fecha de relectura que no
--     sea ya la del activo.
create or replace function public.resolve_pending_import(p_pending_id uuid, p_catalog_item_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.pending_import_rows;
  v_status media_status;
  v_rating smallint;
  v_position jsonb;
  v_dates jsonb;
  v_historical jsonb;
  v_date jsonb;
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.pending_import_rows
    where id = p_pending_id and status = 'pending';
  if not found then
    raise exception 'pending row not found';
  end if;

  v_status := coalesce(nullif(v_row.payload->>'status','')::media_status, 'planned');
  v_rating := nullif(v_row.payload->>'rating','')::smallint;
  v_position := case
    when v_row.payload->>'bookFormat' is not null
      then jsonb_build_object('format', v_row.payload->>'bookFormat')
    else '{}'::jsonb
  end;
  v_dates := coalesce(v_row.payload->'diaryDates', '[]'::jsonb);

  -- Mismo criterio que commit-row.ts: si la obra está terminada/abandonada y hay
  -- fechas, la MÁS RECIENTE es el pase activo; si está planned/in_progress el
  -- activo es un pase aparte (abierto o planificado) y las fechas son relecturas
  -- pasadas.
  v_historical := null;
  if v_status in ('completed','dropped') then
    select d into v_historical
    from jsonb_array_elements(v_dates) d
    order by d->>'finishedOn' desc
    limit 1;
  end if;

  -- Pase activo. ON CONFLICT contra el índice parcial passes_one_active: si el
  -- dueño ya tiene un pase activo para esta obra (re-resolución), no se duplica.
  insert into public.passes (
    user_id, item_type, item_id, status, is_active, position, rating,
    started_on, finished_on, is_public
  ) values (
    v_row.user_id, v_row.item_type, p_catalog_item_id, v_status, true, v_position, v_rating,
    nullif(v_historical->>'startedOn','')::date, (v_historical->>'finishedOn')::date, true
  )
  on conflict (user_id, item_type, item_id) where is_active do nothing;

  -- Un pase cerrado por cada fecha del CSV que no sea ya la del activo, sin
  -- duplicar historial si se reimporta (no hay unique de BD para pases del hub).
  for v_date in select * from jsonb_array_elements(v_dates)
  loop
    if v_historical is not null and v_date->>'finishedOn' = v_historical->>'finishedOn' then
      continue;
    end if;
    if exists (
      select 1 from public.passes
      where user_id = v_row.user_id
        and item_type = v_row.item_type
        and item_id = p_catalog_item_id
        and finished_on = (v_date->>'finishedOn')::date
    ) then
      continue;
    end if;

    insert into public.passes (
      user_id, item_type, item_id, status, is_active, position,
      started_on, finished_on, rating, is_public, created_at
    ) values (
      v_row.user_id, v_row.item_type, p_catalog_item_id, 'completed', false, '{}'::jsonb,
      nullif(v_date->>'startedOn','')::date, (v_date->>'finishedOn')::date, v_rating, true,
      (v_date->>'finishedOn')::timestamptz
    );
  end loop;

  update public.pending_import_rows
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    where id = p_pending_id;
end;
$function$;

-- 2f) validate_club_post_ref: el `case v_source` compara etiquetas ALMACENADAS
--     (datos), pero el `select 1 from diary_entries` de la rama 'diary_entries'
--     ES una tabla → passes. Además (alcance plegado de la revisión de la Tarea
--     9) se enseña la etiqueta nueva 'diary_entries_added': los ítems del hub no
--     tienen fila en library_entries, así que las comparticiones de "añadió a la
--     biblioteca" usan esa etiqueta y apuntan a una fila de `passes` (la del
--     pase añadido); antes caían en el `else null` → 'invalid_ref'. La
--     normalización final preserva v_source, así que la etiqueta se guarda tal
--     cual (dato intacto).
create or replace function public.validate_club_post_ref()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_source text;
  v_row uuid;
  v_owned boolean;
begin
  if new.kind <> 'activity_share' then
    if new.ref is not null then
      raise exception 'ref_only_for_activity_share';
    end if;
    return new;
  end if;

  if new.ref is null then
    raise exception 'ref_required';
  end if;

  v_source := new.ref->>'sourceTable';
  begin
    v_row := (new.ref->>'rowId')::uuid;
  exception when others then
    raise exception 'invalid_ref';
  end;

  v_owned := case v_source
    when 'diary_entries' then exists (
      select 1 from public.passes where id = v_row and user_id = new.author_id
    )
    when 'diary_entries_added' then exists (
      select 1 from public.passes where id = v_row and user_id = new.author_id
    )
    when 'episode_watches' then exists (
      select 1 from public.episode_watches where id = v_row and user_id = new.author_id
    )
    when 'library_entries' then exists (
      select 1 from public.library_entries where id = v_row and user_id = new.author_id
    )
    when 'progress_sessions' then exists (
      select 1 from public.progress_sessions where id = v_row and user_id = new.author_id
    )
    else null
  end;

  if v_owned is distinct from true then
    raise exception 'invalid_ref';
  end if;

  new.ref := jsonb_build_object('sourceTable', v_source, 'rowId', v_row::text);
  return new;
end;
$function$;

-- 2g) is_visible_via_club_share: su cuerpo NO nombra ninguna tabla (compara la
--     etiqueta almacenada contra el parámetro), así que el rename no le obliga.
--     Pero un pase compartido como 'diary_entries_added' apunta a la MISMA fila
--     de passes que uno compartido como 'diary_entries'; su visibilidad es la
--     misma. Como la vista pass_reviews y la política RLS de passes consultan con
--     'diary_entries' fijo, se enseña aquí a hacer coincidir ambas etiquetas para
--     esa consulta (así un "añadido" compartido a un club se ve sin tocar sus
--     llamadores). Las demás etiquetas (episode_watches, etc.) no se ven afectadas.
create or replace function public.is_visible_via_club_share(p_source_table text, p_row_id uuid, p_owner_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and (
        cp.ref->>'sourceTable' = p_source_table
        or (p_source_table = 'diary_entries' and cp.ref->>'sourceTable' = 'diary_entries_added')
      )
      and cp.ref->>'rowId' = p_row_id::text
      and cp.author_id = p_owner_id
      and public.is_club_member(cp.club_id)
  );
$function$;

-- 3) La vista pass_reviews depende de passes.library_entry_id, así que se tira
--    ANTES de borrar la columna y se recrea sin ella (para la Tarea 9 ya nada la
--    selecciona) y con pinned_order.
drop view if exists public.pass_reviews;

-- 4) El footgun de la Tarea 5: finished_on arrastra DEFAULT CURRENT_DATE, que
--    estamparía una fecha de fin a cualquier pase abierto. Un pase abierto debe
--    conservar finished_on NULL.
alter table public.passes alter column finished_on drop default;

-- 5) El cordón: se corta el último lazo con library_entries. DROP COLUMN tira en
--    cascada la FK compuesta (…entry_owner_fkey) y los índices legacy que colgaban
--    de library_entry_id (one_open_pass / one_pass_per_day / idx_library_entry);
--    su papel ya lo hacen passes_one_active y passes_by_item, nacidos en el hub.
alter table public.progress_sessions drop column if exists library_entry_id;
alter table public.passes drop column if exists library_entry_id;

-- 6) Recreación de la vista desde passes, sin library_entry_id y con pinned_order.
create view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.passes d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;

-- 7) Renombrado cosmético de los objetos SUPERVIVIENTES que aún llevan el nombre
--    viejo (para que el repositorio diga la verdad). Los que colgaban de
--    library_entry_id ya desaparecieron con la columna.
alter table public.passes rename constraint diary_entries_pkey to passes_pkey;
alter table public.passes rename constraint diary_entries_rating_check to passes_rating_check;
alter table public.passes rename constraint diary_entries_review_len to passes_review_len;
alter table public.passes rename constraint diary_entries_user_id_fkey to passes_user_id_fkey;
alter table public.passes rename constraint diary_entries_queue_id_fkey to passes_queue_id_fkey;
alter index public.idx_diary_entries_finished rename to idx_passes_finished;
alter trigger diary_entries_check_edition on public.passes rename to passes_check_edition;
alter trigger diary_entries_set_updated_at on public.passes rename to passes_set_updated_at;

-- 8) library_entries queda congelada como red de revert: sólo lectura, sin
--    escrituras de la app (se borrará en una limpieza posterior).
revoke insert, update, delete on public.library_entries from authenticated;
