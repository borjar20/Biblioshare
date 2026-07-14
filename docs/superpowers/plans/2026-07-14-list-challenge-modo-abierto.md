# Reto por lista — modalidad sin revisionado (H3b) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un `list_challenge` pueda contar como hecho cualquier ítem que el participante ya tenga `completed` en su biblioteca, sin exigirle un pase de diario dentro de la ventana del reto.

**Architecture:** El modo vive en `club_activities.config->>'completionMode'` (`'window'` por defecto | `'any'`), el mismo jsonb que ya usan el criterio de H4 y los tiers de H2. La regla se aplica **dentro** de `get_list_challenge_progress` (SECURITY DEFINER — es la política de lectura del tablero), nunca como parámetro del cliente. Una RPC nueva y acotada, `set_activity_completion_mode`, deja que creador o `moderator+` lo cambien en **cualquier** estado, sin relajar `update_activity_config` (que congela el config de los demás kinds al activar).

**Tech Stack:** Next.js (App Router, server actions), Supabase/Postgres (RLS + RPC SECURITY DEFINER), TypeScript, next-intl, Tailwind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-list-challenge-modo-abierto-design.md`.
- Cero tablas nuevas, cero columnas nuevas. El modo va en `club_activities.config` (jsonb).
- Un reto sin la clave `completionMode` **debe** comportarse como `'window'`. Sin migración de datos.
- `update_activity_config` (H4) **no se toca**: sigue escribiendo solo en `proposed`.
- No se inventa fecha de compleción en modo `any`: sin pase de diario, `completed_on` es `null`.
- Copy en **español**, en `messages/es.json` bajo la sección `activity`. Es el único locale del proyecto.
- **`npm test` (vitest) está roto en este entorno** (Node 20.9, deuda conocida del proyecto). La verificación de este plan es: `npx tsc --noEmit`, `npm run lint`, `npm run build`, aserciones SQL contra el proyecto **dev** de Supabase, y un checklist manual (el default del proyecto para UI, ver `docs/TESTING.md`). No inventes un runner nuevo.
- Migraciones **solo al proyecto dev** de Supabase durante la implementación. Nadie aplica nada a prod en este plan.
- Todo el trabajo va en el worktree `.claude/worktrees/worktree-list-challenge-modo-abierto`, rama `worktree-worktree-list-challenge-modo-abierto`.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260714_list_challenge_completion_mode.sql` | **Se borra.** Borrador previo sin commitear, superseded. |
| `supabase/migrations/20260716_list_challenge_completion_mode.sql` | **Nuevo.** Reescribe `get_list_challenge_progress` y crea `set_activity_completion_mode`. |
| `src/lib/clubs/activities/list-challenge-types.ts` | **Modificar.** Tipo `CompletionMode`, `COMPLETION_MODES`, `readCompletionMode()`. Helpers síncronos → no pueden vivir en el módulo `"use server"`. |
| `src/lib/clubs/activities/list-challenge.ts` | **Modificar.** Server action `setCompletionMode()`. Primera mutación de un módulo hasta ahora de solo lectura. |
| `src/lib/supabase/database.types.ts` | **Regenerar.** Firma de la RPC nueva. |
| `src/components/clubs/list-challenge/list-challenge-fields.tsx` | **Nuevo.** Selector de modo en el composer (`ConfigFields` del kind). |
| `src/lib/clubs/activities/kinds/list-challenge.ts` | **Modificar.** Enchufa `ConfigFields`. |
| `src/components/clubs/list-challenge/completion-mode-editor.tsx` | **Nuevo.** Selector de modo en el panel "Modificar actividad", con `confirm` si el reto está `active`. |
| `src/components/clubs/activity-detail.tsx` | **Modificar.** Monta el editor anterior en la vista de edición. |
| `src/components/clubs/list-challenge/list-challenge-board.tsx` | **Modificar.** La línea de regla al pie del tablero depende del modo. |
| `messages/es.json` | **Modificar.** Claves nuevas bajo `activity`. |
| `docs/superpowers/plans/2026-07-14-list-challenge-modo-abierto-manual-test.md` | **Nuevo.** Checklist manual. |

---

## Task 1: Migración — la regla en SQL

**Files:**
- Delete: `supabase/migrations/20260714_list_challenge_completion_mode.sql`
- Create: `supabase/migrations/20260716_list_challenge_completion_mode.sql`

**Interfaces:**
- Consumes: `public.activity_window(uuid)`, `public.is_activity_participant(uuid)`, `public.has_min_club_role(uuid, club_role)` — ya existen.
- Produces:
  - `get_list_challenge_progress(p_activity_id uuid) → table(user_id uuid, item_type public.item_type, item_id uuid, completed_on date)` — **misma firma que H3** (por eso `create or replace` basta, sin `drop`).
  - `set_activity_completion_mode(p_activity_id uuid, p_mode text) → void`.

- [ ] **Step 1: Borrar el borrador huérfano**

Está sin commitear en el worktree y define una firma distinta (con columna `in_window`, descartada en el diseño). Si se queda, se aplicaría antes que la nueva migración y dejaría la función con la firma vieja.

```bash
rm supabase/migrations/20260714_list_challenge_completion_mode.sql
```

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/20260716_list_challenge_completion_mode.sql` con exactamente esto:

```sql
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
-- La firma NO cambia respecto a H3 -> create or replace basta, sin drop.
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
```

- [ ] **Step 3: Aplicar la migración al proyecto dev**

Usa el subagente `supabase-schema` (o el MCP de Supabase) con `apply_migration`, nombre `20260716_list_challenge_completion_mode`, contra el **proyecto dev**. No toques prod.

Esperado: aplica sin error.

- [ ] **Step 4: Verificar la regla con SQL, no con la UI**

Ejecuta contra dev (`execute_sql`). Comprueba que las dos funciones existen con la firma esperada:

```sql
select p.proname,
       pg_get_function_result(p.oid) as result,
       p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_list_challenge_progress', 'set_activity_completion_mode')
 order by p.proname;
```

Esperado: dos filas; `get_list_challenge_progress` devuelve `TABLE(user_id uuid, item_type item_type, item_id uuid, completed_on date)` (**sin** `in_window`), y ambas con `security_definer = true`.

Y que el default sea `window` para un reto sin la clave:

```sql
select coalesce('{"foo":1}'::jsonb ->> 'completionMode', 'window') as sin_clave,
       coalesce('{"completionMode":"any"}'::jsonb ->> 'completionMode', 'window') as con_clave;
```

Esperado: `sin_clave = window`, `con_clave = any`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(clubs): modalidad de compleción del reto por lista en SQL (H3b)"
```

---

## Task 2: Tipos y server action

**Files:**
- Modify: `src/lib/clubs/activities/list-challenge-types.ts`
- Modify: `src/lib/clubs/activities/list-challenge.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: `set_activity_completion_mode` (Task 1).
- Produces:
  - `type CompletionMode = "window" | "any"`
  - `const COMPLETION_MODES: readonly CompletionMode[]`
  - `function readCompletionMode(config: unknown): CompletionMode`
  - `async function setCompletionMode(activityId: string, mode: CompletionMode): Promise<void>`

- [ ] **Step 1: Regenerar los tipos de Supabase**

Con el MCP de Supabase (`generate_typescript_types`) contra **dev**, y vuelca el resultado en `src/lib/supabase/database.types.ts`.

Verifica que aparece la RPC nueva:

```bash
grep -n "set_activity_completion_mode" -A 6 src/lib/supabase/database.types.ts
```

Esperado: un bloque con `Args: { p_activity_id: string; p_mode: string }` y `Returns: undefined`.

- [ ] **Step 2: Añadir los tipos y el lector de config**

Al final de `src/lib/clubs/activities/list-challenge-types.ts`:

```ts
// Modalidad de compleción del reto (EPIC-05, Bloque H3b). Vive en
// club_activities.config->>'completionMode'.
//
//   "window" -- (default) un ítem cuenta si tienes un pase de diario terminado
//              dentro de la ventana del reto. Si ya lo leíste, toca relectura.
//   "any"    -- basta con tenerlo en la biblioteca como 'completed', sin
//              importar cuándo. Es la modalidad "sin revisionado".
export const COMPLETION_MODES = ["window", "any"] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];

// La fuente de verdad de la regla es el SQL (get_list_challenge_progress la lee
// del config por su cuenta). Esto es SOLO para pintar: qué opción sale marcada
// en el selector y qué línea de regla se muestra al pie del tablero. De ahí que
// cualquier valor inesperado (config nulo, clave ausente, basura) caiga en
// "window" -- el mismo default que el coalesce de la migración.
export function readCompletionMode(config: unknown): CompletionMode {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    if ((config as Record<string, unknown>).completionMode === "any") return "any";
  }
  return "window";
}
```

- [ ] **Step 3: Añadir la server action**

En `src/lib/clubs/activities/list-challenge.ts`, amplía el import de tipos y añade la función al final del fichero:

```ts
import type {
  CompletionMode,
  ListChallengeParticipantProgress,
  ListChallengeProgressView,
} from "./list-challenge-types";
```

```ts
// Única mutación de este módulo (EPIC-05, Bloque H3b). El progreso sigue siendo
// 100% derivado -- lo que se escribe aquí no es progreso, es la REGLA con la que
// se lee: config->>'completionMode'.
//
// Sin chequeo de rol en la app, como el resto del módulo: la autorización vive
// entera en la RPC (creador o moderator+, y solo sobre un list_challenge). A
// diferencia de updateActivityConfig, esta se puede llamar con el reto ya
// 'active' -- deliberado, ver la migración.
export async function setCompletionMode(
  activityId: string,
  mode: CompletionMode,
): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_activity_completion_mode", {
    p_activity_id: activityId,
    p_mode: mode,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Comprobar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si `set_activity_completion_mode` no existe en `database.types.ts`, el `.rpc()` falla aquí — vuelve al Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/list-challenge-types.ts src/lib/clubs/activities/list-challenge.ts src/lib/supabase/database.types.ts
git commit -m "feat(clubs): tipos y server action de la modalidad de compleción (H3b)"
```

---

## Task 3: Elegir el modo al proponer el reto

**Files:**
- Create: `src/components/clubs/list-challenge/list-challenge-fields.tsx`
- Modify: `src/lib/clubs/activities/kinds/list-challenge.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `COMPLETION_MODES`, `CompletionMode` (Task 2); el contrato `ConfigFields` de `ActivityKindDefinition` (`src/lib/clubs/activities/kinds/types.ts`): `ComponentType<{ value: Json | null; onChange: (config: Json) => void }>`.
- Produces: `ListChallengeFields`, enchufado en `listChallengeKind.ConfigFields`. El composer (`propose-wizard.tsx:268`) ya lo pinta solo — **no hay que tocar el wizard**.

- [ ] **Step 1: Añadir el copy**

En `messages/es.json`, dentro de la sección `activity`, junto a las claves `listChallenge*` (alrededor de la línea 450):

```json
    "completionMode": "Cómo cuenta un ítem",
    "completionMode_window": "Solo durante el reto",
    "completionMode_any": "También lo que ya leíste",
    "completionModeHint_window": "Un ítem se marca cuando registres un pase terminado dentro de las fechas del reto. Si ya lo habías terminado antes, cuenta una relectura.",
    "completionModeHint_any": "Cuenta cualquier ítem que ya tengas completado en tu biblioteca, aunque lo terminaras antes del reto. Nadie tiene que revisionar nada.",
```

- [ ] **Step 2: Crear el selector del composer**

`src/components/clubs/list-challenge/list-challenge-fields.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import {
  COMPLETION_MODES,
  type CompletionMode,
} from "@/lib/clubs/activities/list-challenge-types";
import { Select } from "@/components/ui/select";

// Campos de configuración del reto por lista en el composer (EPIC-05, Bloque H3b).
// Se enchufan vía ActivityKindDefinition.ConfigFields, igual que los del criterio
// de H4 -- el composer genérico no sabe nada de modalidades, solo pinta lo que el
// kind aporte y manda el config resultante a proposeActivity.
//
// La ayuda bajo el selector no es decorativa: la modalidad decide si a un miembro
// con media lista ya leída le toca revisionar. Sin ella, el selector es un enigma.
export function ListChallengeFields({
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const [mode, setMode] = useState<CompletionMode>("window");

  // `onChange` es el setState del composer (estable). El config se recompone entero
  // en cada cambio, como en CriteriaChallengeFields.
  useEffect(() => {
    onChange({ completionMode: mode } as unknown as Json);
  }, [mode, onChange]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("completionMode")}
        <Select
          value={mode}
          onChange={(e) => setMode(e.target.value as CompletionMode)}
        >
          {COMPLETION_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`completionMode_${m}`)}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t(`completionModeHint_${mode}`)}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Enchufarlo al kind**

`src/lib/clubs/activities/kinds/list-challenge.ts` queda así:

```ts
import { ListChallengeBoard } from "@/components/clubs/list-challenge/list-challenge-board";
import { ListChallengeFields } from "@/components/clubs/list-challenge/list-challenge-fields";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H3 -- reto por lista de ítems. Una lista curada (libros, pelis
// y series pueden convivir en la misma lista) y una rejilla comparativa de quién
// ha completado qué dentro de la ventana del reto. Sin tablas nuevas: el
// progreso se deriva de los pases de diario (ver src/lib/clubs/activities/
// list-challenge.ts y la migración 20260713_list_challenge.sql).
//
// itemCuration "curators": la lista ES el enunciado del reto -- solo el creador
// de la actividad y moderator+ la tocan (espejo de la política RLS
// "club_activity_items insert participant or curator").
//
// ConfigFields (Bloque H3b): la modalidad de compleción -- si un ítem exige un
// pase de diario dentro de la ventana o basta con tenerlo ya completado.
export const listChallengeKind: ActivityKindDefinition = {
  kind: "list_challenge",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "curators",
  usesItemPool: true,
  ConfigFields: ListChallengeFields,
  DetailExtension: ListChallengeBoard,
};
```

- [ ] **Step 4: Compilar y lintar**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/list-challenge/list-challenge-fields.tsx src/lib/clubs/activities/kinds/list-challenge.ts messages/es.json
git commit -m "feat(clubs): elegir la modalidad de compleción al proponer el reto (H3b)"
```

---

## Task 4: Cambiar el modo con el reto ya creado, y que el tablero lo diga

**Files:**
- Create: `src/components/clubs/list-challenge/completion-mode-editor.tsx`
- Modify: `src/components/clubs/activity-detail.tsx` (vista `editing`, líneas 83-121)
- Modify: `src/components/clubs/list-challenge/list-challenge-board.tsx` (línea de regla al pie, líneas 163-167)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `setCompletionMode`, `readCompletionMode`, `COMPLETION_MODES`, `CompletionMode` (Task 2); `ActivityStatus` de `@/lib/clubs/activities/core`; `activity.config` (ya expuesto en `ActivityDetail`).
- Produces: `CompletionModeEditor({ activityId, config, status, onChanged })`.

- [ ] **Step 1: Añadir el copy**

En `messages/es.json`, sección `activity`, junto a lo añadido en Task 3:

```json
    "completionModeConfirm": "Vas a cambiar cómo cuenta un ítem con el reto ya en marcha: el progreso de todos los participantes se recalcula al instante. ¿Seguir?",
    "completionModeError": "No se pudo cambiar la modalidad.",
    "listChallengeRuleOpen": "Cuenta cualquier ítem que tengas completado en tu biblioteca, también si lo terminaste antes del reto.",
```

- [ ] **Step 2: Crear el editor de modalidad**

`src/components/clubs/list-challenge/completion-mode-editor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityStatus } from "@/lib/clubs/activities/core";
import { setCompletionMode } from "@/lib/clubs/activities/list-challenge";
import {
  COMPLETION_MODES,
  readCompletionMode,
  type CompletionMode,
} from "@/lib/clubs/activities/list-challenge-types";
import type { Json } from "@/lib/supabase/database.types";
import { Select } from "@/components/ui/select";

// Cambiar la modalidad de compleción de un reto YA CREADO (EPIC-05, Bloque H3b).
// Vive en el panel "Modificar actividad", junto a la curación del pool y los hitos
// de buddy_read.
//
// A diferencia del config de los demás kinds (que update_activity_config congela al
// activar), esta se puede cambiar con el reto en marcha -- decisión explícita: deja
// rescatar un reto que ahuyentó a la gente por exigir revisionado. El precio es que
// el tablero de TODOS se recalcula al instante, y por eso hay confirmación cuando el
// reto ya está 'active'. En 'proposed' no la hay: no hay progreso que mover.
export function CompletionModeEditor({
  activityId,
  config,
  status,
  onChanged,
}: {
  activityId: string;
  config: Json | null;
  status: ActivityStatus;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [mode, setMode] = useState<CompletionMode>(readCompletionMode(config));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(next: CompletionMode) {
    if (next === mode) return;
    if (status === "active" && !window.confirm(t("completionModeConfirm"))) return;

    const previous = mode;
    setError(null);
    setMode(next); // optimista -- el select no debe quedarse "pegado" mientras va la RPC
    startTransition(async () => {
      try {
        await setCompletionMode(activityId, next);
        onChanged();
      } catch {
        setMode(previous);
        setError(t("completionModeError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("completionMode")}
        <Select
          value={mode}
          disabled={isPending}
          onChange={(e) => change(e.target.value as CompletionMode)}
        >
          {COMPLETION_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`completionMode_${m}`)}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t(`completionModeHint_${mode}`)}
      </p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Montarlo en el panel de edición**

En `src/components/clubs/activity-detail.tsx`, añade el import junto a los demás:

```tsx
import { CompletionModeEditor } from "./list-challenge/completion-mode-editor";
```

y, dentro del bloque `if (editing)`, justo **después** del `{activity.kind === "buddy_read" && ...}` y antes del `</div>` de cierre:

```tsx
        {/* La modalidad de compleción también se cambia aquí. Espejo de la RPC
            set_activity_completion_mode: creador o moderador, en cualquier estado. */}
        {activity.kind === "list_challenge" && (isCreator || isModerator) && (
          <CompletionModeEditor
            activityId={activity.id}
            config={activity.config}
            status={status}
            onChanged={refreshActivity}
          />
        )}
```

- [ ] **Step 4: Que el tablero diga qué regla rige**

En `src/components/clubs/list-challenge/list-challenge-board.tsx`:

Amplía el import de tipos:

```tsx
import {
  itemKey,
  readCompletionMode,
  type ListChallengeProgressView,
} from "@/lib/clubs/activities/list-challenge-types";
```

Justo antes del `return` (después de `const viewerRank = ...`):

```tsx
  const completionMode = readCompletionMode(activity.config);
```

Y sustituye el párrafo final (hoy `{t("listChallengeRule", ...)}`) por:

```tsx
      {/* Esta línea es lo que hace legible la rejilla: el progreso es DERIVADO, no
          se marca a mano -- y qué lo deriva depende de la modalidad del reto. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {completionMode === "any"
          ? t("listChallengeRuleOpen")
          : t("listChallengeRule", { start: view.windowStart, end: view.windowEnd })}
      </p>
```

- [ ] **Step 5: Compilar, lintar, construir**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Esperado: los tres sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs messages/es.json
git commit -m "feat(clubs): cambiar la modalidad de un reto en marcha y reflejarla en el tablero (H3b)"
```

---

## Task 5: Checklist manual y PR

**Files:**
- Create: `docs/superpowers/plans/2026-07-14-list-challenge-modo-abierto-manual-test.md`

- [ ] **Step 1: Escribir el checklist**

Sigue el formato de los `*-manual-test.md` que ya hay en `docs/superpowers/plans/`. Debe cubrir, como mínimo, los cinco puntos de la sección "Verificación" de la spec:

1. **Modo abierto cuenta el historial.** Con un ítem ya `completed` en tu biblioteca desde antes: proponer un `list_challenge` con "También lo que ya leíste", meterlo en la lista, activarlo, unirse → el ítem aparece **tickado** en la rejilla sin registrar nada, y el pie del tablero dice "Cuenta cualquier ítem que tengas completado…".
2. **Modo por defecto sigue exigiendo pase.** El mismo ítem en un reto con "Solo durante el reto" → aparece **sin tickar**; registrar un pase de diario terminado dentro de la ventana → pasa a tickado, y el pie muestra la frase con las fechas.
3. **Cambio en marcha.** Como moderador, con el reto en `active`, cambiar la modalidad en "Modificar actividad" → sale la confirmación; al aceptar, la rejilla, el ranking y el anillo de avance se recalculan. Al cancelar, el selector se queda como estaba.
4. **Permisos.** Un miembro que no es creador ni moderador **no ve** el selector (de hecho no entra al panel de edición de un `list_challenge`).
5. **Retrocompatibilidad.** Un `list_challenge` creado antes de este cambio (sin `completionMode` en su `config`) se comporta como "Solo durante el reto": mismo tablero y mismo pie de siempre.

- [ ] **Step 2: Commit y PR**

```bash
git add docs/superpowers/plans
git commit -m "docs(clubs): checklist manual del modo sin revisionado (H3b)"
git push -u origin worktree-worktree-list-challenge-modo-abierto
gh pr create --draft --title "feat(clubs): modalidad sin revisionado en el reto por lista (H3b)" --body "..."
```

El cuerpo de la PR: qué problema resuelve (el reto por lista obligaba a relectura), las dos modalidades, que el default no cambia para los retos existentes, y el checklist manual pendiente de pasar. Termina con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
