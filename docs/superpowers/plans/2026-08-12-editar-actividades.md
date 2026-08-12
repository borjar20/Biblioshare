# Editar una actividad de club ya creada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un moderador pueda corregir título, descripción y fechas de una actividad ya creada, y que el editor de hitos viva donde los hitos se miran.

**Architecture:** Dos mitades independientes. La primera es UI pura: `BuddyReadCheckpointEditor` se traslada de «Modificar actividad» al tablero de la actividad, y sus dos estados apagados —actividad en propuesta, pool sin ítem— pasan a tener texto propio porque dejan de estar escondidos. La segunda añade la primera escritura de cliente sobre la cabecera de `club_activities`, por RPC `security definer` como todo lo demás de esa tabla, con una server action que **devuelve un resultado discriminado y nunca lanza**.

**Tech Stack:** Next.js (App Router, RSC + client components), TypeScript, Supabase (Postgres + RLS + RPC), next-intl, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-editar-actividades-design.md`

## Global Constraints

- **Una server action NUNCA lanza para comunicar un error de negocio.** Next.js **borra el mensaje** de un `Error` lanzado desde una server action al compilar producción: llega un digest opaco. Un `catch` que mire `error.message` funciona en `next dev` y falla en silencio en producción. Se devuelve un resultado discriminado `{ ok: true } | { ok: false; code }`, exactamente como `src/lib/clubs/activities/event-follow-actions.ts`, que documenta el problema.
- **El servidor es la autoridad.** Toda validación que haga el formulario la repite la RPC. El formulario valida solo para ahorrar el viaje.
- **Migraciones: dev primero**, producción la decide el usuario y va en la última tarea. «No aparece en `list_migrations`» ≠ «no está en prod»: verificar contra `pg_proc`.
- **Antes de añadir una clave a `messages/es.json`, comprobar que el nombre no está cogido.** `JSON.parse` no avisa de duplicados (se queda con el último) y ya provocó una regresión en la rama hermana: `startsOn`/`endsOn` parecían nuevas y eran las etiquetas del asistente de proponer.
- **Un fichero `"use client"` exporta componentes, no utilidades que llame también el servidor.** Eso provocó un 500 en la rama hermana (#595): en Next 16 la directiva convierte hasta una función pura en referencia de cliente. Lo compartido va a un módulo sin directiva.
- Un solo locale: `messages/es.json`. Nada de texto literal en JSX.
- Fechas de Postgres (`date`): comparar como cadenas ISO o partir a mano. Nunca `new Date("2026-08-16")` — se interpreta como UTC y puede retroceder un día.
- Comentarios en castellano explicando el porqué. No pasar prettier: el repo no tiene config y formatear genera cientos de líneas de ruido.
- Node: el shell arranca con v20 y rompe vitest. `fnm use 22` antes de `npm test`; confirmar con `node --version`.
- Un solo `next dev`, en el puerto 3000. `npm run test:e2e` reutiliza el que haya.

---

### Task 1: La RPC `update_activity_details`

**Files:**
- Create: `supabase/migrations/20260854_update_activity_details.sql`

**Interfaces:**
- Produces: `public.update_activity_details(p_activity_id uuid, p_title text, p_description text, p_starts_on date, p_ends_on date) returns void`. La consume Task 2.
- Códigos de error que levanta, y que Task 2 traduce: `not_found`, `use_update_club_event`, `forbidden`, `dates_frozen`, `title_required`, `invalid_range`.

- [ ] **Step 1: Confirmar el número de migración libre**

```bash
ls supabase/migrations | tail -3
```
Expected: la última es `20260853_activities_progress.sql` (la trae la rama hermana, PR #598). Si hubiera algo posterior, usar el siguiente libre y ajustar el nombre en todos los pasos.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/20260854_update_activity_details.sql`:

```sql
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
```

- [ ] **Step 3: Aplicar en DEV**

Con `mcp__supabase-dev__apply_migration`, nombre `update_activity_details`, el contenido del fichero.

**Si las herramientas MCP de Supabase no están disponibles en tu sesión**, no improvises otra vía: deja el fichero committeado, dilo en el informe y marca el paso como no ejecutado. Aplicar una migración por un canal distinto del acordado es peor que no aplicarla.

Expected: sin error.

- [ ] **Step 4: Verificar el objeto y sus permisos**

Con `mcp__supabase-dev__execute_sql`:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef, p.provolatile, p.proconfig,
       (select string_agg(pg_get_userbyid(e.grantee) || '=' || e.privilege_type, ', ')
          from aclexplode(p.proacl) e) as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'update_activity_details';
```

Expected: `prosecdef = true`, `proconfig = {search_path=public}`, y en `permisos` **`authenticated`, y NO `anon`**.

- [ ] **Step 5: Probar los seis códigos de error contra dev**

En UNA llamada envuelta en `begin; … rollback;` para no dejar basura, siembra un club con dos usuarios (uno moderador, otro miembro raso que crea una actividad) y comprueba cada caso. Simula sesión con `set_config('request.jwt.claim.sub', '<uuid>', false)`.

Los **dos que se cuelan con facilidad** y hay que probar a propósito:

- **Creador NO moderador, actividad ya `active`** → `forbidden` (no `dates_frozen`).
- **Un `kind = 'evento'`** → `use_update_club_event`, no un update silencioso.

Y los otros cuatro: id inexistente → `not_found`; extraño al club → `forbidden`; actividad `finished` con un moderador → `dates_frozen`; título con solo espacios → `title_required`; `p_ends_on` anterior a `p_starts_on` → `invalid_range`.

Comprueba además el **camino feliz**: moderador sobre una activa cambia los cuatro campos y la fila queda con los valores nuevos, con `description` a `null` si se manda cadena vacía.

Expected: cada caso levanta su código exacto. Si alguno levanta otro, **para y repórtalo** — el orden de los gates es parte del diseño.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260854_update_activity_details.sql
git commit -m "feat(db): RPC para editar título, descripción y fechas de una actividad"
```

---

### Task 2: Validación pura y server action

**Files:**
- Create: `src/lib/clubs/activities/activity-details.ts`
- Test: `src/lib/clubs/activities/activity-details.test.ts`
- Modify: `src/lib/clubs/activities/core.ts` (añadir la server action al final)

**Interfaces:**
- Consumes: la RPC de Task 1.
- Produces, en `activity-details.ts` (módulo **sin** directiva, lo usan formulario y servidor):
  ```ts
  export type ActivityDetailsError =
    | "not_found" | "use_update_club_event" | "forbidden"
    | "dates_frozen" | "title_required" | "invalid_range" | "unknown";
  export type ActivityDetailsResult = { ok: true } | { ok: false; code: ActivityDetailsError };
  export type ActivityDetailsInput = {
    title: string; description: string; startsOn: string; endsOn: string;
  };
  export function validateActivityDetails(input: ActivityDetailsInput): ActivityDetailsError | null;
  ```
- Produces, en `core.ts`:
  ```ts
  export async function updateActivityDetails(
    activityId: string, input: ActivityDetailsInput,
  ): Promise<ActivityDetailsResult>;
  ```
  Las consumen Tasks 3 y 4.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/clubs/activities/activity-details.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateActivityDetails } from "./activity-details";

const base = { title: "Salitre y Cenizas", description: "", startsOn: "", endsOn: "" };

describe("validateActivityDetails", () => {
  it("lo válido no da error", () => {
    expect(validateActivityDetails(base)).toBeNull();
  });

  it("el título vacío no vale", () => {
    expect(validateActivityDetails({ ...base, title: "" })).toBe("title_required");
  });

  it("un título de solo espacios tampoco: se recorta antes de mirar", () => {
    expect(validateActivityDetails({ ...base, title: "   " })).toBe("title_required");
  });

  it("la ventana invertida no vale", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2026-09-01", endsOn: "2026-08-01" }),
    ).toBe("invalid_range");
  });

  it("mismo día de inicio y fin SÍ vale: una actividad de un día", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2026-08-01", endsOn: "2026-08-01" }),
    ).toBeNull();
  });

  it("solo una de las dos fechas vale: no hay rango que invertir", () => {
    expect(validateActivityDetails({ ...base, endsOn: "2026-08-01" })).toBeNull();
    expect(validateActivityDetails({ ...base, startsOn: "2026-08-01" })).toBeNull();
  });

  it("una fecha de fin en el PASADO vale: cerrar algo con la fecha en que terminó", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2020-01-01", endsOn: "2020-02-01" }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- src/lib/clubs/activities/activity-details.test.ts`
Expected: FAIL — `Failed to resolve import "./activity-details"`.

- [ ] **Step 3: Escribir el módulo compartido**

`src/lib/clubs/activities/activity-details.ts`. **Sin `"use client"` ni `"use server"`**: lo importan el formulario (cliente) y la acción (servidor), y una directiva aquí rompería uno de los dos (#595).

```ts
// Edición de la cabecera de una actividad: los tipos y la validación que
// comparten el formulario y la server action.
//
// Vive en un módulo SIN directiva a propósito. Con "use client", Next 16
// convierte hasta una función pura en referencia de cliente y llamarla desde el
// servidor devuelve un 500 en tiempo de ejecución que ni tsc ni next build
// detectan (#595).

/** Los códigos que levanta la RPC, más el cajón de sastre. La UI los traduce. */
export type ActivityDetailsError =
  | "not_found"
  | "use_update_club_event"
  | "forbidden"
  | "dates_frozen"
  | "title_required"
  | "invalid_range"
  | "unknown";

export type ActivityDetailsResult = { ok: true } | { ok: false; code: ActivityDetailsError };

/** Tal como salen del formulario: cadenas, con "" para "sin fecha". */
export type ActivityDetailsInput = {
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
};

// La MISMA regla que la RPC, adelantada al formulario para no hacer el viaje.
// La autoridad sigue siendo el SQL: esto solo ahorra una ida y vuelta.
//
// Las fechas se comparan como cadenas ISO, que ordenan igual que
// cronológicamente -- ningún Date entra aquí (un `date` de Postgres no lleva
// zona y pasarlo por Date puede retroceder un día).
export function validateActivityDetails(input: ActivityDetailsInput): ActivityDetailsError | null {
  if (input.title.trim() === "") return "title_required";
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) return "invalid_range";
  return null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- src/lib/clubs/activities/activity-details.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Escribir la server action**

Al final de `src/lib/clubs/activities/core.ts`. Fíjate en que **no lanza**: devuelve el resultado.

```ts
import {
  validateActivityDetails,
  type ActivityDetailsError,
  type ActivityDetailsInput,
  type ActivityDetailsResult,
} from "./activity-details";

const DETAILS_CODIGOS: ReadonlySet<string> = new Set<ActivityDetailsError>([
  "not_found",
  "use_update_club_event",
  "forbidden",
  "dates_frozen",
  "title_required",
  "invalid_range",
]);

// Editar la cabecera de una actividad (spec 2026-08-12, #596).
//
// NO LANZA, y no es estilo: Next.js BORRA el mensaje de un Error lanzado desde
// una server action al compilar producción (llega un digest opaco), así que un
// catch que mire error.message funciona en dev y falla en silencio en prod.
// Mismo patrón que event-follow-actions.ts, que documenta el problema.
export async function updateActivityDetails(
  activityId: string,
  input: ActivityDetailsInput,
): Promise<ActivityDetailsResult> {
  // Se valida también aquí, antes del viaje. La autoridad sigue siendo el SQL.
  const local = validateActivityDetails(input);
  if (local) return { ok: false, code: local };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_activity_details", {
    p_activity_id: activityId,
    p_title: input.title,
    p_description: input.description,
    // "" es "sin fecha": la columna es nullable y el formulario manda cadena.
    p_starts_on: input.startsOn || null,
    p_ends_on: input.endsOn || null,
  });

  if (error) {
    const raw = error.message?.trim() ?? "";
    if (DETAILS_CODIGOS.has(raw)) return { ok: false, code: raw as ActivityDetailsError };
    console.error("updateActivityDetails failed", error);
    return { ok: false, code: "unknown" };
  }

  revalidateClubPages();
  return { ok: true };
}
```

- [ ] **Step 6: Regenerar SOLO la entrada de tipos de la función nueva**

**NO regeneres `src/lib/supabase/database.types.ts` entero.** Ese fichero lleva parches a mano deliberados, con su comentario al lado, que el generador borra —Postgres no declara la nulabilidad de los parámetros de función—, y regenerarlo ya rompió el typecheck en la rama hermana.

Añade a mano, en `Functions`, **en su sitio alfabético**:

```ts
      update_activity_details: {
        Args: {
          p_activity_id: string
          p_title: string
          p_description: string | null
          p_starts_on: string | null
          p_ends_on: string | null
        }
        Returns: undefined
      }
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/clubs/activities/activity-details.ts src/lib/clubs/activities/activity-details.test.ts src/lib/clubs/activities/core.ts src/lib/supabase/database.types.ts
git commit -m "feat(actividades): acción para editar título, descripción y fechas"
```

---

### Task 3: El panel de edición

**Files:**
- Create: `src/components/clubs/activity-details-editor.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `updateActivityDetails` y `ActivityDetailsInput` de Task 2; `ClubActivity` de `./core`.
- Produces: `<ActivityDetailsEditor activity={activity} onChanged={fn} />`. La consume Task 4.

- [ ] **Step 1: Comprobar que las claves nuevas no están cogidas**

```bash
node -e "const a=require('./messages/es.json').activity; ['detailsTitle','detailsSave','detailsSaving','detailsWindowWarning','detailsError_forbidden','detailsError_dates_frozen','detailsError_invalid_range','detailsError_title_required','detailsError_not_found','detailsError_use_update_club_event','detailsError_unknown'].forEach(k=>console.log(k, k in a ? 'YA EXISTE' : 'libre'))"
```
Expected: las once `libre`. Si alguna existe, **para**: reutilizar un nombre con otro significado rompe la pantalla que ya lo usaba (pasó con `startsOn`/`endsOn` en la rama hermana).

`titleLabel`, `descriptionLabel`, `descriptionPlaceholder`, `startsOn` y `endsOn` **ya existen** y se reutilizan tal cual: son las mismas etiquetas del asistente de proponer.

- [ ] **Step 2: Añadir las claves**

Dentro del objeto `activity` de `messages/es.json`:

```json
"detailsTitle": "Título y fechas",
"detailsSave": "Guardar cambios",
"detailsSaving": "Guardando...",
"detailsWindowWarning": "Cambiar las fechas recalcula el progreso de todos los participantes: la ventana decide qué lecturas cuentan para el reto.",
"detailsError_forbidden": "No tienes permiso para editar esta actividad.",
"detailsError_dates_frozen": "Una actividad terminada ya no se puede editar.",
"detailsError_invalid_range": "La fecha de fin no puede ser anterior a la de inicio.",
"detailsError_title_required": "El título no puede estar vacío.",
"detailsError_not_found": "Esta actividad ya no existe.",
"detailsError_use_update_club_event": "Un evento se edita desde su propia ficha.",
"detailsError_unknown": "Algo falló. Inténtalo de nuevo.",
```

Son **siete**, una por cada valor de `ActivityDetailsError`. Las dos últimas de la lista no deberían verse nunca desde este panel —no se monta sobre un evento, y la actividad se acaba de cargar— pero el tipo las admite, así que tienen texto: una clave que falta se pinta como el nombre de la clave en crudo.

Verifica que el JSON sigue siendo válido:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"
```

- [ ] **Step 3: Escribir el componente**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { updateActivityDetails } from "@/lib/clubs/activities/core";
import type { ActivityDetailsError } from "@/lib/clubs/activities/activity-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// Panel de "Modificar actividad" para la cabecera: título, descripción y las dos
// fechas. Hasta ahora esos cuatro campos solo eran editables en un evento.
//
// Los kinds cuyo PROGRESO depende de la ventana temporal llevan un aviso; los
// demás no. Un aviso que no aplica enseña a ignorar los avisos.
const AVISA_VENTANA = new Set(["list_challenge", "criteria_challenge"]);

export function ActivityDetailsEditor({
  activity,
  onChanged,
}: {
  activity: ClubActivity;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [title, setTitle] = useState(activity.title);
  const [description, setDescription] = useState(activity.description ?? "");
  const [startsOn, setStartsOn] = useState(activity.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(activity.endsOn ?? "");
  const [error, setError] = useState<ActivityDetailsError | null>(null);
  const [isPending, startTransition] = useTransition();

  // Solo si el progreso YA está corriendo: en una propuesta no hay nada que
  // recalcular todavía.
  const avisaVentana = AVISA_VENTANA.has(activity.kind) && activity.status === "active";

  function guardar() {
    setError(null);
    startTransition(async () => {
      const result = await updateActivityDetails(activity.id, {
        title,
        description,
        startsOn,
        endsOn,
      });
      if (result.ok) onChanged();
      else setError(result.code);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="label-section">{t("detailsTitle")}</h2>

      <Field label={t("titleLabel")} htmlFor="details-title" required>
        <Input
          id="details-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor="details-description">
        <textarea
          id="details-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </Field>

      <div className="flex gap-2">
        <Field label={t("startsOn")} htmlFor="details-starts">
          <Input
            id="details-starts"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("endsOn")} htmlFor="details-ends">
          <Input
            id="details-ends"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>

      {avisaVentana && (
        <p className="rounded-card border border-gold/40 bg-gold/5 px-3 py-2 text-[12.5px] text-muted-foreground">
          {t("detailsWindowWarning")}
        </p>
      )}

      {error && (
        <p className="text-sm text-status-dropped">{t(`detailsError_${error}`)}</p>
      )}

      <Button
        type="button"
        className="self-start px-3.5 py-2 text-xs"
        disabled={isPending}
        onClick={guardar}
      >
        {isPending ? t("detailsSaving") : t("detailsSave")}
      </Button>
    </div>
  );
}
```

**Ojo con `t(\`detailsError_${error}\`)`:** el `t` de next-intl acepta solo claves que existen, así que una clave construida no tipa. Si `tsc` se queja, envuelve **en esa línea** con `t(\`detailsError_${error}\` as never)` y deja el comentario de por qué — es el mismo patrón, y por el mismo motivo, que ya usa `activity-card-large.tsx`. Las siete claves posibles quedan todas creadas en el Step 2, así que el `as never` no está tapando ninguna que falte.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-details-editor.tsx messages/es.json
git commit -m "feat(actividades): panel para editar título, descripción y fechas"
```

---

### Task 4: Montar el panel y sacar los hitos de «Modificar actividad»

**Files:**
- Modify: `src/components/clubs/activity-detail.tsx` (bloque `if (editing)`, hoy en las líneas 205-254)

**Interfaces:**
- Consumes: `<ActivityDetailsEditor>` de Task 3.
- Produces: la vista «Modificar actividad» sin el bloque de hitos, que Task 5 monta en el tablero.

- [ ] **Step 1: Añadir el import y el panel**

Import, junto a los que ya hay:

```tsx
import { ActivityDetailsEditor } from "./activity-details-editor";
```

Dentro del `if (editing)`, **encima** de `<ActivityItemPool …>`:

```tsx
        <ActivityDetailsEditor activity={activity} onChanged={refreshActivity} />
```

- [ ] **Step 2: Quitar el bloque de hitos**

Borrar de esa misma vista:

```tsx
        {/* Los hitos de la lectura conjunta también se gestionan aquí: el
            board del detalle solo los lista. */}
        {activity.kind === "buddy_read" && isModerator && (
          <BuddyReadCheckpointEditor activityId={activity.id} status={status} />
        )}
```

y su import (`import { BuddyReadCheckpointEditor } from "./checkpoints/checkpoint-editor";`). La Task 5 lo monta en el tablero, que es donde los hitos se miran.

- [ ] **Step 3: Verificar que no queda ningún uso huérfano**

```bash
grep -rn "BuddyReadCheckpointEditor" src/
```
Expected: solo su definición en `checkpoint-editor.tsx`. Que de momento no lo monte nadie es lo esperado: lo hace la Task 5.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-detail.tsx
git commit -m "feat(actividades): el panel de cabecera entra en Modificar, los hitos salen"
```

---

### Task 5: Los hitos, en el tablero

La tarea que cierra #597. Al sacar el editor a un sitio visible, sus dos estados apagados dejan de estar escondidos y necesitan texto propio: **un control muerto sin explicación es peor que ningún control**, y era medio problema de partida.

**Files:**
- Modify: `src/components/clubs/checkpoints/buddy-read-checkpoints.tsx`
- Modify: `src/components/clubs/checkpoints/checkpoint-editor.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `BuddyReadCheckpointEditor` (`checkpoint-editor.tsx`), que ya existe y **no se reescribe**.
- Produces: el tablero con la gestión de hitos dentro, para moderadores.

- [ ] **Step 1: Comprobar y añadir las claves nuevas**

```bash
node -e "const a=require('./messages/es.json').activity; ['checkpointsFrozenInProposal'].forEach(k=>console.log(k, k in a ? 'YA EXISTE' : 'libre'))"
```
Expected: `libre`.

`checkpointsPickItemFirst` **ya existe** («Elige primero el ítem de la lectura para poder añadir hitos.») y se reutiliza.

Añadir dentro de `activity`:

```json
"checkpointsFrozenInProposal": "Los hitos se pueden añadir y editar cuando el club active la actividad.",
```

Verificar el JSON con `node -e "JSON.parse(...)"` como en la Task 3.

- [ ] **Step 2: Que el editor explique sus estados apagados**

En `src/components/clubs/checkpoints/checkpoint-editor.tsx`, el componente devuelve hoy `null` si no hay ítem, y pasa `disabled` al manager si la actividad no está activa. Los dos casos van a estar a la vista de todos los moderadores, así que se explican.

Sustituir el cuerpo (dejando el `useEffect`/`refresh` como están):

```tsx
  if (!view) return null;

  // Sin ítem en el pool no hay posiciones que medir, así que no hay hitos que
  // crear. Antes esto devolvía null sin más: escondido dentro de "Modificar
  // actividad" pasaba desapercibido, pero en el tablero deja un hueco mudo.
  if (!view.itemType) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="label-section">{t("checkpoints")}</h2>
        <p className="text-[12.5px] text-muted-foreground">
          {t("checkpointsPickItemFirst")}
        </p>
      </div>
    );
  }

  const congelado = status !== "active";

  return (
    <div className="flex flex-col gap-2">
      <h2 className="label-section">{t("checkpoints")}</h2>
      {/* La RLS solo permite tocar hitos con la actividad ACTIVE
          (20260713_activity_checkpoints.sql:225-250). Se dice, en vez de dejar
          unos controles apagados sin explicación. */}
      {congelado && (
        <p className="text-[12.5px] text-muted-foreground">
          {t("checkpointsFrozenInProposal")}
        </p>
      )}
      <CheckpointManager
        activityId={activityId}
        itemType={view.itemType}
        checkpoints={view.checkpoints}
        disabled={congelado}
        onChanged={onChanged}
      />
    </div>
  );
```

Y actualizar el comentario de cabecera del fichero, que dice que vive en «Modificar actividad»: ahora vive en el tablero.

- [ ] **Step 3: Montarlo en el tablero**

En `src/components/clubs/checkpoints/buddy-read-checkpoints.tsx`:

Import:
```tsx
import { BuddyReadCheckpointEditor } from "./checkpoint-editor";
```

`isModerator` **ya está en las props y no se usaba** — ahora sí. Cambiar la desestructuración:

```tsx
export function BuddyReadCheckpoints({ activity, isModerator, Layout, railExtra }: {
```

Y en el `body` del `Layout`, debajo de `<CheckpointList …>`:

```tsx
      body={
        <div className="flex flex-col gap-3">
          <h2 className="label-section">
            {t("checkpoints")}
          </h2>
          <CheckpointList
            itemType={view.itemType}
            checkpoints={view.checkpoints}
            groupSafeOrder={view.groupSafeOrder}
            onChanged={refresh}
            clubId={activity.clubId}
            knownUsernames={view.knownUsernames}
            viewerIsParticipant={activity.viewerIsParticipant}
          />

          {/* Los hitos se gestionan DONDE SE MIRAN (spec 2026-08-12, #597).
              Antes se veían aquí y se editaban en "Modificar actividad", detrás
              de un botón que no mencionaba los hitos: un moderador con permiso
              concluyó que la función no existía. */}
          {isModerator && (
            <BuddyReadCheckpointEditor
              activityId={activity.id}
              status={activity.status}
              onChanged={refresh}
            />
          )}
        </div>
      }
```

**Ojo:** el editor tenía su propio `refresh` interno y ahora recibe `onChanged` del tablero, para que al añadir un hito se refresque **la lista de arriba** y no solo su copia. Comprueba la firma real de `BuddyReadCheckpointEditor` antes de pasarle `onChanged`: si hoy no la acepta, añádesela y que llame a su `refresh` propio **y** al de fuera. Dos vistas del mismo dato refrescándose por separado divergen en cuanto alguien crea un hito.

Actualizar también el comentario de cabecera del fichero, que dice «Solo lectura: el alta/edición de hitos vive en "Modificar actividad"».

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Comprobarlo en el navegador, contra build de producción**

```bash
npm run build && npm start
```

Abrir una lectura conjunta activa de un club donde seas moderador y comprobar: los hitos se gestionan desde el tablero, sin pasar por «Modificar actividad»; al añadir uno, la lista de arriba lo refleja; y en una actividad en propuesta sale el texto en vez de controles apagados sin explicación.

Si no puedes autenticarte, **dilo en el informe** en vez de darlo por bueno.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/checkpoints/buddy-read-checkpoints.tsx src/components/clubs/checkpoints/checkpoint-editor.tsx messages/es.json
git commit -m "feat(actividades): los hitos se gestionan donde se miran"
```

---

### Task 6: e2e

**Files:**
- Create: `e2e/club-editar-actividad.spec.ts`

- [ ] **Step 1: Copiar el arranque de sesión de un spec existente**

Run: `sed -n '1,60p' e2e/club-activities-page.spec.ts`

Copia de ahí el patrón de login y de siembra/limpieza de datos por REST. **No inventes fixtures.** Ese spec siembra en `beforeAll` y limpia en `afterAll`; haz lo mismo con un club propio de slug único.

- [ ] **Step 2: Escribir el spec**

Dos comprobaciones, que son exactamente las dos issues:

```ts
test("un moderador cambia la fecha de fin y se ve en la pestaña Actividades", async ({ page }) => {
  await page.goto(`/club/${CLUB_SLUG}/actividad/${ACTIVITY_ID}`);
  await page.getByRole("button", { name: "Modificar" }).click();

  await page.locator("#details-ends").fill("2026-12-24");
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
  await expect(page.locator("#en-curso")).toContainText("24 dic");
});

test("los hitos se gestionan desde el tablero, sin pasar por Modificar", async ({ page }) => {
  await page.goto(`/club/${CLUB_SLUG}/actividad/${ACTIVITY_ID}`);
  // Sin pulsar "Modificar": el editor tiene que estar aquí.
  await expect(page.getByPlaceholder(/Nombre del hito/)).toBeVisible();
});
```

Ajusta `CLUB_SLUG`, `ACTIVITY_ID` y los textos a lo que use la suite. El placeholder del segundo test sale de la clave `checkpointLabelPlaceholder`, que ya existe.

La actividad de prueba tiene que ser `buddy_read`, `active`, con **un ítem en el pool** (sin ítem el editor de hitos no se pinta, por diseño), y tú tienes que ser moderador de ese club.

- [ ] **Step 3: Correr los e2e**

Run: `npm run test:e2e -- e2e/club-editar-actividad.spec.ts`
Expected: PASS.

Reutiliza el `next dev` que haya en el 3000. **Si el cambio movió módulos de sitio, arranca el servidor DESPUÉS del último commit**: un servidor con el bundle viejo da resultados que no significan nada (pasó en la rama hermana y costó una ejecución entera).

Si algún test falla, **no toques código de producto para que pase**: reporta el error literal y tu diagnóstico de si le falla al test o a la pantalla.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-editar-actividad.spec.ts
git commit -m "test(e2e): editar la fecha de fin y gestionar hitos desde el tablero"
```

---

### Task 7: Docs, issues y producción

Sin esto el cambio no está hecho: un doc canónico que ha dejado de ser cierto es peor que no tenerlo.

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: `data-model.md`**

Documentar `update_activity_details(uuid, text, text, date, date)`: qué campos toca, quién puede (moderator+ siempre, creador solo en `proposed`), hasta cuándo (`proposed`/`active`; finalizada y archivada congeladas y por qué), que los eventos van por `update_club_event`, y la lista de códigos de error. Actualizar la fecha de verificación de la cabecera y decir si está en dev, en prod o en las dos.

- [ ] **Step 2: `decisiones.md`**

**Al final** (append-only, no reescribir las anteriores), dos entradas:

- Por qué el creador que no modera pierde el control al activarse la actividad, incluido el título.
- Por qué los hitos se editan en el tablero y no en «Modificar actividad».

- [ ] **Step 3: Cerrar las issues**

Cerrar **#596** con el commit que la resuelve.

Cerrar **#597** diciendo explícitamente que **su diagnóstico de partida era incorrecto**: los helpers de escritura existían (`checkpoints.ts:174-241`) y sus políticas RLS los permitían; lo que fallaba era el acceso, no el permiso. Un diagnóstico equivocado que sobrevive en el repo manda a la siguiente persona en dirección contraria, y en este proyecto ya ha pasado dos veces (#106 y #117).

- [ ] **Step 4: Producción**

**Solo cuando el usuario lo pida.** Aplicar `20260854_update_activity_details.sql` con `mcp__supabase-prod__apply_migration` y verificar contra los objetos reales, nunca contra el ledger:

```sql
select proname, prosecdef, proconfig from pg_proc
 where proname = 'update_activity_details';
```
Expected: una fila, `prosecdef = true`.

Comprobar además los permisos: `authenticated` sí, `anon` **no**.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/
git commit -m "docs: sincronizar data-model y decisiones con la edición de actividades"
```

---

## Notas de revisión del plan

Repasado contra la spec: cubiertas §1.1 y D1 (Tasks 4 y 5), §1.2 y D2/D3/D4/D5 (Task 1), §3 (Tasks 1 y 2), §4 (Task 3), §5 (todas), §6 (Tasks 2, 6 y 7).

Tres puntos donde el implementador tiene que mirar el código y no fiarse del plan, marcados en su paso:

1. **Task 5, Step 3** — la firma real de `BuddyReadCheckpointEditor`: hoy refresca solo su copia, y al montarlo junto a la lista hacen falta los dos refrescos o las dos vistas divergen.
2. **Task 3, Step 3** — si `tsc` acepta la clave de traducción construida; si no, el `as never` acotado a esa línea.
3. **Task 1, Step 3** — si las herramientas MCP de Supabase no están disponibles, se deja el fichero y se dice, no se busca otra vía.
