# La ronda — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un club tenga un latido semanal automático — cada semana le toca a un miembro proponer una pregunta al club, y si no aparece entra una consigna de la casa.

**Architecture:** Tabla propia `club_rounds` (NO un `kind` de `club_activities` — ver §1 de la spec). La semana y el turno se calculan **en SQL**, jamás en TypeScript, y la escritura pasa solo por una RPC `SECURITY DEFINER`. Las respuestas del club no son tabla nueva: la ronda se registra en `interaction_targets` mediante trigger y hereda comentarios, reacciones, menciones, bloqueos y reportes de las fases 0 y 1 sociales.

**Tech Stack:** Next.js App Router (RSC + server actions), Supabase/Postgres con RLS, next-intl, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-club-rondas-design.md`
**Maqueta:** https://claude.ai/code/artifact/6f9c246b-d135-4ddb-850a-be45d678bda6

## Global Constraints

- **Idioma:** el repo es SOLO `es`. Existe únicamente `messages/es.json`. **No crees `en.json`.**
- **Migraciones:** `supabase-dev` PRIMERO, producción después (Task 7). Verifica siempre contra los objetos reales (`pg_proc`, `pg_class`, `information_schema.columns`), **nunca** contra `list_migrations` — el ledger de prod ya mintió una vez en esta base de código.
- **Fechas:** ninguna fecha de esta feature se calcula en el cliente. Si escribes `new Date()` en TS para decidir el periodo o el turno, está mal.
- **Zona horaria:** toda la aritmética de semanas usa `Europe/Madrid`, no UTC (ver Task 2, Step 3 — `private.club_now()`). El producto es de un solo idioma y un solo huso.
- **Node:** activa Node 22 con `fnm use` antes de correr Vitest — el shell arranca en 20.9 y vitest falla ahí.
- **Un solo `next dev`, en el puerto 3000.** Si está ocupado, mata el viejo; no levantes un segundo. `npm run test:e2e` reutiliza el que haya.
- **Toda mutación revalida** vía `revalidateClubPages()` (`src/lib/reactivity/revalidate.ts`), nunca `revalidatePath` suelto.

## Estructura de ficheros

**Se crea:**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260803_club_rounds.sql` | Enums, tabla, RLS, triggers, `get_club_round_state`, `ensure_club_round`, `private.house_prompt` |
| `supabase/tests/club_rounds.sql` | Matriz transaccional de regresión (todo con `rollback`) |
| `src/lib/clubs/rounds/rounds.ts` | Server actions: leer estado, proponer, materializar la casa |
| `src/lib/clubs/rounds/types.ts` | `RoundState`, `RoundHistoryEntry` — tipos puros, sin `"use server"` |
| `src/lib/clubs/rounds/history.ts` | Lectura del histórico (consulta + recuento) |
| `src/components/clubs/round/round-block.tsx` | Server component: elige y pinta uno de los 5 estados |
| `src/components/clubs/round/round-composer.tsx` | Client: textarea + obra opcional → `proposeRound` |
| `src/components/clubs/round/round-answer-gate.tsx` | Client: «Responder» a una ronda de la casa aún sin fila |
| `src/components/clubs/round/round-history.tsx` | Server: las últimas 4 semanas |
| `e2e/club-ronda.spec.ts` | Proponer como titular, responder como otro miembro |

**Se modifica:**

| Fichero | Cambio |
|---|---|
| `src/app/club/[slug]/page.tsx` | Montar `<RoundBlock>` arriba del feed, dentro de `ClubFeedSection` |
| `messages/es.json` | Claves `club.round.*` y tres de `notifications.*` |
| `src/lib/supabase/database.types.ts` | Regenerar contra dev |
| `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`, `supabase/schema-baseline.sql` | Cierre documental (Task 7) |

**Por qué esta división:** `rounds.ts` son server actions (todo export debe ser función asíncrona), así que los tipos van aparte en `types.ts` — mismo motivo por el que `notify-club.ts` vive en un módulo plano. El bloque de UI se parte en cuatro porque cada estado tiene una interactividad distinta: el composer y el gate son cliente, el bloque y el histórico son servidor, y mezclarlos obligaría a marcar todo `"use client"` y perder el render en servidor.

---

### Task 1: Migración — enums, tabla, RLS y triggers

**Files:**
- Create: `supabase/migrations/20260803_club_rounds.sql`
- Create: `supabase/tests/club_rounds.sql`

**Interfaces:**
- Consumes: `public.is_club_member(uuid)`, `public.has_min_club_role(uuid, public.club_role)`, `private.upsert_interaction_target(...)`, `private.cleanup_social_target()` — todos existentes.
- Produces: tabla `public.club_rounds`; valor de enum `target_kind = 'club_round'`; tres valores de `notification_type`.

- [ ] **Step 1: Escribe la matriz de pruebas que aún no puede pasar**

Crea `supabase/tests/club_rounds.sql`. Copia el arnés de `supabase/tests/social_phase1_interaction_targets.sql` (las dos funciones `pg_temp`) y añade el sembrado y las aserciones de esta tarea:

```sql
-- Matriz de regresión de las rondas de club.
-- Se ejecuta SOLO contra biblioshare-dev. Todo se revierte.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_expected_state text, p_message text)
returns void language plpgsql as $function$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then return; end if;
    raise exception 'assertion_failed: % (esperaba SQLSTATE %, llegó %)', p_message, p_expected_state, v_state;
  end;
  raise exception 'assertion_failed: % (la sentencia funcionó y no debía)', p_message;
end;
$function$;

-- Ana es dueña del club. Beto entra después. Carla NO es miembro: existe solo
-- para las aserciones negativas de RLS.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000002a1', 'authenticated', 'authenticated', 'rondas-ana@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002b2', 'authenticated', 'authenticated', 'rondas-beto@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002c3', 'authenticated', 'authenticated', 'rondas-carla@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000002a1', 'rondas_ana', 'Ana', true, 'user'),
  ('00000000-0000-4000-8000-0000000002b2', 'rondas_beto', 'Beto', true, 'user'),
  ('00000000-0000-4000-8000-0000000002c3', 'rondas_carla', 'Carla', true, 'user');

insert into public.clubs (id, slug, name, visibility, owner_id, created_at) values
  ('00000000-0000-4000-8000-000000000201', 'rondas-test', 'Club de rondas', 'public',
   '00000000-0000-4000-8000-0000000002a1', now() - interval '10 weeks');
insert into public.club_members (club_id, user_id, role, status, joined_at) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000002a1', 'owner',  'active', now() - interval '10 weeks'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000002b2', 'member', 'active', now() - interval '9 weeks');

-- ── La tabla y su forma ──────────────────────────────────────────────
insert into public.club_rounds (id, club_id, period_key, author_id, prompt) values
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000201',
   '2026-W01', '00000000-0000-4000-8000-0000000002a1', 'Una ronda de prueba');

select pg_temp.expect_sqlstate(
  $$insert into public.club_rounds (club_id, period_key, prompt)
    values ('00000000-0000-4000-8000-000000000201', '2026-W01', 'Otra del mismo periodo')$$,
  '23505',
  'dos rondas en el mismo periodo del mismo club violan la unicidad'
);

-- ── El registro canónico de interacción ──────────────────────────────
select pg_temp.assert_true(
  exists (select 1 from public.interaction_targets t
          where t.kind = 'club_round'
            and t.source_id = '00000000-0000-4000-8000-000000000202'
            and t.audience_kind = 'club_member'
            and t.audience_id = '00000000-0000-4000-8000-000000000201'
            and t.commentable and t.reactable),
  'insertar una ronda registra su interaction_target con audiencia club_member'
);

-- Una ronda de la casa (author_id nulo) tiene por dueño al dueño DEL CLUB:
-- interaction_targets.owner_id es NOT NULL y la casa no es un usuario.
insert into public.club_rounds (id, club_id, period_key, author_id, prompt) values
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000201',
   '2026-W02', null, 'Consigna de la casa de prueba');
select pg_temp.assert_true(
  (select t.owner_id from public.interaction_targets t
   where t.kind = 'club_round' and t.source_id = '00000000-0000-4000-8000-000000000203')
  = '00000000-0000-4000-8000-0000000002a1',
  'una ronda de la casa cuelga del dueño del club'
);

-- ── Borrado: el trigger genérico barre el target ─────────────────────
delete from public.club_rounds where id = '00000000-0000-4000-8000-000000000203';
select pg_temp.assert_true(
  not exists (select 1 from public.interaction_targets
              where kind = 'club_round' and source_id = '00000000-0000-4000-8000-000000000203'),
  'borrar una ronda borra su interaction_target'
);

rollback;
```

- [ ] **Step 2: Ejecútala y comprueba que falla**

Con la herramienta `mcp__supabase-dev__execute_sql`, pasando el fichero completo.
Esperado: FALLA con `relation "public.club_rounds" does not exist` (SQLSTATE `42P01`).

- [ ] **Step 3: Escribe la migración**

Crea `supabase/migrations/20260803_club_rounds.sql`:

```sql
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
-- hace fallar la migración entera. Misma trampa que 20260713_club_activities.sql.
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
```

- [ ] **Step 4: Aplícala a dev y verifica contra los objetos reales**

Aplica con `mcp__supabase-dev__apply_migration` (nombre: `club_rounds`). Después verifica **contra `pg_class`/`pg_enum`, no contra el ledger**:

```sql
select relname, relrowsecurity from pg_class where relname = 'club_rounds';
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname in ('target_kind','notification_type') and enumlabel like 'club_round%';
select tgname from pg_trigger where tgrelid = 'public.club_rounds'::regclass and not tgisinternal;
```
Esperado: `club_rounds` con `relrowsecurity = t`; cuatro etiquetas de enum; dos triggers.

- [ ] **Step 5: Vuelve a ejecutar la matriz y comprueba que pasa**

Ejecuta `supabase/tests/club_rounds.sql` con `mcp__supabase-dev__execute_sql`.
Esperado: sin excepciones (la transacción llega al `rollback`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260803_club_rounds.sql supabase/tests/club_rounds.sql
git commit -m "feat(clubes): tabla club_rounds con RLS y registro canónico de interacción"
```

---

### Task 2: La semana y el turno, en SQL

**Files:**
- Modify: `supabase/migrations/20260803_club_rounds.sql` (añadir al final)
- Modify: `supabase/tests/club_rounds.sql` (añadir antes del `rollback`)

**Interfaces:**
- Produces:
  - `public.get_club_round_state(p_club_id uuid) returns table (period_key text, day_index int, holder_id uuid, round_id uuid, round_author uuid, round_prompt text, round_item_type public.item_type, round_item_id uuid)`
  - `public.ensure_club_round(p_club_id uuid, p_prompt text default null, p_item_type public.item_type default null, p_item_id uuid default null) returns uuid`

> **Corrección a la spec:** §2.4 dice que el array de consignas de la casa vive en
> `src/lib/clubs/rounds/house-prompts.ts`. Es incompatible con la regla —de la misma
> sección— de que **el texto lo elige el servidor y el cliente no lo manda**: si el texto
> lo elige el servidor, la lista tiene que estar en SQL. Vive en `private.house_prompt()`.
> Añadir consignas es un `create or replace function`. Se acepta porque el repo es
> mono-idioma (`es`); el día que haya un segundo locale, esto se mueve.

- [ ] **Step 1: Escribe las aserciones que aún no pueden pasar**

Añade en `supabase/tests/club_rounds.sql`, justo antes del `rollback;`:

```sql
-- ── El periodo y el turno ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';

select pg_temp.assert_true(
  (select period_key from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
   = to_char(timezone('Europe/Madrid', now()), 'IYYY-"W"IW'),
  'el periodo es la semana ISO en Europe/Madrid'
);

select pg_temp.assert_true(
  (select holder_id from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
   in ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b2'),
  'el titular es uno de los dos miembros activos'
);

-- El club nació hace 10 semanas con 2 miembros: el titular alterna semana a
-- semana. Se comprueba la ARITMÉTICA, no una fecha concreta.
select pg_temp.assert_true(
  (select count(distinct holder) from (
     select (select user_id from (
       select user_id, row_number() over (order by joined_at, user_id) - 1 as idx
       from public.club_members
       where club_id = '00000000-0000-4000-8000-000000000201' and status = 'active'
     ) r where r.idx = w % 2) as holder
     from generate_series(0, 5) as w
   ) s) = 2,
  'a lo largo de 6 semanas consecutivas rotan los 2 miembros'
);

-- ── ensure_club_round: quién puede escribir ──────────────────────────
-- Carla no es miembro.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}';
select pg_temp.expect_sqlstate(
  $$select public.ensure_club_round('00000000-0000-4000-8000-000000000201', 'Intrusa')$$,
  '42501',
  'un no-miembro no puede crear una ronda'
);
select pg_temp.assert_true(
  not exists (select 1 from public.club_rounds
              where club_id = '00000000-0000-4000-8000-000000000201' and period_key = '2026-W01'),
  'un no-miembro tampoco LEE las rondas del club (RLS de select)'
);

-- El que NO es titular no puede proponer.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';
do $$
declare v_holder uuid; v_otro uuid;
begin
  select holder_id into v_holder from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select user_id into v_otro from public.club_members
   where club_id = '00000000-0000-4000-8000-000000000201' and status = 'active' and user_id <> v_holder limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  perform pg_temp.expect_sqlstate(
    format('select public.ensure_club_round(%L, %L)', '00000000-0000-4000-8000-000000000201', 'No me toca'),
    '42501',
    'quien no es titular no puede proponer la ronda');
  -- Y el titular SÍ puede.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder, 'role', 'authenticated')::text, true);
  perform public.ensure_club_round('00000000-0000-4000-8000-000000000201', 'La pregunta del titular');
end;
$$;

select pg_temp.assert_true(
  (select count(*) from public.club_rounds
   where club_id = '00000000-0000-4000-8000-000000000201'
     and period_key = to_char(timezone('Europe/Madrid', now()), 'IYYY-"W"IW')) = 1,
  'el titular creó exactamente una ronda para el periodo actual'
);

-- Idempotencia: repetir la llamada devuelve la MISMA ronda, no una segunda.
do $$
declare v_a uuid; v_b uuid;
begin
  select round_id into v_a from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select public.ensure_club_round('00000000-0000-4000-8000-000000000201') into v_b;
  perform pg_temp.assert_true(v_a = v_b, 'ensure_club_round es idempotente dentro del periodo');
end;
$$;

-- La consigna de la casa es determinista y depende del club Y del periodo.
select pg_temp.assert_true(
  private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W05')
  = private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W05'),
  'la consigna de la casa es estable para un club y periodo dados'
);
select pg_temp.assert_true(
  private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W05')
  is distinct from private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W06'),
  'la consigna cambia de una semana a la siguiente'
);
```

- [ ] **Step 2: Ejecútala y comprueba que falla**

Esperado: FALLA con `function public.get_club_round_state(uuid) does not exist` (SQLSTATE `42883`).

- [ ] **Step 3: Añade las funciones a la migración**

Al final de `supabase/migrations/20260803_club_rounds.sql`:

```sql
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
  ])[1 + (abs(hashtext(p_club_id::text || p_period_key)) % 10)];
$function$;

create or replace function public.get_club_round_state(p_club_id uuid)
returns table (
  period_key      text,
  day_index       int,
  holder_id       uuid,
  round_id        uuid,
  round_author    uuid,
  round_prompt    text,
  round_item_type public.item_type,
  round_item_id   uuid
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
         rd.id, rd.author_id, rd.prompt, rd.item_type, rd.item_id
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
  v_period text; v_day int; v_holder uuid; v_existing uuid;
  v_prompt text; v_author uuid; v_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select s.period_key, s.day_index, s.holder_id, s.round_id
    into v_period, v_day, v_holder, v_existing
  from public.get_club_round_state(p_club_id) s;

  -- Ya hay ronda de este periodo: idempotente. Quien escribió primero la
  -- definió, y esa es toda la regla de resolución de conflictos.
  if v_existing is not null then
    return v_existing;
  end if;

  if p_prompt is not null then
    if (select auth.uid()) is distinct from v_holder then
      raise exception 'not_your_turn' using errcode = '42501';
    end if;
    v_prompt := btrim(p_prompt);
    if v_prompt = '' then
      raise exception 'prompt_required' using errcode = '22023';
    end if;
    v_author := v_holder;
  else
    -- Consigna de la casa: solo del día 3 en adelante, para que el titular
    -- tenga sus 48 h de exclusividad.
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
grant  execute on function public.get_club_round_state(uuid) to authenticated;
grant  execute on function public.ensure_club_round(uuid, text, public.item_type, uuid) to authenticated;
```

- [ ] **Step 4: Aplica a dev y verifica contra `pg_proc`**

```sql
select p.proname, pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('get_club_round_state','ensure_club_round','house_prompt','club_now');
```
Esperado: las cuatro, y `ensure_club_round` con `uuid` como resultado.

- [ ] **Step 5: Ejecuta la matriz completa**

Esperado: sin excepciones. Si falla `quien no es titular no puede proponer`, comprueba que el club de prueba tiene **exactamente dos** miembros activos: con uno solo, titular y no-titular son la misma persona y la aserción no puede distinguirse.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260803_club_rounds.sql supabase/tests/club_rounds.sql
git commit -m "feat(clubes): la semana y el turno de la ronda se calculan en SQL"
```

---

### Task 3: Capa de dominio en TypeScript

**Files:**
- Create: `src/lib/clubs/rounds/types.ts`
- Create: `src/lib/clubs/rounds/rounds.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerar)

**Interfaces:**
- Consumes: `public.get_club_round_state`, `public.ensure_club_round` (Task 2); `notifyClub()` de `src/lib/clubs/activities/notify-club.ts`; `revalidateClubPages()`.
- Produces:
  - `type RoundState` (ver Step 1)
  - `getRoundState(clubId: string): Promise<RoundState | null>`
  - `proposeRound(clubId: string, prompt: string, item: { itemType: ItemType; itemId: string } | null): Promise<void>`
  - `ensureHouseRound(clubId: string): Promise<string>`

- [ ] **Step 1: Escribe los tipos**

Crea `src/lib/clubs/rounds/types.ts` (módulo plano, **sin** `"use server"`: en un módulo de server actions todo export debe ser una función asíncrona, así que los tipos no caben allí — mismo motivo que `notify-club.ts`):

```ts
import type { ItemType } from "@/lib/catalog/types";

/** Estado de la ronda del periodo actual, tal y como lo devuelve SQL.
 *  Ninguno de estos campos se calcula en el cliente: `periodKey` y `dayIndex`
 *  vienen del servidor porque la fecha del navegador miente (issue #271). */
export type RoundState = {
  /** Semana ISO en Europe/Madrid, p. ej. '2026-W32'. */
  periodKey: string;
  /** 1 = lunes … 7 = domingo. La consigna de la casa entra desde el 3. */
  dayIndex: number;
  /** A quién le toca proponer este periodo. */
  holderId: string | null;
  /** Nombre del titular, para el estado 02 («Esta semana le toca a Marta»). */
  holderName: string | null;
  /** La ronda ya escrita de este periodo, si existe. */
  round: {
    id: string;
    authorId: string | null;
    prompt: string;
    itemType: ItemType | null;
    itemId: string | null;
  } | null;
};
```

- [ ] **Step 2: Escribe las server actions**

Crea `src/lib/clubs/rounds/rounds.ts`:

```ts
"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
import { notifyClub } from "@/lib/clubs/activities/notify-club";
import type { ItemType } from "@/lib/catalog/types";
import type { RoundState } from "./types";

const MAX_PROMPT_LENGTH = 500; // espejo del CHECK club_rounds_prompt_len

export async function getRoundState(clubId: string): Promise<RoundState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_club_round_state", { p_club_id: clubId })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null; // no eres miembro, o el club no existe

  // El nombre del titular pide una segunda consulta: la RPC devuelve el id, y
  // el estado 02 de la maqueta dice «Esta semana le toca a Marta», no un uuid.
  let holderName: string | null = null;
  if (data.holder_id) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("user_id", data.holder_id)
      .maybeSingle();
    holderName = perfil?.display_name ?? perfil?.username ?? null;
  }

  return {
    periodKey: data.period_key,
    dayIndex: data.day_index,
    holderId: data.holder_id,
    holderName,
    round: data.round_id
      ? {
          id: data.round_id,
          authorId: data.round_author,
          prompt: data.round_prompt,
          itemType: data.round_item_type,
          itemId: data.round_item_id,
        }
      : null,
  };
}

export async function proposeRound(
  clubId: string,
  prompt: string,
  item: { itemType: ItemType; itemId: string } | null,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("not_authenticated");
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("prompt_required");
  if (trimmed.length > MAX_PROMPT_LENGTH) throw new Error("prompt_too_long");

  const supabase = await createClient();
  // El periodo NO se envía: lo calcula la RPC. La RPC también verifica que
  // quien llama es el titular -- validarlo aquí sería decorativo.
  const { data: roundId, error } = await supabase.rpc("ensure_club_round", {
    p_club_id: clubId,
    p_prompt: trimmed,
    p_item_type: item?.itemType ?? null,
    p_item_id: item?.itemId ?? null,
  });
  if (error) throw error;

  await notifyClub(supabase, clubId, user.id, "club_round_proposed", roundId as string);
  revalidateClubPages();
}

/** Materializa la consigna de la casa del periodo actual y devuelve su id.
 *  Se llama justo antes de la PRIMERA respuesta: hasta que alguien contesta,
 *  una ronda de la casa no tiene fila (§2.4 de la spec). Idempotente. */
export async function ensureHouseRound(clubId: string): Promise<string> {
  const supabase = await createClient();
  const { data: roundId, error } = await supabase.rpc("ensure_club_round", {
    p_club_id: clubId,
    p_prompt: null,
    p_item_type: null,
    p_item_id: null,
  });
  if (error) throw error;
  revalidateClubPages();
  return roundId as string;
}
```

- [ ] **Step 3: Regenera los tipos de Supabase**

Con `mcp__supabase-dev__generate_typescript_types`, y vuelca el resultado en `src/lib/supabase/database.types.ts`.
Comprueba que aparecen `club_rounds`, `get_club_round_state` y `ensure_club_round`.

- [ ] **Step 4: Comprueba que compila**

```bash
npx tsc --noEmit
```
Esperado: sin errores. Si `data.period_key` da error de tipo, es que los tipos no se regeneraron: repite el Step 3.

- [ ] **Step 5: Añade el tipo de aviso a `notifyClub`**

En `src/lib/clubs/activities/notify-club.ts`, añade `"club_round_proposed"` a la unión del parámetro `type`, y en el ternario de `targetType` haz que `club_round_proposed` use `"club_round"`:

```ts
    | "club_event_created"
    | "club_round_proposed",
```

```ts
      targetType:
        type === "club_event_created" ? "club_event"
        : type === "club_round_proposed" ? "club_round"
        : "club_activity",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/rounds src/lib/clubs/activities/notify-club.ts src/lib/supabase/database.types.ts
git commit -m "feat(clubes): capa de dominio de las rondas"
```

---

### Task 4: El bloque de la ronda en el feed

**Files:**
- Create: `src/components/clubs/round/round-block.tsx`
- Create: `src/components/clubs/round/round-composer.tsx`
- Create: `src/components/clubs/round/round-answer-gate.tsx`
- Modify: `src/app/club/[slug]/page.tsx:~218` (dentro de `ClubFeedSection`, encima de `<ClubFeed>`)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getRoundState`, `proposeRound`, `ensureHouseRound` (Task 3); `getInteractionSummary(supabase, 'club_round', [id])` de `src/lib/social/interactions.ts`; `ReviewInteractions` de `src/components/social/review-interactions`; `ItemPicker` y `PickedItem` de `src/components/clubs/item-picker.tsx`.
- Produces: `<RoundBlock clubId clubSlug viewerId />` (server component).

- [ ] **Step 1: Añade las claves de i18n**

En `messages/es.json`, dentro de `"club"`, añade el objeto `"round"`:

```json
"round": {
  "title": "La ronda",
  "yourTurnTitle": "Te toca. ¿Qué le preguntas al club?",
  "yourTurnPlaceholder": "Un libro que abandonaste y no te arrepientes…",
  "yourTurnSubmit": "Proponer la ronda",
  "yourTurnAddWork": "+ Añadir una obra",
  "yourTurnDeadline": "Hasta el miércoles es tuya",
  "waitingTitle": "Esta semana le toca a {name}",
  "waitingSub": "Si el miércoles no ha propuesto nada, entra una consigna de la casa",
  "houseStamp": "Ronda de la casa",
  "proposedBy": "{name} propuso la ronda",
  "answer": "Responder",
  "noAnswersYet": "Sin respuestas todavía",
  "addToPlanned": "A pendientes",
  "historyTitle": "Rondas anteriores",
  "historyWeeks": "{count} semanas",
  "historyAnswers": "{count} respuestas",
  "historyEmptyWeek": "Sin ronda",
  "errorNotYourTurn": "Se te pasó el turno: alguien ya abrió la ronda de esta semana.",
  "errorGeneric": "No se ha podido guardar la ronda. Inténtalo otra vez."
}
```

Y en `"notifications"`, tres claves nuevas — mismo tono que `clubPostCommented` (`"{name} comentó tu publicación"`):

```json
"clubRoundProposed": "{name} propuso la ronda de esta semana",
"clubRoundCommented": "{name} respondió a la ronda",
"clubRoundLiked": "A {name} le gustó tu ronda"
```

- [ ] **Step 2: Escribe el composer (cliente)**

Crea `src/components/clubs/round/round-composer.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ItemPicker, type PickedItem } from "@/components/clubs/item-picker";
import { proposeRound } from "@/lib/clubs/rounds/rounds";
import { buttonVariants } from "@/components/ui/button";

// Estado 01 de la maqueta: te toca a ti. La obra va DETRÁS de un botón -- la
// mayoría de rondas serán solo pregunta, y un selector siempre visible
// convierte un campo en un formulario.
export function RoundComposer({ clubId }: { clubId: string }) {
  const t = useTranslations("club.round");
  const [prompt, setPrompt] = useState("");
  const [item, setItem] = useState<PickedItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await proposeRound(
          clubId,
          prompt,
          item ? { itemType: item.itemType, itemId: item.itemId } : null,
        );
        setPrompt("");
        setItem(null);
      } catch (e) {
        // La RPC rechaza con not_your_turn si alguien se te adelantó: es el
        // único error que merece copia propia, el resto es genérico.
        setError(
          String(e).includes("not_your_turn") ? t("errorNotYourTurn") : t("errorGeneric"),
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-dashed border-accent/45 bg-accent/5 p-3.5">
      <p className="font-serif text-base font-semibold">{t("yourTurnTitle")}</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("yourTurnPlaceholder")}
        maxLength={500}
        rows={3}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
      />
      {item && <p className="text-sm text-muted-foreground">{item.title}</p>}
      {pickerOpen && (
        <ItemPicker
          onPick={(picked) => {
            setItem(picked);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !prompt.trim()}
          onClick={submit}
          className={buttonVariants("primary")}
        >
          {t("yourTurnSubmit")}
        </button>
        {!item && !pickerOpen && (
          <button type="button" onClick={() => setPickerOpen(true)} className={buttonVariants("secondary")}>
            {t("yourTurnAddWork")}
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{t("yourTurnDeadline")}</span>
      </div>
      {error && <p className="text-sm text-status-dropped">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Escribe el gate de respuesta (cliente)**

Crea `src/components/clubs/round/round-answer-gate.tsx`. Existe porque una ronda de la casa **no tiene fila hasta que alguien responde**, y `ReviewInteractions` necesita un `interactionTargetId` que aún no existe:

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ensureHouseRound } from "@/lib/clubs/rounds/rounds";
import { buttonVariants } from "@/components/ui/button";

export function RoundAnswerGate({ clubId }: { clubId: string }) {
  const t = useTranslations("club.round");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        // Materializa la fila y revalida: al repintar, el bloque ya tiene
        // interactionTargetId y muestra el hilo de respuestas de verdad.
        onClick={() => startTransition(() => ensureHouseRound(clubId).then(() => undefined))}
        className={buttonVariants("primary")}
      >
        {t("answer")}
      </button>
      <span className="text-xs text-muted-foreground">{t("noAnswersYet")}</span>
    </div>
  );
}
```

- [ ] **Step 4: Escribe el bloque (servidor)**

Crea `src/components/clubs/round/round-block.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getRoundState } from "@/lib/clubs/rounds/rounds";
import { getInteractionSummary } from "@/lib/social/interactions";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { RoundComposer } from "./round-composer";
import { RoundAnswerGate } from "./round-answer-gate";
import { RoundHistory } from "./round-history";

// Los cinco estados de la maqueta viven aquí porque son excluyentes: cuál se
// pinta lo decide el estado que devuelve SQL, no el cliente.
export async function RoundBlock({
  clubId,
  clubSlug,
  viewerId,
}: {
  clubId: string;
  clubSlug: string;
  viewerId: string;
}) {
  const [state, t] = await Promise.all([getRoundState(clubId), getTranslations("club.round")]);
  if (!state) return null;

  const supabase = await createClient();
  const summary = state.round
    ? (await getInteractionSummary(supabase, "club_round", [state.round.id])).get(state.round.id)
    : undefined;

  const esMiTurno = state.holderId === viewerId;
  const casaDisponible = state.dayIndex >= 3;

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[15px] font-semibold">{t("title")}</h2>
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {state.periodKey}
        </span>
      </div>

      {/* 03 y 04: ya hay ronda escrita este periodo. */}
      {state.round ? (
        <>
          {state.round.authorId === null && (
            <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
              {t("houseStamp")}
            </span>
          )}
          <p className="font-serif text-xl leading-snug font-medium text-balance">
            {state.round.prompt}
          </p>
          {summary && (
            <ReviewInteractions
              interactionTargetId={summary.interactionTargetId}
              reactionCount={summary.reactionCount}
              viewerReacted={summary.viewerReacted}
              commentCount={summary.commentCount}
              comments={summary.comments}
              viewerLoggedIn
              showTargetReaction
              clubId={clubId}
              // Firma real: (supabase, texts: string[]). Se le pasan la
              // consigna Y los cuerpos de las respuestas, igual que
              // checkpoints.ts con su chat.
              knownUsernames={await resolveKnownMentions(supabase, [
                state.round.prompt,
                ...summary.comments.map((c) => c.body),
              ])}
            />
          )}
        </>
      ) : esMiTurno ? (
        /* 01: te toca a ti. */
        <RoundComposer clubId={clubId} />
      ) : casaDisponible ? (
        /* 04 sin materializar: la consigna existe, su fila todavía no. */
        <>
          <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
            {t("houseStamp")}
          </span>
          <RoundAnswerGate clubId={clubId} />
        </>
      ) : (
        /* 02: le toca a otro y aún tiene sus 48 h. Deliberadamente sin nada que
           responder: si aquí ya hubiera contenido, el turno no valdría nada. */
        <div className="flex flex-col gap-1">
          <p className="font-serif text-[17px] font-semibold">
            {t("waitingTitle", { name: state.holderName ?? "" })}
          </p>
          <p className="text-sm text-muted-foreground">{t("waitingSub")}</p>
        </div>
      )}

      <RoundHistory clubId={clubId} currentPeriodKey={state.periodKey} />
    </section>
  );
}
```

> **Fuera, a sabiendas:** la maqueta pinta además el avatar del titular en el estado 02 y
> las caras de quién ha respondido en el estado 03. Ninguna de las dos cambia lo que el
> bloque comunica, y las dos piden más consultas a `profiles`. Si las dejas fuera, ábrelo
> como issue en el Task 7.

- [ ] **Step 5: Móntalo en el feed**

En `src/app/club/[slug]/page.tsx`, dentro de `ClubFeedSection`, en la columna principal, **encima** de `<ClubFeed>`:

```tsx
      <div className="min-w-0 lg:order-1">
        <div className="mb-5">
          <RoundBlock clubId={club.id} clubSlug={club.slug} viewerId={userId} />
        </div>
        <ClubFeed
```

Con su import: `import { RoundBlock } from "@/components/clubs/round/round-block";`

- [ ] **Step 6: Compruébalo en el navegador**

Levanta `npm run dev` (puerto 3000, y solo uno) y entra en un club tuyo.
Esperado: el bloque «La ronda» encima del feed, con el estado que toque según el día y si eres el titular. Si eres el titular, proponer una ronda y ver que aparece y admite respuestas.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubs/round messages/es.json "src/app/club/[slug]/page.tsx"
git commit -m "feat(clubes): bloque de la ronda en el feed del club"
```

---

### Task 5: Histórico de rondas

**Files:**
- Create: `src/lib/clubs/rounds/history.ts`
- Create: `src/components/clubs/round/round-history.tsx`

**Interfaces:**
- Produces: `listRoundHistory(clubId: string, currentPeriodKey: string, weeks?: number): Promise<RoundHistoryEntry[]>`; `<RoundHistory clubId currentPeriodKey />`.
- `RoundHistoryEntry = { periodKey: string; prompt: string | null; answerCount: number }` — `prompt: null` es una semana sin ronda.

- [ ] **Step 1: Añade el tipo del histórico**

En `src/lib/clubs/rounds/types.ts`:

```ts
/** Una semana del histórico. `prompt: null` = esa semana no hubo ronda. */
export type RoundHistoryEntry = {
  periodKey: string;
  prompt: string | null;
  answerCount: number;
};
```

- [ ] **Step 2: Escribe la lectura**

Crea `src/lib/clubs/rounds/history.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getInteractionSummary } from "@/lib/social/interactions";
import type { RoundHistoryEntry } from "./types";

const DEFAULT_WEEKS = 4;

export async function listRoundHistory(
  clubId: string,
  currentPeriodKey: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<RoundHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_rounds")
    .select("id, period_key, prompt")
    .eq("club_id", clubId)
    .neq("period_key", currentPeriodKey)
    .order("period_key", { ascending: false })
    .limit(weeks);
  if (error) throw error;

  const rows = data ?? [];
  const summaries = await getInteractionSummary(supabase, "club_round", rows.map((r) => r.id));
  return rows.map((r) => ({
    periodKey: r.period_key,
    prompt: r.prompt,
    answerCount: summaries.get(r.id)?.commentCount ?? 0,
  }));
}
```

> **Límite asumido:** esto lista las últimas 4 rondas **que existen**, no las últimas 4
> semanas del calendario. La maqueta pinta además los huecos («Sin ronda», estado 05), y
> para eso hay que generar la serie de semanas y cruzarla. Se deja fuera: la serie de
> semanas ISO hacia atrás vuelve a ser aritmética de fechas, y toda la de esta feature vive
> en SQL — hacerlo bien es `generate_series` en una función, no un bucle en TS. Ábrelo como
> issue en vez de improvisarlo en el cliente.

- [ ] **Step 3: Escribe el componente**

Crea `src/components/clubs/round/round-history.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { listRoundHistory } from "@/lib/clubs/rounds/history";

export async function RoundHistory({
  clubId,
  currentPeriodKey,
}: {
  clubId: string;
  currentPeriodKey: string;
}) {
  const [entries, t] = await Promise.all([
    listRoundHistory(clubId, currentPeriodKey),
    getTranslations("club.round"),
  ]);
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        {t("historyTitle")}
      </h3>
      <ul className="flex flex-col">
        {entries.map((e) => (
          <li key={e.periodKey} className="flex items-baseline gap-3 border-b border-border py-2 last:border-b-0">
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {e.periodKey.slice(-3)}
            </span>
            <span className="min-w-0 text-sm text-foreground-soft">
              {e.prompt ?? t("historyEmptyWeek")}
            </span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("historyAnswers", { count: e.answerCount })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Comprueba en el navegador**

Inserta a mano dos rondas de periodos pasados en dev y recarga el club.
Esperado: la tira «Rondas anteriores» con `W31`, `W30` y su recuento.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/rounds/history.ts src/lib/clubs/rounds/types.ts src/components/clubs/round/round-history.tsx
git commit -m "feat(clubes): histórico de rondas anteriores"
```

---

### Task 6: E2E

**Files:**
- Create: `e2e/club-ronda.spec.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `TEST_USER_EMAIL/PASSWORD`; el club de pruebas `test-public-club`, del que `devtest` es dueño.

> **Esta es la parte frágil del plan.** El turno es determinista: si el usuario de prueba no
> es el titular, el test no ve el composer y falla sin que haya ningún bug. **Hay que
> forzarlo sembrando** — no confíes en tener suerte.

- [ ] **Step 1: Escribe el test**

Crea `e2e/club-ronda.spec.ts`, siguiendo el patrón de `e2e/club-evento.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CLUB_SLUG = "test-public-club"; // devtest es su dueño

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function clubBySlug(slug: string): Promise<{ id: string; created_at: string }> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs?slug=eq.${slug}&select=id,created_at`, {
      headers: adminHeaders(),
    })
  ).json()) as { id: string; created_at: string }[];
  if (!rows[0]) throw new Error(`no se encontró el club ${slug}`);
  return rows[0];
}

test("ronda: el titular propone y la ronda queda respondible", async ({ page }) => {
  const club = await clubBySlug(CLUB_SLUG);

  // El turno es (semanas desde created_at) % nº de miembros activos, sobre los
  // miembros ordenados por (joined_at, user_id). Para que le toque a devtest
  // -- que por ser el dueño es el de joined_at más antiguo, o sea idx 0 -- el
  // club tiene que llevar un número ENTERO de vueltas: created_at exactamente
  // N*miembros semanas atrás. Con created_at = ahora, weeks=0 y 0 % n = 0.
  // Sin esto el test es una moneda al aire.
  const original = club.created_at;
  await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${club.id}`, {
    method: "PATCH",
    headers: adminJson(),
    body: JSON.stringify({ created_at: new Date().toISOString() }),
  });
  // Y no puede haber ya una ronda de este periodo, o se pinta el estado 03.
  await fetch(`${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });

  try {
    await page.goto(`/club/${CLUB_SLUG}`);
    const composer = page.getByPlaceholder("Un libro que abandonaste");
    await expect(composer).toBeVisible();

    const pregunta = `¿Ronda de prueba ${Date.now()}?`;
    await composer.fill(pregunta);
    await page.getByRole("button", { name: "Proponer la ronda" }).click();

    // Se comprueba que se GUARDÓ, no solo que se pintara.
    await expect(page.getByText(pregunta)).toBeVisible();
    const rows = (await (
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}&select=prompt,author_id`,
        { headers: adminHeaders() },
      )
    ).json()) as { prompt: string; author_id: string | null }[];
    expect(rows.some((r) => r.prompt === pregunta && r.author_id !== null)).toBe(true);
  } finally {
    // Autolimpieza: deja el club como estaba, o el siguiente test hereda basura.
    await fetch(`${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${club.id}`, {
      method: "PATCH",
      headers: adminJson(),
      body: JSON.stringify({ created_at: original }),
    });
  }
});
```

- [ ] **Step 2: Ejecútalo**

```bash
npm run test:e2e -- club-ronda
```
Esperado: PASA. Reutiliza el dev server que ya haya en el 3000; no levantes otro.

- [ ] **Step 3: Ejecuta la suite de clubes completa**

```bash
npm run test:e2e -- club-
```
Esperado: sin regresiones. Si cae media suite, mira la carga de la máquina antes que tu código — la suite está calibrada para `next dev` y esta máquina tiene 8 GB.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-ronda.spec.ts
git commit -m "test(clubes): e2e de proponer una ronda como titular"
```

---

### Task 7: Producción y cierre documental

**Files:**
- Modify: `docs/requirements/data-model.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `supabase/schema-baseline.sql`

- [ ] **Step 1: Aplica la migración a producción**

Con `mcp__supabase-prod__apply_migration`. Es **puramente aditiva** (tabla nueva, valores de enum nuevos, funciones nuevas): no hay fase de contrato, así que no depende de que el bundle esté desplegado.

- [ ] **Step 2: Verifica prod contra los objetos reales**

Las mismas consultas del Task 1 Step 4 y Task 2 Step 4, con `mcp__supabase-prod__execute_sql`.
**No des por buena la migración porque aparezca en `list_migrations`**: el ledger de prod ya venía sin una fila cuyo efecto sí estaba.

- [ ] **Step 3: Pasa los advisors**

`mcp__supabase-prod__get_advisors` (seguridad y rendimiento). Esperado: sin hallazgos nuevos frente a la línea base. Si sale uno de RLS sobre `club_rounds`, arréglalo antes de seguir.

- [ ] **Step 4: Actualiza `data-model.md`**

En §5, añade `club_rounds`: columnas, el `unique (club_id, period_key)`, las dos políticas, los dos triggers y las tres funciones. Pon fecha de verificación **por entorno** (dev y prod por separado), que es como lo lleva el resto del documento.

- [ ] **Step 5: Marca el backlog**

En `docs/requirements/backlog.md`, sección «Social y clubes (EPIC-05)», añade la entrada marcada, con enlaces a la spec y a este plan. **La narrativa de cómo se hizo va en la spec, no aquí.**

- [ ] **Step 6: Anexa las decisiones**

**Al final** de `docs/requirements/decisiones.md` (append-only, no reescribas las anteriores), dos entradas fechadas 2026-08-03:
1. `club_rounds` es tabla propia y no un `kind` de `club_activities`, contra SD-8 — con el argumento de §1 de la spec.
2. La semana y el turno se calculan en SQL, en `Europe/Madrid`, y el cliente nunca envía el periodo.

- [ ] **Step 7: Anexa el baseline**

Añade la migración a `supabase/schema-baseline.sql` **en el orden en que la recibió producción**.

- [ ] **Step 8: Abre las issues de lo que quedó fuera**

- El histórico lista las últimas 4 rondas **que existen**, no las últimas 4 semanas: no
  pinta los huecos «Sin ronda» que sí dibuja la maqueta (Task 5, Step 2).
- Los avatares que dibuja la maqueta y que no se implementaron: el del titular en el estado
  02 y las caras de quién ha respondido en el 03 (Task 4, Step 4).

- [ ] **Step 9: Commit**

```bash
git add docs/requirements supabase/schema-baseline.sql
git commit -m "docs(clubes): cierre documental de las rondas"
```

---

## Notas de verificación

- **Vitest apenas aparece en este plan, y es intencionado.** La lógica de esta feature vive
  en SQL, así que la cobertura de verdad es `supabase/tests/club_rounds.sql`. Si te
  encuentras escribiendo un test de Vitest que reimplementa el cálculo del turno, para: eso
  es la señal de que la lógica se ha escapado a TypeScript.
- **Antes de dar nada por hecho**, corre la suite completa (`npm run test:e2e`) y
  `npx tsc --noEmit`, y comprueba que el puerto 3000 queda libre y no hay worktrees
  huérfanos en `.claude/worktrees/`.
