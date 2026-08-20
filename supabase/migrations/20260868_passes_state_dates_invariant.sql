-- Issues #714 y #719 — el invariante «`finished_on IS NULL` ⟺ pase
-- abierto» era solo una convención de TypeScript, y el importador ya lo rompía.
--
-- Toda la app aguas abajo define «pase abierto» como `finished_on IS NULL`
-- (`log-panel.tsx`, `get-passes.ts`). Un `completed` sin fecha —que es lo que
-- creaba `commit-row.ts` con un CSV de Goodreads con *Date Read* vacía— se leía
-- como lectura EN CURSO, y al releer la obra quedaban dos pases «abiertos de
-- facto». No había CHECK ni trigger que lo impidiera: la máquina de estados
-- (`planTransition`) vivía entera en el cliente y cualquier camino de escritura
-- nuevo podía saltársela.
--
-- ── Medición previa (2026-08-20, objetos reales, no `list_migrations`) ───────
--
--                                   dev            prod
--   cerrados sin fecha              0              0
--   abiertos con fecha              0              0
--   duplicados (obra + día)         2 grupos       0 grupos
--                                   (12 filas)
--   TOTAL de pases                  308            407
--
-- O sea: el CHECK entra en verde en las dos bases. Los duplicados son cosa del
-- índice único de #720, que va en otra migración (los 12 de dev son ruido de
-- una sesión de pruebas del 2026-07-15 y hay que decidir si se borran).
--
-- ── Lo que NO hace esta migración, a propósito ──────────────────────────────
--
-- El hallazgo F1-011 pedía además `finished_on >= started_on`. NO se pone:
-- prod tiene 167 de 407 pases (41 %) con la fecha de inicio POSTERIOR a la de
-- fin — todos con `started_on` = el día de una importación (2026-07-22,
-- 2026-08-14) y `finished_on` = la fecha real de lectura, de años antes.
-- Arreglarlo es reescribir datos reales del usuario y hay que decidir CÓMO
-- (poner `started_on` a null vs. igualarlo a `finished_on`), así que va en su
-- propia issue con la medición, no colado aquí.
--
-- ── Orden de despliegue ─────────────────────────────────────────────────────
--
-- DESPUÉS del deploy del código. El CHECK es restrictivo sobre un camino que el
-- código nuevo ya no usa: aplicarlo antes deja una ventana en la que importar un
-- CSV sin fechas falla con violación de CHECK en vez de crear el pase.

-- 1) Estado ⟺ fechas. `=` entre dos booleanos es equivalencia estricta: cerrado
--    exige fecha, abierto la prohíbe. `status` es NOT NULL y el enum
--    `media_status` solo tiene estos cuatro valores (comprobado en pg_enum), así
--    que no hay tercer caso silencioso.
alter table public.passes
  add constraint passes_status_dates check (
    (status in ('completed', 'dropped')) = (finished_on is not null)
  );

comment on constraint passes_status_dates on public.passes is
  'Invariante #719: pase cerrado (completed/dropped) <=> finished_on no nulo. La app entera define "pase abierto" como finished_on IS NULL.';

-- El índice único «un pase por obra y día» (#720) NO va aquí: exige limpiar
-- antes los 12 duplicados de dev, y eso es una decisión sobre datos que se toma
-- aparte. Va en su propia migración.

-- 2) El gemelo SQL del importador. `resolve_pending_import` (SECURITY DEFINER,
--    la usa el colaborador que resuelve una fila pendiente) tenía el MISMO
--    hueco que `commit-row.ts`: insertaba el pase activo con
--    `(v_historical->>'finishedOn')::date`, que es NULL cuando el CSV no traía
--    fechas. Con el CHECK de arriba eso ya no pasaría desapercibido: fallaría.
--
--    Se recrea con el mismo criterio que el TS (fecha de importación como
--    cierre por defecto) y, de paso, con `pg_temp` en el `search_path`, que es
--    la plantilla del repo para SECURITY DEFINER y a esta le faltaba.
create or replace function public.resolve_pending_import(p_pending_id uuid, p_catalog_item_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.pending_import_rows;
  v_status media_status;
  v_rating smallint;
  v_position jsonb;
  v_dates jsonb;
  v_historical jsonb;
  v_date jsonb;
  v_finished date;
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

  -- Cierre por defecto = hoy cuando el CSV no trae fecha (#714). El estado que
  -- afirmó el usuario se respeta; lo que no se puede es dejar un pase cerrado
  -- sin fecha, que la app leería como lectura en curso.
  v_finished := case
    when v_status in ('completed','dropped')
      then coalesce(nullif(v_historical->>'finishedOn','')::date, current_date)
    else null
  end;

  -- Pase activo. ON CONFLICT contra el índice parcial passes_one_active: si el
  -- dueño ya tiene un pase activo para esta obra (re-resolución), no se duplica.
  insert into public.passes (
    user_id, item_type, item_id, status, is_active, position, rating,
    started_on, finished_on, is_public
  ) values (
    v_row.user_id, v_row.item_type, p_catalog_item_id, v_status, true, v_position, v_rating,
    nullif(v_historical->>'startedOn','')::date, v_finished, true
  )
  on conflict (user_id, item_type, item_id) where is_active do nothing;

  -- Un pase cerrado por cada fecha del CSV que no sea ya la del activo, sin
  -- duplicar historial. Sigue siendo read-then-write: quien lo garantice de
  -- verdad será el índice `passes_one_pass_per_day` de #720, en su migración.
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
