# Eventos al calendario y color por tipo/medio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar los eventos de club del listado de la pestaña Actividades y darles tipo (`estreno`/`quedada`/`otro`) más medio (`book`/`movie`/`series`), de modo que el calendario los pinte de colores distintos.

**Architecture:** Los dos campos nuevos viven en `club_activities.config` (el JSONB opaco de SD-8), se escriben solo por RPC y se leen con un parser tolerante. El color del calendario deja de indexarse por `CalendarMarkKind` y pasa a un `MarkAccentKey` de 7 valores resuelto por `accentKeyFor(mark)`. Las tres superficies del calendario (rejilla, agenda, leyenda) consumen esa función; la pestaña Actividades deja de agrupar eventos y cede editar/archivar a la agenda.

**Tech Stack:** Next.js (App Router, RSC + Server Actions), TypeScript, Supabase/Postgres (RPC `security definer`), Tailwind v4 (tokens en `@theme`), next-intl, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-11-eventos-al-calendario-y-color-por-medio-design.md`

## Global Constraints

- **Node 22 obligatorio antes de cualquier `tsc`/`vitest`/`playwright`.** El shell no interactivo resuelve Node v20.9.0 y `npx vitest run` muere con `node:util no exporta styleText`. Ver Task 0.
- **Los e2e mienten sin `.env.local` en el worktree.** `playwright.config.ts` lo lee relativo al cwd; sin él cada spec con login hace `test.skip` y la suite sale **verde sin probar nada**. Ver Task 0.
- **Nunca crear un junction a `node_modules` del repo padre.** `git worktree remove` lo sigue y vacía el `node_modules` del padre (issue #277).
- **Un solo `next dev`, en el puerto 3000.** Si 3000 está ocupado, Next salta a 3001 y los e2e y los redirects de Supabase se rompen. `npm run test:e2e` reutiliza el servidor que ya haya.
- **Errores de dominio en snake_case**, tanto en las RPCs como en la validación de cliente (#133). Los nuevos son exactamente `event_type_invalid`, `medium_required`, `medium_invalid`.
- **Límites de texto ya existentes, no reinventar:** `EVENT_TITLE_MAX = 120`, `EVENT_DESCRIPTION_MAX = 2000` (espejo de los CHECK `club_activities_title_len` y `club_activities_description_len`).
- **Valores literales, sin desviación:** `ClubEventType` = `"estreno" | "quedada" | "otro"`. `medium` es `ItemType` = `"book" | "movie" | "series"`. Las claves JSON son `eventType` y `medium` (camelCase dentro del JSONB).
- **Tailwind v4 exige clases enteras y literales**, nunca concatenadas: `bg-type-book`, no `` `bg-${x}` ``.
- **Dev antes que prod** en toda migración: `supabase-dev` primero, `supabase-prod` después de verificar.
- **Idioma del código:** comentarios y copy en español, igual que el resto del módulo. Los identificadores siguen la mezcla ya existente en estos ficheros.

---

### Task 0: Preparar el entorno del worktree

Sin esto, todo lo demás da falsos verdes o no arranca. No produce commit.

**Files:**
- Ninguno (solo entorno)

**Interfaces:**
- Consumes: nada
- Produces: un shell con Node 22, `node_modules` instalado y `.env.local` presente

- [ ] **Step 1: Exportar Node 22 al PATH**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
node --version
```

Expected: `v22.x.x`. Si sale `v20.9.0`, el `cygpath` falló — la ruta debe ser POSIX (`/c/…`), nunca `C:\…`: un `C:\` dentro de un PATH de bash rompe el split por `:`.

Este `export` **no persiste entre llamadas de la herramienta Bash**. Repetirlo al principio de cada bloque que ejecute tests.

- [ ] **Step 2: Instalar dependencias en el worktree**

```bash
npm ci
```

Expected: termina sin error. Tarda varios minutos.

No sustituir por un junction/symlink a `node_modules` del repo padre: `git worktree remove` lo sigue y vacía el del padre (issue #277).

- [ ] **Step 3: Copiar `.env.local` del repo padre**

```bash
cp ../../../.env.local .env.local && ls -l .env.local
```

Expected: el fichero existe. Está en `.gitignore` (`.env*`), no se commitea.

- [ ] **Step 4: Comprobar que la base verde es verde**

```bash
npx vitest run
```

Expected: toda la suite unit en PASS. Si algo falla ya aquí, arreglarlo o anotarlo antes de empezar — si no, no se sabrá qué rompió este plan.

---

### Task 1: `event-config.ts` — tipos, parseo tolerante y validación

Lógica pura, sin Supabase ni React. Primera pieza porque todo lo demás la consume.

**Files:**
- Create: `src/lib/clubs/activities/event-config.ts`
- Test: `src/lib/clubs/activities/event-config.test.ts`

**Interfaces:**
- Consumes: `ItemType` de `@/lib/catalog/types`, `Json` de `@/lib/supabase/database.types`
- Produces:
  - `type ClubEventType = "estreno" | "quedada" | "otro"`
  - `type ClubEventConfig = { eventType: ClubEventType; medium?: ItemType }`
  - `const CLUB_EVENT_TYPES: readonly ClubEventType[]`
  - `const CLUB_EVENT_MEDIA: readonly ItemType[]`
  - `function parseEventConfig(config: Json | null): ClubEventConfig`
  - `function validateEventConfig(input: { eventType: string; medium?: string | null }): ClubEventConfig`
  - `type EventConfigError = "event_type_invalid" | "medium_required" | "medium_invalid"`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/clubs/activities/event-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseEventConfig,
  validateEventConfig,
  CLUB_EVENT_TYPES,
  CLUB_EVENT_MEDIA,
} from "./event-config";

describe("parseEventConfig — degrada, nunca lanza", () => {
  it("config null cae a otro", () => {
    expect(parseEventConfig(null)).toEqual({ eventType: "otro" });
  });

  it("objeto vacío cae a otro", () => {
    expect(parseEventConfig({})).toEqual({ eventType: "otro" });
  });

  it("un array no es una config", () => {
    expect(parseEventConfig([1, 2] as never)).toEqual({ eventType: "otro" });
  });

  it("eventType desconocido cae a otro — una versión futura no rompe el calendario", () => {
    expect(parseEventConfig({ eventType: "concierto" })).toEqual({ eventType: "otro" });
  });

  it("quedada se conserva y NUNCA arrastra medio", () => {
    expect(parseEventConfig({ eventType: "quedada", medium: "movie" })).toEqual({
      eventType: "quedada",
    });
  });

  it("estreno con medio válido se conserva entero", () => {
    expect(parseEventConfig({ eventType: "estreno", medium: "movie" })).toEqual({
      eventType: "estreno",
      medium: "movie",
    });
  });

  it("estreno SIN medio degrada a otro — un estreno sin medio no puede colorearse", () => {
    expect(parseEventConfig({ eventType: "estreno" })).toEqual({ eventType: "otro" });
  });

  it("estreno con medio inválido degrada a otro", () => {
    expect(parseEventConfig({ eventType: "estreno", medium: "manga" })).toEqual({
      eventType: "otro",
    });
  });
});

describe("validateEventConfig — lanza claves snake_case", () => {
  it("tipo fuera de la lista", () => {
    expect(() => validateEventConfig({ eventType: "concierto" })).toThrow(
      "event_type_invalid",
    );
  });

  it("estreno sin medio", () => {
    expect(() => validateEventConfig({ eventType: "estreno" })).toThrow("medium_required");
  });

  it("estreno con medio vacío cuenta como sin medio", () => {
    expect(() => validateEventConfig({ eventType: "estreno", medium: "" })).toThrow(
      "medium_required",
    );
  });

  it("estreno con medio inválido", () => {
    expect(() => validateEventConfig({ eventType: "estreno", medium: "manga" })).toThrow(
      "medium_invalid",
    );
  });

  it("estreno bien formado", () => {
    expect(validateEventConfig({ eventType: "estreno", medium: "book" })).toEqual({
      eventType: "estreno",
      medium: "book",
    });
  });

  it("medio sobrante en un NO-estreno se descarta en silencio", () => {
    // Es lo que pasa al cambiar el select de tipo con un medio ya elegido: no
    // es un error del usuario, así que no puede bloquear el envío.
    expect(validateEventConfig({ eventType: "quedada", medium: "movie" })).toEqual({
      eventType: "quedada",
    });
  });

  it("otro es el valor por defecto y es válido", () => {
    expect(validateEventConfig({ eventType: "otro" })).toEqual({ eventType: "otro" });
  });
});

describe("las listas son la fuente de los selects", () => {
  it("tres tipos, en el orden en que se ofrecen", () => {
    expect(CLUB_EVENT_TYPES).toEqual(["estreno", "quedada", "otro"]);
  });
  it("tres medios, en el orden de la leyenda", () => {
    expect(CLUB_EVENT_MEDIA).toEqual(["book", "movie", "series"]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx vitest run src/lib/clubs/activities/event-config.test.ts
```

Expected: FAIL — `Failed to resolve import "./event-config"`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/clubs/activities/event-config.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

// Qué CLASE de fecha es un evento de club, y de qué medio cuando es un estreno.
// Viven en `club_activities.config` (el JSONB opaco de SD-8) en vez de en
// columnas propias: son dos campos de UN solo kind de los cinco, y dos columnas
// nuevas quedarían a null en las filas de los otros cuatro.
//
// El contra conocido es que Postgres no valida la forma del JSONB. Lo acota que
// escribir un evento solo se puede por RPC (`club_activities` no tiene política
// UPDATE, a propósito), y que la lectura degrada en vez de reventar.
export type ClubEventType = "estreno" | "quedada" | "otro";

export type ClubEventConfig = {
  eventType: ClubEventType;
  /** Presente si y SOLO si eventType === "estreno". */
  medium?: ItemType;
};

// El orden importa: es el de los <option> del formulario y, para los medios,
// el de la fila "ESTRENOS" de la leyenda del calendario.
export const CLUB_EVENT_TYPES = ["estreno", "quedada", "otro"] as const satisfies
  readonly ClubEventType[];
export const CLUB_EVENT_MEDIA = ["book", "movie", "series"] as const satisfies
  readonly ItemType[];

export type EventConfigError =
  | "event_type_invalid"
  | "medium_required"
  | "medium_invalid";

function esTipo(x: unknown): x is ClubEventType {
  return typeof x === "string" && (CLUB_EVENT_TYPES as readonly string[]).includes(x);
}

function esMedio(x: unknown): x is ItemType {
  return typeof x === "string" && (CLUB_EVENT_MEDIA as readonly string[]).includes(x);
}

/**
 * Lectura TOLERANTE: cualquier config que no case degrada a `{eventType:"otro"}`.
 *
 * No es pereza, es el contrato: por aquí pasan los eventos anteriores al
 * backfill y los que escribiera una versión futura de la app con un tipo que
 * esta todavía no conoce. Un throw aquí tumbaría el calendario ENTERO del club
 * por una sola fila rara. Degradar la pinta gris, que es lo que ya se ve hoy.
 *
 * Esto NO sustituye al backfill: el backfill hace que el dato sea cierto en la
 * base, esto hace que la pantalla aguante cuando no lo es.
 */
export function parseEventConfig(config: Json | null): ClubEventConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { eventType: "otro" };
  }

  const raw = config as Record<string, unknown>;
  if (!esTipo(raw.eventType)) return { eventType: "otro" };
  if (raw.eventType !== "estreno") return { eventType: raw.eventType };

  // Un estreno sin medio válido no se puede colorear, que es justo lo que el
  // tipo existe para hacer: degrada entero en vez de quedar a medias.
  if (!esMedio(raw.medium)) return { eventType: "otro" };
  return { eventType: "estreno", medium: raw.medium };
}

/**
 * Escritura VALIDADA, antes del roundtrip a la RPC (mismo patrón que
 * `validateEventInput`). Devuelve la config ya normalizada para que el llamante
 * no vuelva a componerla por su cuenta y guarde algo distinto de lo validado.
 *
 * La RPC vuelve a validar lo mismo: esta guarda ahorra un viaje, no es la
 * autoridad.
 */
export function validateEventConfig(input: {
  eventType: string;
  medium?: string | null;
}): ClubEventConfig {
  if (!esTipo(input.eventType)) {
    throw new Error("event_type_invalid" satisfies EventConfigError);
  }
  // Un medio elegido y luego abandonado al cambiar el tipo NO es un error del
  // usuario: se descarta callando. Solo el estreno exige medio.
  if (input.eventType !== "estreno") return { eventType: input.eventType };

  if (!input.medium) throw new Error("medium_required" satisfies EventConfigError);
  if (!esMedio(input.medium)) throw new Error("medium_invalid" satisfies EventConfigError);
  return { eventType: "estreno", medium: input.medium };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

```bash
npx vitest run src/lib/clubs/activities/event-config.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/event-config.ts src/lib/clubs/activities/event-config.test.ts
git commit -m "feat(clubes): tipo y medio de un evento, con parseo tolerante"
```

---

### Task 2: Migración — RPCs con tipo/medio y backfill

**Files:**
- Create: `supabase/migrations/20260811_club_event_tipo_y_medio.sql`

**Interfaces:**
- Consumes: las firmas actuales `create_club_event(uuid, text, text, date)` y `update_club_event(uuid, text, text, date)` de `20260810_club_event_validacion.sql`
- Produces: `create_club_event(uuid, text, text, date, text, text)` y `update_club_event(uuid, text, text, date, text, text)`, que escriben `club_activities.config`

**La trampa que hunde esta tarea:** `create or replace function` con una lista de parámetros distinta **no reemplaza — crea una sobrecarga**. Si no se hace `drop function` de la firma vieja, PostgREST puede seguir resolviendo a la antigua y los eventos nuevos nacerían sin `config`, en silencio.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260811_club_event_tipo_y_medio.sql`:

```sql
-- Tipo y medio de un evento de club (spec 2026-08-11).
--
-- Los dos campos van a `club_activities.config`, el JSONB opaco de SD-8 que ya
-- usa criteria_challenge, no a columnas propias: son de UN kind de los cinco.
-- Claves camelCase DENTRO del JSONB ('eventType', 'medium'), que es como las lee
-- la capa de app (`parseEventConfig`).
--
-- OJO con el orden de los parámetros nuevos: van AL FINAL. Postgres exige que
-- todo parámetro posterior a uno con default tenga default, y la firma actual ya
-- termina en `p_description default null, p_starts_on default null` desde
-- 20260810. Colocarlos antes obligaría a reordenar y cambiaría la firma.
--
-- Y OJO con el drop: `create or replace` sobre una lista de parámetros distinta
-- NO reemplaza, crea una SOBRECARGA. Sin este drop conviven las dos y PostgREST
-- puede resolver a la vieja -- que no escribe config -- sin dar ningún error.
drop function if exists public.create_club_event(uuid, text, text, date);
drop function if exists public.update_club_event(uuid, text, text, date);

create or replace function public.create_club_event(
  p_club_id uuid,
  p_title text,
  p_description text default null,
  p_starts_on date default null,
  p_event_type text default 'otro',
  p_medium text default null
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
  -- Un p_event_type nulo o vacío es 'otro': así un llamante viejo que no mande
  -- el parámetro sigue creando eventos válidos en vez de fallar.
  v_event_type text := coalesce(nullif(trim(coalesce(p_event_type, '')), ''), 'otro');
  v_medium text := nullif(trim(coalesce(p_medium, '')), '');
  v_config jsonb;
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
  if v_event_type not in ('estreno', 'quedada', 'otro') then
    raise exception 'event_type_invalid';
  end if;

  if v_event_type = 'estreno' then
    if v_medium is null then
      raise exception 'medium_required';
    end if;
    if v_medium not in ('book', 'movie', 'series') then
      raise exception 'medium_invalid';
    end if;
    v_config := jsonb_build_object('eventType', v_event_type, 'medium', v_medium);
  else
    -- Un medio sobrante en un no-estreno se descarta: es lo que pasa al cambiar
    -- el select de tipo con un medio ya elegido, y no es un error.
    v_config := jsonb_build_object('eventType', v_event_type);
  end if;

  insert into public.club_activities
    (club_id, kind, title, description, status, created_by, starts_on, config)
  values
    (p_club_id, 'evento', v_title, v_description, 'active', auth.uid(), p_starts_on, v_config)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_club_event(uuid, text, text, date, text, text)
  from public, anon;
grant execute on function public.create_club_event(uuid, text, text, date, text, text)
  to authenticated;

-- update_club_event: se mantienen TODAS las guardas de 20260810. El
-- `and kind = 'evento'` del UPDATE sigue siendo obligatorio, no defensivo: sin
-- él, esta función SECURITY DEFINER gateada solo por rol deja a un moderador
-- reescribir cualquier buddy_read por la puerta de atrás.
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title text,
  p_description text default null,
  p_starts_on date default null,
  p_event_type text default 'otro',
  p_medium text default null
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
  v_event_type text := coalesce(nullif(trim(coalesce(p_event_type, '')), ''), 'otro');
  v_medium text := nullif(trim(coalesce(p_medium, '')), '');
  v_config jsonb;
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
  if v_event_type not in ('estreno', 'quedada', 'otro') then
    raise exception 'event_type_invalid';
  end if;

  if v_event_type = 'estreno' then
    if v_medium is null then
      raise exception 'medium_required';
    end if;
    if v_medium not in ('book', 'movie', 'series') then
      raise exception 'medium_invalid';
    end if;
    v_config := jsonb_build_object('eventType', v_event_type, 'medium', v_medium);
  else
    v_config := jsonb_build_object('eventType', v_event_type);
  end if;

  -- REEMPLAZA el objeto entero, no lo mezcla con el previo (nada de `config ||
  -- v_config`): mezclando, pasar un estreno a quedada dejaría colgado el
  -- 'medium' viejo y el evento se seguiría pintando del color del medio.
  update public.club_activities
  set title = v_title,
      description = v_description,
      starts_on = p_starts_on,
      config = v_config
  where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;

revoke execute on function public.update_club_event(uuid, text, text, date, text, text)
  from public, anon;
grant execute on function public.update_club_event(uuid, text, text, date, text, text)
  to authenticated;

comment on function public.create_club_event(uuid, text, text, date, text, text) is
  'Crea un evento de club (kind=evento, status=active) saltando la RLS de INSERT que fuerza proposed. Moderador+. Escribe config {eventType, medium?}. Errores de dominio en snake_case.';
comment on function public.update_club_event(uuid, text, text, date, text, text) is
  'Edita título/descripción/fecha/tipo/medio de un EVENTO. Moderador+. Restringida a kind=evento y status=active a propósito. Reemplaza config entera. Errores de dominio en snake_case.';

-- Backfill: los eventos que ya existen pasan a 'otro', que pinta el color
-- genérico -- exactamente lo que se ve hoy. Idempotente y no pisa nada escrito:
-- la guarda salta las filas que ya tienen eventType.
update public.club_activities
   set config = coalesce(config, '{}'::jsonb) || '{"eventType":"otro"}'::jsonb
 where kind = 'evento'
   and (config is null or config->>'eventType' is null);
```

- [ ] **Step 2: Aplicar en dev**

Aplicar con la herramienta MCP `mcp__supabase-dev__apply_migration`, nombre `club_event_tipo_y_medio`, con el contenido del fichero.

Expected: aplica sin error.

- [ ] **Step 3: Verificar que NO quedó la sobrecarga vieja**

Con `mcp__supabase-dev__execute_sql`:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_club_event', 'update_club_event')
order by 1, 2;
```

Expected: **exactamente dos filas**, ambas con `args` terminando en `, text, text`. Si salen cuatro, el `drop function` no coincidió con la firma real: mirar los `args` de las sobrantes y dropearlas por esa firma exacta antes de seguir.

Esta comprobación va contra los objetos reales (`pg_proc`), no contra `list_migrations`: "no aparece en el ledger" ≠ "no está".

- [ ] **Step 4: Verificar el backfill**

```sql
select count(*) filter (where config->>'eventType' is null) as sin_tipo,
       count(*) as total
from public.club_activities
where kind = 'evento';
```

Expected: `sin_tipo = 0`.

- [ ] **Step 5: Regenerar los tipos de TypeScript**

Sin esto, `supabase.rpc("create_club_event", { p_event_type, p_medium })` no compila: los tipos generados todavía describen la firma vieja.

Usar `mcp__supabase-dev__generate_typescript_types` y volcar el resultado sobre `src/lib/supabase/database.types.ts`.

```bash
git diff --stat src/lib/supabase/database.types.ts
```

Expected: el diff muestra `p_event_type` y `p_medium` en los `Args` de las dos funciones.

- [ ] **Step 6: Typecheck**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
```

Expected: sin errores (los call sites todavía no mandan los parámetros nuevos, y son opcionales).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811_club_event_tipo_y_medio.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): tipo y medio de evento en config, con backfill a otro"
```

**Prod queda para el final del plan (Task 12).** Dev primero, siempre.

---

### Task 3: Server actions — pasar tipo y medio a la RPC

**Files:**
- Modify: `src/lib/clubs/activities/events.ts` (ambas funciones)

**Interfaces:**
- Consumes: `validateEventConfig` de Task 1; las RPCs de Task 2
- Produces:
  - `createClubEvent(input: { clubId, title, description?, startsOn, eventType, medium? }): Promise<void>`
  - `updateClubEvent(input: { activityId, title, description?, startsOn, eventType, medium? }): Promise<void>`
  - En ambas, `eventType: string` y `medium?: string | null` — se validan dentro, así que el llamante puede pasar lo que tenga el `<select>` sin castear.

- [ ] **Step 1: Modificar `createClubEvent`**

En `src/lib/clubs/activities/events.ts`, añadir el import y reemplazar la función entera:

```ts
import { validateEventConfig } from "./event-config";
```

```ts
export async function createClubEvent(input: {
  clubId: string;
  title: string;
  description?: string;
  startsOn: string;
  // Sin tipar como ClubEventType a propósito: lo que llega es el value de un
  // <select>, y validateEventConfig es quien lo estrecha. Tiparlo aquí obligaría
  // al formulario a castear, moviendo la validación al sitio equivocado.
  eventType: string;
  medium?: string | null;
}): Promise<void> {
  const { supabase, userId } = await requireUser();
  const title = validateEventInput(input);
  // Valida y NORMALIZA: un medio sobrante en un no-estreno se cae aquí, así que
  // nunca llega a la RPC.
  const config = validateEventConfig(input);

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: title,
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_event_type: config.eventType,
    p_medium: config.medium,
  });
  if (error) throw error;

  await notifyClub(
    supabase,
    input.clubId,
    userId,
    "club_event_created",
    eventId as string,
  );
  revalidateClubPages();
}
```

- [ ] **Step 2: Modificar `updateClubEvent`**

Reemplazar el cuerpo de la función, conservando el comentario largo que ya tiene sobre las guardas de la RPC:

```ts
export async function updateClubEvent(input: {
  activityId: string;
  title: string;
  description?: string;
  startsOn: string;
  eventType: string;
  medium?: string | null;
}): Promise<void> {
  const { supabase } = await requireUser();
  const title = validateEventInput(input);
  const config = validateEventConfig(input);

  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: title,
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_event_type: config.eventType,
    p_medium: config.medium,
  });
  if (error) throw error;

  revalidateClubPages();
}
```

Añadir al comentario largo que precede a la función, tras la lista de errores existente:

```
// Desde 2026-08-11 puede lanzar además 'event_type_invalid' | 'medium_required'
// | 'medium_invalid', y REEMPLAZA la config entera (no la mezcla): pasar un
// estreno a quedada tiene que borrar su 'medium'.
```

- [ ] **Step 3: Typecheck — se espera que FALLE**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
```

Expected: FAIL en `src/components/clubs/propose/event-form.tsx` — las dos llamadas no pasan `eventType`. Es correcto: Task 4 las arregla. **No arreglarlo aquí a medias**; seguir a Task 4 y commitear al final de esta pareja.

- [ ] **Step 4: Commit (junto con Task 4)**

Esta tarea no compila sola. Su commit va al final de Task 4.

---

### Task 4: `EventForm` — los dos selects y su copy

**Files:**
- Modify: `src/components/clubs/propose/event-form.tsx`
- Modify: `messages/es.json` (bloque `activity`)

**Interfaces:**
- Consumes: `CLUB_EVENT_TYPES`, `CLUB_EVENT_MEDIA`, `parseEventConfig` de Task 1; `createClubEvent`/`updateClubEvent` de Task 3
- Produces: `EventForm` acepta ahora `activity?: { id, title, description, startsOn, config }` — `config` es el `Json | null` de la fila, del que el formulario deriva sus valores iniciales con `parseEventConfig`

- [ ] **Step 1: Añadir las claves de i18n**

En `messages/es.json`, dentro del bloque `"activity"`, junto a las otras claves `event*` (después de `"eventDateLabel": "Fecha",`):

```json
    "eventTypeLabel": "Tipo",
    "eventType_estreno": "Estreno",
    "eventType_quedada": "Quedada",
    "eventType_otro": "Otro",
    "eventMediumLabel": "Medio",
    "eventMedium_book": "Libro",
    "eventMedium_movie": "Película",
    "eventMedium_series": "Serie",
    "eventMediumRequired": "Un estreno necesita saber de qué medio es.",
```

- [ ] **Step 2: Modificar el formulario**

En `src/components/clubs/propose/event-form.tsx`:

Añadir imports:

```ts
import type { Json } from "@/lib/supabase/database.types";
import {
  CLUB_EVENT_TYPES,
  CLUB_EVENT_MEDIA,
  parseEventConfig,
} from "@/lib/clubs/activities/event-config";
import { Select } from "@/components/ui/select";
```

Ampliar la prop `activity` para que traiga `config`:

```ts
  activity?: {
    id: string;
    title: string;
    description: string | null;
    startsOn: string | null;
    // La config cruda de la fila. El formulario deriva de ella sus valores
    // iniciales con el MISMO parser que usa el calendario: si un evento viejo
    // pinta gris, aquí abre en "Otro", y no en dos cosas distintas.
    config: Json | null;
  };
```

Añadir los ids y el estado, junto a los que ya existen:

```ts
  const eventTypeId = `event-type-${uid}`;
  const mediumId = `event-medium-${uid}`;
```

```ts
  const inicial = parseEventConfig(activity?.config ?? null);
  const [eventType, setEventType] = useState<string>(inicial.eventType);
  // El medio se RECUERDA aunque el tipo deje de ser estreno: si el usuario
  // cambia a "Quedada" y vuelve a "Estreno", no tiene que volver a elegirlo.
  // Lo que se descarta es al ENVIAR (validateEventConfig), no al teclear.
  const [medium, setMedium] = useState<string>(inicial.medium ?? "");
```

Ampliar `submit()` con la guarda del medio y los campos nuevos en ambas llamadas:

```ts
  function submit() {
    setError(null);
    if (!startsOn) {
      setError(t("eventDateRequired"));
      return;
    }
    // Misma guarda que la de la fecha: se avisa antes del roundtrip, aunque la
    // RPC vuelva a comprobarlo (medium_required).
    if (eventType === "estreno" && !medium) {
      setError(t("eventMediumRequired"));
      return;
    }

    startTransition(async () => {
      try {
        if (activity) {
          await updateClubEvent({
            activityId: activity.id,
            title,
            description: description || undefined,
            startsOn,
            eventType,
            medium: medium || undefined,
          });
        } else {
          await createClubEvent({
            clubId,
            title,
            description: description || undefined,
            startsOn,
            eventType,
            medium: medium || undefined,
          });
        }
        onDone(startsOn);
      } catch {
        setError(t("eventError"));
      }
    });
  }
```

Insertar los dos campos en el JSX, **entre** el `<Field>` de descripción y el de fecha:

```tsx
      <Field label={t("eventTypeLabel")} htmlFor={eventTypeId}>
        <Select
          id={eventTypeId}
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="w-full"
        >
          {CLUB_EVENT_TYPES.map((tipo) => (
            <option key={tipo} value={tipo}>
              {t(`eventType_${tipo}`)}
            </option>
          ))}
        </Select>
      </Field>

      {/* El medio SOLO existe en un estreno: es lo único que lo colorea. En una
          quedada no hay medio que preguntar, y un select gris permanente
          invitaría a rellenarlo. */}
      {eventType === "estreno" && (
        <Field label={t("eventMediumLabel")} htmlFor={mediumId}>
          <Select
            id={mediumId}
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="w-full"
          >
            <option value="">—</option>
            {CLUB_EVENT_MEDIA.map((medio) => (
              <option key={medio} value={medio}>
                {t(`eventMedium_${medio}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
```

- [ ] **Step 3: Arreglar el único llamante que pasa `activity`**

`src/components/clubs/event-card-actions.tsx` construye el objeto `activity` sin `config`. Añadir la línea:

```tsx
          activity={{
            id: activity.id,
            title: activity.title,
            description: activity.description,
            startsOn: activity.startsOn,
            config: activity.config,
          }}
```

(Este componente se muda entero en Task 9; aquí solo se le tapa el agujero para que el árbol compile.)

- [ ] **Step 4: Typecheck**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Suite unit completa**

```bash
npx vitest run
```

Expected: todo PASS.

- [ ] **Step 6: Commit (Tasks 3 y 4 juntas)**

```bash
git add src/lib/clubs/activities/events.ts src/components/clubs/propose/event-form.tsx src/components/clubs/event-card-actions.tsx messages/es.json
git commit -m "feat(clubes): elegir tipo y medio al crear o editar un evento"
```

---

### Task 5: Propagar tipo, medio y descripción a la marca del calendario

**Files:**
- Modify: `src/lib/clubs/activities/calendar-marks.ts`
- Modify: `src/lib/clubs/activities/calendar.ts`
- Test: `src/lib/clubs/activities/calendar-marks.test.ts`

**Interfaces:**
- Consumes: `parseEventConfig`, `ClubEventType` de Task 1
- Produces: `CalendarMark` gana tres campos —
  - `eventType: ClubEventType | null`
  - `medium: ItemType | null`
  - `description: string | null`

  `CalendarActivityRow` gana `config: Json | null` y `description: string | null`. Los tres campos de la marca son `null` en toda marca que no sea un evento.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `describe("buildCalendarMarks", ...)` en `src/lib/clubs/activities/calendar-marks.test.ts`:

```ts
  it("un estreno propaga tipo, medio y descripción a su marca", () => {
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          title: "Dune 3",
          startsOn: "2026-07-04",
          description: "En cines",
          config: { eventType: "estreno", medium: "movie" },
        }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("estreno");
    expect(marks[0].medium).toBe("movie");
    expect(marks[0].description).toBe("En cines");
  });

  it("un evento sin config degrada a otro en vez de romper", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04", config: null })],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("otro");
    expect(marks[0].medium).toBeNull();
  });

  it("una actividad NO-evento deja los tres campos a null", () => {
    const marks = buildCalendarMarks(
      [actividad({ startsOn: "2026-07-20", endsOn: "2026-07-31", description: "x" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.eventType)).toEqual([null, null]);
    expect(marks.map((m) => m.medium)).toEqual([null, null]);
    expect(marks.map((m) => m.description)).toEqual([null, null]);
  });

  it("un HITO de una actividad evento tampoco lleva tipo ni medio", () => {
    // La marca es del checkpoint, no del evento: heredar su tipo la pintaría
    // del color del estreno en vez del de hito.
    const marks = buildCalendarMarks(
      [],
      [
        {
          id: "h1",
          label: "Capítulo 5",
          dueOn: "2026-07-30",
          activityId: "a1",
          activityTitle: "Un evento raro",
          activityKind: "evento",
          activityStatus: "active",
        } satisfies CalendarCheckpointRow,
      ],
      HOY,
      SLUG,
    );
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].eventType).toBeNull();
    expect(marks[0].medium).toBeNull();
  });
```

Y ampliar el helper `actividad()` del principio del fichero:

```ts
function actividad(over: Partial<CalendarActivityRow> = {}): CalendarActivityRow {
  return {
    id: "a1",
    kind: "buddy_read",
    title: "Fundación",
    status: "active",
    startsOn: null,
    endsOn: null,
    description: null,
    config: null,
    ...over,
  };
}
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
```

Expected: FAIL — `Object literal may only specify known properties` / `expected undefined to be 'estreno'`.

- [ ] **Step 3: Ampliar los tipos y `buildCalendarMarks`**

En `src/lib/clubs/activities/calendar-marks.ts`, añadir imports:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";
import { parseEventConfig, type ClubEventType } from "./event-config";
```

Añadir a `CalendarMark`, tras `href`:

```ts
  /**
   * Los tres SOLO están puestos en una marca de evento (markKind === "evento").
   * En hito/inicio/cierre son null, incluido el hito de una actividad evento:
   * esa marca es del checkpoint, y heredar el tipo del evento la pintaría del
   * color equivocado.
   */
  eventType: ClubEventType | null;
  medium: ItemType | null;
  /** La descripción del evento, que el formulario de edición necesita para no borrarla al guardar. */
  description: string | null;
```

Añadir a `CalendarActivityRow`:

```ts
  description: string | null;
  config: Json | null;
```

En el bucle de actividades, rama de evento:

```ts
    if (activity.kind === "evento") {
      if (activity.startsOn) {
        const config = parseEventConfig(activity.config);
        marks.push({
          date: activity.startsOn,
          markKind: "evento",
          title: activity.title,
          detail: null,
          activityId: activity.id,
          activityKind: activity.kind,
          href: null,
          past: activity.startsOn < today,
          eventType: config.eventType,
          medium: config.medium ?? null,
          description: activity.description,
        });
      }
      continue;
    }
```

En los otros tres `marks.push` (inicio, cierre, hito), añadir a cada uno:

```ts
      eventType: null,
      medium: null,
      description: null,
```

- [ ] **Step 4: Ampliar la consulta**

En `src/lib/clubs/activities/calendar.ts`, cambiar el `select` de `club_activities`:

```ts
      .select("id, kind, title, description, config, status, starts_on, ends_on", {
        count: "exact",
      })
```

Y el mapeo a `CalendarActivityRow`:

```ts
  const activityRows: CalendarActivityRow[] = (actividades.data ?? []).map(
    (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      description: row.description,
      config: row.config,
    }),
  );
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
npx tsc --noEmit
```

Expected: PASS y sin errores de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/calendar-marks.ts src/lib/clubs/activities/calendar.ts src/lib/clubs/activities/calendar-marks.test.ts
git commit -m "feat(clubes): la marca de calendario lleva tipo, medio y descripción del evento"
```

---

### Task 6: `mark-accent.ts` — siete claves de color y `accentKeyFor`

**Files:**
- Modify: `src/components/clubs/calendar/mark-accent.ts`
- Test: `src/components/clubs/calendar/mark-accent.test.ts` (crear)

**Interfaces:**
- Consumes: `CalendarMark` de Task 5
- Produces:
  - `type MarkAccentKey = "inicio" | "hito" | "evento" | "cierre" | "estreno_book" | "estreno_movie" | "estreno_series"`
  - `const MARK_ACCENT: Record<MarkAccentKey, MarkAccent>`
  - `function accentKeyFor(mark: Pick<CalendarMark, "markKind" | "eventType" | "medium">): MarkAccentKey`
  - `const LEYENDA_MARCAS: MarkAccentKey[]` (fila 1, ordenada por `ORDEN_MARCA`)
  - `const LEYENDA_ESTRENOS: MarkAccentKey[]` (fila 2)

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/clubs/calendar/mark-accent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MARK_ACCENT,
  accentKeyFor,
  LEYENDA_MARCAS,
  LEYENDA_ESTRENOS,
  type MarkAccentKey,
} from "./mark-accent";

function marca(over: Partial<Parameters<typeof accentKeyFor>[0]> = {}) {
  return {
    markKind: "evento" as const,
    eventType: "otro" as const,
    medium: null,
    ...over,
  };
}

describe("accentKeyFor", () => {
  it("markKind manda: un hito de una actividad evento sigue siendo hito", () => {
    expect(accentKeyFor(marca({ markKind: "hito", eventType: null, medium: null }))).toBe(
      "hito",
    );
  });

  it("inicio y cierre pasan tal cual", () => {
    expect(accentKeyFor(marca({ markKind: "inicio", eventType: null }))).toBe("inicio");
    expect(accentKeyFor(marca({ markKind: "cierre", eventType: null }))).toBe("cierre");
  });

  it("quedada y otro comparten el color genérico de evento", () => {
    expect(accentKeyFor(marca({ eventType: "quedada" }))).toBe("evento");
    expect(accentKeyFor(marca({ eventType: "otro" }))).toBe("evento");
  });

  it("cada medio de estreno tiene su clave", () => {
    expect(accentKeyFor(marca({ eventType: "estreno", medium: "book" }))).toBe(
      "estreno_book",
    );
    expect(accentKeyFor(marca({ eventType: "estreno", medium: "movie" }))).toBe(
      "estreno_movie",
    );
    expect(accentKeyFor(marca({ eventType: "estreno", medium: "series" }))).toBe(
      "estreno_series",
    );
  });

  it("un estreno sin medio cae al color genérico, no revienta", () => {
    expect(accentKeyFor(marca({ eventType: "estreno", medium: null }))).toBe("evento");
  });
});

describe("la leyenda cubre TODO MARK_ACCENT", () => {
  // Este es el test que de verdad importa: si alguien añade una clave nueva al
  // Record y no la coloca en ninguna fila, la leyenda dejaría de explicar un
  // color que la rejilla sí pinta -- exactamente la divergencia contra la que
  // avisa el comentario de calendar-marks.ts.
  it("las dos filas particionan las claves, sin huecos ni repetidos", () => {
    const todas = Object.keys(MARK_ACCENT).sort();
    const enLeyenda = [...LEYENDA_MARCAS, ...LEYENDA_ESTRENOS].sort();
    expect(enLeyenda).toEqual(todas);
    expect(new Set(enLeyenda).size).toBe(enLeyenda.length);
  });

  it("la fila de marcas va en el orden de desempate de la rejilla", () => {
    const esperado: MarkAccentKey[] = ["inicio", "hito", "evento", "cierre"];
    expect(LEYENDA_MARCAS).toEqual(esperado);
  });

  it("la fila de estrenos va libro, película, serie", () => {
    const esperado: MarkAccentKey[] = [
      "estreno_book",
      "estreno_movie",
      "estreno_series",
    ];
    expect(LEYENDA_ESTRENOS).toEqual(esperado);
  });
});

describe("el evento genérico NO puede reusar el color de estreno de serie", () => {
  it("evento y estreno_series son colores distintos", () => {
    expect(MARK_ACCENT.evento.bar).not.toBe(MARK_ACCENT.estreno_series.bar);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx vitest run src/components/clubs/calendar/mark-accent.test.ts
```

Expected: FAIL — `accentKeyFor is not a function` / no exporta `LEYENDA_MARCAS`.

- [ ] **Step 3: Reescribir `mark-accent.ts`**

Reemplazar `src/components/clubs/calendar/mark-accent.ts` entero:

```ts
import type { ItemType } from "@/lib/catalog/types";
import {
  ORDEN_MARCA,
  type CalendarMark,
  type CalendarMarkKind,
} from "@/lib/clubs/activities/calendar-marks";

// El color del calendario ya NO se indexa por clase de marca: dos marcas
// `evento` del mismo día pueden ser de colores distintos según de qué sea el
// estreno. La clave de color es su propio eje.
//
// Se conserva la propiedad que este fichero ya tenía: MARK_ACCENT es un Record
// EXHAUSTIVO, así que una clave nueva rompe la compilación aquí en vez de
// quedarse sin color en silencio.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
};

export type MarkAccentKey =
  | "inicio"
  | "hito"
  /** Quedada y "otro": el evento que no es un estreno. */
  | "evento"
  | "cierre"
  | "estreno_book"
  | "estreno_movie"
  | "estreno_series";

// El orden de declaración ES el de la fila "ESTRENOS" de la leyenda (se deriva
// de Object.keys más abajo).
export const MARK_ACCENT: Record<MarkAccentKey, MarkAccent> = {
  inicio: { text: "text-green", bgSoft: "bg-green/10", bar: "bg-green" },
  hito: { text: "text-accent", bgSoft: "bg-accent/10", bar: "bg-accent" },
  // OJO: el evento genérico usaba `type-series`, y NO puede seguir haciéndolo:
  // ese token pasa a significar "estreno de serie", así que una quedada y un
  // estreno de serie serían el mismo púrpura. `spine` (el beige-nexo de las
  // sagas) es el único token de la paleta que no está ya comprometido con otra
  // clase de marca ni con un status-* de lectura.
  evento: { text: "text-spine", bgSoft: "bg-spine/10", bar: "bg-spine" },
  cierre: { text: "text-gold", bgSoft: "bg-gold/10", bar: "bg-gold" },
  estreno_book: {
    text: "text-type-book",
    bgSoft: "bg-type-book/10",
    bar: "bg-type-book",
  },
  estreno_movie: {
    text: "text-type-movie",
    bgSoft: "bg-type-movie/10",
    bar: "bg-type-movie",
  },
  estreno_series: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
  },
};

// Record en vez de plantilla `estreno_${medium}`: así el compilador comprueba
// que los tres medios tienen clave, en vez de fiarlo a un cast.
const ESTRENO_POR_MEDIO: Record<ItemType, MarkAccentKey> = {
  book: "estreno_book",
  movie: "estreno_movie",
  series: "estreno_series",
};

/**
 * `markKind` manda SIEMPRE, y solo desciende al tipo cuando la marca es un
 * evento. Un checkpoint de una actividad evento llega con markKind "hito" y
 * tiene que seguir pintándose de hito.
 */
export function accentKeyFor(
  mark: Pick<CalendarMark, "markKind" | "eventType" | "medium">,
): MarkAccentKey {
  if (mark.markKind !== "evento") return mark.markKind;
  if (mark.eventType !== "estreno" || !mark.medium) return "evento";
  return ESTRENO_POR_MEDIO[mark.medium];
}

// Las dos filas de la leyenda se DERIVAN de las claves del Record, nunca se
// escriben a mano: una clave nueva aparece sola en su fila. Dos constantes
// gemelas acabarían divergiendo y la leyenda contradiría a la rejilla sin que
// nada avisara (es el mismo motivo por el que ORDEN_MARCA se importa en vez de
// copiarse).
const TODAS = Object.keys(MARK_ACCENT) as MarkAccentKey[];

function esEstreno(key: MarkAccentKey): boolean {
  return key.startsWith("estreno_");
}

/** Fila 1: las clases estructurales, en el mismo orden que desempata la rejilla. */
export const LEYENDA_MARCAS: MarkAccentKey[] = TODAS.filter((k) => !esEstreno(k)).sort(
  (a, b) => ORDEN_MARCA[a as CalendarMarkKind] - ORDEN_MARCA[b as CalendarMarkKind],
);

/** Fila 2: los medios de estreno, en el orden de declaración del Record. */
export const LEYENDA_ESTRENOS: MarkAccentKey[] = TODAS.filter(esEstreno);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npx vitest run src/components/clubs/calendar/mark-accent.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck — se espera que FALLE en los consumidores**

```bash
npx tsc --noEmit
```

Expected: FAIL en `month-grid.tsx`, `agenda-list.tsx` y `club-calendar.tsx` — `MARK_ACCENT[mark.markKind]` ya no indexa. Task 7 los arregla. No parchear aquí.

- [ ] **Step 6: Commit (junto con Task 7)**

Esta tarea no compila sola. Su commit va al final de Task 7.

---

### Task 7: Las tres superficies del calendario

**Files:**
- Create: `src/components/clubs/calendar/mark-label.ts`
- Test: `src/components/clubs/calendar/mark-label.test.ts`
- Modify: `src/components/clubs/calendar/month-grid.tsx`
- Modify: `src/components/clubs/calendar/agenda-list.tsx`
- Modify: `src/components/clubs/calendar/club-calendar.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `accentKeyFor`, `MARK_ACCENT`, `LEYENDA_MARCAS`, `LEYENDA_ESTRENOS` de Task 6; `CalendarMark` de Task 5
- Produces: `function markLabel(mark, t): string` en `mark-label.ts`

**Por qué una función y no `t(\`markKind_${...}\`)` inline:** la etiqueta del chip ya no depende solo de `markKind`, y la necesitan tres sitios (chip de agenda, `title` de la rejilla y el resumen `sr-only`). Repetir el `if` tres veces es donde diverge.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/clubs/calendar/mark-label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markLabel } from "./mark-label";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// Traductor de mentira que devuelve la clave: así el test comprueba QUÉ claves
// se piden, sin depender de la copy real (que puede cambiar sin ser un bug).
const t = (key: string) => key;

function marca(over: Partial<CalendarMark> = {}): CalendarMark {
  return {
    date: "2026-08-01",
    markKind: "evento",
    title: "t",
    detail: null,
    activityId: "a",
    activityKind: "evento",
    href: null,
    past: false,
    eventType: "otro",
    medium: null,
    description: null,
    ...over,
  };
}

describe("markLabel", () => {
  it("hito, inicio y cierre usan su clave de siempre", () => {
    expect(markLabel(marca({ markKind: "hito" }), t)).toBe("markKind_hito");
    expect(markLabel(marca({ markKind: "inicio" }), t)).toBe("markKind_inicio");
    expect(markLabel(marca({ markKind: "cierre" }), t)).toBe("markKind_cierre");
  });

  it("un estreno dice de qué medio es", () => {
    expect(markLabel(marca({ eventType: "estreno", medium: "movie" }), t)).toBe(
      "eventType_estreno · eventMedium_movie",
    );
  });

  it("una quedada se nombra por su tipo", () => {
    expect(markLabel(marca({ eventType: "quedada" }), t)).toBe("eventType_quedada");
  });

  it("un evento 'otro' sigue diciendo Evento — no 'Otro', que no significa nada suelto", () => {
    expect(markLabel(marca({ eventType: "otro" }), t)).toBe("markKind_evento");
  });

  it("un estreno sin medio cae a la etiqueta genérica", () => {
    expect(markLabel(marca({ eventType: "estreno", medium: null }), t)).toBe(
      "markKind_evento",
    );
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx vitest run src/components/clubs/calendar/mark-label.test.ts
```

Expected: FAIL — `Failed to resolve import "./mark-label"`.

- [ ] **Step 3: Escribir `mark-label.ts`**

```ts
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// El proyecto no declara `IntlMessages`, así que la `t` de next-intl acepta
// string y esta firma encaja sin castear.
type Translate = (key: string) => string;

/**
 * Qué dice el chip de una marca. El color NUNCA es la única señal: sin este
 * texto, un estreno de película y uno de serie solo se distinguirían por el
 * tono (WCAG 1.4.1).
 *
 * "Otro" se etiqueta como "Evento", no como "Otro": suelto en un chip, "Otro"
 * no le dice nada a nadie.
 */
export function markLabel(mark: CalendarMark, t: Translate): string {
  if (mark.markKind !== "evento") return t(`markKind_${mark.markKind}`);
  if (mark.eventType === "estreno" && mark.medium) {
    return `${t("eventType_estreno")} · ${t(`eventMedium_${mark.medium}`)}`;
  }
  if (mark.eventType === "quedada") return t("eventType_quedada");
  return t("markKind_evento");
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npx vitest run src/components/clubs/calendar/mark-label.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Añadir la copy de la leyenda**

En `messages/es.json`, bloque `activity`, junto a las claves `markKind_*`:

```json
    "legendMarks": "Marcas",
    "legendPremieres": "Estrenos",
    "markAccent_inicio": "Empieza",
    "markAccent_hito": "Hito",
    "markAccent_evento": "Evento",
    "markAccent_cierre": "Cierre",
    "markAccent_estreno_book": "Libro",
    "markAccent_estreno_movie": "Película",
    "markAccent_estreno_series": "Serie",
```

`markKind_*` se queda: la usa `markLabel` para hito/inicio/cierre y para el evento genérico.

- [ ] **Step 6: Actualizar `month-grid.tsx`**

Cambiar el import:

```ts
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
```

Los tres usos, en orden de aparición:

```tsx
                      className={`h-1.5 w-1.5 rounded-full ${MARK_ACCENT[accentKeyFor(mark)].bar}`}
```

```tsx
                  const accent = MARK_ACCENT[accentKeyFor(mark)];
                  return (
                    <span
                      key={`${mark.activityId}-${mark.markKind}-${i}`}
                      title={`${markLabel(mark, t)} · ${mark.title}`}
```

```tsx
                  {delDia.map((m) => `${markLabel(m, t)}: ${m.title}`).join(". ")}
```

- [ ] **Step 7: Actualizar `agenda-list.tsx`**

Cambiar el import:

```ts
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
```

Y dentro del `map`:

```tsx
        const accent = MARK_ACCENT[accentKeyFor(mark)];
```

```tsx
                <span aria-hidden className={`h-1.5 w-1.5 rounded-[2px] ${accent.bar}`} />
                {markLabel(mark, t)}
```

- [ ] **Step 8: Leyenda de dos filas en `club-calendar.tsx`**

Sustituir el import y la constante `CLASES_LEYENDA` (con su comentario, que queda obsoleto):

```ts
import {
  MARK_ACCENT,
  LEYENDA_MARCAS,
  LEYENDA_ESTRENOS,
  type MarkAccentKey,
} from "./mark-accent";
```

Y borrar de los imports de `calendar-marks` los que dejan de usarse aquí (`ORDEN_MARCA`, `CalendarMarkKind`), que ahora viven dentro de `mark-accent.ts`.

Sustituir el bloque `<div className="flex flex-wrap gap-3 lg:ml-auto">…</div>` por:

```tsx
            {/* Dos filas, no una tira de siete: el eje "qué clase de marca es"
                y el eje "de qué medio es el estreno" son preguntas distintas, y
                mezcladas en una sola línea envuelven en tres renglones en
                móvil. Ambas filas se DERIVAN de las claves de MARK_ACCENT, así
                que una clave nueva aparece sola en su sitio. */}
            <div className="flex flex-col gap-1.5 lg:ml-auto lg:items-end">
              <LegendRow title={t("legendMarks")} keys={LEYENDA_MARCAS} t={t} />
              <LegendRow title={t("legendPremieres")} keys={LEYENDA_ESTRENOS} t={t} />
            </div>
```

Y añadir el componente al final del fichero:

```tsx
function LegendRow({
  title,
  keys,
  t,
}: {
  title: string;
  keys: MarkAccentKey[];
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-[9.5px] tracking-wide text-foreground-faint uppercase">
        {title}
      </span>
      {keys.map((key) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase"
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${MARK_ACCENT[key].bar}`} />
          {t(`markAccent_${key}`)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Typecheck y suite completa**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: sin errores, todo PASS.

- [ ] **Step 10: Mirar el color de verdad, en claro y en oscuro**

Este paso no es opcional: `spine` se eligió para el lienzo oscuro del grafo de sagas, y aquí su muestra va sobre `--surface`.

```powershell
$env:PATH = "C:\Users\borja\AppData\Roaming\fnm\node-versions\v22.23.1\installation;$env:PATH"
npm run dev
```

Abrir `/club/test-public-club/calendario`, crear un evento de cada medio y comprobar en tema claro y oscuro que los cuatro colores de evento se distinguen entre sí y del fondo.

Si `spine` no contrasta, **no reciclar otro token ya comprometido**: añadir uno nuevo `--event-generic` en `src/app/globals.css` (los tres bloques: `:root`, `.dark` y el `@media (prefers-color-scheme: dark)`) más su `--color-event-generic` en `@theme`, y apuntar `MARK_ACCENT.evento` a él.

- [ ] **Step 11: Commit (Tasks 6 y 7 juntas)**

```bash
git add src/components/clubs/calendar/ messages/es.json
git commit -m "feat(clubes): el calendario pinta cada evento según su tipo y medio"
```

---

### Task 8: Sacar los eventos de la pestaña Actividades

**Files:**
- Modify: `src/lib/clubs/activities/group-activities.ts`
- Modify: `src/lib/clubs/activities/group-activities.test.ts`
- Modify: `src/components/clubs/activity-list.tsx`
- Modify: `messages/es.json` (borrar `groupEvents`)

**Interfaces:**
- Consumes: nada nuevo
- Produces: `groupActivities(activities: ClubActivity[]): ActivityGroups` — **sin** el parámetro `today` y **sin** la propiedad `events`. `ActivityGroups` queda `{ active, proposed, finished }`.

- [ ] **Step 1: Reescribir el test**

Reemplazar el bloque `describe("groupActivities", ...)` de `src/lib/clubs/activities/group-activities.test.ts` (el `describe("isPastEvent", ...)` se queda **tal cual**, y su import también):

```ts
describe("groupActivities — los eventos viven en el calendario, no aquí", () => {
  it("un evento activo no está en ninguno de los tres grupos", () => {
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
      act({ id: "a", kind: "buddy_read", status: "active" }),
    ]);
    expect(groups.active.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proposed).toHaveLength(0);
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento ARCHIVADO tampoco cae en finalizadas — es el que se olvida", () => {
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" }),
      act({ id: "f", kind: "tierlist", status: "finished" }),
    ]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });

  it("un evento 'finished' tampoco, aunque la RPC ya no deje llegar ahí", () => {
    // finish_club_activity rechaza los eventos desde 20260810, pero filas
    // anteriores a esa migración pueden existir: el filtro es por kind, no por
    // confianza en el estado.
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "finished", startsOn: "2026-08-01" }),
    ]);
    expect(groups.finished).toHaveLength(0);
  });

  it("propuestas y finalizadas no-evento se agrupan como antes", () => {
    const groups = groupActivities([
      act({ id: "p", status: "proposed" }),
      act({ id: "f", status: "finished" }),
      act({ id: "ar", status: "archived" }),
    ]);
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f", "ar"]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx vitest run src/lib/clubs/activities/group-activities.test.ts
```

Expected: FAIL — `Expected 1 arguments, but got 2` en tiempo de ejecución no, pero sí `groups.finished` con el evento archivado dentro.

- [ ] **Step 3: Reescribir `group-activities.ts`**

Reemplazar el fichero desde `export type ActivityGroups` hasta el final, dejando `isPastEvent` intacta arriba:

```ts
import type { ClubActivity } from "./core";

export type ActivityGroups = {
  active: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas. Sin eventos: los archivados también salen. */
  finished: ClubActivity[];
};

// "Pasado" se DERIVA de la fecha, nunca se persiste (spec 2026-07-22 §2.3): un
// estado que hay que mantener sincronizado con el calendario es un estado que se
// desincroniza. La comparación es de cadenas ISO, que ordenan lexicográficamente
// igual que cronológicamente -- así no entra ningún Date en el cálculo.
//
// Un evento que es HOY no ha pasado: sigue siendo la fecha señalada.
//
// Ya NO la usa groupActivities (los eventos salieron de la pestaña), pero sí
// activity-card.tsx, que atenúa cualquier actividad activa cuya fecha de inicio
// ya pasó -- no solo eventos.
export function isPastEvent(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  return startsOn < today;
}

// Los eventos NO se agrupan aquí: viven en el calendario (spec 2026-08-11). Se
// filtran por `kind`, no por estado, y en los tres grupos -- el que se olvida es
// `finished`, donde caía el evento ARCHIVADO y seguiría a la vista.
//
// Por eso esta función ya no necesita `today`: lo usaba solo para ordenar los
// eventos (futuros antes que pasados), y ese grupo ya no existe.
export function groupActivities(activities: ClubActivity[]): ActivityGroups {
  const sinEventos = activities.filter((a) => a.kind !== "evento");

  return {
    active: sinEventos.filter((a) => a.status === "active"),
    proposed: sinEventos.filter((a) => a.status === "proposed"),
    finished: sinEventos.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
```

- [ ] **Step 4: Actualizar `activity-list.tsx`**

Borrar los imports de `todayISO` y `EventCardActions`, la línea `const today = todayISO();` con su comentario, y el `<Group>` de eventos entero. La desestructuración pasa a:

```tsx
  const { active, proposed, finished } = groupActivities(activities);
```

Y el bloque a borrar es exactamente:

```tsx
      <Group title={t("groupEvents")}>
        {events.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            actions={isModerator ? <EventCardActions activity={activity} /> : undefined}
          />
        ))}
      </Group>
```

- [ ] **Step 5: Borrar la copy huérfana**

En `messages/es.json`, borrar la línea `"groupEvents": "Fechas señaladas",`.

- [ ] **Step 6: Comprobar que no queda ninguna referencia**

```bash
grep -rn "groupEvents\|groups.events\|\.events\b" src/ messages/ | grep -v node_modules
```

Expected: sin resultados en `src/` ni en `messages/`. (`e2e/` sí tendrá referencias a "Fechas señaladas": las arregla Task 11.)

- [ ] **Step 7: Ejecutar y verificar que pasa**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: todo PASS, sin errores de tipo.

- [ ] **Step 8: Commit**

```bash
git add src/lib/clubs/activities/group-activities.ts src/lib/clubs/activities/group-activities.test.ts src/components/clubs/activity-list.tsx messages/es.json
git commit -m "feat(clubes): los eventos salen del listado de actividades"
```

---

### Task 9: Editar y archivar un evento desde la agenda

**Files:**
- Modify: `src/components/clubs/event-card-actions.tsx`
- Modify: `src/components/clubs/calendar/agenda-list.tsx`
- Modify: `src/components/clubs/calendar/club-calendar.tsx`

**Interfaces:**
- Consumes: `CalendarMark` con `description` (Task 5); `EventForm` con `config` (Task 4)
- Produces: `EventCardActions({ clubId, activityId, title, description, startsOn, config, onDone })` — ya no recibe un `ClubActivity`. `AgendaList` gana las props `clubId: string`, `canModerate: boolean`, `onChanged: () => void`.

**Nota sobre `config`:** la marca no lo lleva crudo — lleva `eventType`/`medium` ya parseados. Se recompone el objeto para `EventForm`, que espera el `Json` de la fila. Es lo correcto: el `EventForm` deriva sus valores iniciales con `parseEventConfig`, así que reconstruirlo aquí y parsearlo allí da lo mismo que hubiera dado la fila.

- [ ] **Step 1: Reescribir `event-card-actions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { archiveActivity } from "@/lib/clubs/activities/core";
import type { Json } from "@/lib/supabase/database.types";
import { EventForm } from "./propose/event-form";
import { Button } from "@/components/ui/button";

// Editar y archivar un evento. Viven en el CALENDARIO (spec 2026-08-11): un
// evento no tiene página propia donde ponerlos, y desde que salió de la pestaña
// Actividades tampoco tiene tarjeta.
//
// Archivar reutiliza archive_club_activity tal cual: ya es moderador+ y ya
// acepta 'active'. Estos controles desaparecen solos tras archivar, igual que
// antes pero por otro motivo: getClubCalendarMarks solo lee actividades con
// status in ('active','finished'), así que un evento archivado deja de tener
// marca. Sin lógica de estado extra aquí.
export function EventCardActions({
  clubId,
  activityId,
  title,
  description,
  startsOn,
  config,
  onDone,
}: {
  clubId: string;
  activityId: string;
  title: string;
  description: string | null;
  startsOn: string;
  config: Json | null;
  /** Releer las marcas: son props de un server component. */
  onDone: () => void;
}) {
  const t = useTranslations("activity");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="w-full">
        <EventForm
          clubId={clubId}
          activity={{ id: activityId, title, description, startsOn, config }}
          onDone={() => {
            setEditing(false);
            onDone();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    // role="group": un <div> pelado tiene rol `generic`, que no expone
    // aria-label a los lectores de pantalla -- la etiqueta se perdía.
    <div className="flex w-full flex-col gap-2" role="group" aria-label={t("eventActions")}>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          {t("editEvent")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await archiveActivity(activityId);
                onDone();
              } catch {
                // El error se MUESTRA, nunca se traga. Next.js redacta el
                // mensaje real de un Server Action en producción (llega un
                // digest opaco), así que no se distingue por texto -- solo se
                // enseña la copy i18n fija.
                setError(t("eventError"));
              }
            })
          }
        >
          {t("archive")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {error}
        </p>
      )}
    </div>
  );
}
```

`Button` solo acepta `variant` (`src/components/ui/button.tsx:24`), no hay prop `size`: no inventarla.

- [ ] **Step 2: Montar las acciones en `agenda-list.tsx`**

Ampliar la firma:

```tsx
export function AgendaList({
  marks,
  clubId,
  canModerate,
  onChanged,
}: {
  marks: CalendarMark[];
  clubId: string;
  canModerate: boolean;
  onChanged: () => void;
}) {
```

Añadir el import:

```ts
import { EventCardActions } from "../event-card-actions";
```

Y dentro del `<li>`, tras el envoltorio condicional `mark.href ? <Link…> : <div…>`:

```tsx
            {canModerate && mark.markKind === "evento" && (
              <div className="mt-2">
                <EventCardActions
                  clubId={clubId}
                  activityId={mark.activityId}
                  title={mark.title}
                  description={mark.description}
                  startsOn={mark.date}
                  // La marca trae el tipo ya parseado; se recompone la forma que
                  // espera EventForm, que vuelve a parsearla. Da el mismo
                  // resultado que la fila cruda -- es el mismo parser.
                  config={
                    mark.eventType === "estreno" && mark.medium
                      ? { eventType: mark.eventType, medium: mark.medium }
                      : { eventType: mark.eventType ?? "otro" }
                  }
                  onDone={onChanged}
                />
              </div>
            )}
```

- [ ] **Step 3: Pasar las props desde `club-calendar.tsx`**

```tsx
          <AgendaList
            marks={agenda}
            clubId={clubId}
            canModerate={canModerate}
            onChanged={() => router.refresh()}
          />
```

- [ ] **Step 4: Typecheck y suite**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
npx vitest run
```

Expected: sin errores, todo PASS.

- [ ] **Step 5: Comprobar a mano**

Con `npm run dev` levantado, en `/club/test-public-club/calendario`: crear un evento, verlo en la agenda con sus botones, editarlo (la descripción debe llegar rellena, no vacía), guardarlo y archivarlo. Tras archivar, su marca desaparece del calendario.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/event-card-actions.tsx src/components/clubs/calendar/agenda-list.tsx src/components/clubs/calendar/club-calendar.tsx
git commit -m "feat(clubes): editar y archivar un evento desde la agenda del calendario"
```

---

### Task 10: El asistente lleva al calendario tras crear un evento

**Files:**
- Modify: `src/components/clubs/propose/propose-wizard.tsx`
- Modify: `src/components/clubs/activity-composer.tsx`
- Modify: `src/components/clubs/activity-list.tsx`

**Interfaces:**
- Consumes: `EventForm.onDone(startsOn?: string)` (ya existe)
- Produces: `ProposeWizard` y `ActivityComposer` ganan la prop `clubSlug: string`

**Por qué:** el asistente sigue ofreciendo "Evento" (decisión del diseño), pero con el grupo fuera del listado, crearlo desde Actividades dejaría al moderador mirando una pantalla donde no ha pasado nada.

- [ ] **Step 1: `ProposeWizard` acepta `clubSlug` y navega**

Añadir el import de router:

```ts
import { useRouter } from "next/navigation";
```

Añadir la prop a la firma (junto a `clubId`):

```ts
  clubSlug: string;
```

Dentro del componente, junto a los otros hooks:

```ts
  const router = useRouter();
```

Y en la rama `if (kind === "evento")`, sustituir `onDone={onProposed}`:

```tsx
          onDone={(startsOn) => {
            onProposed();
            // Un evento creado desde aquí ya no aparece en esta pestaña: vive
            // en el calendario. Sin este salto, el moderador rellena el
            // formulario, se cierra el panel y no ve pasar nada.
            const mes = startsOn ? `?mes=${startsOn.slice(0, 7)}` : "";
            router.push(`/club/${clubSlug}/calendario${mes}`);
          }}
```

- [ ] **Step 2: `ActivityComposer` pasa `clubSlug`**

Añadir `clubSlug: string` a su firma y pasarlo al `<ProposeWizard clubId={clubId} clubSlug={clubSlug} … />`.

- [ ] **Step 3: `ActivityList` lo entrega**

```tsx
      <ActivityComposer clubId={clubId} clubSlug={clubSlug} isModerator={isModerator} />
```

`clubSlug` ya es prop de `ActivityList` (`src/app/club/[slug]/page.tsx:139` la pasa), no hay que subir más.

- [ ] **Step 4: Typecheck**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Comprobar a mano**

Con `npm run dev`: en `/club/test-public-club?tab=actividades`, "Proponer actividad" → "Evento" → fecha de un mes futuro → "Crear evento". La URL debe acabar en `/club/test-public-club/calendario?mes=YYYY-MM` con el evento visible en ese mes.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/propose/propose-wizard.tsx src/components/clubs/activity-composer.tsx src/components/clubs/activity-list.tsx
git commit -m "feat(clubes): crear un evento desde el asistente lleva a su mes en el calendario"
```

---

### Task 11: e2e — reescribir `club-evento.spec.ts`

**Files:**
- Modify: `e2e/club-evento.spec.ts`

**Interfaces:**
- Consumes: toda la funcionalidad de las tareas anteriores
- Produces: nada que consuma otra tarea

**Qué hay que cambiar y por qué:** el spec actual ancla en la sección "Fechas señaladas" de la pestaña Actividades, que ya no existe. Todo lo que hoy comprueba (crear, no enlazar, 404 de su ficha, editar, archivar) sigue siendo válido — cambia el sitio donde se hace y se le añade el tipo/medio. El **segundo** test del fichero (miembro raso no ve la tarjeta "Evento") no se toca: sigue siendo cierto tal cual.

- [ ] **Step 1: Sustituir la creación para que pase por el calendario**

Reemplazar el bloque desde `await page.goto(\`/club/${CLUB_SLUG}?tab=actividades\`);` hasta el click en "Crear evento" por:

```ts
    await page.goto(`/club/${CLUB_SLUG}/calendario`);
    await page.getByRole("button", { name: /^nuevo evento$/i }).click();

    const titulo = `e2e evento ${Date.now()}`;
    await page.getByLabel(/^título$/i).fill(titulo);
    await page.getByLabel(/^fecha$/i).fill("2027-03-15");

    // Estreno sin medio NO debe pasar: la guarda de cliente salta antes del
    // roundtrip. Se comprueba el negativo ANTES de completar, con el aviso
    // visible -- si se comprobara después, un submit que funcionara igual
    // pasaría desapercibido.
    await page.getByLabel(/^tipo$/i).selectOption("estreno");
    await page.getByRole("button", { name: /^crear evento$/i }).click();
    await expect(page.getByRole("alert")).toContainText(/medio/i);

    await page.getByLabel(/^medio$/i).selectOption("movie");
    await page.getByRole("button", { name: /^crear evento$/i }).click();
```

- [ ] **Step 2: Añadir `config` a lo que se verifica en la base**

En el `expect.poll` de creación, ampliar el `select` y los asserts:

```ts
    let creado:
      | { id: string; status: string; kind: string; starts_on: string; config: unknown }
      | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,status,kind,starts_on,config`,
            { headers },
          );
          [creado] = await res.json();
          return creado?.id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    eventoId = creado!.id;

    expect(creado!.kind).toBe("evento");
    expect(creado!.status).toBe("active"); // nace activo, no propuesto
    expect(creado!.starts_on).toBe("2027-03-15");
    // La config es lo que colorea la marca: si la RPC no la escribiera, la UI
    // pintaría gris y nada más fallaría.
    expect(creado!.config).toEqual({ eventType: "estreno", medium: "movie" });
```

- [ ] **Step 3: Sustituir el assert de la sección "Fechas señaladas"**

Reemplazar el bloque `const seccionEventos = …` y su `expect` por la comprobación en la agenda del calendario, más la ausencia en Actividades:

```ts
    // En la agenda del calendario, con su etiqueta de estreno. El chip lleva el
    // texto además del color: si solo se comprobara la clase de color, un
    // daltónico no tendría cómo distinguirlo y el test tampoco.
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=2027-03`);
    // Anclado por su encabezado "Agenda", NO por getByRole("complementary"):
    // ClubShell pinta su propio <aside> de sidebar, así que el rol casa dos
    // veces y el modo estricto de Playwright aborta.
    const agenda = page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Agenda" }) });
    await expect(agenda.getByText(titulo)).toBeVisible({ timeout: 15000 });
    await expect(agenda.getByText(/estreno · película/i).first()).toBeVisible();

    // Y NO en la pestaña Actividades, que es la mitad de este cambio. Se espera
    // PRIMERO algo positivo (que la pestaña pintó su composer) para que la
    // ausencia no sea trivialmente cierta por no haber cargado nada.
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    await expect(
      page.getByRole("button", { name: /proponer actividad/i }).first(),
    ).toBeVisible();
    await expect(page.getByText(titulo)).toHaveCount(0);
```

Ese `getByRole("complementary")` es el `<aside>` de la agenda en `club-calendar.tsx`. Si el DOM cambiara, anclar por el heading `t("calendarAgenda")` = "Agenda" en vez de por el rol.

- [ ] **Step 4: Conservar el bloque de "Próximo" y el de 404**

El assert de la tira "Próximo" en `/club/{slug}` y el par 404/control-positivo de la ficha **siguen siendo válidos y no se tocan** — la tira sale de `proximasMarcas`, que no cambia, y un evento sigue sin tener página. Conservar también sus comentarios largos: explican fragilidades reales ya pagadas.

Lo que sí hay que borrar es el bloque que hace click sobre el título en la pestaña Actividades para comprobar que no navega (`const urlAntes = page.url();` …). Esa comprobación se mueve a la agenda:

```ts
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=2027-03`);
    await expect(
      page.locator(`a[href*="/actividad/"]`).filter({ hasText: titulo }),
    ).toHaveCount(0);
```

- [ ] **Step 5: Editar desde la agenda**

Reemplazar el bloque de edición:

```ts
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=2027-03`);
    const item = page
      .getByRole("listitem")
      .filter({ hasText: titulo });
    await item.getByRole("button", { name: /^editar evento$/i }).click();

    const tituloEditado = `e2e evento editado ${Date.now()}`;
    await page.getByLabel(/^título$/i).fill(tituloEditado);
    await page.getByLabel(/^fecha$/i).fill("2027-04-20");
    // Pasar de estreno a quedada tiene que BORRAR el medio, no dejarlo colgado:
    // si la RPC mezclara la config en vez de reemplazarla, este evento seguiría
    // pintándose del color de película.
    await page.getByLabel(/^tipo$/i).selectOption("quedada");
    await page.getByRole("button", { name: /^guardar cambios$/i }).click();

    let editado:
      | { title: string; starts_on: string; status: string; config: unknown }
      | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}&select=title,starts_on,status,config`,
            { headers },
          );
          [editado] = await res.json();
          return editado?.title ?? null;
        },
        { timeout: 15000 },
      )
      .toBe(tituloEditado);
    expect(editado!.starts_on).toBe("2027-04-20");
    expect(editado!.status).toBe("active"); // editar no cambia el estado
    expect(editado!.config).toEqual({ eventType: "quedada" });
```

- [ ] **Step 6: Archivar desde la agenda**

Reemplazar el bloque de archivado y su comprobación de pantalla:

```ts
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=2027-04`);
    const itemEditado = page.getByRole("listitem").filter({ hasText: tituloEditado });
    await expect(itemEditado).toBeVisible({ timeout: 15000 });
    await itemEditado.getByRole("button", { name: /^archivar$/i }).click();

    let archivado: { status: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}&select=status`,
            { headers },
          );
          [archivado] = await res.json();
          return archivado?.status ?? null;
        },
        { timeout: 15000 },
      )
      .toBe("archived");

    // Un evento archivado sale del calendario entero: getClubCalendarMarks solo
    // lee status in ('active','finished'). Se comprueba tras un recargado
    // explícito, no confiando en el router.refresh() de la UI.
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=2027-04`);
    await expect(page.getByText(tituloEditado)).toHaveCount(0);
    // ...y tampoco reaparece en "Finalizadas" de la pestaña Actividades, que es
    // donde caía antes.
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    await expect(
      page.getByRole("button", { name: /proponer actividad/i }).first(),
    ).toBeVisible();
    await expect(page.getByText(tituloEditado)).toHaveCount(0);
```

- [ ] **Step 7: Actualizar el nombre y el comentario del test**

```ts
// Un moderador marca una fecha en el CALENDARIO (los eventos salieron de la
// pestaña Actividades, spec 2026-08-11). Se comprueba que se crea de verdad con
// su tipo y medio (no solo que se pinte), que un estreno sin medio no pasa, que
// NO aparece en Actividades, que su URL de detalle da 404 (con control
// positivo), y que EDITAR/ARCHIVAR desde la agenda -- controles solo de
// moderador+ -- funcionan contra la RPC con un auth.uid() real. Se autolimpia.
test("evento: se crea con tipo y medio en el calendario, se edita, se archiva y no tiene ficha", async ({
```

- [ ] **Step 8: Ejecutar el e2e**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
ls .env.local
npm run test:e2e -- club-evento
```

Expected: **2 passed**, cero `skipped`. Un solo "skipped" significa que falta `.env.local` y el verde es mentira.

- [ ] **Step 9: Suite e2e completa de clubes**

```bash
npm run test:e2e -- club-
```

Expected: todo PASS. Si `club-activity-changes.spec.ts` o `propose-wizard.spec.ts` fallan, es regresión de Task 8 o 10 — arreglarla aquí, no dejarla para después.

- [ ] **Step 10: Commit**

```bash
git add e2e/club-evento.spec.ts
git commit -m "test(clubes): e2e del evento con tipo y medio, creado y gestionado desde el calendario"
```

---

### Task 12: Prod, documentación y cierre

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:**
- Consumes: todo lo anterior
- Produces: nada de código

Un cambio no está "hecho" hasta que el doc canónico correspondiente vuelve a ser cierto.

- [ ] **Step 1: Aplicar la migración en prod**

Con `mcp__supabase-prod__apply_migration`, mismo nombre y mismo contenido que en Task 2.

- [ ] **Step 2: Verificar prod contra los objetos reales**

Con `mcp__supabase-prod__execute_sql`, las **dos** consultas de Task 2 (Steps 3 y 4).

Expected: exactamente dos funciones, ambas con la firma de seis parámetros; `sin_tipo = 0`.

"No aparece en `list_migrations`" ≠ "no está en prod": la comprobación va contra `pg_proc`, no contra el ledger.

- [ ] **Step 3: `data-model.md`**

El párrafo que abre el tema está en `docs/requirements/data-model.md:528` («**`config` (jsonb) es opaco a la BD**…»). Añadir justo debajo la forma para `kind = 'evento'`:

```markdown
Para `kind = 'evento'`, `config` es `{ "eventType": "estreno" | "quedada" | "otro",
"medium"?: "book" | "movie" | "series" }`. `medium` está presente si y solo si
`eventType = "estreno"`. Lo escriben **solo** `create_club_event` y
`update_club_event` (la tabla no tiene política UPDATE), que validan los valores
y reemplazan el objeto entero; lo lee `parseEventConfig`, que degrada a
`{eventType:"otro"}` ante cualquier forma que no case.
```

Actualizar la fecha de verificación del documento.

- [ ] **Step 4: `backlog.md`**

La entrada de `docs/requirements/backlog.md:81` («**Eventos de club**…») **ha quedado falsa**: termina en «grupo "Fechas señaladas" en la lista de actividades», que es exactamente lo que este cambio retira. Corregir esa cola, y añadir una entrada nueva ya marcada:

```markdown
- [x] **Eventos por tipo y medio, solo en el calendario** — los eventos salen del listado de actividades y el calendario los colorea según `config.eventType` (`estreno`/`quedada`/`otro`) y, en los estrenos, `config.medium` (`book`/`movie`/`series`). Editar y archivar viven en la agenda. Migración aplicada en dev y prod. Spec: `docs/superpowers/specs/2026-08-11-eventos-al-calendario-y-color-por-medio-design.md`
```

La narrativa de *cómo* se hizo va en la spec, **nunca** en el backlog.

- [ ] **Step 5: `decisiones.md`**

Añadir **al final** (append-only, sin reescribir las anteriores) las cinco entradas de la §10 de la spec:

1. Dos ejes (`eventType` + `medium`) en vez de un enum plano.
2. `config` JSONB en vez de columnas.
3. El evento genérico deja `type-series` y pasa a `spine` (o al token nuevo, si el Step 10 de Task 7 obligó a crearlo — escribir lo que de verdad se hizo).
4. `quedada` y `otro` comparten color.
5. El asistente sigue creando eventos, pero lleva al calendario.

- [ ] **Step 6: Chequeo de deriva**

```bash
cat docs/DRIFT-CHECK.md
```

Seguir el chequeo que describa.

- [ ] **Step 7: Abrir issues de lo que quede suelto**

Todo lo pendiente, dudoso o descubierto de refilón va como issue en el repo — no en el cuerpo de la PR ni en un comentario `TODO`. Como mínimo: qué falla y qué se esperaba, cómo reproducirlo, qué acota el problema y las trampas que costaron tiempo.

Candidatos previsibles:
- Si `spine` no contrastaba y hubo que crear `--event-generic`, la elección de color queda sin validar por nadie con ojo de diseño.
- `MonthGrid` corta a `MAX_CHIPS = 3` por día: un día con cuatro estrenos esconde colores sin decir cuáles.

- [ ] **Step 8: Verificación final**

```bash
NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
npm run test:e2e -- club-
```

Expected: los cuatro en verde, e2e con cero `skipped`.

- [ ] **Step 9: `detect_changes` antes de cerrar**

```
mcp__gitnexus__detect_changes({ scope: "compare", base_ref: "main" })
```

Comprobar que el alcance afectado son los símbolos esperados y ningún otro.

- [ ] **Step 10: Commit y push**

```bash
git add docs/
git commit -m "docs(clubes): sincronizar data-model, backlog y decisiones con eventos por tipo/medio"
git push -u origin HEAD
```

- [ ] **Step 11: Limpiar el entorno**

No dejar `next dev`, watchers de Vitest ni servidores de Playwright en segundo plano. Puerto 3000 libre o con un único `next dev`.

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

---

## Orden de dependencias

```
Task 0 (entorno)
  └─ Task 1 (event-config)
       ├─ Task 2 (migración dev + tipos)
       │    └─ Task 3 (server actions) ──┐
       │                                  ├─ commit conjunto
       │         Task 4 (EventForm) ─────┘
       └─ Task 5 (marca del calendario)
            └─ Task 6 (mark-accent) ──┐
                                       ├─ commit conjunto
                 Task 7 (superficies) ─┘
                      └─ Task 9 (acciones en la agenda)

Task 8 (retirada de Actividades)  ← independiente de 5-7
Task 10 (asistente → calendario)  ← necesita Task 8
Task 11 (e2e)                     ← necesita 1-10
Task 12 (prod + docs)             ← el último
```

Tasks 3+4 y 6+7 dejan el árbol sin compilar entre medias, a propósito: partirlas más obligaría a escribir código puente que se borra acto seguido.
