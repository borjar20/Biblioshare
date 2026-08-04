-- La ronda: latido semanal de un club. Spec:
-- docs/superpowers/specs/2026-08-03-club-rondas-design.md
--
-- Tabla propia y NO un sexto `kind` de club_activities, a propósito y contra
-- SD-8: una ronda no se propone a moderación, no tiene ciclo de vida y no
-- tiene participación opt-in -- solo comparte la superficie de discusión, y esa
-- vive en interaction_targets desde la fase 1 social. Ver §1 de la spec.

alter type public.target_kind       add value if not exists 'club_round';
alter type public.notification_type add value if not exists 'club_round_proposed';
alter type public.notification_type add value if not exists 'club_round_commented';
alter type public.notification_type add value if not exists 'club_round_liked';

-- Postgres prohíbe USAR una etiqueta de enum en la misma transacción que la
-- crea: sin este commit, el trigger de más abajo que menciona 'club_round'
-- hace fallar la migración entera. Misma trampa que 20260712_club_posts.sql.
commit;

create table public.club_rounds (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  period_key text not null,
  -- NULL = consigna de la casa. `on delete set null` a propósito: con cascade
  -- se perdería la conversación del club al borrarse una cuenta, y sin acción
  -- explícita la cuenta no se podría borrar.
  author_id  uuid references auth.users(id) on delete set null,
  prompt     text not null,
  -- Par (tipo, id) sin FK, igual que club_activity_items: el catálogo no es
  -- una sola tabla.
  item_type  public.item_type,
  item_id    uuid,
  created_at timestamptz not null default now(),
  unique (club_id, period_key),
  constraint club_rounds_prompt_len check (char_length(prompt) between 1 and 500),
  constraint club_rounds_item_pair check (num_nonnulls(item_type, item_id) <> 1)
);

create index idx_club_rounds_club on public.club_rounds (club_id, created_at desc);

comment on table public.club_rounds is
  'Rondas semanales de club (La ronda). author_id NULL = consigna de la casa. La escritura pasa SOLO por ensure_club_round(); no hay política INSERT.';

alter table public.club_rounds enable row level security;

-- Contenido siempre solo-miembros, con independencia de clubs.visibility (SD-4).
create policy "club rounds select members" on public.club_rounds
  for select to authenticated
  using (public.is_club_member(club_id));

-- Una consigna abusiva se queda una semana entera en lo alto del club.
create policy "club rounds delete moderators" on public.club_rounds
  for delete to authenticated
  using (public.has_min_club_role(club_id, 'moderator'));

-- Sin política INSERT ni UPDATE, a propósito: el único camino de escritura es
-- ensure_club_round() (SECURITY DEFINER), y una ronda es inmutable -- sus
-- respuestas contestan a ESA pregunta.

grant select, delete on table public.club_rounds to authenticated;

-- ── Registro canónico de interacción ─────────────────────────────────
create or replace function private.sync_club_round_interaction_target()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_slug text; v_club_owner uuid;
begin
  select c.slug, c.owner_id into v_slug, v_club_owner
  from public.clubs c where c.id = new.club_id;
  perform private.upsert_interaction_target(
    'club_round', new.id,
    -- La casa no es un usuario, y owner_id es NOT NULL.
    coalesce(new.author_id, v_club_owner),
    'club_member', new.club_id,
    '/club/' || v_slug || '?ronda=' || new.period_key,
    true, true, 'club_round_commented', 'club_round_liked');
  return new;
end;
$function$;
revoke execute on function private.sync_club_round_interaction_target() from public, anon, authenticated;

create trigger club_rounds_sync_interaction_target
  after insert on public.club_rounds
  for each row execute function private.sync_club_round_interaction_target();

-- cleanup_social_target() es genérico y toma los kinds por trigger args: cierra
-- los reportes pendientes y barre target, comentarios, reacciones y avisos.
create trigger club_rounds_cleanup_social_target
  after delete on public.club_rounds
  for each row execute function private.cleanup_social_target('club_round');

-- ── La semana y el turno viven AQUÍ, nunca en TypeScript ─────────────
-- El cliente no calcula ni envía el periodo: así la clase de bug de la issue
-- #271 (fecha del NAVEGADOR, no del servidor) no puede reproducirse.
-- Europe/Madrid y no UTC: con UTC la semana cambiaría a las 02:00 del lunes
-- en verano, y el producto es de un solo huso.
create or replace function private.club_now()
returns timestamp language sql stable set search_path = '' as $function$
  select timezone('Europe/Madrid', now());
$function$;

create or replace function private.house_prompt(p_club_id uuid, p_period_key text)
returns text language sql immutable set search_path = '' as $function$
  -- Índice determinista por club Y periodo: dos clubes no reciben la misma
  -- consigna la misma semana, y un club recibe siempre la misma para una
  -- semana dada (lo que hace idempotente materializarla dos veces).
  -- hashtext devuelve int4: abs() del valor más negativo de int4 desborda
  -- ('integer out of range'). Se castea a bigint antes de abs() para que
  -- ningún club quede permanentemente roto por esa colisión.
  select (array[
    'El libro que llevas más tiempo diciendo que vas a leer. ¿Cuánto llevas ya?',
    'Un libro que abandonaste y no te arrepientes.',
    'Una adaptación que mejora al original. Defiéndela.',
    '¿Releer es perder el tiempo?',
    'El personaje secundario que se merecía su propio libro.',
    'Algo que leíste por obligación y acabó gustándote.',
    'Un final que te sigue doliendo.',
    'La recomendación que más veces has hecho.',
    '¿Qué estás leyendo ahora mismo y qué tal va?',
    'Un libro que te vendieron mal y era otra cosa.'
  ])[1 + (abs(hashtext(p_club_id::text || p_period_key)::bigint) % 10)];
$function$;

-- create or replace NO puede cambiar las columnas de salida de una función
-- returns table: en dev ya obligó a un DROP + CREATE a mano cuando esta
-- función ganó house_prompt. Prod todavía no la tiene, así que hoy el DROP no
-- hace nada -- pero deja el fichero listo para el siguiente cambio de
-- columnas en vez de reventar. Convención ya establecida en el repo (p.ej.
-- 20260716_list_challenge_completion_mode.sql).
drop function if exists public.get_club_round_state(uuid);

create or replace function public.get_club_round_state(p_club_id uuid)
returns table (
  period_key      text,
  day_index       int,
  holder_id       uuid,
  round_id        uuid,
  round_author    uuid,
  round_prompt    text,
  round_item_type public.item_type,
  round_item_id   uuid,
  -- La consigna de la casa PENDIENTE de materializar (día >= 3, sin ronda
  -- todavía): private.house_prompt() tiene el execute revocado a
  -- `authenticated` a propósito (el 05: house_prompt es un cabo suelto que
  -- no puede llamar el cliente), pero esta función es SECURITY DEFINER y sí
  -- puede. Sin esto, la UI anunciaba "Ronda de la casa" + el botón
  -- «Responder» sin la pregunta a la vista -- issue detectada en la review
  -- de la Task 4. NULL en cualquier otro caso (ya hay ronda, o aún no toca).
  house_prompt    text
)
language sql stable security definer set search_path = '' as $function$
  with ctx as (
    select to_char(private.club_now(), 'IYYY-"W"IW')     as period_key,
           extract(isodow from private.club_now())::int  as day_index,
           c.created_at
    from public.clubs c
    -- Sin ser miembro no hay estado que devolver: la función es SECURITY
    -- DEFINER, así que la puerta se pone aquí a mano.
    where c.id = p_club_id and public.is_club_member(p_club_id)
  ),
  roster as (
    select m.user_id,
           row_number() over (order by m.joined_at, m.user_id) - 1 as idx,
           count(*) over ()                                        as n
    from public.club_members m
    where m.club_id = p_club_id and m.status = 'active'
  ),
  turno as (
    select (
      extract(epoch from (
        date_trunc('week', private.club_now())
        - date_trunc('week', timezone('Europe/Madrid', ctx.created_at))
      )) / 604800
    )::bigint as weeks
    from ctx
  )
  select ctx.period_key,
         ctx.day_index,
         (select r.user_id from roster r
           where r.idx = (select weeks from turno) % nullif((select n from roster limit 1), 0)),
         rd.id, rd.author_id, rd.prompt, rd.item_type, rd.item_id,
         case when rd.id is null and ctx.day_index >= 3
              then private.house_prompt(p_club_id, ctx.period_key)
         end as house_prompt
  from ctx
  left join public.club_rounds rd
    on rd.club_id = p_club_id and rd.period_key = ctx.period_key;
$function$;

create or replace function public.ensure_club_round(
  p_club_id   uuid,
  p_prompt    text default null,
  p_item_type public.item_type default null,
  p_item_id   uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_period text; v_day int; v_holder uuid; v_existing uuid; v_existing_author uuid;
  v_prompt text; v_author uuid; v_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select s.period_key, s.day_index, s.holder_id, s.round_id, s.round_author
    into v_period, v_day, v_holder, v_existing, v_existing_author
  from public.get_club_round_state(p_club_id) s;

  if p_prompt is not null then
    if v_existing is not null then
      -- Ya hay ronda de este periodo. Si la escribió quien llama, idempotente
      -- (devuelve la misma). Si no, un retorno silencioso perdería el texto
      -- de quien llega tarde sin que nadie se entere: mejor un error que la
      -- UI pueda mostrar como "se te pasó el turno".
      if v_existing_author is not distinct from (select auth.uid()) then
        return v_existing;
      end if;
      raise exception 'round_already_open' using errcode = '42501';
    end if;

    if (select auth.uid()) is distinct from v_holder then
      raise exception 'not_your_turn' using errcode = '42501';
    end if;
    v_prompt := btrim(p_prompt);
    if v_prompt = '' then
      raise exception 'prompt_required' using errcode = '22023';
    end if;
    v_author := v_holder;
  else
    -- Consigna de la casa: idempotente sin condiciones -- dos respuestas
    -- simultáneas a la casa deben acabar en la misma ronda, sea quien sea
    -- quien la dispare.
    if v_existing is not null then
      return v_existing;
    end if;
    -- Solo del día 3 en adelante, para que el titular tenga sus 48 h de
    -- exclusividad.
    if v_day < 3 then
      raise exception 'house_round_too_early' using errcode = '42501';
    end if;
    v_prompt := private.house_prompt(p_club_id, v_period);
    v_author := null;
  end if;

  insert into public.club_rounds (club_id, period_key, author_id, prompt, item_type, item_id)
  values (p_club_id, v_period, v_author, v_prompt,
          case when p_prompt is not null then p_item_type end,
          case when p_prompt is not null then p_item_id  end)
  on conflict (club_id, period_key) do nothing
  returning id into v_id;

  -- La carrera entre dos respuestas simultáneas a la consigna de la casa la
  -- resuelve el índice único, no un lock: si perdimos, leemos la ganadora.
  if v_id is null then
    select id into v_id from public.club_rounds
     where club_id = p_club_id and period_key = v_period;
  end if;
  return v_id;
end;
$function$;

revoke execute on function private.club_now()            from public, anon, authenticated;
revoke execute on function private.house_prompt(uuid, text) from public, anon, authenticated;
-- Postgres concede EXECUTE a PUBLIC por defecto al crear una función, y
-- Supabase añade anon: sin este revoke, un llamante sin autenticar podría
-- invocar una función SECURITY DEFINER. Mismo patrón que el resto de RPC del
-- repo (create_club_poll, create_club, vote_club_poll, activate_club_activity...).
revoke execute on function public.get_club_round_state(uuid) from public, anon;
revoke execute on function public.ensure_club_round(uuid, text, public.item_type, uuid) from public, anon;
grant  execute on function public.get_club_round_state(uuid) to authenticated;
grant  execute on function public.ensure_club_round(uuid, text, public.item_type, uuid) to authenticated;
