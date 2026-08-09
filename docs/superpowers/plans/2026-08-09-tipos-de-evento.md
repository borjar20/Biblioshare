# Tipos de evento de club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolucionar la actividad `evento` de club para soportar tres tipos (Encuentro, Lanzamiento, Fecha destacada) dentro de un solo sistema, con formulario dinámico y modelo extensible.

**Architecture:** Un discriminador `event_type` (enum nuevo) sobre `club_activities` + la columna `config` jsonb existente (opaca a la BD, como tierlist/reto) para los campos propios de cada tipo. Se reutilizan las columnas de Encuentro, la ficha `/evento/[id]`, el calendario y el motor de seguir/avisar. Las escrituras siguen yendo por las RPC `SECURITY DEFINER` `create_club_event`/`update_club_event` (ampliadas con `p_event_type` + `p_config`).

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase/Postgres (RLS, RPC `SECURITY DEFINER`), TypeScript, next-intl (`es` mono-idioma), Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-09-tipos-de-evento-design.md`
**Prototipo UX:** `docs/superpowers/specs/2026-08-09-tipos-de-evento-prototype.html`

## Global Constraints

- **Migración primero (dev), merge después, prod al final.** Verificar SIEMPRE contra objetos reales (`pg_proc`, `information_schema.columns`, `to_regtype`), **nunca contra `list_migrations`**.
- **Enum nuevo en su PROPIA migración** (Postgres prohíbe usar un valor de enum en la misma transacción que lo crea).
- **Columna nueva ⇒ grant por columna** (issue #375; DRIFT-CHECK superficie 6). Una columna sin grant compila, pasa tests y revienta en prod.
- **Cambiar firma de RPC = `DROP` + `CREATE`, no overload** (una llamada ambigua da `42725`; con defaults el bundle viejo sigue resolviendo).
- **Las server actions NO lanzan `Error`**: devuelven resultado discriminado. Next.js borra el mensaje de un `Error` de server action en prod.
- **`config` es OPACO a la BD**: la RPC lo guarda tal cual; la forma la garantiza la app (igual que tierlist/reto).
- **i18n solo `es`**: añadir claves solo a `messages/es.json` (no crear `en.json`).
- **Node 22 para Vitest**: el shell arranca en 20.9; activar fnm antes (`fnm use` / el `.nvmrc`) o `npx vitest` fallará.
- **Un solo `next dev` en el puerto 3000** para los e2e (reutilizan el server que haya).
- **Referencias a catálogo polimórficas sin FK** (`item_type`+`item_id`), igual que `passes`: integridad responsabilidad de la app.
- **Límites de texto**: título ≤120, descripción ≤2000, location ≤200, online_url ≤500, region ≤120.
- Trabajar en el worktree `tipos-de-evento` (branch `worktree-tipos-de-evento`). Commits frecuentes.

---

## File Structure

**Migraciones (crear):**
- `supabase/migrations/20260840_club_event_type_enum.sql` — enum `club_event_type` (solo eso).
- `supabase/migrations/20260841_club_event_type_column.sql` — columna `event_type` + grant.
- `supabase/migrations/20260842_club_event_typed_rpcs.sql` — `DROP`+`CREATE` de `create_club_event`/`update_club_event`.

**TypeScript de dominio (crear):**
- `src/lib/clubs/activities/event-release-types.ts` — vocabularios `RELEASE_TYPES` (por medio) y `PLATFORMS`.
- `src/lib/clubs/activities/event-types.ts` — `EventType`, unión `EventConfig`, `parseEventConfig`.
- Tests: `src/lib/clubs/activities/event-release-types.test.ts`, `src/lib/clubs/activities/event-types.test.ts`.

**TypeScript (modificar):**
- `src/lib/clubs/activities/events.ts` — reescritura a resultado discriminado + `eventType`/`config`.
- `src/lib/clubs/activities/event-detail.ts` — `ClubEventDetail` gana `eventType`/`allDay`/config hidratado; `getClubEvent` parsea e hidrata.
- `src/lib/clubs/activities/core.ts` — `ClubActivity` gana `eventType`; queries de lista lo seleccionan.

**UI (modificar):**
- `src/components/clubs/propose/event-form.tsx` — selector de tipo + grupos condicionales.
- `src/components/clubs/event/event-detail-view.tsx` — render por tipo + «todo el día».
- `src/components/clubs/event-card-actions.tsx` y `src/components/clubs/event/event-moderation.tsx` — pasan `eventType` + campos completos a `EventForm`.
- `src/components/clubs/activity-card.tsx` y `src/components/clubs/calendar/agenda-list.tsx` — subtítulo/fecha por tipo (ligero).

**i18n (modificar):** `messages/es.json` — claves nuevas bajo `activity`.

**Tests e2e (crear):** `e2e/club-event-types.spec.ts`.

**Docs (modificar al cerrar):** `docs/requirements/data-model.md`, `decisiones.md`, `backlog.md`.

---

## Task 1: DB — enum `club_event_type` (dev)

**Files:**
- Create: `supabase/migrations/20260840_club_event_type_enum.sql`

**Interfaces:**
- Produces: tipo `public.club_event_type` con valores `encuentro | lanzamiento | fecha_destacada`.

- [ ] **Step 1: Confirmar el número de migración libre**

Run: `ls -1 supabase/migrations/ | sort | tail -3`
Expected: el último es `20260839_*`. Si hay algo `>= 20260840`, sube los tres números de este plan en consecuencia.

- [ ] **Step 2: Escribir la migración**

```sql
-- Enum discriminador de tipo de evento (spec 2026-08-09). SOLO en su fichero:
-- Postgres prohíbe usar un valor de enum en la misma transacción que lo crea, y
-- la columna de 20260841 usa 'encuentro' como default.
create type public.club_event_type as enum ('encuentro', 'lanzamiento', 'fecha_destacada');
```

- [ ] **Step 3: Aplicar en dev**

Usar `mcp__supabase-dev__apply_migration` con name `20260840_club_event_type_enum` y el SQL de arriba.

- [ ] **Step 4: Verificar contra el objeto real (no el ledger)**

Usar `mcp__supabase-dev__execute_sql`:
```sql
select enumlabel from pg_enum
where enumtypid = 'public.club_event_type'::regtype order by enumsortorder;
```
Expected: tres filas `encuentro`, `lanzamiento`, `fecha_destacada`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260840_club_event_type_enum.sql
git commit -m "feat(db): enum club_event_type (encuentro/lanzamiento/fecha_destacada)"
```

---

## Task 2: DB — columna `event_type` + grant (dev)

**Files:**
- Create: `supabase/migrations/20260841_club_event_type_column.sql`

**Interfaces:**
- Consumes: `public.club_event_type` (Task 1).
- Produces: `club_activities.event_type club_event_type NOT NULL DEFAULT 'encuentro'`, con grant por columna igual que `modality`.

- [ ] **Step 1: Leer los grants ACTUALES de `modality` para replicarlos**

Run (`mcp__supabase-dev__execute_sql`):
```sql
select grantee, privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='club_activities' and column_name='modality'
order by grantee, privilege_type;
```
Expected (referencia; si difiere, replica lo que salga): `anon: SELECT`; `authenticated: INSERT, SELECT, UPDATE`.

- [ ] **Step 2: Escribir la migración**

```sql
-- event_type: discriminador de tipo de evento. Default 'encuentro' hace el
-- backfill gratis -- todo evento existente ES un encuentro (lo único creable
-- hasta hoy). Grant por columna igual que `modality` (issue #375: una columna
-- sin grant rompe la escritura ENTERA de la tabla).
alter table public.club_activities
  add column event_type public.club_event_type not null default 'encuentro';

grant select (event_type) on public.club_activities to anon;
grant select (event_type), insert (event_type), update (event_type)
  on public.club_activities to authenticated;
```
(Si el Step 1 mostró grants distintos para `modality`, ajusta estas dos líneas para que `event_type` quede idéntico a `modality`.)

- [ ] **Step 3: Aplicar en dev**

`mcp__supabase-dev__apply_migration`, name `20260841_club_event_type_column`.

- [ ] **Step 4: Verificar columna + grant + backfill**

```sql
select is_nullable, column_default from information_schema.columns
where table_schema='public' and table_name='club_activities' and column_name='event_type';
-- Expected: NO, 'encuentro'::club_event_type

select grantee, privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='club_activities' and column_name='event_type'
order by grantee, privilege_type;
-- Expected: idéntico a modality (Step 1)

select event_type, count(*) from public.club_activities where kind='evento' group by 1;
-- Expected: todos 'encuentro'
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260841_club_event_type_column.sql
git commit -m "feat(db): club_activities.event_type + grant por columna"
```

---

## Task 3: DB — RPCs `create_club_event`/`update_club_event` tipadas (dev)

**Files:**
- Create: `supabase/migrations/20260842_club_event_typed_rpcs.sql`

**Interfaces:**
- Consumes: `club_event_type` (Task 1), columna `event_type` (Task 2), `private.validate_event_fields` (existente).
- Produces:
  - `create_club_event(p_club_id uuid, p_title text, p_description text, p_starts_on date, p_starts_time time, p_ends_time time, p_timezone text, p_location text, p_modality event_modality, p_online_url text, p_event_type club_event_type, p_config jsonb) returns uuid`
  - `update_club_event(p_activity_id uuid, p_title text, p_description text, p_starts_on date, p_starts_time time, p_ends_time time, p_timezone text, p_location text, p_modality event_modality, p_online_url text, p_config jsonb) returns void`
  - Errores nuevos: `starts_time_required` (Encuentro sin hora).

- [ ] **Step 1: Escribir la migración**

```sql
-- Tipos de evento (spec 2026-08-09). Se AMPLÍAN las firmas con DROP + CREATE (no
-- overload): con defaults, la llamada del bundle ANTERIOR (10 args, sin
-- p_event_type/p_config) sigue resolviendo -- «migración primero, merge después».
--
-- Dos cambios de comportamiento:
--   1. p_event_type + p_config: el config es OPACO (se guarda tal cual, como
--      tierlist/reto). event_type NO se cambia al editar (update lo lee de la fila).
--   2. Hora opcional: sin hora, el evento es de «todo el día» y starts_at se ancla
--      a 00:00 en su zona. Encuentro sigue exigiendo hora (starts_time_required).

drop function if exists public.create_club_event(uuid, text, text, date, time, time, text, text, public.event_modality, text);
drop function if exists public.update_club_event(uuid, text, text, date, time, time, text, text, public.event_modality, text);

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
  v_starts_time time := coalesce(p_starts_time, '00:00'::time);
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
  -- Encuentro exige hora; lanzamiento/fecha_destacada pueden ser de todo el día.
  if p_event_type = 'encuentro' and p_starts_time is null then
    raise exception 'starts_time_required';
  end if;

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
  values (v_id, auth.uid(), 1440)
  on conflict (activity_id, user_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title       text,
  p_description text default null,
  p_starts_on   date default null,
  p_starts_time time default null,
  p_ends_time   time default null,
  p_timezone    text default null,
  p_location    text default null,
  p_modality    public.event_modality default null,
  p_online_url  text default null,
  p_config      jsonb default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
  v_event_type public.club_event_type;
  v_old_tz text;
  v_old_time time;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_online_url text := nullif(trim(coalesce(p_online_url, '')), '');
  v_tz text;
  v_all_day boolean;
  v_starts_time time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select club_id, kind, status, event_type, event_timezone,
         (starts_at at time zone event_timezone)::time
    into v_club_id, v_kind, v_status, v_event_type, v_old_tz, v_old_time
    from public.club_activities where id = p_activity_id;

  -- Gate de rol PRIMERO (#129): con la fila inexistente v_club_id es null ->
  -- has_min_club_role(null,...) es false -> forbidden genérico, sin oráculo.
  if not public.has_min_club_role(v_club_id, 'moderator') then raise exception 'forbidden'; end if;
  if v_club_id is null then raise exception 'not_found'; end if;
  if v_kind <> 'evento' then raise exception 'not_an_event'; end if;
  if v_status <> 'active' then raise exception 'event_not_active'; end if;
  if p_starts_on is null then raise exception 'starts_on_required'; end if;
  if coalesce(v_title, '') = '' then raise exception 'title_required'; end if;
  if char_length(v_title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(coalesce(v_description, '')) > 2000 then raise exception 'description_too_long'; end if;

  v_tz := coalesce(p_timezone, v_old_tz, 'Europe/Madrid');

  -- El tipo NO cambia al editar. Encuentro conserva su hora (coalesce a la vieja
  -- para no borrarla si el cliente no la manda); los demás tipos son de todo el
  -- día cuando config.allDay es true o no llega hora.
  if v_event_type = 'encuentro' then
    v_starts_time := coalesce(p_starts_time, v_old_time, '00:00'::time);
  else
    v_all_day := coalesce((p_config->>'allDay')::boolean, p_starts_time is null);
    v_starts_time := case when v_all_day then '00:00'::time
                          else coalesce(p_starts_time, v_old_time, '00:00'::time) end;
  end if;

  perform private.validate_event_fields(
    v_tz, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp at time zone v_tz;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp at time zone v_tz;
  end if;

  update public.club_activities
     set title = v_title,
         description = v_description,
         starts_at = v_starts_at,
         ends_at = v_ends_at,
         event_timezone = v_tz,
         location = v_location,
         modality = p_modality,
         online_url = v_online_url,
         -- p_config null (bundle viejo) => no tocar; forma nueva => set (nullif '{}').
         config = case when p_config is null then config else nullif(p_config, '{}'::jsonb) end
   where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;
```

- [ ] **Step 2: Aplicar en dev**

`mcp__supabase-dev__apply_migration`, name `20260842_club_event_typed_rpcs`.

- [ ] **Step 3: Verificar UNA firma por nombre y que el enum aparece**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_club_event','update_club_event')
order by 1;
```
Expected: exactamente una fila por nombre; `create_club_event` termina en `p_event_type club_event_type, p_config jsonb`; `update_club_event` termina en `p_config jsonb`.

- [ ] **Step 4: Prueba funcional en dev (crear un lanzamiento de todo el día)**

Contra un club de prueba donde el usuario de servicio sea moderador (o usa la matriz de impersonación existente). Comprueba que un `create_club_event` con `p_event_type='lanzamiento'`, `p_starts_time=null`, `p_config='{"item":{"itemType":"series","itemId":"..."},"releaseType":"estreno_temporada","allDay":true}'` inserta con `starts_at` a las 00:00 locales y `config` no nulo; y que `p_event_type='encuentro'` con `p_starts_time=null` lanza `starts_time_required`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260842_club_event_typed_rpcs.sql
git commit -m "feat(db): create/update_club_event con event_type + config + hora opcional"
```

---

## Task 4: Regenerar `database.types.ts` (acotado)

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Enums"]["club_event_type"]`, columna `event_type` en `club_activities` Row/Insert/Update, y las firmas nuevas de las dos RPC.

- [ ] **Step 1: `git fetch` antes de nada** (evita el falso «drift» si el main local va por detrás — memoria `database-types-regen-drift`)

Run: `git fetch origin`

- [ ] **Step 2: Generar tipos de dev**

Usar `mcp__supabase-dev__generate_typescript_types` y guardar la salida.

- [ ] **Step 3: Acotar el diff a ESTA feature**

Compara con el actual y quédate SOLO con: el enum `club_event_type`, la columna `event_type` (Row/Insert/Update de `club_activities`) y los args nuevos de `create_club_event`/`update_club_event`. Si el generador arrastra esquema ajeno (otra feature en dev), parte de `origin/main` y re-aplica a mano:
```bash
git checkout origin/main -- src/lib/supabase/database.types.ts
```
y añade a mano las adiciones anteriores.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (los call-sites viejos siguen compilando gracias a los defaults).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regen database.types para event_type + config en RPCs de evento"
```

---

## Task 5: `event-release-types.ts` — vocabularios

**Files:**
- Create: `src/lib/clubs/activities/event-release-types.ts`
- Test: `src/lib/clubs/activities/event-release-types.test.ts`

**Interfaces:**
- Produces:
  - `type ReleaseType = string` (opaco; el valor es del vocabulario por medio)
  - `RELEASE_TYPES: Record<ItemType, ReadonlyArray<{ value: string; labelKey: string }>>`
  - `PLATFORMS: ReadonlyArray<{ value: string; labelKey: string }>`
  - `isValidReleaseType(itemType: ItemType, value: string): boolean`
  - `platformAllowed(itemType: ItemType): boolean` (true para movie/series)

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/clubs/activities/event-release-types.test.ts
import { describe, it, expect } from "vitest";
import { RELEASE_TYPES, PLATFORMS, isValidReleaseType, platformAllowed } from "./event-release-types";

describe("event-release-types", () => {
  it("da vocabulario por medio y lo valida", () => {
    expect(RELEASE_TYPES.book.map((r) => r.value)).toContain("audiolibro");
    expect(RELEASE_TYPES.series.map((r) => r.value)).toContain("estreno_temporada");
    expect(isValidReleaseType("book", "audiolibro")).toBe(true);
    expect(isValidReleaseType("book", "estreno_temporada")).toBe(false); // no es de libro
    expect(isValidReleaseType("movie", "no_existe")).toBe(false);
  });

  it("la plataforma solo aplica a pantalla (movie/series)", () => {
    expect(platformAllowed("movie")).toBe(true);
    expect(platformAllowed("series")).toBe(true);
    expect(platformAllowed("book")).toBe(false);
    expect(PLATFORMS.map((p) => p.value)).toContain("netflix");
    expect(PLATFORMS.map((p) => p.value)).toContain("otro");
  });
});
```

- [ ] **Step 2: Ver el test rojo**

Run: `npx vitest run src/lib/clubs/activities/event-release-types.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Escribir el módulo**

```ts
// src/lib/clubs/activities/event-release-types.ts
import type { ItemType } from "@/lib/catalog/types";

// Vocabulario de «tipo de lanzamiento» POR MEDIO. En TS a propósito: config
// guarda el string y añadir un valor no toca la BD (spec §4.2). Las etiquetas
// viven en messages/es.json bajo la clave labelKey.
export const RELEASE_TYPES: Record<
  ItemType,
  ReadonlyArray<{ value: string; labelKey: string }>
> = {
  book: [
    { value: "publicacion", labelKey: "releaseType_publicacion" },
    { value: "tapa_dura", labelKey: "releaseType_tapa_dura" },
    { value: "bolsillo", labelKey: "releaseType_bolsillo" },
    { value: "ebook", labelKey: "releaseType_ebook" },
    { value: "audiolibro", labelKey: "releaseType_audiolibro" },
  ],
  movie: [
    { value: "cine", labelKey: "releaseType_cine" },
    { value: "streaming", labelKey: "releaseType_streaming" },
    { value: "fisico", labelKey: "releaseType_fisico" },
  ],
  series: [
    { value: "estreno_temporada", labelKey: "releaseType_estreno_temporada" },
    { value: "final_temporada", labelKey: "releaseType_final_temporada" },
    { value: "episodio", labelKey: "releaseType_episodio" },
    { value: "estreno", labelKey: "releaseType_estreno" },
  ],
};

// Plataforma de estreno (solo pantalla). Lista + «otro» (spec §4.2, nota del
// dueño 2026-08-09: Netflix/Amazon…).
export const PLATFORMS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "netflix", labelKey: "platform_netflix" },
  { value: "prime", labelKey: "platform_prime" },
  { value: "disney", labelKey: "platform_disney" },
  { value: "max", labelKey: "platform_max" },
  { value: "appletv", labelKey: "platform_appletv" },
  { value: "filmin", labelKey: "platform_filmin" },
  { value: "otro", labelKey: "platform_otro" },
];

export function isValidReleaseType(itemType: ItemType, value: string): boolean {
  return RELEASE_TYPES[itemType].some((r) => r.value === value);
}

/** La plataforma solo tiene sentido para pantalla (streaming): película y serie. */
export function platformAllowed(itemType: ItemType): boolean {
  return itemType === "movie" || itemType === "series";
}
```

- [ ] **Step 4: Ver el test verde**

Run: `npx vitest run src/lib/clubs/activities/event-release-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/event-release-types.ts src/lib/clubs/activities/event-release-types.test.ts
git commit -m "feat(clubs): vocabulario de tipo de lanzamiento y plataforma por medio"
```

---

## Task 6: `event-types.ts` — `EventType`, `EventConfig`, `parseEventConfig`

**Files:**
- Create: `src/lib/clubs/activities/event-types.ts`
- Test: `src/lib/clubs/activities/event-types.test.ts`

**Interfaces:**
- Consumes: `ItemType`; `Json` de database.types.
- Produces:
  - `type EventType = "encuentro" | "lanzamiento" | "fecha_destacada"`
  - `type ItemRef = { itemType: ItemType; itemId: string }`
  - `type EventRelation = { kind: "item"; itemType: ItemType; itemId: string } | { kind: "activity"; activityId: string }`
  - `type LanzamientoConfig = { item: ItemRef | null; releaseType: string | null; platform?: string | null; region?: string; allDay: boolean }`
  - `type FechaDestacadaConfig = { relations: EventRelation[]; allDay: true }`
  - `type EventConfig = Record<string, never> | LanzamientoConfig | FechaDestacadaConfig`
  - `parseEventConfig(eventType: EventType, raw: Json | null): EventConfig`
  - `EVENT_TYPES: readonly EventType[]`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/clubs/activities/event-types.test.ts
import { describe, it, expect } from "vitest";
import { parseEventConfig } from "./event-types";

describe("parseEventConfig", () => {
  it("encuentro: config vacío pase lo que pase", () => {
    expect(parseEventConfig("encuentro", null)).toEqual({});
    expect(parseEventConfig("encuentro", { foo: 1 })).toEqual({});
  });

  it("lanzamiento: normaliza item/releaseType/platform/region/allDay", () => {
    const c = parseEventConfig("lanzamiento", {
      item: { itemType: "series", itemId: "abc" },
      releaseType: "estreno_temporada",
      platform: "netflix",
      region: "España",
      allDay: true,
    });
    expect(c).toEqual({
      item: { itemType: "series", itemId: "abc" },
      releaseType: "estreno_temporada",
      platform: "netflix",
      region: "España",
      allDay: true,
    });
  });

  it("lanzamiento: tolera forma incompleta / basura", () => {
    const c = parseEventConfig("lanzamiento", { item: { itemType: "book" } }); // sin itemId
    expect(c).toEqual({ item: null, releaseType: null, allDay: false });
  });

  it("fecha_destacada: filtra relaciones inválidas y conserva el orden", () => {
    const c = parseEventConfig("fecha_destacada", {
      relations: [
        { kind: "item", itemType: "book", itemId: "b1" },
        { kind: "activity", activityId: "a1" },
        { kind: "item", itemType: "book" }, // inválida: sin itemId
        { kind: "bogus" },                  // inválida
      ],
      allDay: true,
    });
    expect(c).toEqual({
      relations: [
        { kind: "item", itemType: "book", itemId: "b1" },
        { kind: "activity", activityId: "a1" },
      ],
      allDay: true,
    });
  });

  it("fecha_destacada: sin relaciones", () => {
    expect(parseEventConfig("fecha_destacada", null)).toEqual({ relations: [], allDay: true });
  });
});
```

- [ ] **Step 2: Ver el test rojo**

Run: `npx vitest run src/lib/clubs/activities/event-types.test.ts`
Expected: FAIL.

- [ ] **Step 3: Escribir el módulo**

```ts
// src/lib/clubs/activities/event-types.ts
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

// Tipo de evento y forma de su `config` jsonb (spec §3.2). config es OPACO a la
// BD; parseEventConfig es la ÚNICA puerta de entrada tipada -- tolerante a formas
// viejas o corruptas para que un jsonb raro no reviente una ficha.
export type EventType = "encuentro" | "lanzamiento" | "fecha_destacada";
export const EVENT_TYPES = ["encuentro", "lanzamiento", "fecha_destacada"] as const;

const ITEM_TYPES: ReadonlyArray<ItemType> = ["book", "movie", "series"];

export type ItemRef = { itemType: ItemType; itemId: string };
export type EventRelation =
  | { kind: "item"; itemType: ItemType; itemId: string }
  | { kind: "activity"; activityId: string };

export type LanzamientoConfig = {
  item: ItemRef | null;
  releaseType: string | null;
  platform?: string | null;
  region?: string;
  allDay: boolean;
};
export type FechaDestacadaConfig = { relations: EventRelation[]; allDay: true };
export type EventConfig = Record<string, never> | LanzamientoConfig | FechaDestacadaConfig;

function asObject(raw: Json | null): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function itemRef(v: unknown): ItemRef | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const itemType = o?.itemType;
  const itemId = str(o?.itemId);
  if (!itemId || typeof itemType !== "string" || !ITEM_TYPES.includes(itemType as ItemType)) {
    return null;
  }
  return { itemType: itemType as ItemType, itemId };
}

export function parseEventConfig(eventType: EventType, raw: Json | null): EventConfig {
  if (eventType === "encuentro") return {};
  const o = asObject(raw);

  if (eventType === "lanzamiento") {
    const item = itemRef(o.item);
    const platform = str(o.platform);
    const region = str(o.region);
    const cfg: LanzamientoConfig = {
      item,
      releaseType: str(o.releaseType),
      allDay: o.allDay === true,
    };
    if (platform) cfg.platform = platform;
    if (region) cfg.region = region;
    return cfg;
  }

  // fecha_destacada
  const rels = Array.isArray(o.relations) ? o.relations : [];
  const relations: EventRelation[] = [];
  for (const r of rels) {
    const ro = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (ro?.kind === "item") {
      const ref = itemRef(ro);
      if (ref) relations.push({ kind: "item", ...ref });
    } else if (ro?.kind === "activity") {
      const activityId = str(ro.activityId);
      if (activityId) relations.push({ kind: "activity", activityId });
    }
  }
  return { relations, allDay: true };
}
```

- [ ] **Step 4: Ver el test verde + typecheck**

Run: `npx vitest run src/lib/clubs/activities/event-types.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/event-types.ts src/lib/clubs/activities/event-types.test.ts
git commit -m "feat(clubs): EventType + EventConfig + parseEventConfig tolerante"
```

---

## Task 7: `events.ts` — resultado discriminado + `eventType`/`config`

**Files:**
- Modify: `src/lib/clubs/activities/events.ts` (reescritura de las dos acciones)

**Interfaces:**
- Consumes: `EventType`, `EventConfig` (Task 6); `validateEventInput` (existente); RPCs de Task 3.
- Produces:
  - `type ClubEventFields` (ampliado): `{ eventType: EventType; title; description?; startsOn; startsTime?; endsTime?; timezone?; location?; modality?; onlineUrl?; config?: EventConfig }`
  - `type EventFormError` (unión de códigos, ver abajo)
  - `type EventFormResult = { ok: true; activityId: string } | { ok: false; code: EventFormError }`
  - `createClubEvent(input: { clubId: string } & ClubEventFields): Promise<EventFormResult>`
  - `updateClubEvent(input: { activityId: string } & ClubEventFields): Promise<EventFormResult>`

- [ ] **Step 1: Reescribir el fichero**

Reemplaza el bloque desde el `export type ClubEventFields` (línea 39) hasta el final por:

```ts
export type EventFormError =
  // Del validador de cliente y de las RPC (snake_case):
  | "title_required" | "title_too_long" | "starts_on_required" | "description_too_long"
  | "starts_time_required"
  | "invalid_timezone" | "location_too_long" | "online_url_too_long"
  | "invalid_online_url" | "online_event_has_location" | "ends_before_starts"
  | "not_found" | "not_an_event" | "event_not_active" | "forbidden"
  // De la validación de config en esta capa:
  | "item_required" | "release_type_required" | "relation_not_in_club"
  | "unknown";

export type EventFormResult = { ok: true; activityId: string } | { ok: false; code: EventFormError };

export type ClubEventFields = {
  eventType: EventType;
  title: string;
  description?: string;
  startsOn: string;
  startsTime?: string;
  endsTime?: string;
  timezone?: string;
  location?: string;
  modality?: Database["public"]["Enums"]["event_modality"];
  onlineUrl?: string;
  /** Solo para lanzamiento/fecha_destacada. Encuentro no lo manda. */
  config?: EventConfig;
};

const RPC_CODES: ReadonlySet<string> = new Set<EventFormError>([
  "title_required", "title_too_long", "starts_on_required", "description_too_long",
  "starts_time_required", "invalid_timezone", "location_too_long", "online_url_too_long",
  "invalid_online_url", "online_event_has_location", "ends_before_starts",
  "not_found", "not_an_event", "event_not_active", "forbidden",
]);

function mapRpcError(error: { message?: string } | null, where: string): EventFormResult {
  const raw = error?.message?.trim() ?? "";
  if (RPC_CODES.has(raw)) return { ok: false, code: raw as EventFormError };
  console.error(`${where} failed`, error);
  return { ok: false, code: "unknown" };
}

/** Validación de cliente (título/fechas) + de config, devolviendo código. No lanza. */
function validateFields(input: ClubEventFields): EventFormError | null {
  try {
    validateEventInput(input); // title/starts_on/description; lanza el código
  } catch (e) {
    return (e as Error).message as EventFormError;
  }
  if (input.eventType === "lanzamiento") {
    const cfg = input.config as LanzamientoConfig | undefined;
    if (!cfg?.item) return "item_required";
    if (!cfg.releaseType) return "release_type_required";
  }
  return null;
}

/** Las relaciones de tipo `activity` de una fecha destacada deben ser del MISMO club. */
async function relationsInClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  config: EventConfig | undefined,
): Promise<boolean> {
  const relations = (config as FechaDestacadaConfig | undefined)?.relations ?? [];
  const activityIds = relations.filter((r) => r.kind === "activity").map((r) => r.activityId);
  if (activityIds.length === 0) return true;
  const { data } = await supabase
    .from("club_activities")
    .select("id")
    .eq("club_id", clubId)
    .in("id", activityIds);
  return (data?.length ?? 0) === activityIds.length;
}

export async function createClubEvent(
  input: { clubId: string } & ClubEventFields,
): Promise<EventFormResult> {
  const { supabase, userId } = await requireUser();

  const invalid = validateFields(input);
  if (invalid) return { ok: false, code: invalid };
  if (input.eventType === "fecha_destacada" && !(await relationsInClub(supabase, input.clubId, input.config))) {
    return { ok: false, code: "relation_not_in_club" };
  }

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: input.title.trim(),
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
    p_event_type: input.eventType,
    p_config: (input.config ?? {}) as never,
  });
  if (error) return mapRpcError(error, "createClubEvent");

  await notifyClub(supabase, input.clubId, userId, "club_event_created", eventId as string);
  revalidateClubPages();
  return { ok: true, activityId: eventId as string };
}

export async function updateClubEvent(
  input: { activityId: string } & ClubEventFields,
): Promise<EventFormResult> {
  const { supabase, userId } = await requireUser();

  const invalid = validateFields(input);
  if (invalid) return { ok: false, code: invalid };

  // club_id + fecha ANTERIOR en una lectura: club_id para validar relaciones,
  // starts_at para decidir si se avisa a los seguidores (solo si cambia el instante).
  const { data: antes } = await supabase
    .from("club_activities")
    .select("club_id, starts_at")
    .eq("id", input.activityId)
    .maybeSingle();

  if (
    input.eventType === "fecha_destacada" &&
    antes?.club_id &&
    !(await relationsInClub(supabase, antes.club_id, input.config))
  ) {
    return { ok: false, code: "relation_not_in_club" };
  }

  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: input.title.trim(),
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
    p_config: (input.config ?? {}) as never,
  });
  if (error) return mapRpcError(error, "updateClubEvent");

  const { data: despues } = await supabase
    .from("club_activities")
    .select("starts_at")
    .eq("id", input.activityId)
    .maybeSingle();

  if (antes?.starts_at && despues?.starts_at && antes.starts_at !== despues.starts_at) {
    await notifyEventFollowers(supabase, {
      activityId: input.activityId,
      actorId: userId,
      type: "club_event_updated",
    });
  }

  revalidateClubPages();
  return { ok: true, activityId: input.activityId };
}
```

- [ ] **Step 2: Actualizar los imports de cabecera**

Añade a los imports del top del fichero:
```ts
import type { EventType, EventConfig, LanzamientoConfig, FechaDestacadaConfig } from "./event-types";
```
(`validateEventInput`, `notifyClub`, `notifyEventFollowers`, `createClient`, `revalidateClubPages`, `Database` ya están importados.)

- [ ] **Step 3: Typecheck (fallará en los call-sites del formulario, es esperado hasta Task 10-12)**

Run: `npx tsc --noEmit 2>&1 | grep -E "events.ts|event-form|event-card-actions|event-moderation" | head`
Expected: los ÚNICOS errores nuevos son en `event-form.tsx` (llamadas viejas sin `eventType`/sin manejar el result). `events.ts` en sí compila.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs/activities/events.ts
git commit -m "refactor(clubs): events.ts a resultado discriminado + eventType/config"
```

---

## Task 8: `event-detail.ts` + `core.ts` — leer `eventType`, `allDay` y config hidratado

**Files:**
- Modify: `src/lib/clubs/activities/event-detail.ts`
- Modify: `src/lib/clubs/activities/core.ts:31-50` (tipo `ClubActivity`), `:256-257` y `:303-304` (queries), `:446-452` (map)

**Interfaces:**
- Consumes: `parseEventConfig`, `EventType`, `EventConfig` (Task 6).
- Produces:
  - `ClubActivity` gana `eventType: EventType | null`.
  - `ClubEventDetail` gana `eventType: EventType`, `allDay: boolean`, `config: EventConfig`, y `hydratedItem`/`hydratedRelations` (ver abajo).

- [ ] **Step 1: `core.ts` — añadir `eventType` al tipo y a las dos queries**

En `ClubActivity` (tras `config: Json | null;`):
```ts
  /** Solo para kind='evento'; null para el resto. Discrimina el subtipo. */
  eventType: import("./event-types").EventType | null;
```
En las DOS cadenas `.select(...)` (líneas ~256 y ~303) añade `event_type` tras `config`:
```
"id, club_id, kind, title, description, status, config, event_type, created_by, starts_on, ends_on, created_at, spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id"
```
En el objeto mapeado (junto a `config: row.config,` en ~450):
```ts
    eventType: (row.event_type ?? null) as import("./event-types").EventType | null,
```
(Hazlo en los dos sitios donde se mapea una fila de actividad a `ClubActivity`; si solo hay uno, uno.)

- [ ] **Step 2: `event-detail.ts` — ampliar `ClubEventDetail`**

Añade al type (tras `modality` / antes de `declaredState`):
```ts
  eventType: import("./event-types").EventType;
  /** true = sin hora concreta (lanzamiento «todo el día» / fecha destacada). */
  allDay: boolean;
  config: import("./event-types").EventConfig;
  /** Lanzamiento: la obra ya hidratada (título/portada) o null si no resuelve. */
  hydratedItem: { itemType: ItemType; itemId: string; title: string; coverUrl: string | null } | null;
  /** Fecha destacada: relaciones ya hidratadas para pintar como enlaces. */
  hydratedRelations: Array<
    | { kind: "item"; itemType: ItemType; itemId: string; title: string; coverUrl: string | null }
    | { kind: "activity"; activityId: string; title: string; clubSlug: string }
  >;
```
Añade el import arriba:
```ts
import type { ItemType } from "@/lib/catalog/types";
import { parseEventConfig } from "./event-types";
```

- [ ] **Step 3: `getClubEvent` — seleccionar `event_type`/`config` y parsear**

En el `.select(...)` de `getClubEvent` (línea ~88), añade `event_type, config` a la lista. Tras calcular `declaredState`, antes del `return`, añade:

```ts
  const eventType = (row.event_type ?? "encuentro") as import("./event-types").EventType;
  const config = parseEventConfig(eventType, row.config);
  const allDay =
    eventType === "fecha_destacada" ||
    (eventType === "lanzamiento" && (config as import("./event-types").LanzamientoConfig).allDay);
```

- [ ] **Step 4: `getClubEvent` — hidratar la obra (lanzamiento) y las relaciones (fecha destacada)**

Justo antes del `return`, añade la hidratación (una query por tabla de catálogo tocada + una a `club_activities` para relaciones de actividad):

```ts
  // Reúne los ids de catálogo a hidratar (obra del lanzamiento + relaciones item).
  const catalogRefs: Array<{ itemType: ItemType; itemId: string }> = [];
  if (eventType === "lanzamiento") {
    const it = (config as import("./event-types").LanzamientoConfig).item;
    if (it) catalogRefs.push(it);
  }
  const relActivityIds: string[] = [];
  if (eventType === "fecha_destacada") {
    for (const r of (config as import("./event-types").FechaDestacadaConfig).relations) {
      if (r.kind === "item") catalogRefs.push({ itemType: r.itemType, itemId: r.itemId });
      else relActivityIds.push(r.activityId);
    }
  }

  const byType = { book: [] as string[], movie: [] as string[], series: [] as string[] };
  for (const r of catalogRefs) byType[r.itemType].push(r.itemId);
  const catalogTitles = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (["book", "movie", "series"] as ItemType[]).map(async (tipo) => {
      if (byType[tipo].length === 0) return;
      const tabla = tipo === "book" ? "books" : tipo === "movie" ? "movies" : "series";
      const { data } = await supabase.from(tabla).select("id, title, cover_url").in("id", byType[tipo]);
      for (const c of data ?? []) catalogTitles.set(`${tipo}:${c.id}`, { title: c.title, coverUrl: c.cover_url });
    }),
  );
  const relTitles = new Map<string, string>();
  if (relActivityIds.length) {
    const { data } = await supabase
      .from("club_activities")
      .select("id, title")
      .eq("club_id", row.club_id)
      .in("id", relActivityIds);
    for (const a of data ?? []) relTitles.set(a.id, a.title);
  }

  const hydratedItem =
    eventType === "lanzamiento" && (config as import("./event-types").LanzamientoConfig).item
      ? (() => {
          const it = (config as import("./event-types").LanzamientoConfig).item!;
          const hit = catalogTitles.get(`${it.itemType}:${it.itemId}`);
          return hit ? { ...it, title: hit.title, coverUrl: hit.coverUrl } : null;
        })()
      : null;

  const hydratedRelations: ClubEventDetail["hydratedRelations"] = [];
  if (eventType === "fecha_destacada") {
    for (const r of (config as import("./event-types").FechaDestacadaConfig).relations) {
      if (r.kind === "item") {
        const hit = catalogTitles.get(`${r.itemType}:${r.itemId}`);
        if (hit) hydratedRelations.push({ kind: "item", itemType: r.itemType, itemId: r.itemId, ...hit });
      } else {
        const title = relTitles.get(r.activityId);
        if (title) hydratedRelations.push({ kind: "activity", activityId: r.activityId, title, clubSlug: club.slug });
      }
    }
  }
```
Y en el objeto `return`, añade: `eventType, allDay, config, hydratedItem, hydratedRelations,`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "event-detail|core.ts" | head`
Expected: sin errores en estos dos ficheros (los de event-detail-view.tsx llegan en Task 13).

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/event-detail.ts src/lib/clubs/activities/core.ts
git commit -m "feat(clubs): getClubEvent parsea event_type/config e hidrata obra y relaciones"
```

---

## Task 9: i18n — claves nuevas en `messages/es.json`

**Files:**
- Modify: `messages/es.json` (namespace `activity`, ~líneas 808-940)

**Interfaces:**
- Produces: claves de copy que consumen los Tasks 10-13.

- [ ] **Step 1: Añadir las claves** dentro del objeto `activity` (junto a las `event*` existentes). Respeta el estilo camelCase y las lookups por interpolación (`eventType_${t}`, `releaseType_${v}`, `platform_${v}`):

```json
"eventTypeLabel": "Tipo de evento",
"eventType_encuentro": "Encuentro",
"eventType_lanzamiento": "Lanzamiento",
"eventType_fecha_destacada": "Fecha destacada",
"eventTypeHint_encuentro": "Quedada del club, presencial u online.",
"eventTypeHint_lanzamiento": "Estreno o publicación de una obra.",
"eventTypeHint_fecha_destacada": "Un día señalado, con enlaces opcionales.",
"eventTypeFixedOnEdit": "El tipo no se puede cambiar al editar.",
"eventWorkLabel": "Obra que se lanza",
"eventPickWork": "Elegir libro, película o serie",
"eventChangeWork": "Cambiar obra",
"eventReleaseTypeLabel": "Tipo de lanzamiento",
"eventReleaseTypePlaceholder": "Elige el tipo…",
"eventPlatformLabel": "Plataforma",
"eventPlatformNone": "—",
"eventRegionLabel": "Región",
"eventRegionPlaceholder": "España · Latinoamérica · Global…",
"eventAllDayLabel": "Todo el día",
"eventAllDayHint": "sin hora concreta",
"eventRelationsLabel": "Enlaces",
"eventRelationsHint": "Obras o actividades del club (opcional)",
"eventAddRelation": "Añadir obra o actividad",
"eventRelationItems": "Obras",
"eventRelationActivities": "Actividades del club",
"eventRelationRemove": "Quitar",
"eventItemRequired": "Elige la obra que se lanza.",
"eventReleaseTypeRequired": "Elige el tipo de lanzamiento.",
"eventRelationNotInClub": "Esa actividad no es de este club.",
"eventStartsTimeRequired": "Un encuentro necesita una hora de inicio.",
"releaseType_publicacion": "Publicación",
"releaseType_tapa_dura": "Tapa dura",
"releaseType_bolsillo": "Edición de bolsillo",
"releaseType_ebook": "Ebook",
"releaseType_audiolibro": "Audiolibro",
"releaseType_cine": "Estreno en cine",
"releaseType_streaming": "Streaming",
"releaseType_fisico": "Edición física",
"releaseType_estreno_temporada": "Estreno de temporada",
"releaseType_final_temporada": "Final de temporada",
"releaseType_episodio": "Episodio especial",
"releaseType_estreno": "Estreno",
"platform_netflix": "Netflix",
"platform_prime": "Prime Video",
"platform_disney": "Disney+",
"platform_max": "Max",
"platform_appletv": "Apple TV+",
"platform_filmin": "Filmin",
"platform_otro": "Otro"
```

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: `ok` (sin coma colgante ni clave duplicada).

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n(clubs): claves de tipos de evento, lanzamiento y relaciones"
```

---

## Task 10: `EventForm` — selector de tipo + Encuentro con el nuevo result

**Files:**
- Modify: `src/components/clubs/propose/event-form.tsx`

**Interfaces:**
- Consumes: `createClubEvent`/`updateClubEvent` (result discriminado), `EventType`.
- Produces: `EventForm` acepta `eventType?: EventType` y `activityEventType?: EventType` (para editar) y renderiza el selector + el grupo de Encuentro; el submit maneja `EventFormResult`.

- [ ] **Step 1: Ampliar props y estado**

En el objeto de props añade:
```ts
  /** Tipo con el que se crea (el selector puede cambiarlo mientras no se edite). */
  initialEventType?: EventType;
  /** Al editar, el tipo REAL del evento (fijo, no se puede cambiar). */
  activityEventType?: EventType;
```
Importa arriba:
```ts
import { type EventType } from "@/lib/clubs/activities/event-types";
import { RELEASE_TYPES, PLATFORMS, platformAllowed, isValidReleaseType } from "@/lib/clubs/activities/event-release-types";
import { ItemPicker, type PickedItem } from "@/components/clubs/item-picker";
```
Añade estado (tras `const [onlineUrl, ...]`):
```ts
const [eventType, setEventType] = useState<EventType>(
  activityEventType ?? initialEventType ?? "encuentro",
);
// Lanzamiento
const [work, setWork] = useState<PickedItem | null>(null);
const [releaseType, setReleaseType] = useState("");
const [platform, setPlatform] = useState("");
const [region, setRegion] = useState("");
const [allDay, setAllDay] = useState(true);
const [pickingWork, setPickingWork] = useState(false);
// Fecha destacada
const [relations, setRelations] = useState<import("@/lib/clubs/activities/event-types").EventRelation[]>([]);
```
(La hidratación de estos al EDITAR un lanzamiento/fecha existente se resuelve en Task 11-12 leyendo `activity.config`; para Encuentro no aplican.)

- [ ] **Step 2: Renderizar el selector de tipo (arriba del todo del `return`)**

Justo dentro del `<div className="flex flex-col gap-4">`, antes del campo de título:
```tsx
<Field label={t("eventTypeLabel")} htmlFor={`event-type-${uid}`}>
  {editing ? (
    <p className="text-sm text-muted-foreground">
      {t(`eventType_${eventType}`)} · {t("eventTypeFixedOnEdit")}
    </p>
  ) : (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("eventTypeLabel")}>
      {(["encuentro", "lanzamiento", "fecha_destacada"] as EventType[]).map((tp) => (
        <button
          key={tp}
          type="button"
          role="radio"
          aria-checked={eventType === tp}
          onClick={() => setEventType(tp)}
          className={`rounded-card border p-3 text-left ${eventType === tp ? "border-accent" : "border-border"}`}
        >
          <span className="block text-sm font-medium">{t(`eventType_${tp}`)}</span>
          <span className="block text-xs text-muted-foreground">{t(`eventTypeHint_${tp}`)}</span>
        </button>
      ))}
    </div>
  )}
</Field>
```

- [ ] **Step 3: Envolver los campos de Encuentro en su grupo condicional**

Envuelve los campos de hora/zona/modalidad/ubicación/enlace (el bloque desde `<div className="grid grid-cols-2 gap-3">` de horas hasta el bloque de `onlineUrl`) en:
```tsx
{eventType === "encuentro" && (
  <>
    {/* … horas, zona, modalidad, ubicación, enlace, tal cual … */}
  </>
)}
```
(El título, la descripción y la fecha quedan FUERA del grupo: son compartidos por los tres tipos.)

- [ ] **Step 4: Reescribir `submit()` para manejar el resultado discriminado + construir `config`**

Reemplaza la función `submit` por:
```ts
function submit() {
  setError(null);
  if (!startsOn) { setError(t("eventDateRequired")); return; }
  if (eventType === "encuentro") {
    if (!startsTime) { setError(t("eventStartsTimeRequired")); return; }
    if (startsTime && endsTime && endsTime <= startsTime) { setError(t("eventEndsBeforeStarts")); return; }
    if (onlineUrl && !URL_HTTP.test(onlineUrl)) { setError(t("eventInvalidUrl")); return; }
    if (modality === "online" && location.trim()) { setError(t("eventOnlineHasLocation")); return; }
  }
  if (eventType === "lanzamiento") {
    if (!work) { setError(t("eventItemRequired")); return; }
    if (!releaseType) { setError(t("eventReleaseTypeRequired")); return; }
  }

  const config =
    eventType === "lanzamiento"
      ? {
          item: work ? { itemType: work.itemType, itemId: work.itemId } : null,
          releaseType: releaseType || null,
          ...(work && platformAllowed(work.itemType) && platform ? { platform } : {}),
          ...(region.trim() ? { region: region.trim() } : {}),
          allDay,
        }
      : eventType === "fecha_destacada"
        ? { relations, allDay: true as const }
        : {};

  const esEncuentro = eventType === "encuentro";
  const campos = {
    eventType,
    title,
    description: description || undefined,
    startsOn,
    // Sin hora en lanzamiento «todo el día» y en fecha destacada.
    startsTime: esEncuentro ? startsTime || undefined
      : eventType === "lanzamiento" && !allDay ? startsTime || undefined : undefined,
    endsTime: esEncuentro ? endsTime || undefined : undefined,
    timezone: esEncuentro ? timezone : undefined,
    location: esEncuentro ? location.trim() || undefined : undefined,
    modality: esEncuentro ? modality || undefined : undefined,
    onlineUrl: esEncuentro ? onlineUrl.trim() || undefined : undefined,
    config: config as import("@/lib/clubs/activities/event-types").EventConfig,
  };

  startTransition(async () => {
    const result = activity
      ? await updateClubEvent({ activityId: activity.id, ...campos })
      : await createClubEvent({ clubId, ...campos });
    if (result.ok) {
      onDone(startsOn);
    } else {
      setError(errorLabel(result.code));
    }
  });
}

// Traduce el código a copy; los que valga la pena distinguir tienen clave propia.
function errorLabel(code: import("@/lib/clubs/activities/events").EventFormError): string {
  switch (code) {
    case "eventDateRequired" as never: return t("eventDateRequired");
    case "item_required": return t("eventItemRequired");
    case "release_type_required": return t("eventReleaseTypeRequired");
    case "relation_not_in_club": return t("eventRelationNotInClub");
    case "starts_time_required": return t("eventStartsTimeRequired");
    case "ends_before_starts": return t("eventEndsBeforeStarts");
    case "invalid_online_url": return t("eventInvalidUrl");
    case "online_event_has_location": return t("eventOnlineHasLocation");
    case "starts_on_required": return t("eventDateRequired");
    default: return t("eventError");
  }
}
```
(El `errorLabel` va dentro del cuerpo del componente para tener `t` en scope. La rama `"eventDateRequired" as never` es un placeholder que puedes borrar; se deja el `default`.)

- [ ] **Step 5: Verificar Encuentro (parity) en el navegador**

Arranca `next dev` (puerto 3000). Crea un Encuentro desde el asistente de una actividad de club y edítalo desde la tarjeta. Debe comportarse EXACTAMENTE como antes (modalidad conmuta ubicación/enlace). El selector de tipo aparece; al editar muestra el tipo fijo.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/propose/event-form.tsx
git commit -m "feat(clubs): EventForm con selector de tipo + submit por resultado discriminado (Encuentro)"
```

---

## Task 11: `EventForm` — grupo Lanzamiento

**Files:**
- Modify: `src/components/clubs/propose/event-form.tsx`

**Interfaces:**
- Consumes: `ItemPicker`/`PickedItem`, `RELEASE_TYPES`, `PLATFORMS`, `platformAllowed`.

- [ ] **Step 1: Hidratar el estado del lanzamiento al EDITAR**

Tras las declaraciones de estado, añade un efecto de inicialización que lea `activity` si es un lanzamiento (usa `parseEventConfig` sobre la config que EventCardActions/EventModeration pasarán en Task 13 vía una prop `activityConfig`). Como el hidratado necesita el título/portada de la obra, para editar se apoya en `activityConfig` ya hidratado que pasa el consumidor. Añade props opcionales:
```ts
  /** Al editar un lanzamiento/fecha destacada: config ya hidratado por el consumidor. */
  activityWork?: PickedItem | null;
  activityReleaseType?: string;
  activityPlatform?: string;
  activityRegion?: string;
  activityAllDay?: boolean;
  activityRelations?: import("@/lib/clubs/activities/event-types").EventRelation[];
```
E inicializa el estado con ellos:
```ts
const [work, setWork] = useState<PickedItem | null>(activityWork ?? null);
const [releaseType, setReleaseType] = useState(activityReleaseType ?? "");
const [platform, setPlatform] = useState(activityPlatform ?? "");
const [region, setRegion] = useState(activityRegion ?? "");
const [allDay, setAllDay] = useState(activityAllDay ?? true);
```
(Reemplaza las inicializaciones de Task 10 Step 1 por estas.)

- [ ] **Step 2: Renderizar el grupo Lanzamiento** (tras el grupo de Encuentro)

```tsx
{eventType === "lanzamiento" && (
  <>
    <Field label={t("eventWorkLabel")}>
      {work ? (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-2">
          {work.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={work.coverUrl} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{work.title}</span>
          <button type="button" className="text-xs text-accent" onClick={() => setPickingWork(true)}>
            {t("eventChangeWork")}
          </button>
        </div>
      ) : pickingWork ? null : (
        <Button type="button" variant="secondary" onClick={() => setPickingWork(true)}>
          {t("eventPickWork")}
        </Button>
      )}
      {pickingWork && (
        <ItemPicker
          allowedItemTypes="all"
          onPick={(item) => {
            setWork(item);
            setReleaseType("");
            setPlatform("");
            setPickingWork(false);
            if (!title.trim()) setTitle(item.title);
          }}
          onCancel={() => setPickingWork(false)}
        />
      )}
    </Field>

    {work && (
      <>
        <Field label={t("eventReleaseTypeLabel")} htmlFor={`event-release-${uid}`}>
          <Select id={`event-release-${uid}`} value={releaseType} onChange={(e) => setReleaseType(e.target.value)} className="w-full">
            <option value="">{t("eventReleaseTypePlaceholder")}</option>
            {RELEASE_TYPES[work.itemType].map((r) => (
              <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
            ))}
          </Select>
        </Field>

        {platformAllowed(work.itemType) && (
          <Field label={t("eventPlatformLabel")} htmlFor={`event-platform-${uid}`}>
            <Select id={`event-platform-${uid}`} value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full">
              <option value="">{t("eventPlatformNone")}</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
              ))}
            </Select>
          </Field>
        )}
      </>
    )}

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      <span>{t("eventAllDayLabel")} <span className="text-muted-foreground">· {t("eventAllDayHint")}</span></span>
    </label>
    {!allDay && (
      <Field label={t("eventTimeLabel")} htmlFor={`event-launch-time-${uid}`}>
        <Input id={`event-launch-time-${uid}`} type="time" value={startsTime} onChange={(e) => setStartsTime(e.target.value)} className="w-full" />
      </Field>
    )}

    <Field label={t("eventRegionLabel")} htmlFor={`event-region-${uid}`}>
      <Input id={`event-region-${uid}`} value={region} maxLength={120} onChange={(e) => setRegion(e.target.value)} placeholder={t("eventRegionPlaceholder")} className="w-full" />
    </Field>
  </>
)}
```

- [ ] **Step 3: Ajustar el `disabled` del botón de envío**

El botón de submit está `disabled={isPending || !title.trim()}`. Déjalo así (título requerido en los tres tipos). La obra/tipo se validan en `submit()`.

- [ ] **Step 4: Verificar en navegador**

Crea un Lanzamiento: elige una serie, comprueba que salen los tipos de serie y el select de plataforma; con «todo el día» activo no hay hora; desactívalo y aparece la hora. Guarda y confirma en `/club/[slug]/evento/[id]` (render llega en Task 13, aquí basta con que la creación no dé error).

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/propose/event-form.tsx
git commit -m "feat(clubs): EventForm grupo Lanzamiento (obra + tipo + plataforma + todo el día + región)"
```

---

## Task 12: `EventForm` — grupo Fecha destacada

**Files:**
- Modify: `src/components/clubs/propose/event-form.tsx`

- [ ] **Step 1: Estado de relaciones ya inicializado** (Task 11 Step 1 añadió `activityRelations`):
```ts
const [relations, setRelations] = useState<import("@/lib/clubs/activities/event-types").EventRelation[]>(activityRelations ?? []);
const [pickingRelation, setPickingRelation] = useState<null | "item" | "activity">(null);
```

- [ ] **Step 2: Cargar las actividades del club para el selector de relaciones**

`EventForm` necesita la lista de actividades del club para el picker de relaciones de tipo `activity`. Añade una prop:
```ts
  /** Actividades del club (id + título) para enlazar desde una fecha destacada. */
  clubActivities?: Array<{ id: string; title: string }>;
```
El consumidor (asistente / tarjeta / ficha) la pasa; si no viene, el selector de actividades queda vacío (solo obras).

- [ ] **Step 3: Renderizar el grupo Fecha destacada** (tras el grupo Lanzamiento)

```tsx
{eventType === "fecha_destacada" && (
  <Field label={t("eventRelationsLabel")}>
    <p className="text-xs text-muted-foreground">{t("eventRelationsHint")}</p>
    <ul className="flex flex-col gap-1">
      {relations.map((r, i) => (
        <li key={i} className="flex items-center gap-2 rounded-card border border-border p-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {r.kind === "item" ? t(`itemType_${r.itemType}`) : t("eventRelationActivities")}
          </span>
          <button type="button" className="text-xs text-status-dropped" aria-label={t("eventRelationRemove")}
            onClick={() => setRelations(relations.filter((_, j) => j !== i))}>
            ✕
          </button>
        </li>
      ))}
    </ul>
    {pickingRelation === "item" ? (
      <ItemPicker
        allowedItemTypes="all"
        onPick={(item) => {
          setRelations([...relations, { kind: "item", itemType: item.itemType, itemId: item.itemId }]);
          setPickingRelation(null);
        }}
        onCancel={() => setPickingRelation(null)}
      />
    ) : pickingRelation === "activity" ? (
      <div className="flex flex-col gap-1 rounded-card border border-border p-2">
        {(clubActivities ?? []).map((a) => (
          <button key={a.id} type="button" className="truncate rounded p-1 text-left text-sm hover:bg-surface-muted"
            onClick={() => {
              setRelations([...relations, { kind: "activity", activityId: a.id }]);
              setPickingRelation(null);
            }}>
            {a.title}
          </button>
        ))}
        <button type="button" className="self-start text-xs text-muted-foreground" onClick={() => setPickingRelation(null)}>
          {t("cancel")}
        </button>
      </div>
    ) : (
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setPickingRelation("item")}>{t("eventRelationItems")}</Button>
        <Button type="button" variant="secondary" onClick={() => setPickingRelation("activity")}>{t("eventRelationActivities")}</Button>
      </div>
    )}
  </Field>
)}
```

- [ ] **Step 4: Ocultar el bloque de horas compartido cuando NO es Encuentro**

Verifica que el bloque de horas/zona quedó dentro de `{eventType === "encuentro" && (...)}` (Task 10 Step 3). Fecha destacada no muestra hora ninguna. Lanzamiento gestiona su hora en su propio grupo (Task 11).

- [ ] **Step 5: Typecheck + navegador**

Run: `npx tsc --noEmit 2>&1 | grep event-form | head`
Expected: sin errores. Crea una Fecha destacada con una obra y una actividad enlazadas; guarda.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/propose/event-form.tsx
git commit -m "feat(clubs): EventForm grupo Fecha destacada (editor de relaciones)"
```

---

## Task 13: Render por tipo (ficha, tarjeta, calendario) + mount points

**Files:**
- Modify: `src/components/clubs/event/event-detail-view.tsx`
- Modify: `src/components/clubs/event-card-actions.tsx`
- Modify: `src/components/clubs/event/event-moderation.tsx`
- Modify: `src/components/clubs/activity-card.tsx` (subtítulo por tipo, opcional)

**Interfaces:**
- Consumes: `ClubEventDetail` (con `eventType`/`allDay`/`hydratedItem`/`hydratedRelations`), `ClubActivity.eventType`.

- [ ] **Step 1: `event-detail-view.tsx` — «cuándo» respeta `allDay`**

Donde se pinta la fecha/hora (usa `formatEventWhen`), cuando `event.allDay` muestra solo la fecha. Importa `formatEventDate` (el de `date` suelto) o deriva la fecha del `startsAt` en la zona. Añade una rama:
```tsx
{event.allDay
  ? <span>{/* solo fecha: usa formatEventWhen y recorta, o formatea starts_at a fecha */}</span>
  : <span>{formatEventWhen(event.startsAt, event.endsAt, event.timezone)}</span>}
```
(Reutiliza el helper de fecha-sin-hora que ya exista; si no, formatea `starts_at` con `Intl` `timeZone: event.timezone` a día/mes/año.)

- [ ] **Step 2: `event-detail-view.tsx` — bloque específico por tipo**

Añade, junto al `<dl>` de modalidad/lugar (que ahora solo aplica a Encuentro), un `switch` por `event.eventType`:
```tsx
{event.eventType === "encuentro" && (/* … el <dl> de modalidad/lugar/enlace actual … */)}

{event.eventType === "lanzamiento" && event.hydratedItem && (
  <div className="flex items-center gap-3">
    <Link href={`/${event.hydratedItem.itemType === "book" ? "libro" : event.hydratedItem.itemType === "movie" ? "pelicula" : "serie"}/${event.hydratedItem.itemId}`} className="flex items-center gap-3">
      {event.hydratedItem.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.hydratedItem.coverUrl} alt="" className="h-16 w-11 rounded object-cover" />
      )}
      <span className="font-medium">{event.hydratedItem.title}</span>
    </Link>
    {/* releaseType + platform + region desde event.config (LanzamientoConfig) con t(`releaseType_…`) */}
  </div>
)}

{event.eventType === "fecha_destacada" && event.hydratedRelations.length > 0 && (
  <ul className="flex flex-col gap-1">
    {event.hydratedRelations.map((r, i) => (
      <li key={i}>
        {r.kind === "item"
          ? <Link href={`/${r.itemType === "book" ? "libro" : r.itemType === "movie" ? "pelicula" : "serie"}/${r.itemId}`}>{r.title}</Link>
          : <Link href={`/club/${r.clubSlug}/actividad/${r.activityId}`}>{r.title}</Link>}
      </li>
    ))}
  </ul>
)}
```
(Verifica las rutas reales de ficha de obra en el repo — `/libro/[id]`, `/pelicula/[id]`, `/serie/[id]` — con un `grep -r "libro/" src/app` si dudas.)

- [ ] **Step 3: `event-card-actions.tsx` — pasar el tipo y los campos completos**

Cambia el `activity={{ id, title, description, startsOn }}` por el set completo, incluyendo `activityEventType`:
```tsx
<EventForm
  clubId={activity.clubId}
  activity={{ id: activity.id, title: activity.title, description: activity.description, startsOn: activity.startsOn }}
  activityEventType={activity.eventType ?? "encuentro"}
  onDone={() => setEditing(false)}
  onCancel={() => setEditing(false)}
/>
```
(Para lanzamiento/fecha destacada, `EventCardActions` no tiene la config hidratada; pásale `activityWork`/`activityRelations` solo si ya la tiene. Si no, el formulario de edición desde la tarjeta arranca con el tipo correcto pero sin prehidratar la obra: aceptable de momento — editar con todos los datos se hace desde la ficha, Step 4. Anota esto como límite en Task 15.)

- [ ] **Step 4: `event-moderation.tsx` — pasar tipo + config hidratado al editar**

`EventModeration` tiene el `ClubEventDetail` completo. Pásale a `EventForm`:
```tsx
activityEventType={event.eventType}
activityWork={event.hydratedItem}
activityReleaseType={(event.config as LanzamientoConfig).releaseType ?? undefined}
activityPlatform={(event.config as LanzamientoConfig).platform ?? undefined}
activityRegion={(event.config as LanzamientoConfig).region}
activityAllDay={event.allDay}
activityRelations={event.eventType === "fecha_destacada" ? (event.config as FechaDestacadaConfig).relations : undefined}
```
(Importa los tipos de `@/lib/clubs/activities/event-types`. Guarda los accesos a `config` tras comprobar `event.eventType`.)

- [ ] **Step 5: `activity-card.tsx` — subtítulo por tipo (ligero)**

Donde la tarjeta pinta el meta del evento (`formatEventDate(activity.startsOn)`), antepón el tipo cuando no sea encuentro: `t(\`eventType_${activity.eventType}\`)`. Cambio mínimo, sin acento nuevo.

- [ ] **Step 6: Typecheck + navegador**

Run: `npx tsc --noEmit`
Expected: 0 errores. Verifica en navegador las tres fichas: Encuentro (igual que antes), Lanzamiento (obra enlazada + tipo/plataforma/región, solo fecha si allDay), Fecha destacada (relaciones como enlaces). Edita un Lanzamiento desde la ficha y confirma que llega prehidratado.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubs/event/event-detail-view.tsx src/components/clubs/event-card-actions.tsx src/components/clubs/event/event-moderation.tsx src/components/clubs/activity-card.tsx
git commit -m "feat(clubs): render por tipo de evento en ficha/tarjeta + edición prehidratada"
```

---

## Task 14: e2e — crear los tres tipos

**Files:**
- Create: `e2e/club-event-types.spec.ts`

**Interfaces:**
- Consumes: la app completa contra `next dev` (puerto 3000) o build de prod.

- [ ] **Step 1: Escribir el e2e** (patrón del e2e de evento existente: crea su propio club desechable; busca `e2e/*event*` para copiar el helper de alta de club y login)

```ts
// e2e/club-event-types.spec.ts
import { test, expect } from "@playwright/test";
// Reutiliza los helpers del e2e de evento existente (login + crear club desechable).
// Busca en e2e/ el spec de seguimiento de eventos para el patrón exacto.

test.describe("tipos de evento de club", () => {
  test("crea un Encuentro (parity)", async ({ page }) => {
    // … alta de club, abrir «proponer», elegir kind Evento, tipo Encuentro,
    // rellenar fecha+hora+modalidad, enviar; comprobar que aparece en el calendario.
  });

  test("crea un Lanzamiento de una serie con plataforma", async ({ page }) => {
    // … tipo Lanzamiento; ItemPicker → elegir una serie; releaseType=Estreno de
    // temporada; platform=Netflix; «todo el día» activo; enviar.
    // Abrir /club/[slug]/evento/[id]: la obra enlazada y el tipo se ven; sin hora.
  });

  test("crea una Fecha destacada con relaciones", async ({ page }) => {
    // … tipo Fecha destacada; añadir una obra y una actividad; enviar.
    // La ficha muestra los dos enlaces.
  });
});
```
Rellena los pasos con los selectores reales copiando el spec de eventos existente (mismos `data-testid`/roles).

- [ ] **Step 2: Ejecutar**

Run: `npm run test:e2e -- club-event-types`
Expected: los tres tests en verde. (Reutiliza el dev server que haya; no arranques un segundo.)

- [ ] **Step 3: Verificar que el test PROTEGE (regla `tests-que-no-protegen`)**

Rompe algo a propósito (p. ej. en `submit()` fuerza `eventType="encuentro"` siempre) y comprueba que el test de Lanzamiento se pone ROJO. Revierte.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-event-types.spec.ts
git commit -m "test(e2e): crear evento de los tres tipos"
```

---

## Task 15: Sincronizar docs + abrir issues (Definición de «hecho»)

**Files:**
- Modify: `docs/requirements/data-model.md` (§6/§6.1), `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`

- [ ] **Step 1: `data-model.md`** — en §6.1 (o una §6.3 nueva) documenta: enum `club_event_type`, columna `event_type` + su grant, la forma de `config` por tipo, y la semántica «todo el día» (`config.allDay`, `starts_at` a 00:00). Actualiza la fecha de verificación de la cabecera. **Puedes usar el subagente `backlog-scribe`** para esto.

- [ ] **Step 2: `decisiones.md`** (append-only, al final): dos entradas — «tipos de evento: discriminador `event_type` + `config` opaco, no columnas por subtipo» y «all-day como `config.allDay`, no columna».

- [ ] **Step 3: `backlog.md`**: marca la casilla de la feature de tipos de evento.

- [ ] **Step 4: Abrir las issues de los límites asumidos** (regla `pendientes-como-issues`), cada una con sus tres etiquetas:
```sh
gh issue create --label "area:clubes,tipo:deuda,P2" --title "Referencias de config de evento pueden colgar si se borra la obra del catálogo" --body "…repro + que forbid_delete_with_passes NO cubre config de eventos…"
gh issue create --label "area:clubes,tipo:deuda,P2" --title "Editar Lanzamiento/Fecha destacada desde la tarjeta arranca sin prehidratar la obra/relaciones" --body "…desde la ficha sí; desde EventCardActions falta la config hidratada…"
```

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(clubes): sincronizar data-model/decisiones/backlog con tipos de evento"
```

---

## Despliegue a producción (tras merge)

- [ ] Aplicar en PROD, EN ORDEN, las tres migraciones (`20260840` enum → `20260841` columna+grant → `20260842` RPCs), tras confirmar el despliegue del bundle. Verificar en prod contra objetos reales: una firma por nombre en `pg_proc`, `event_type` con su grant en `information_schema.column_privileges` (idéntico a `modality`), backfill `event_type='encuentro'` en todos los eventos, y `to_regtype('public.club_event_type')` no nulo.
- [ ] DRIFT-CHECK superficie 6: `club_activities` sigue SIN aparecer en la lista de tablas con hueco de grant (= `event_type` tiene su grant).
- [ ] Anexar las tres migraciones a `schema-baseline.sql` en orden de prod.

---

## Self-Review (hecha al escribir el plan)

- **Cobertura del spec:** §3.1 enum/columna → T1-T2; §3.2 config → T6; §3.3 all-day → T3/T6/T13; §3.4 refs sin FK → T7 (validación) + T15 (issue); §4.1-4.3 tipos → T10-T12; §5 RPCs → T3; §6 TS → T5/T6/T8; §7 formulario → T10-T12; §8 render → T13; §9 errores discriminados → T7; §10 despliegue → sección final; §11 docs → T15; §12 issues → T15. Sin huecos.
- **Tipos consistentes:** `EventFormResult`/`EventFormError`, `ClubEventFields` (con `eventType`+`config`), `parseEventConfig`, `RELEASE_TYPES`/`PLATFORMS`, `ClubActivity.eventType`, `ClubEventDetail.{eventType,allDay,config,hydratedItem,hydratedRelations}` usados igual en todas las tareas.
- **Sin placeholders de contenido:** cada validación y cada campo están escritos; los ÚNICOS «rellena con el selector real» son los pasos de e2e, que dependen de los `data-testid` del spec existente que se copia.
