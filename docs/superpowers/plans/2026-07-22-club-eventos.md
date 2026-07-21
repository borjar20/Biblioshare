# Eventos de club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir el kind `evento` a las actividades de club — una fecha señalada con título y descripción, creada por moderador+, sin vista individual.

**Architecture:** Kind nuevo en el enum `activity_kind` de `club_activities` (SD-8: enum abierto, nunca tabla aparte), para que el calendario futuro lea una sola fuente de fechas. Dos RPCs `SECURITY DEFINER` saltan la RLS de INSERT (que fuerza `status='proposed'`) y aportan el UPDATE que la tabla no tiene. El estado «pasado» se deriva de `starts_on < today` al leer, nunca se persiste.

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase/Postgres con RLS, TypeScript, Tailwind v4 con tokens CSS, next-intl, Vitest (unit puro), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-22-club-eventos-design.md`

## Global Constraints

- **Migraciones: dev primero (`supabase-dev`), luego prod.** Nunca al revés.
- **`alter type ... add value` va SIEMPRE en su propia migración**, sin nada que use el valor nuevo. Postgres prohíbe usar un valor de enum en la misma transacción que lo añade.
- **`list_migrations` no es la fuente de verdad.** Para comprobar si algo está aplicado, consultar los objetos reales (`pg_proc`, `pg_type`, `pg_class`).
- **Nunca `new Date()` sobre un `date` de Postgres.** Se interpreta como UTC y puede retroceder un día. Partir la cadena `YYYY-MM-DD` a mano.
- **Clases Tailwind literales enteras**, jamás construidas por concatenación (`accent.ts:20-21`).
- **Locale único: `messages/es.json`.** No existe `en.json`.
- **`t(\`kind_${...}\`)` es lookup dinámico:** una clave que falte revienta en runtime, no en compilación. Las claves van ANTES que los componentes que las usan.
- **Toda RPC nueva lleva** `revoke execute ... from public, anon;` + `grant execute ... to authenticated;` (patrón de `20260713_club_activities.sql:145-178`).
- Verificación de comandos: `npm test` (Vitest), `npm run test:e2e` (Playwright, **reutiliza el dev server existente**, no arranques otro), `npx tsc --noEmit`.

---

### Task 1: Migración del enum (aislada)

**Files:**
- Create: `supabase/migrations/20260722_activity_kind_evento.sql`

**Interfaces:**
- Produces: el valor `'evento'` en `public.activity_kind` y `'club_event_created'` en `public.notification_type`, disponibles para todas las tareas siguientes.

Los dos `alter type` van juntos aquí y **solos**: ninguno se usa en esta migración, y así la Task 2 puede referenciar `'evento'` sin chocar con la restricción transaccional de Postgres.

- [ ] **Step 1: Escribir la migración**

```sql
-- Eventos de club (spec 2026-07-22): actividad no participativa que marca una
-- fecha señalada. Kind nuevo en vez de tabla aparte, aplicando SD-8 -- el
-- calendario futuro debe leer UNA fuente de fechas de club, no un UNION.
--
-- Este fichero contiene SOLO los `add value`. Postgres prohíbe usar un valor de
-- enum en la misma transacción que lo añade, así que las RPCs que comparan
-- `kind = 'evento'` viven en 20260722_club_event_rpcs.sql.
alter type public.activity_kind add value 'evento';
alter type public.notification_type add value 'club_event_created';
```

- [ ] **Step 2: Aplicar en dev y verificar contra el objeto real**

Aplicar con `mcp__supabase-dev__apply_migration` (name: `20260722_activity_kind_evento`).

Verificar con `mcp__supabase-dev__execute_sql`:

```sql
select t.typname, e.enumlabel
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname in ('activity_kind', 'notification_type')
  and e.enumlabel in ('evento', 'club_event_created');
```

Esperado: **2 filas** (`activity_kind|evento` y `notification_type|club_event_created`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260722_activity_kind_evento.sql
git commit -m "feat(db): añade 'evento' a activity_kind y 'club_event_created' a notification_type"
```

---

### Task 2: RPCs `create_club_event` y `update_club_event`

**Files:**
- Create: `supabase/migrations/20260722_club_event_rpcs.sql`

**Interfaces:**
- Consumes: el valor `'evento'` de Task 1.
- Produces:
  - `public.create_club_event(p_club_id uuid, p_title text, p_description text, p_starts_on date) returns uuid`
  - `public.update_club_event(p_activity_id uuid, p_title text, p_description text, p_starts_on date) returns void`

- [ ] **Step 1: Escribir la migración**

```sql
-- RPCs de eventos de club (spec 2026-07-22 §2.2). Separadas del `add value`
-- (20260722_activity_kind_evento.sql) por la restricción transaccional de enums.

-- create_club_event: existe porque la política "club_activities insert member"
-- FUERZA status='proposed' -- y un evento no se propone: lo crea quien tiene
-- autoridad para fijar la fecha, y al crearlo ya está fijada.
create or replace function public.create_club_event(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.club_activities
    (club_id, kind, title, description, status, created_by, starts_on)
  values
    (p_club_id,
     'evento',
     trim(p_title),
     nullif(trim(coalesce(p_description, '')), ''),
     'active',
     auth.uid(),
     p_starts_on)
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
-- list_challenge por la puerta de atrás. Eso es exactamente la edición arbitraria
-- que SD-8 evitó al no crear la política.
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
begin
  select club_id, kind into v_club_id, v_kind
  from public.club_activities where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not an event';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  update public.club_activities
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      starts_on = p_starts_on
  where id = p_activity_id and kind = 'evento';
end;
$$;

revoke execute on function public.update_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.update_club_event(uuid, text, text, date) to authenticated;

comment on function public.create_club_event(uuid, text, text, date) is
  'Crea un evento de club (kind=evento, status=active) saltando la RLS de INSERT que fuerza proposed. Moderador+.';
comment on function public.update_club_event(uuid, text, text, date) is
  'Edita título/descripción/fecha de un EVENTO. Moderador+. Restringida a kind=evento a propósito.';
```

- [ ] **Step 2: Aplicar en dev y verificar contra `pg_proc`**

Aplicar con `mcp__supabase-dev__apply_migration` (name: `20260722_club_event_rpcs`).

Verificar con `mcp__supabase-dev__execute_sql`:

```sql
select proname, prosecdef from pg_proc
where proname in ('create_club_event', 'update_club_event');
```

Esperado: **2 filas**, ambas con `prosecdef = true`.

- [ ] **Step 3: Probar el gate de `kind` — la línea que más importa**

Con `mcp__supabase-dev__execute_sql`, coger una actividad NO evento y comprobar que la RPC la rechaza:

```sql
select public.update_club_event(
  (select id from public.club_activities where kind <> 'evento' limit 1),
  'HACKEADO', null, current_date
);
```

Esperado: **error `not an event`**. Si esto devuelve éxito, el `and kind = 'evento'` falta o está mal — para y arréglalo antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722_club_event_rpcs.sql
git commit -m "feat(db): RPCs create_club_event y update_club_event (moderador+, solo kind=evento)"
```

---

### Task 3: Tipos y registro de kinds

**Files:**
- Modify: `src/lib/clubs/activities/core.ts:21` (unión `ActivityKind`)
- Modify: `src/lib/clubs/activities/kinds/types.ts` (campo `hasDetailView`, `ACTIVITY_KIND_ORDER`, `visibleKindOptions`)
- Modify: `src/lib/clubs/activities/kinds/buddy-read.ts`, `tierlist.ts`, `list-challenge.ts`, `criteria-challenge.ts` (una línea cada uno)
- Create: `src/lib/clubs/activities/kinds/evento.ts`
- Modify: `src/lib/clubs/activities/kinds/accent.ts`
- Modify: `src/lib/clubs/activities/kinds/registry.ts`
- Create: `src/lib/clubs/activities/kinds/visible-kinds.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces:
  - `ActivityKind` incluye `"evento"`
  - `ActivityKindDefinition.hasDetailView: boolean` (requerido)
  - `eventoKind: ActivityKindDefinition`
  - `visibleKindOptions(isModerator: boolean): ActivityKind[]`
  - `ACTIVITY_ACCENT.evento`

`hasDetailView` es **requerido, no opcional con default `true`**: son cuatro ediciones de una línea, y a cambio quien añada el sexto kind está obligado a decidirlo en vez de heredarlo en silencio.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/clubs/activities/kinds/visible-kinds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { visibleKindOptions } from "./types";

describe("visibleKindOptions", () => {
  it("oculta 'evento' a quien no modera", () => {
    expect(visibleKindOptions(false)).not.toContain("evento");
  });

  it("ofrece 'evento' a moderador+", () => {
    expect(visibleKindOptions(true)).toContain("evento");
  });

  it("los cuatro kinds participativos se ofrecen a todo el mundo", () => {
    const raso = visibleKindOptions(false);
    expect(raso).toEqual([
      "buddy_read",
      "tierlist",
      "list_challenge",
      "criteria_challenge",
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- visible-kinds`
Expected: FAIL — `visibleKindOptions is not a function`.

- [ ] **Step 3: Ampliar la unión `ActivityKind`**

En `src/lib/clubs/activities/core.ts:21`, sustituir la línea por:

```ts
export type ActivityKind =
  | "buddy_read"
  | "tierlist"
  | "list_challenge"
  | "criteria_challenge"
  // Evento: actividad NO participativa (spec 2026-07-22). Solo fecha, título y
  // descripción; sin pool, sin participantes, sin vista de detalle.
  | "evento";
```

- [ ] **Step 4: Añadir `hasDetailView` y `visibleKindOptions` a `types.ts`**

Dentro del tipo `ActivityKindDefinition` (`src/lib/clubs/activities/kinds/types.ts`), añadir tras `usesItemPool`:

```ts
  // ¿Este kind tiene página propia en /club/[slug]/actividad/[id]? `evento` no
  // (spec 2026-07-22): es una fecha en el calendario, no algo en lo que entrar.
  // REQUERIDO a propósito, sin default: quien añada un kind nuevo tiene que
  // decidirlo, no heredarlo. La tarjeta y la guardia de ruta leen esto.
  hasDetailView: boolean;
```

Y al final del fichero, tras `ACTIVITY_KIND_ORDER`, sustituir/añadir:

```ts
export const ACTIVITY_KIND_ORDER: ActivityKind[] = [
  "buddy_read",
  "tierlist",
  "list_challenge",
  "criteria_challenge",
  "evento",
];

// Kinds ofrecibles en el asistente. `evento` solo lo crea moderador+, así que a
// un miembro raso ni se le enseña la tarjeta. Esto es gate de UI: la autoridad
// real es create_club_event, que valida el rol en servidor.
export function visibleKindOptions(isModerator: boolean): ActivityKind[] {
  return ACTIVITY_KIND_ORDER.filter(
    (kind) => kind !== "evento" || isModerator,
  );
}
```

- [ ] **Step 5: Añadir `hasDetailView: true` a los cuatro kinds existentes**

Una línea en cada fichero, dentro del objeto de definición:

- `src/lib/clubs/activities/kinds/buddy-read.ts` → `hasDetailView: true,`
- `src/lib/clubs/activities/kinds/tierlist.ts` → `hasDetailView: true,`
- `src/lib/clubs/activities/kinds/list-challenge.ts` → `hasDetailView: true,`
- `src/lib/clubs/activities/kinds/criteria-challenge.ts` → `hasDetailView: true,`

- [ ] **Step 6: Crear `kinds/evento.ts`**

```ts
import type { ActivityKindDefinition } from "./types";

// Evento (spec 2026-07-22): una fecha señalada del club -- "sale en cine X".
// Es el primer kind NO participativo del motor: no se propone (nace 'active'
// por RPC), no se une nadie, no progresa y no tiene página propia. Por eso
// todos los campos del pool quedan en su valor nulo y hasDetailView es false.
//
// `itemCuration` es irrelevante aquí (no hay pool que curar), pero el tipo lo
// exige: se pone "curators" por coherencia con quién manda en un evento.
export const eventoKind: ActivityKindDefinition = {
  kind: "evento",
  allowedItemTypes: [],
  maxItems: 0,
  itemCuration: "curators",
  usesItemPool: false,
  hasDetailView: false,
};
```

- [ ] **Step 7: Registrar el kind y su acento**

En `src/lib/clubs/activities/kinds/registry.ts`, añadir el import y la entrada:

```ts
import { eventoKind } from "./evento";
```

```ts
export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindDefinition> = {
  buddy_read: buddyReadKind,
  tierlist: tierlistKind,
  list_challenge: listChallengeKind,
  criteria_challenge: criteriaChallengeKind,
  evento: eventoKind,
};
```

Y exportar el helper nuevo al final del mismo fichero, junto a los reexports existentes:

```ts
export { ACTIVITY_KIND_ORDER, visibleKindOptions } from "./types";
```

En `src/lib/clubs/activities/kinds/accent.ts`, añadir `CalendarIcon` al import desde `@/components/ui/icons` y la entrada al `Record` (morado `type-series`, el único token de la paleta que ninguna actividad usaba):

```ts
  evento: {
    Icon: CalendarIcon,
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    borderSoft: "border-type-series/30",
    bar: "bg-type-series",
  },
```

Añadir además esta línea al bloque de comentario que explica la paleta (sobre `ActivityAccent`), tras la línea de «reto genérico»:

```
//   evento          → morado (el de serie), el único token libre de la paleta
```

- [ ] **Step 8: Ejecutar el test y el compilador**

Run: `npm test -- visible-kinds`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit`
Expected: sin errores. Si `ACTIVITY_ACCENT` o `ACTIVITY_KINDS` se quejan de una clave que falta, es el tripwire funcionando — complétala.

- [ ] **Step 9: Regenerar los tipos de Supabase**

Usar `mcp__supabase-dev__generate_typescript_types` y volcar el resultado en `src/lib/supabase/database.types.ts`.

Verificar: `grep -c "evento" src/lib/supabase/database.types.ts` → al menos 1.

Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/lib/clubs/activities/core.ts src/lib/clubs/activities/kinds/ src/lib/supabase/database.types.ts
git commit -m "feat(actividades): kind 'evento' en el registro, con hasDetailView requerido"
```

---

### Task 4: Claves de i18n

**Files:**
- Modify: `messages/es.json` (namespace `activity` ~`:495-672`, y `:369-371` para la notificación)

**Interfaces:**
- Produces: todas las claves que consumen las tareas 6–12.

Van **antes** que los componentes: los lookups dinámicos (`t(\`kind_${kind}\`)`) fallan en runtime, no en compilación, así que una clave olvidada aquí se descubre en pantalla.

- [ ] **Step 1: Añadir las claves del namespace `activity`**

Junto a `kind_criteria_challenge` (`:503`):

```json
    "kind_evento": "Evento",
```

Junto a `kindHint_criteria_challenge` (`:659`):

```json
    "kindHint_evento": "Una fecha señalada del club.",
```

Al final del namespace `activity`, antes del cierre:

```json
    "groupEvents": "Fechas señaladas",
    "eventPast": "Ya pasó",
    "newEvent": "Nuevo evento",
    "editEvent": "Editar evento",
    "eventDateLabel": "Fecha",
    "eventSubmit": "Crear evento",
    "eventSubmitting": "Creando...",
    "eventSaveSubmit": "Guardar cambios",
    "eventDateRequired": "Un evento necesita una fecha.",
    "eventError": "No se pudo guardar el evento. Inténtalo de nuevo.",
    "summaryDates": "Próximas fechas",
    "archive": "Archivar",
    "edit": "Editar",
    "eventActions": "Acciones del evento"
```

> Antes de añadir `archive` y `edit`, comprueba si ya existen en el namespace (`grep -n '"archive"\|"edit"' messages/es.json`). Si están, no las dupliques — JSON con clave repetida se resuelve al último valor en silencio.

- [ ] **Step 2: Añadir el copy de la notificación**

Junto a `clubActivitySpawned` (`messages/es.json:371`):

```json
    "clubEventCreated": "{name} marcó una fecha en el club",
```

- [ ] **Step 3: Verificar que el JSON sigue siendo válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "i18n: claves de eventos de club"
```

---

### Task 5: Helpers puros de fecha y agrupación (TDD)

**Files:**
- Create: `src/lib/clubs/activities/format-date.ts`
- Create: `src/lib/clubs/activities/format-date.test.ts`
- Create: `src/lib/clubs/activities/group-activities.ts`
- Create: `src/lib/clubs/activities/group-activities.test.ts`
- Modify: `src/components/clubs/club-summary.tsx:23-27` (usar el helper compartido en vez de su `formatDue` local)

**Interfaces:**
- Produces:
  - `formatDayMonth(iso: string): { day: string; month: string }`
  - `formatEventDate(iso: string): string` — p. ej. `"18 jul"`
  - `isPastEvent(startsOn: string | null, today: string): boolean`
  - `groupActivities(activities: ClubActivity[], today: string): ActivityGroups`
  - `type ActivityGroups = { events: ClubActivity[]; active: ClubActivity[]; proposed: ClubActivity[]; finished: ClubActivity[] }`

`club-summary.tsx` ya tiene un `formatDue` privado idéntico. Se extrae en vez de duplicarlo: dos formateadores de la misma fecha divergen.

- [ ] **Step 1: Escribir los tests de fecha**

Crear `src/lib/clubs/activities/format-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDayMonth, formatEventDate } from "./format-date";

describe("formatDayMonth", () => {
  it("parte la cadena ISO sin pasar por Date", () => {
    expect(formatDayMonth("2026-07-18")).toEqual({ day: "18", month: "jul" });
  });

  it("enero y diciembre caen en los extremos del array", () => {
    expect(formatDayMonth("2026-01-01").month).toBe("ene");
    expect(formatDayMonth("2026-12-31").month).toBe("dic");
  });

  // Esta es la razón de existir del helper: `new Date("2026-01-01")` se
  // interpreta como UTC, y en cualquier zona al oeste de Greenwich
  // .getDate() devuelve 31 de diciembre. Partir la cadena no puede fallar así.
  it("no retrocede un día en el primero de enero", () => {
    expect(formatDayMonth("2026-01-01").day).toBe("01");
  });
});

describe("formatEventDate", () => {
  it("junta día y mes en una línea", () => {
    expect(formatEventDate("2026-07-18")).toBe("18 jul");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- format-date`
Expected: FAIL — no existe `./format-date`.

- [ ] **Step 3: Implementar `format-date.ts`**

```ts
// Formateo de fechas `date` de Postgres. Se parte la cadena a mano en vez de
// usar new Date(): un `date` no lleva zona, y pasarlo por Date lo interpreta
// como UTC y puede retroceder un día según dónde esté quien mira.
//
// Extraído del formatDue privado de club-summary.tsx al añadir los eventos
// (spec 2026-07-22): dos formateadores de la misma fecha acaban divergiendo.
export const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatDayMonth(iso: string): { day: string; month: string } {
  const [, month, day] = iso.split("-");
  return { day, month: MONTHS_ES[Number(month) - 1] ?? "" };
}

export function formatEventDate(iso: string): string {
  const { day, month } = formatDayMonth(iso);
  return `${day} ${month}`;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- format-date`
Expected: PASS (4 tests).

- [ ] **Step 5: Escribir los tests de agrupación**

Crear `src/lib/clubs/activities/group-activities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupActivities, isPastEvent } from "./group-activities";
import type { ClubActivity } from "./core";

const HOY = "2026-07-22";

function act(over: Partial<ClubActivity>): ClubActivity {
  return {
    id: "id", clubId: "c", kind: "buddy_read", title: "t", description: null,
    status: "active", config: null, createdBy: "u", startsOn: null, endsOn: null,
    createdAt: "2026-07-01", viewerIsParticipant: false, participantCount: 0,
    spawnedFromActivityId: null, spawnedFromItem: null,
    ...over,
  };
}

describe("isPastEvent", () => {
  it("ayer ya pasó", () => expect(isPastEvent("2026-07-21", HOY)).toBe(true));
  it("hoy NO ha pasado — el evento es hoy", () =>
    expect(isPastEvent("2026-07-22", HOY)).toBe(false));
  it("mañana no ha pasado", () => expect(isPastEvent("2026-07-23", HOY)).toBe(false));
  it("sin fecha no cuenta como pasado", () => expect(isPastEvent(null, HOY)).toBe(false));
});

describe("groupActivities", () => {
  it("saca los eventos del grupo de activas — si no, salen dos veces", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
        act({ id: "a", kind: "buddy_read", status: "active" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["e"]);
    expect(groups.active.map((a) => a.id)).toEqual(["a"]);
  });

  it("los futuros van primero, del más próximo al más lejano", () => {
    const groups = groupActivities(
      [
        act({ id: "lejos", kind: "evento", status: "active", startsOn: "2026-12-01" }),
        act({ id: "cerca", kind: "evento", status: "active", startsOn: "2026-07-25" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["cerca", "lejos"]);
  });

  it("los pasados van al final, del más reciente al más antiguo", () => {
    const groups = groupActivities(
      [
        act({ id: "viejo", kind: "evento", status: "active", startsOn: "2026-01-01" }),
        act({ id: "reciente", kind: "evento", status: "active", startsOn: "2026-07-20" }),
        act({ id: "futuro", kind: "evento", status: "active", startsOn: "2026-08-01" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["futuro", "reciente", "viejo"]);
  });

  it("un evento archivado sale de 'events' y cae en 'finished'", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" })],
      HOY,
    );
    expect(groups.events).toHaveLength(0);
    expect(groups.finished.map((a) => a.id)).toEqual(["e"]);
  });

  it("propuestas y finalizadas se agrupan como antes", () => {
    const groups = groupActivities(
      [
        act({ id: "p", status: "proposed" }),
        act({ id: "f", status: "finished" }),
      ],
      HOY,
    );
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `npm test -- group-activities`
Expected: FAIL — no existe `./group-activities`.

- [ ] **Step 7: Implementar `group-activities.ts`**

```ts
import type { ClubActivity } from "./core";

export type ActivityGroups = {
  /** Eventos vivos (kind='evento', status='active'), futuros antes que pasados. */
  events: ClubActivity[];
  active: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas, incluidos los eventos archivados. */
  finished: ClubActivity[];
};

// "Pasado" se DERIVA de la fecha, nunca se persiste (spec 2026-07-22 §2.3): un
// estado que hay que mantener sincronizado con el calendario es un estado que se
// desincroniza. La comparación es de cadenas ISO, que ordenan lexicográficamente
// igual que cronológicamente -- así no entra ningún Date en el cálculo.
//
// Un evento que es HOY no ha pasado: sigue siendo la fecha señalada.
export function isPastEvent(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  return startsOn < today;
}

export function groupActivities(
  activities: ClubActivity[],
  today: string,
): ActivityGroups {
  // Los eventos SALEN del filtro de activas: comparten status='active' con las
  // actividades en marcha, y sin esto aparecerían en dos grupos a la vez.
  const events = activities
    .filter((a) => a.kind === "evento" && a.status === "active")
    .sort((x, y) => {
      const xPast = isPastEvent(x.startsOn, today);
      const yPast = isPastEvent(y.startsOn, today);
      if (xPast !== yPast) return xPast ? 1 : -1;
      const xDate = x.startsOn ?? "";
      const yDate = y.startsOn ?? "";
      // Futuros: el más próximo primero. Pasados: el más reciente primero.
      return xPast ? yDate.localeCompare(xDate) : xDate.localeCompare(yDate);
    });

  return {
    events,
    active: activities.filter((a) => a.status === "active" && a.kind !== "evento"),
    proposed: activities.filter((a) => a.status === "proposed"),
    finished: activities.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `npm test -- group-activities`
Expected: PASS (9 tests).

- [ ] **Step 9: Hacer que `club-summary.tsx` use el helper compartido**

En `src/components/clubs/club-summary.tsx`: borrar el array `MONTHS` (`:7-20`) y la función `formatDue` (`:23-27`), y añadir el import:

```ts
import { formatDayMonth } from "@/lib/clubs/activities/format-date";
```

Sustituir las tres llamadas a `formatDue(` por `formatDayMonth(`.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/lib/clubs/activities/format-date.ts src/lib/clubs/activities/format-date.test.ts src/lib/clubs/activities/group-activities.ts src/lib/clubs/activities/group-activities.test.ts src/components/clubs/club-summary.tsx
git commit -m "feat(actividades): helpers puros de fecha y agrupación, con el formateo unificado"
```

---

### Task 6: Server actions de eventos

**Files:**
- Create: `src/lib/clubs/activities/events.ts`
- Modify: `src/lib/clubs/activities/notify-club.ts:16`
- Modify: `src/lib/social/notification-types.ts:22-24,58-60`

**Interfaces:**
- Consumes: las RPCs de Task 2, la clave i18n `clubEventCreated` de Task 4.
- Produces:
  - `createClubEvent(input: { clubId: string; title: string; description?: string; startsOn: string }): Promise<void>`
  - `updateClubEvent(input: { activityId: string; title: string; description?: string; startsOn: string }): Promise<void>`

- [ ] **Step 1: Ampliar el tipo de notificación**

En `src/lib/social/notification-types.ts`, añadir a la unión `NotificationType` (tras `club_activity_spawned`, `:24`):

```ts
  | "club_event_created";
```

Y a `NOTIFICATION_TYPE_KEY` (tras `club_activity_spawned`, `:60`):

```ts
  club_event_created: "clubEventCreated",
```

En `src/lib/clubs/activities/notify-club.ts:16`, ampliar la unión del parámetro `type`:

```ts
  type:
    | "club_activity_proposed"
    | "club_activity_activated"
    | "club_activity_spawned"
    | "club_event_created",
```

- [ ] **Step 2: Crear `events.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { notifyClub } from "./notify-club";
import { createClient } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";

// Eventos de club (spec 2026-07-22). Módulo aparte de core.ts porque un evento
// no comparte NADA de su ciclo de vida: no se propone, no se activa, no se une
// nadie. Meterlo en core.ts habría sido mezclar dos modelos en un fichero ya
// largo.
//
// Ambas acciones van por RPC, no por insert/update de cliente:
//   - crear: la política de INSERT fuerza status='proposed', y un evento nace activo.
//   - editar: club_activities no tiene política UPDATE (SD-8), a propósito.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function createClubEvent(input: {
  clubId: string;
  title: string;
  description?: string;
  startsOn: string;
}): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_starts_on: input.startsOn,
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

export async function updateClubEvent(input: {
  activityId: string;
  title: string;
  description?: string;
  startsOn: string;
}): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_starts_on: input.startsOn,
  });
  if (error) throw error;

  // Editar no notifica: el club ya se enteró de la fecha al crearse, y avisar de
  // cada corrección de errata sería ruido.
  revalidateClubPages();
}
```

- [ ] **Step 3: Verificar la compilación**

Run: `npx tsc --noEmit`
Expected: sin errores. Si `supabase.rpc("create_club_event", …)` no está tipado, los tipos de Task 3 Step 9 no se regeneraron — vuelve a ese paso.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs/activities/events.ts src/lib/clubs/activities/notify-club.ts src/lib/social/notification-types.ts
git commit -m "feat(actividades): server actions createClubEvent y updateClubEvent"
```

---

### Task 7: Tarjeta sin enlace y con fecha

**Files:**
- Modify: `src/components/clubs/activity-card.tsx`

**Interfaces:**
- Consumes: `getActivityKindDefinition` (Task 3), `formatEventDate` (Task 5), claves `eventPast`/`kind_evento` (Task 4).
- Produces: `ActivityCard` que no enlaza cuando `hasDetailView === false`.

- [ ] **Step 1: Añadir los imports**

En `src/components/clubs/activity-card.tsx`, junto a los imports existentes:

```ts
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
import { isPastEvent } from "@/lib/clubs/activities/group-activities";
```

- [ ] **Step 2: Elegir envoltorio y línea meta**

Dentro del componente, tras `const accent = ACTIVITY_ACCENT[activity.kind];`:

```ts
  const definition = getActivityKindDefinition(activity.kind);
  // Sin página propia no hay a dónde enlazar: el mismo marcado va en un <div>.
  // Se elige el ENVOLTORIO, no se duplica la tarjeta -- dos copias del mismo
  // marcado divergen en cuanto alguien toca una sola.
  const linked = definition.hasDetailView;

  // La línea meta de un evento dice su fecha; "0 participantes" en algo a lo que
  // nadie se apunta no informa de nada.
  const meta = definition.hasDetailView
    ? t("participants", { count: activity.participantCount })
    : activity.startsOn
      ? formatEventDate(activity.startsOn)
      : "";
  const past = !definition.hasDetailView && isPastEvent(activity.startsOn, todayIso());
```

Y añadir arriba del fichero, fuera del componente:

```ts
// Hoy en formato ISO local (no UTC): toISOString() daría el día de Greenwich, que
// de madrugada es otro día distinto del que ve quien mira la pantalla.
function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
```

- [ ] **Step 3: Aplicar el envoltorio condicional**

Sustituir el `<Link …>` que abre el cuerpo de la tarjeta por un envoltorio elegido. El contenido interno (baldosa, título, meta, chip de estado) **no cambia**:

```tsx
      {linked ? (
        <Link
          href={`/club/${clubSlug}/actividad/${activity.id}`}
          className="flex items-center gap-3 hover:opacity-80"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{inner}</div>
      )}
```

donde `inner` se declara justo antes del `return`, con el marcado que hoy vive dentro del `<Link>`:

```tsx
  const inner = (
    <>
      <span
        aria-hidden
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
      >
        <accent.Icon className="h-4 w-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-serif text-sm font-semibold text-foreground">
          {activity.title}
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {t(`kind_${activity.kind}`)}
          {meta && ` · ${meta}`}
        </span>
      </span>

      <span
        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
          past ? "bg-surface-muted text-muted-foreground" : STATUS_STYLE[activity.status]
        }`}
      >
        {past ? t("eventPast") : t(`status_${activity.status}`)}
      </span>
    </>
  );
```

- [ ] **Step 4: Verificar la compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-card.tsx
git commit -m "feat(actividades): la tarjeta no enlaza si el kind no tiene detalle, y muestra fecha en eventos"
```

---

### Task 8: Grupo «Fechas señaladas» en la lista

**Files:**
- Modify: `src/components/clubs/activity-list.tsx`

**Interfaces:**
- Consumes: `groupActivities` (Task 5), `ActivityCard` (Task 7), clave `groupEvents` (Task 4).

- [ ] **Step 1: Sustituir los filtros por el helper**

En `src/components/clubs/activity-list.tsx`, añadir el import:

```ts
import { groupActivities } from "@/lib/clubs/activities/group-activities";
```

Y sustituir los tres `filter` locales (`const active`, `const proposed`, `const finished`) por:

```ts
  // Hoy se calcula en cliente a propósito: "pasado" depende del huso de quien
  // mira, y este componente ya es "use client".
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { events, active, proposed, finished } = groupActivities(activities, today);
```

- [ ] **Step 2: Pintar el grupo de eventos**

Insertar el bloque **antes** del `<Group title={t("groupActive"…)}>`:

```tsx
      <Group title={t("groupEvents")}>
        {events.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
          />
        ))}
      </Group>
```

`Group` ya devuelve `null` si no tiene hijos, así que un club sin eventos no ve encabezado vacío.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm test` → todos verdes.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-list.tsx
git commit -m "feat(actividades): grupo «Fechas señaladas» en la lista del club"
```

---

### Task 9: Formulario de evento y rama del asistente

**Files:**
- Create: `src/components/clubs/propose/event-form.tsx`
- Modify: `src/components/clubs/propose/propose-wizard.tsx`
- Modify: `src/components/clubs/activity-composer.tsx`
- Modify: `src/app/club/[slug]/page.tsx:137-139` (pasar `isModerator` — ya se pasa, verificar)

**Interfaces:**
- Consumes: `createClubEvent`/`updateClubEvent` (Task 6), `visibleKindOptions` (Task 3), claves de evento (Task 4).
- Produces: `EventForm` — reutilizado por el asistente (crear) y por las acciones de tarjeta (editar, Task 10).

```ts
export function EventForm(props: {
  clubId: string;
  /** Presente = modo edición. */
  activity?: { id: string; title: string; description: string | null; startsOn: string | null };
  onDone: () => void;
  onCancel: () => void;
}): JSX.Element
```

- [ ] **Step 1: Crear `event-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClubEvent, updateClubEvent } from "@/lib/clubs/activities/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// Formulario de evento, compartido por crear (asistente) y editar (menú de la
// tarjeta). Un solo formulario a propósito: son los mismos tres campos, y dos
// copias acabarían validando distinto.
export function EventForm({
  clubId,
  activity,
  onDone,
  onCancel,
}: {
  clubId: string;
  activity?: {
    id: string;
    title: string;
    description: string | null;
    startsOn: string | null;
  };
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const editing = Boolean(activity);

  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [startsOn, setStartsOn] = useState(activity?.startsOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!startsOn) {
      setError(t("eventDateRequired"));
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
          });
        } else {
          await createClubEvent({
            clubId,
            title,
            description: description || undefined,
            startsOn,
          });
        }
        onDone();
      } catch {
        // El error se MUESTRA: SD-8 ya registró "errores de mutación no
        // visibles" como hallazgo Important en este mismo motor. El caso real
        // aquí es dejar de ser moderador entre abrir el formulario y enviarlo.
        setError(t("eventError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("titleLabel")} htmlFor="event-title">
        <Input
          id="event-title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor="event-description">
        <textarea
          id="event-description"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </Field>

      <Field label={t("eventDateLabel")} htmlFor="event-date">
        <Input
          id="event-date"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          className="w-full"
        />
      </Field>

      {error && <p className="text-sm text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={submit}
          className="w-full"
        >
          {isPending
            ? t("eventSubmitting")
            : editing
              ? t("eventSaveSubmit")
              : t("eventSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ramificar el asistente**

En `src/components/clubs/propose/propose-wizard.tsx`:

Añadir `isModerator: boolean` a las props del componente y del tipo.

Cambiar el import del registro para traer el helper:

```ts
import {
  visibleKindOptions,
  getActivityKindDefinition,
} from "@/lib/clubs/activities/kinds/registry";
```

Añadir el import del formulario:

```ts
import { EventForm } from "./event-form";
```

En el paso 1, sustituir `ACTIVITY_KIND_ORDER.map((option) => {` por:

```ts
            {visibleKindOptions(isModerator).map((option) => {
```

Y al principio del paso 2 (justo tras `const accent = ACTIVITY_ACCENT[kind!];`), desviar los eventos a su propio formulario:

```tsx
  // Un evento no tiene pool, ni config, ni fecha de fin: su paso 2 es solo la
  // fecha. Y no se "propone" -- se crea ya activo por RPC.
  if (kind === "evento") {
    return (
      <Panel title={title || t("newEvent")} onCancel={onCancel}>
        <EventForm
          clubId={clubId}
          onDone={onProposed}
          onCancel={() => setStep(1)}
        />
      </Panel>
    );
  }
```

- [ ] **Step 3: Pasar `isModerator` desde el composer**

En `src/components/clubs/activity-composer.tsx`, añadir la prop y reenviarla:

```tsx
export function ActivityComposer({
  clubId,
  isModerator,
}: {
  clubId: string;
  isModerator: boolean;
}) {
```

```tsx
    <ProposeWizard
      clubId={clubId}
      isModerator={isModerator}
      onProposed={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
```

En `src/components/clubs/activity-list.tsx`, pasar la prop que ya tiene el componente:

```tsx
      <ActivityComposer clubId={clubId} isModerator={isModerator} />
```

- [ ] **Step 4: Verificar la compilación**

Run: `npx tsc --noEmit`
Expected: sin errores. `ActivityList` ya recibe `isModerator` de `page.tsx:137-139`, así que no hace falta tocar la página.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/propose/event-form.tsx src/components/clubs/propose/propose-wizard.tsx src/components/clubs/activity-composer.tsx src/components/clubs/activity-list.tsx
git commit -m "feat(actividades): crear eventos desde el asistente, tarjeta solo para moderador+"
```

---

### Task 10: Editar y archivar desde la tarjeta

**Files:**
- Create: `src/components/clubs/event-card-actions.tsx`
- Modify: `src/components/clubs/activity-card.tsx` (aceptar `actions`, ya soportado)
- Modify: `src/components/clubs/activity-list.tsx` (pasar las acciones a los eventos)

**Interfaces:**
- Consumes: `EventForm` (Task 9), `archiveActivity` (`core.ts:152`, ya existe), claves `edit`/`archive`/`eventActions` (Task 4).
- Produces: `EventCardActions`

Sin página de detalle, los controles viven en la tarjeta. `ActivityCard` ya acepta una prop `actions` (la usa la moderación de propuestas), así que se reutiliza sin tocar su firma.

- [ ] **Step 1: Crear `event-card-actions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { archiveActivity } from "@/lib/clubs/activities/core";
import { EventForm } from "./propose/event-form";
import { Button } from "@/components/ui/button";

// Editar y archivar un evento. Van EN la tarjeta porque un evento no tiene
// página propia donde ponerlos. Archivar reutiliza archive_club_activity tal
// cual: ya es moderador+ y ya acepta el estado 'active'.
export function EventCardActions({ activity }: { activity: ClubActivity }) {
  const t = useTranslations("activity");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="w-full">
        <EventForm
          clubId={activity.clubId}
          activity={{
            id: activity.id,
            title: activity.title,
            description: activity.description,
            startsOn: activity.startsOn,
          }}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          {t("edit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await archiveActivity(activity.id);
              } catch {
                setError(t("eventError"));
              }
            })
          }
        >
          {t("archive")}
        </Button>
      </div>
      {error && <p className="text-sm text-status-dropped">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Pasar las acciones desde la lista**

En `src/components/clubs/activity-list.tsx`, añadir el import y la prop `actions` al `ActivityCard` del grupo de eventos:

```ts
import { EventCardActions } from "./event-card-actions";
```

```tsx
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            actions={isModerator ? <EventCardActions activity={activity} /> : undefined}
          />
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` → sin errores.

> `archiveActivity` se importa y se llama tal cual desde un componente cliente — es exactamente lo que hace `proposal-moderation.tsx:5-10,42`. No hace falta envoltorio.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/event-card-actions.tsx src/components/clubs/activity-list.tsx
git commit -m "feat(actividades): editar y archivar un evento desde su tarjeta"
```

---

### Task 11: «Próximas fechas» en el resumen del club

**Files:**
- Modify: `src/lib/clubs/activities/upcoming.ts`
- Modify: `src/components/clubs/club-summary.tsx`
- Modify: `src/app/club/[slug]/page.tsx:176-198`

**Interfaces:**
- Produces: `getUpcomingEvents(clubId: string, limit?: number): Promise<UpcomingEvent[]>` con `type UpcomingEvent = { id: string; title: string; startsOn: string }`.

Consulta **separada** de `getUpcomingCheckpoints`, no fusionada: ese merge es el trabajo del calendario, y hacerlo aquí a medias obliga a escribirlo dos veces.

- [ ] **Step 1: Añadir `getUpcomingEvents`**

Al final de `src/lib/clubs/activities/upcoming.ts`:

```ts
export type UpcomingEvent = {
  id: string;
  title: string;
  startsOn: string;
};

// Las próximas fechas señaladas del club (spec 2026-07-22). Mismo criterio que
// getUpcomingCheckpoints: solo miran hacia delante -- un evento que ya pasó no
// es "próximo". La RLS de club_activities ya limita a miembros.
//
// Consulta APARTE de los hitos a propósito: unir ambas fuentes en una sola
// línea de tiempo es el trabajo del calendario, y adelantarlo aquí a medias
// significa escribirlo dos veces.
export async function getUpcomingEvents(
  clubId: string,
  limit = 4,
): Promise<UpcomingEvent[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("club_activities")
    .select("id, title, starts_on")
    .eq("club_id", clubId)
    .eq("kind", "evento")
    .eq("status", "active")
    .gte("starts_on", today)
    .order("starts_on", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data ?? [])
    .filter((row): row is typeof row & { starts_on: string } => row.starts_on != null)
    .map((row) => ({ id: row.id, title: row.title, startsOn: row.starts_on }));
}
```

- [ ] **Step 2: Pintar el bloque en el resumen**

En `src/components/clubs/club-summary.tsx`:

Añadir el import del tipo y la prop:

```ts
import type { UpcomingCheckpoint, UpcomingEvent } from "@/lib/clubs/activities/upcoming";
```

```ts
export async function ClubSummary({
  activities,
  upcoming,
  events,
  clubSlug,
}: {
  activities: ClubActivity[];
  upcoming: UpcomingCheckpoint[];
  events: UpcomingEvent[];
  clubSlug: string;
}) {
```

**Excluir los eventos del strip de «en marcha»** — comparten `status='active'` y hoy entrarían ahí con un enlace a una página que devuelve 404:

```ts
  const active = activities.filter(
    (a) => a.status === "active" && a.kind !== "evento",
  );

  if (active.length === 0 && upcoming.length === 0 && events.length === 0) return null;
```

Y añadir la sección al final, tras el bloque de `upcoming`:

```tsx
      {events.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("summaryDates")}
          </h2>

          {/* Sin enlace: un evento no tiene página propia. */}
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {events.map((event) => {
              const { day, month } = formatDayMonth(event.startsOn);
              return (
                <div
                  key={event.id}
                  className="flex shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2"
                >
                  <span aria-hidden className="flex shrink-0 flex-col items-center leading-none">
                    <span className="font-serif text-lg font-semibold text-foreground">
                      {day}
                    </span>
                    <span className="font-mono text-[8.5px] text-muted-foreground uppercase">
                      {month}
                    </span>
                  </span>
                  <span className="max-w-44 truncate text-xs leading-tight text-foreground">
                    {event.title}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
```

- [ ] **Step 3: Cargar los eventos en la página del club**

En `src/app/club/[slug]/page.tsx`, dentro de `ClubFeedSection`, añadir la consulta al `Promise.all` (`:176-181`):

```ts
  const [initialPage, upcoming, events, viewer, t] = await Promise.all([
    listClubPosts(club.id),
    getUpcomingCheckpoints(club.id),
    getUpcomingEvents(club.id),
    getViewerIdentity(),
    getTranslations("club"),
  ]);
```

Ampliar el import (`:11`):

```ts
import { getUpcomingCheckpoints, getUpcomingEvents } from "@/lib/clubs/activities/upcoming";
```

Y pasar la prop (`:193`):

```tsx
        <ClubSummary
          activities={activities}
          upcoming={upcoming}
          events={events}
          clubSlug={club.slug}
        />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/upcoming.ts src/components/clubs/club-summary.tsx "src/app/club/[slug]/page.tsx"
git commit -m "feat(clubes): bloque «Próximas fechas» en el resumen del club"
```

---

### Task 12: Guardia de ruta del detalle

**Files:**
- Modify: `src/app/club/[slug]/actividad/[id]/page.tsx:34`

**Interfaces:**
- Consumes: `getActivityKindDefinition` (Task 3).

La URL es adivinable y hoy renderizaría una página rota (sin pool, sin participantes, sin extensión).

- [ ] **Step 1: Añadir el import y la guardia**

```ts
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
```

Justo después de `if (!activity || activity.clubId !== club.id) notFound();`:

```ts
  // Un kind sin página propia (evento) no tiene nada que renderizar aquí: la URL
  // es adivinable y sin esto se serviría una vista vacía y rota.
  if (!getActivityKindDefinition(activity.kind).hasDetailView) notFound();
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/club/[slug]/actividad/[id]/page.tsx"
git commit -m "feat(actividades): 404 en el detalle de un kind sin vista propia"
```

---

### Task 13: e2e del recorrido completo

**Files:**
- Create: `e2e/club-evento.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.

**Alcance honesto:** solo hay **un** usuario de prueba seedeado (`TEST_USER_EMAIL`), así que este spec **no** puede comprobar que un miembro raso no vea la tarjeta «Evento». Ese gate queda cubierto por el unit test de `visibleKindOptions` (Task 3) y por la RPC. El e2e con segunda cuenta se abre como issue en Task 14 — un test que finge comprobar el gate es peor que no tenerlo.

- [ ] **Step 1: Escribir el spec**

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Un moderador marca una fecha en el club. Se comprueba que se crea de verdad
// (no solo que se pinte), que NO navega a ninguna ficha, y que su URL de detalle
// devuelve 404. Se autolimpia.
test("evento: se crea, aparece en la lista y no tiene ficha", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 420, height: 1100 });
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/club/test-public-club?tab=actividades");
  await page.getByRole("button", { name: /proponer actividad/i }).first().click();

  const titulo = `e2e evento ${Date.now()}`;
  await page.getByLabel(/^título$/i).fill(titulo);
  // OJO con el ancla: la tarjeta de kind contiene el nombre Y su descripción, así
  // que su nombre accesible es "Evento Una fecha señalada del club". Un
  // /^evento$/ no casaría y el test fallaría sin que nada estuviera roto.
  await page.getByRole("button", { name: /^evento\b/i }).click();
  await page.getByRole("button", { name: /^continuar$/i }).click();

  // Paso 2 de un evento: SOLO la fecha. Si aparece el pool de ítems, la rama
  // del asistente no se está aplicando.
  await expect(page.getByRole("button", { name: /^añadir ítem$/i })).toHaveCount(0);
  await page.getByLabel(/^fecha$/i).fill("2027-03-15");
  await page.getByRole("button", { name: /^crear evento$/i }).click();

  // Existe en la BD. Se comprueba antes que la pantalla: la UI puede pintar el
  // título desde su propio estado aunque el submit falle (falso verde ya visto
  // en propose-wizard.spec.ts).
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  let creado: { id: string; status: string; kind: string; starts_on: string } | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,status,kind,starts_on`,
          { headers },
        );
        [creado] = await res.json();
        return creado?.id ?? null;
      },
      { timeout: 15000 },
    )
    .not.toBeNull();

  expect(creado!.kind).toBe("evento");
  expect(creado!.status).toBe("active"); // nace activo, no propuesto
  expect(creado!.starts_on).toBe("2027-03-15");

  // La tarjeta se ve bajo su grupo...
  await expect(page.getByText("Fechas señaladas")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(titulo).first()).toBeVisible();

  // ...y NO enlaza a ninguna ficha. Se comprueba que la URL no cambia, no solo
  // que falte un <a>: lo que rompería de verdad es que el envoltorio condicional
  // se invierta y la tarjeta vuelva a ser un Link.
  await expect(
    page.locator(`a[href*="/actividad/"]`).filter({ hasText: titulo }),
  ).toHaveCount(0);
  const urlAntes = page.url();
  await page.getByText(titulo).first().click();
  await page.waitForTimeout(500);
  expect(page.url()).toBe(urlAntes);

  // Y su ficha, pedida a mano, da 404.
  const respuesta = await page.goto(
    `/club/test-public-club/actividad/${creado!.id}`,
  );
  expect(respuesta?.status()).toBe(404);

  // Limpieza.
  const del = await request.delete(
    `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${creado!.id}`,
    { headers },
  );
  expect(del.ok()).toBeTruthy();
  console.log("LIMPIEZA OK: evento", creado!.id, "borrado");
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npm run test:e2e -- club-evento`

> Reutiliza el dev server que ya haya en el puerto 3000. **No arranques un segundo** — si Next salta a 3001, los redirects de Supabase y los e2e dejan de funcionar. Comprobar antes: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`

Expected: 1 passed.

- [ ] **Step 3: Ejecutar la batería completa (sin regresiones)**

Run: `npm test`
Expected: todos verdes, incluidos los tests nuevos de Tasks 3 y 5.

Run: `npm run test:e2e -- club-actividad-pc propose-wizard club-activity-changes`
Expected: todos verdes. Estos tocan el asistente y la lista, que acabamos de cambiar.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-evento.spec.ts
git commit -m "test(e2e): recorrido de evento de club — creación, sin ficha, 404"
```

---

### Task 14: Verificación en navegador, doc y prod

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:**
- Consumes: todo lo anterior.

Un cambio no está «hecho» hasta que el doc canónico vuelve a ser cierto.

- [ ] **Step 1: Verificar en navegador real**

Lanzar el agente `qa-verifier` con este guion:

> Verifica los eventos de club en `/club/test-public-club?tab=actividades`: (1) el asistente ofrece la tarjeta «Evento» a un moderador; (2) su paso 2 pide solo la fecha, sin pool ni fecha de fin; (3) el evento creado aparece bajo «Fechas señaladas» con su icono de calendario morado y su fecha; (4) al hacer clic en la tarjeta no se navega a ninguna parte; (5) «Editar» cambia la fecha y se refleja sin recargar; (6) el evento aparece en «Próximas fechas» del resumen (pestaña Feed) y NO en el strip de «Actividades en marcha»; (7) «Archivar» lo saca de «Fechas señaladas». Borra al final lo que hayas creado.

Arreglar lo que aparezca antes de seguir.

- [ ] **Step 2: Aplicar las migraciones en prod**

Solo tras la verificación en dev. Aplicar en orden con `mcp__supabase-prod__apply_migration`:
1. `20260722_activity_kind_evento`
2. `20260722_club_event_rpcs`

Verificar contra los objetos reales, no contra `list_migrations`, con `mcp__supabase-prod__execute_sql`:

```sql
select
  (select count(*) from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'activity_kind' and e.enumlabel = 'evento') as kind_ok,
  (select count(*) from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'notification_type' and e.enumlabel = 'club_event_created') as notif_ok,
  (select count(*) from pg_proc
     where proname in ('create_club_event','update_club_event')) as rpcs_ok;
```

Esperado: `kind_ok=1`, `notif_ok=1`, `rpcs_ok=2`.

- [ ] **Step 3: Actualizar `data-model.md`**

En la sección 6 (actividades de club, `:197-201`) y la tabla de enums (`:240-246`):
- añadir `evento` a los valores de `activity_kind`, anotando que sus filas no usan `config`, `ends_on` ni los tres satélites;
- añadir `club_event_created` a `notification_type`;
- documentar las RPCs `create_club_event` y `update_club_event`, señalando que la segunda está restringida a `kind='evento'`;
- **actualizar la fecha de verificación de la cabecera a 2026-07-22.**

- [ ] **Step 4: Marcar el backlog**

En `docs/requirements/backlog.md`, marcar la casilla de la feature. **Solo la casilla** — la narrativa de cómo se hizo va en la spec, nunca en el backlog.

- [ ] **Step 5: Añadir la entrada de decisiones (append-only)**

Al **final** de `docs/requirements/decisiones.md`, sin reescribir ninguna anterior:

```markdown
| 2026-07-22 | **Eventos de club** (§ actividades) construidos y verificados — kind nuevo `evento` en `activity_kind` (migraciones `20260722_activity_kind_evento.sql` y `20260722_club_event_rpcs.sql`, dev y prod): actividad NO participativa con solo fecha, título y descripción, creada por moderador+ vía `create_club_event`, sin vista individual. `ActivityKindDefinition` gana `hasDetailView`; helpers puros `groupActivities` y `format-date` extraídos con tests | Ver spec 2026-07-22-club-eventos-design.md. **Kind nuevo en vez de tabla aparte, aplicando SD-8**: el calendario que viene debe leer UNA fuente de fechas de club, no un `UNION` con RLS y notificaciones duplicadas; el precio asumido son las columnas sin uso (`config`, `ends_on`, satélites vacíos) en las filas de evento. El estado **«pasado» se DERIVA** de `starts_on < today` al leer y nunca se persiste — un estado sincronizado a mano con el calendario se desincroniza. `update_club_event` lleva `and kind = 'evento'` **obligatorio**: sin él, una RPC `SECURITY DEFINER` gateada solo por rol reabre la edición arbitraria de las otras cuatro kinds que SD-8 evitó al no crear la política `UPDATE`. `hasDetailView` se hizo **requerido y no opcional con default**, para que el próximo kind tenga que decidirlo en vez de heredarlo. Al implementarlo se descubrió que `club-summary.tsx` metía los eventos en el strip de «en marcha» (comparten `status='active'`) con enlace a una ficha que da 404 — corregido con el mismo filtro que la lista. Cobertura del gate de moderador limitada a unit + RPC: solo hay una cuenta de prueba seedeada (issue abierta) |
```

- [ ] **Step 6: Abrir las issues de lo que queda fuera**

Con `mcp__github__create_issue`, una por cada punto. Escritas para quien las lea en seis meses sin este contexto:

1. **«Calendario del club: unir eventos, hitos y fechas del usuario»** — hoy hay dos consultas separadas (`getUpcomingCheckpoints` y `getUpcomingEvents`, ambas en `src/lib/clubs/activities/upcoming.ts`) que se pintan en dos bloques distintos del resumen. El calendario debe fundirlas en una línea de tiempo. Incluir por qué se dejaron separadas (spec 2026-07-22 §3.7).
2. **«e2e: un miembro raso no ve la tarjeta Evento»** — no cubierto porque solo existe un usuario de prueba seedeado (`TEST_USER_EMAIL`). Requiere seedear una segunda cuenta que sea miembro raso de `test-public-club`. Hoy el gate está cubierto por el unit de `visibleKindOptions` y por `create_club_event`, pero **nada comprueba de punta a punta que la tarjeta no se pinte**. Indicar el fichero donde iría (`e2e/club-evento.spec.ts`).
3. **«Eventos recurrentes»** — decidido no hacer ahora. Un evento es una fecha única; la repetición exige decidir si se materializan filas o se guarda una regla.
4. **«Hora del día en los eventos»** — hoy no existe ningún timestamp en el modelo de actividades (`starts_on`/`ends_on`/`due_on` son `date` pelados). Añadir hora trae la pregunta de zona horaria, que el proyecto no tiene resuelta en ninguna parte. Anotar la trampa ya documentada: `new Date()` sobre un `date` de Postgres lo lee como UTC.
5. **«RSVP / "me interesa" en eventos»** — exigiría decidir si `club_activity_participants` sirve o hace falta otra cosa. Hoy un evento no tiene participantes por diseño.

- [ ] **Step 7: Commit final**

```bash
git add docs/requirements/data-model.md docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs: sincroniza data-model, backlog y decisiones con los eventos de club"
```

- [ ] **Step 8: Higiene del entorno**

Antes de cerrar la sesión:
- `git worktree list` → los `prunable` con `git worktree prune`; borrar a mano las carpetas que sobrevivan en `.claude/worktrees/`.
- No dejar en segundo plano `next dev`, watchers de Vitest ni servidores de Playwright.
- Estado limpio = puerto 3000 libre (o un único `next dev`) y cero worktrees huérfanos.

---

## Notas de revisión del plan

**Cobertura de la spec:** §1 → Task 1+3. §2.1 → Task 1. §2.2 → Task 2. §2.3 → Task 5 (`isPastEvent`). §2.4 → Task 6. §3.1 → Task 3. §3.2 → Task 3. §3.3 → Task 7. §3.4 → Task 8. §3.5 → Task 9. §3.6 → Task 10. §3.7 → Task 11. §3.8 → Task 12. §3.9 → Task 5. §4 → Task 2 (BD) + Task 9 (cliente). §5 → Tasks 3, 5, 13. §6 → Task 4. §7 → Task 14. §8 → Task 14 Step 6.

**Divergencia consciente respecto a la spec:** la spec §5 pedía un e2e de «miembro raso no ve la tarjeta». No es realizable con una sola cuenta seedeada, así que se sustituye por unit + RPC y se abre issue. Documentado en la entrada de decisiones para que no parezca un olvido.

**Hallazgo durante la planificación, no previsto en la spec:** `club-summary.tsx` filtra `status === "active"` para el strip de «Actividades en marcha», así que los eventos habrían aparecido ahí con un enlace a una ficha que ahora da 404. Corregido en Task 11 Step 2.
