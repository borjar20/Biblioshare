# EPIC-05 Bloque H4 — Reto por criterio (`criteria_challenge`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el cuarto tipo de actividad de club — un reto definido por criterio (tipo + meta + género + saga) con leaderboard competitivo o meta colectiva cooperativa, con el progreso 100% derivado de `diary_entries`.

**Architecture:** Cero tablas nuevas. El criterio vive en `club_activities.config` (jsonb, primer consumidor real de ese campo). Una RPC `SECURITY DEFINER` **deliberadamente tonta** (`get_activity_diary_passes`) actúa como política de lectura del tablero — solo lee, no cuenta — para que los participantes con perfil privado no salgan en 0. El conteo se queda en `countForChallenge` (TS, `src/lib/challenges/match.ts`), reutilizado sin duplicarse.

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + RLS), TypeScript, next-intl, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-13-epic05-bloque-h4-criteria-challenge-design.md`

## Global Constraints

- **Worktree:** `.claude/worktrees/epic05-bloque-h4-criteria-challenge`, rama `worktree-epic05-bloque-h4-criteria-challenge` (ya creado, basado en `origin/main`).
- **Supabase dev** (`tyvzpuhxfwxrnkcpzxyg`): SQL vía Management API con `$SUPABASE_ACCESS_TOKEN` (`POST https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query`, body `{"query": "..."}`). **El MCP de Supabase apunta a PROD** (`vmutcradmodhiltuohys`) — usarlo solo para aplicar a prod al final. `jq` no está instalado; construir JSON con `node -e`.
- **Convención de verificación** (`docs/TESTING.md`): checklist manual en navegador ejecutada por el humano, **no** E2E automático.
- **Tras regenerar `src/lib/supabase/database.types.ts`**: reaplicar siempre a mano `reorder_queue: { Args: { entry_ids: string[]; target_queue: string | null } }` — el generador lo emite no-null.
- **Sin notificaciones** en este bloque: ningún valor nuevo en `notification_type` (razón estructural, §6 del spec).
- **Comentarios en español**, como el resto del código de este epic.

---

### Task 1: Migración — ventana renombrada + RPC lectora + RPC de config

**Files:**
- Create: `supabase/migrations/20260714_criteria_challenge.sql`
- Modify: `src/lib/clubs/activities/list-challenge.ts:42` (la llamada a la RPC renombrada)
- Modify: `supabase/schema-baseline.sql` (append)
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces (SQL): `activity_window(p_activity_id uuid) returns table (window_start date, window_end date)` — renombre de `list_challenge_window`, ya no específica de un kind.
- Produces (SQL): `get_activity_diary_passes(p_activity_id uuid) returns table (user_id uuid, item_type item_type, item_id uuid, finished_on date)`.
- Produces (SQL): `update_activity_config(p_activity_id uuid, p_config jsonb) returns void`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260714_criteria_challenge.sql`:

```sql
-- EPIC-05 Bloque H4 — Reto por criterio (criteria_challenge). Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h4-criteria-challenge-design.md
--
-- Cuarto tipo del motor de actividades de club, y **primer consumidor real de
-- club_activities.config** -- el campo jsonb que SD-8 reservó y que ni H1 (buddy_read) ni H3
-- (list_challenge) llegaron a tocar. Cero tablas nuevas: el progreso es 100% derivado de
-- diary_entries, igual que en H3.

-- ── 1. La ventana deja de ser específica de un kind ──────────────────────────
-- list_challenge_window() (Bloque H3) calcula coalesce(starts_on, created_at) ..
-- coalesce(ends_on, hoy). H4 necesita exactamente la misma regla, así que se renombra a
-- activity_window() y la regla del coalesce sigue existiendo UNA SOLA VEZ (sin deriva).
-- H3 pasa a llamar al nombre nuevo (src/lib/clubs/activities/list-challenge.ts).
create or replace function public.activity_window(p_activity_id uuid)
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

comment on function public.activity_window(uuid) is 'Ventana temporal efectiva de una actividad de club: coalesce(starts_on, created_at) .. coalesce(ends_on, hoy). Fuente única de la regla -- la usan get_list_challenge_progress (H3) y get_activity_diary_passes (H4).';

revoke execute on function public.activity_window(uuid) from public, anon;
grant execute on function public.activity_window(uuid) to authenticated;

-- get_list_challenge_progress (H3) referenciaba list_challenge_window por nombre: se recrea
-- apuntando al nombre nuevo. Cuerpo idéntico por lo demás.
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
      cross join lateral public.activity_window(ca.id) w
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

drop function if exists public.list_challenge_window(uuid);

-- ── 2. La RPC lectora del tablero ────────────────────────────────────────────
--
-- SECURITY DEFINER a propósito, por la misma razón que en H3: la RLS de diary_entries/
-- library_entries pasa por can_view_profile(), así que un participante con PERFIL PRIVADO
-- sería invisible para sus compañeros y su fila del leaderboard saldría en 0 -- un falso
-- negativo silencioso. Esta función ES la política de lectura del tablero, y materializa Q5
-- ("unirte a una actividad = consentir compartir tu progreso DENTRO de ella").
--
-- DELIBERADAMENTE TONTA: solo LEE, no cuenta. El filtrado por tipo/género/saga y el conteo
-- se quedan en countForChallenge (src/lib/challenges/match.ts), el mismo motor ya testeado
-- que usa el reto personal (§7.10) -- sin duplicar el matcher en SQL, donde acabaría
-- separándose de la versión TS con el tiempo.
--
-- Escala: devuelve TODOS los pases de los participantes en la ventana, no solo los que casan
-- el criterio. A escala de club (decenas de participantes x decenas de pases) es trivial. Si
-- algún día se volviera caro, el camino de escalada es mover el filtro por item_type (el
-- único que no necesita joins de catálogo) al SQL -- no reescribir el matcher entero.
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, finished_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, le.item_type, le.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.library_entries le on le.user_id = p.user_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$$;

comment on function public.get_activity_diary_passes(uuid) is 'Pases de diario crudos de todos los participantes de un criteria_challenge, dentro de la ventana del reto (EPIC-05 Bloque H4). SECURITY DEFINER a propósito -- ES la política de lectura del tablero (los perfiles privados deben ser visibles a sus compañeros de actividad, Q5). Solo lee: el conteo por criterio vive en TS (countForChallenge).';

revoke execute on function public.get_activity_diary_passes(uuid) from public, anon;
grant execute on function public.get_activity_diary_passes(uuid) to authenticated;

-- ── 3. Escribir el criterio (config) ─────────────────────────────────────────
--
-- Bloque G NO dejó ninguna política UPDATE de cliente sobre club_activities ("las
-- transiciones de estado son RPC-only"), así que editar config tiene que ir por RPC, no por
-- un UPDATE gateado por RLS.
--
-- Dos condiciones, revalidadas en servidor:
--   (a) llamante = creador de la actividad O moderator+ del club;
--   (b) status = 'proposed'  -- el criterio se CONGELA al activar: si la meta cambiara a
--       mitad de reto, el progreso de todo el mundo se movería bajo sus pies.
create or replace function public.update_activity_config(p_activity_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_status public.activity_status;
begin
  select club_id, created_by, status
    into v_club_id, v_created_by, v_status
    from public.club_activities
   where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;

  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;

  if v_status <> 'proposed' then
    raise exception 'config_frozen';
  end if;

  update public.club_activities set config = p_config where id = p_activity_id;
end;
$$;

comment on function public.update_activity_config(uuid, jsonb) is 'Edita club_activities.config (EPIC-05 Bloque H4). Solo creador o moderator+, y solo mientras la actividad esté en proposed -- el criterio se congela al activar. RPC porque Bloque G no dejó política UPDATE de cliente sobre club_activities.';

revoke execute on function public.update_activity_config(uuid, jsonb) from public, anon;
grant execute on function public.update_activity_config(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar la migración a dev**

```bash
cd .claude/worktrees/epic05-bloque-h4-criteria-challenge
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260714_criteria_challenge.sql', 'utf8');
fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h4-mig.json', JSON.stringify({ query: sql }));
"
curl -s -X POST "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$CLAUDE_JOB_DIR/tmp/h4-mig.json"
```

Expected: `[]` (DDL sin filas). Si sale un error de dependencia al hacer `drop function list_challenge_window`, es que `get_list_challenge_progress` no se recreó antes — revisar el orden.

- [ ] **Step 3: Escribir y ejecutar la batería de impersonación RLS**

Escribir `$CLAUDE_JOB_DIR/tmp/h4-rls-battery.sql`. Semilla: club privado; **O** owner, **M** moderator, **R** creador (miembro raso), **P1** y **P2** participantes (**P2 con perfil privado**, `is_public=false`), **X** miembro no participante, **Z** no miembro. Un `criteria_challenge` CC (activado, con `starts_on = current_date - 10`, `ends_on = current_date + 10`), y un `buddy_read` BR para la guarda de kind.

Casos (mismo formato `begin; ... set_config('app.tN', ...); ... rollback;` que las baterías de H1/H3 — ver `docs/superpowers/plans/2026-07-13-epic05-bloque-h3-list-challenge-manual-test.md` y el histórico de H3 para el idiom exacto de impersonación con `set local role authenticated` + `set_config('request.jwt.claims', ...)`):

1. R (creador, actividad en `proposed`) llama `update_activity_config` → **OK**; `config` queda escrito.
2. M (moderador, no creador, `proposed`) llama `update_activity_config` → **OK**.
3. P1 (participante raso) llama `update_activity_config` → **rechazado** (`forbidden`).
4. X (miembro no participante, no mod) → **rechazado** (`forbidden`).
5. Tras `activate_club_activity(CC)`: R llama `update_activity_config` → **rechazado** (`config_frozen`). M también → **rechazado**. *(El congelado al activar.)*
6. P1 (participante) llama `get_activity_diary_passes(CC)` → ve pases de **todos** los participantes, **incluido P2 (perfil privado)**. Assert: `count(*) where user_id = P2 >= 1`.
7. X (miembro, no participante) llama la RPC → **0 filas**.
8. Z (no miembro) → **0 filas**.
9. anon → **permiso denegado**.
10. Guarda de kind: llamar la RPC con el id de BR (`buddy_read`) → **0 filas**.
11. Ventana: un pase con `finished_on = current_date - 100` (anterior a `starts_on`) **no aparece**; uno de `current_date - 5` **sí**.
12. **Regresión H3**: `get_list_challenge_progress` sigue funcionando tras el renombre (crear un `list_challenge` con un ítem y un pase en ventana → devuelve la celda).
13. `activity_window` sobre una actividad sin fechas → `start = created_at::date`, `end = current_date`.

Ejecutar con:
```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h4-rls-battery.sql', 'utf8');
fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h4-bat.json', JSON.stringify({ query: sql }));
"
curl -s -X POST "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$CLAUDE_JOB_DIR/tmp/h4-bat.json"
```

Expected: los 13 casos con el resultado esperado. **Ojo con un falso positivo conocido**: si una query de conteo del propio test corre impersonando a alguien que no puede ver el perfil privado de P2, la RLS filtrará esa fila y el conteo saldrá bajo — eso pasó en H3. Para asertar la verdad de fondo, contar con `reset role` (sin RLS), no bajo impersonación.

- [ ] **Step 4: Advisors**

```bash
curl -s -X GET "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/advisors/security" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -o "$CLAUDE_JOB_DIR/tmp/adv.json"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/adv.json','utf8'));
console.log('search_path issues:', d.lints.filter(l=>l.name==='function_search_path_mutable' && /activity_window|diary_passes|activity_config/.test(JSON.stringify(l))).length);
"
```

Expected: `search_path issues: 0`. Los avisos `*_security_definer_function_executable` sobre las funciones nuevas son el **falso positivo ya aceptado** en H1/H3 (mismo patrón que `is_club_member`, `is_activity_participant`) — no hay que actuar.

- [ ] **Step 5: Apuntar H3 al nombre nuevo de la ventana**

En `src/lib/clubs/activities/list-challenge.ts`, línea ~42:

```ts
    supabase.rpc("activity_window", { p_activity_id: activityId }),
```

(antes decía `"list_challenge_window"`).

- [ ] **Step 6: Aplicar a prod y regenerar tipos + baseline**

Aplicar la misma SQL a prod con `mcp__supabase__apply_migration` (name: `criteria_challenge`). Luego:

```bash
curl -s -X GET "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/types/typescript?included_schemas=public" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -o "$CLAUDE_JOB_DIR/tmp/types.json"
node -e "
const fs = require('fs');
let t = JSON.parse(fs.readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/types.json','utf8')).types;
t = t.replace('Args: { entry_ids: string[]; target_queue: string }', 'Args: { entry_ids: string[]; target_queue: string | null }');
fs.writeFileSync('src/lib/supabase/database.types.ts', t);
console.log('ok', /get_activity_diary_passes/.test(t), /update_activity_config/.test(t), /activity_window/.test(t));
"
node -e "
const fs = require('fs');
const mig = fs.readFileSync('supabase/migrations/20260714_criteria_challenge.sql','utf8');
fs.appendFileSync('supabase/schema-baseline.sql',
  '\n\n-- ============================================================\n-- 20260714_criteria_challenge.sql (EPIC-05 Bloque H4)\n-- ============================================================\n\n' + mig);
"
```

Expected: `ok true true true`.

- [ ] **Step 7: Commit**

```bash
git add supabase/ src/lib/supabase/database.types.ts src/lib/clubs/activities/list-challenge.ts
git commit -m "feat(h4): migracion — activity_window, RPC lectora del tablero y update_activity_config"
```

---

### Task 2: `core.ts` — `config` en el modelo, al proponer y al editar

**Files:**
- Modify: `src/lib/clubs/activities/core.ts`

**Interfaces:**
- Consumes: RPC `update_activity_config` (Task 1).
- Produces: `ClubActivity.config: Json | null` y por tanto `ActivityDetail.config`; `proposeActivity(clubId, kind, title, description?, startsOn?, endsOn?, config?)`; `updateActivityConfig(activityId, config): Promise<void>`.

**Contexto:** hoy `ClubActivity` no incluye `config` y los `select(...)` de `listClubActivities`/`getActivity` no lo piden. `proposeActivity` tampoco lo escribe. H4 lo necesita todo.

- [ ] **Step 1: Añadir `config` al tipo y a los selects**

En `src/lib/clubs/activities/core.ts`:

```ts
import type { Json } from "@/lib/supabase/database.types";
```

En `ClubActivity`, tras `createdAt`:

```ts
  // Configuración específica del kind (SD-8). Opaca a SQL/RLS -- la interpreta cada kind en
  // la capa de app. criteria_challenge (Bloque H4) es su primer consumidor real.
  config: Json | null;
```

En **ambos** `select(...)` (el de `listClubActivities` y el de `getActivity`), añadir `config` a la lista de columnas:

```ts
    .select("id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at")
```

Y en los dos objetos de retorno mapeados, añadir `config: r.config` (en `listClubActivities`) y `config: row.config` (en `getActivity`).

- [ ] **Step 2: `proposeActivity` acepta config**

```ts
export async function proposeActivity(
  clubId: string,
  kind: ActivityKind,
  title: string,
  description?: string,
  startsOn?: string,
  endsOn?: string,
  config?: Json,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("title_required");

  const { data, error } = await supabase
    .from("club_activities")
    .insert({
      club_id: clubId,
      kind,
      title: trimmedTitle,
      description: description?.trim() || null,
      config: config ?? null,
      created_by: userId,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await notifyClub(supabase, clubId, userId, "club_activity_proposed", data.id);
}
```

*(La política INSERT de `club_activities` ya existe y fuerza `status='proposed'` + `is_club_member` — no hace falta gate nuevo aquí.)*

- [ ] **Step 3: `updateActivityConfig`**

Añadir al final de `core.ts`:

```ts
// Editar el criterio/config de una actividad. Va por RPC porque Bloque G no dejó política
// UPDATE de cliente sobre club_activities: la RPC revalida en servidor que el llamante sea
// creador o moderator+ Y que la actividad siga en 'proposed' (el criterio se congela al
// activar -- si la meta cambiara a mitad de reto, el progreso de todos se movería).
export async function updateActivityConfig(activityId: string, config: Json): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_activity_config", {
    p_activity_id: activityId,
    p_config: config,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (los call sites existentes de `proposeActivity` siguen valiendo — `config` es opcional y va al final).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/core.ts
git commit -m "feat(h4): core — config en ClubActivity, proposeActivity y updateActivityConfig"
```

---

### Task 3: Registro de kinds — `ConfigFields` y `usesItemPool`

**Files:**
- Modify: `src/lib/clubs/activities/kinds/types.ts`
- Modify: `src/lib/clubs/activities/kinds/{buddy-read,tierlist,list-challenge,criteria-challenge}.ts`
- Modify: `src/components/clubs/activity-composer.tsx`
- Modify: `src/components/clubs/activity-detail.tsx`

**Interfaces:**
- Consumes: `Json` de `database.types`; `updateActivityConfig` (Task 2).
- Produces: `ActivityKindDefinition.usesItemPool: boolean`; `ActivityKindDefinition.ConfigFields?: ComponentType<{ value: Json | null; onChange: (config: Json) => void }>`.

- [ ] **Step 1: Extender la definición del registro**

En `src/lib/clubs/activities/kinds/types.ts`, dentro de `ActivityKindDefinition` (tras `itemCuration`):

```ts
  // ¿Este kind usa el pool de ítems genérico de G? criteria_challenge (H4) no tiene lista de
  // ítems -- su reto se define por criterio, no por enumeración -- así que pintar la sección
  // "Ítems" (y las opiniones por ítem, que sin ítems no existen) sería una sección vacía sin
  // sentido.
  usesItemPool: boolean;
  // Campos de configuración que este kind aporta al composer, y que se serializan a
  // club_activities.config (SD-8). Sin esto el composer solo sabe pedir título/fechas.
  ConfigFields?: ComponentType<{
    value: Json | null;
    onChange: (config: Json) => void;
  }>;
```

Y arriba, el import:

```ts
import type { Json } from "@/lib/supabase/database.types";
```

Actualizar también el comentario de cabecera del tipo: ahora `buddy_read` (H1), `list_challenge` (H3) y `criteria_challenge` (H4) tienen comportamiento real; solo `tierlist` sigue de stub.

- [ ] **Step 2: Declarar `usesItemPool` en los cuatro kinds**

- `buddy-read.ts`, `tierlist.ts`, `list-challenge.ts` → añadir `usesItemPool: true,`
- `criteria-challenge.ts` → reescribir el stub entero:

```ts
import { CriteriaChallengeFields } from "@/components/clubs/criteria-challenge/criteria-challenge-fields";
import { CriteriaChallengeBoard } from "@/components/clubs/criteria-challenge/criteria-challenge-board";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H4 -- el "reto comparativo" original: criterio (tipo + meta + género + saga)
// en vez de lista fija, con leaderboard (modo competitivo) o meta colectiva sumada (modo
// cooperativo). Primer consumidor real de config jsonb (SD-8).
//
// Sin pool de ítems: el reto no enumera qué hay que consumir, lo describe.
export const criteriaChallengeKind: ActivityKindDefinition = {
  kind: "criteria_challenge",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "participants",
  usesItemPool: false,
  ConfigFields: CriteriaChallengeFields,
  DetailExtension: CriteriaChallengeBoard,
};
```

*(Los componentes se crean en las Tasks 6 y 7 — hasta entonces esto no compila, es esperado; se commitea al final de la Task 3 solo si ya existen, así que **este step se completa junto con las Tasks 6-7**. Para mantener el árbol compilando, crear primero los dos componentes como stubs mínimos que devuelvan `null`, y rellenarlos en sus tasks.)*

Stubs temporales (crear ahora, rellenar en Tasks 6 y 7):

```tsx
// src/components/clubs/criteria-challenge/criteria-challenge-fields.tsx
"use client";
import type { Json } from "@/lib/supabase/database.types";
export function CriteriaChallengeFields(_: { value: Json | null; onChange: (config: Json) => void }) {
  return null;
}
```

```tsx
// src/components/clubs/criteria-challenge/criteria-challenge-board.tsx
"use client";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
export function CriteriaChallengeBoard(_: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  return null;
}
```

- [ ] **Step 3: El composer pinta los campos del kind y envía el config**

En `src/components/clubs/activity-composer.tsx`:

```tsx
import { ACTIVITY_KIND_ORDER, getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import type { Json } from "@/lib/supabase/database.types";
```

Añadir estado y resetearlo al cambiar de kind (el config de un kind no vale para otro):

```tsx
  const [config, setConfig] = useState<Json | null>(null);
  const ConfigFields = getActivityKindDefinition(kind).ConfigFields;
```

En `reset()`, añadir `setConfig(null);`. En el `onChange` del `<select>` de kind:

```tsx
          onChange={(e) => {
            setKind(e.target.value as ActivityKind);
            setConfig(null); // el config es específico del kind
          }}
```

Renderizar los campos tras el `<textarea>` de descripción:

```tsx
      {ConfigFields && <ConfigFields value={config} onChange={setConfig} />}
```

Y pasar el config al proponer:

```tsx
        await proposeActivity(
          clubId,
          kind,
          title,
          description || undefined,
          startsOn || undefined,
          endsOn || undefined,
          config ?? undefined,
        );
```

- [ ] **Step 4: El detalle oculta pool y opiniones cuando el kind no usa ítems**

En `src/components/clubs/activity-detail.tsx`, envolver los dos bloques existentes:

```tsx
      {kindDefinition.usesItemPool && (
        <>
          <ActivityItemPool
            activityId={activity.id}
            items={activity.items}
            viewerId={viewerId}
            isParticipant={isParticipant}
            isCreator={isCreator}
            canModerate={isModerator}
            allowedItemTypes={kindDefinition.allowedItemTypes}
            maxItems={kindDefinition.maxItems}
            itemCuration={kindDefinition.itemCuration}
            onChanged={refreshActivity}
          />

          <ActivityOpinions
            activity={activity}
            viewerId={viewerId}
            isParticipant={isParticipant}
            onChanged={refreshActivity}
          />
        </>
      )}
```

*(El aviso `joinDisclosure` que añadió H3 está gateado a `activity.items.length > 0`, así que un `criteria_challenge` — sin ítems — no lo pinta. Correcto: no hay nada que añadir a tu biblioteca.)*

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (con los stubs de la Step 2 en su sitio).

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/kinds/ src/components/clubs/activity-composer.tsx src/components/clubs/activity-detail.tsx src/components/clubs/criteria-challenge/
git commit -m "feat(h4): registro gana ConfigFields y usesItemPool; composer y detalle los consumen"
```

---

### Task 4: Dominio — tipos del criterio y helpers de catálogo compartidos

**Files:**
- Create: `src/lib/clubs/activities/criteria-challenge-types.ts`
- Create: `src/lib/challenges/load-catalog-facets.ts`
- Modify: `src/lib/challenges/get-challenge-progress.ts` (extraer los dos loaders)

**Interfaces:**
- Produces: `CriteriaChallengeConfig`, `parseCriteriaConfig(raw: Json | null): CriteriaChallengeConfig | null`, `CRITERIA_MODES`.
- Produces: `loadGenres(supabase, refs)` y `loadSagaIds(supabase, refs)` exportados desde `load-catalog-facets.ts` (hoy son privados dentro de `get-challenge-progress.ts`).

**Contexto:** `get-challenge-progress.ts` tiene `loadGenres` y `loadSagaIds` privados. H4 los necesita igual. Se extraen a un módulo compartido en vez de duplicarlos (DRY), y `get-challenge-progress.ts` pasa a importarlos.

- [ ] **Step 1: Extraer los loaders de catálogo**

Crear `src/lib/challenges/load-catalog-facets.ts` moviendo **tal cual** las funciones `loadGenres` y `loadSagaIds` (y el tipo local que usan) desde `get-challenge-progress.ts`, exportándolas:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { groupIdsByType } from "@/lib/catalog/group-ids-by-type";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type ItemRef = { itemType: ItemType; itemId: string };

// Facetas de catálogo que los criterios de reto necesitan (§7.10 y EPIC-05 Bloque H4).
// Extraídas de get-challenge-progress.ts para que el reto de club las reutilice sin duplicar.

// Los géneros viven por tabla de catálogo (books/movies/series) -- una query por tipo que
// realmente tenga ids, patrón idsByType compartido con la cola.
export async function loadGenres(
  supabase: SupabaseServerClient,
  refs: ItemRef[],
): Promise<Map<string, string[]>> {
  /* cuerpo idéntico al actual de get-challenge-progress.ts */
}

// Pertenencia a saga vía saga_items (polimórfico item_type+item_id). Un ítem puede estar en
// más de una saga, así que los valores se acumulan.
export async function loadSagaIds(
  supabase: SupabaseServerClient,
  refs: ItemRef[],
): Promise<Map<string, string[]>> {
  /* cuerpo idéntico al actual de get-challenge-progress.ts */
}
```

En `get-challenge-progress.ts`: borrar las dos funciones privadas y añadir
`import { loadGenres, loadSagaIds } from "./load-catalog-facets";`. El resto del fichero no cambia.

- [ ] **Step 2: Tipos del criterio de club**

Crear `src/lib/clubs/activities/criteria-challenge-types.ts` (módulo plano, **no** `"use server"` — los componentes cliente importan de aquí; misma razón que `list-challenge-types.ts` en H3):

```ts
import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";

// El criterio de un reto de club (EPIC-05 Bloque H4). Vive en club_activities.config (jsonb,
// opaco a SQL) -- primer consumidor real de ese campo (SD-8). Misma forma que Challenge
// (§7.10, src/lib/challenges/types.ts) más el modo, porque un criteria_challenge ES un
// challenge personal evaluado sobre varias personas.
export type CriteriaMode = "competitive" | "cooperative";
export const CRITERIA_MODES: CriteriaMode[] = ["competitive", "cooperative"];

export type CriteriaChallengeConfig = {
  mode: CriteriaMode;
  itemType: ItemType | null; // null = cualquier tipo cuenta
  targetCount: number;
  genre?: string;
  sagaId?: string;
};

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// config es jsonb sin validar en BD -- esta es la única puerta de entrada tipada. Devuelve
// null si la actividad no tiene criterio todavía o si está mal formado (p.ej. una propuesta
// que se guardó sin config), y el tablero muestra el estado "sin criterio" en vez de romper.
export function parseCriteriaConfig(raw: Json | null): CriteriaChallengeConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;

  const mode = v.mode === "cooperative" ? "cooperative" : "competitive";

  const targetCount = Number(v.targetCount);
  if (!Number.isInteger(targetCount) || targetCount < 1) return null;

  const itemType = ITEM_TYPES.includes(v.itemType as ItemType) ? (v.itemType as ItemType) : null;

  const config: CriteriaChallengeConfig = { mode, itemType, targetCount };
  if (typeof v.genre === "string" && v.genre.trim()) config.genre = v.genre.trim();
  if (typeof v.sagaId === "string" && v.sagaId) config.sagaId = v.sagaId;
  return config;
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/challenges/ src/lib/clubs/activities/criteria-challenge-types.ts
git commit -m "feat(h4): tipos del criterio + extraer loadGenres/loadSagaIds a un modulo compartido"
```

---

### Task 5: Dominio — el fetcher del tablero (reutiliza `countForChallenge`)

**Files:**
- Create: `src/lib/clubs/activities/criteria-challenge.ts`

**Interfaces:**
- Consumes: RPC `get_activity_diary_passes` + `activity_window` (Task 1); `parseCriteriaConfig` (Task 4); `loadGenres`/`loadSagaIds` (Task 4); `countForChallenge` + `CompletedItem` de `src/lib/challenges/match.ts`; `Challenge` de `src/lib/challenges/types.ts`.
- Produces: `getCriteriaChallengeProgress(activityId): Promise<CriteriaChallengeView | null>`, y los tipos `CriteriaParticipantProgress` / `CriteriaChallengeView` (exportados desde `criteria-challenge-types.ts`, ver step 1).

- [ ] **Step 1: Añadir los tipos de la vista a `criteria-challenge-types.ts`**

(Van en el módulo plano, no en el `"use server"`, porque los componentes cliente los importan.)

```ts
export type CriteriaParticipantProgress = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  completed: number;    // capado a targetCount (para la barra)
  rawCompleted: number; // conteo real (puede superar la meta)
};

export type CriteriaChallengeView = {
  config: CriteriaChallengeConfig;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
  participants: CriteriaParticipantProgress[]; // roster COMPLETO, ordenado
  clubTotal: number; // Σ rawCompleted -- la cifra del modo cooperativo
};
```

- [ ] **Step 2: El fetcher**

Crear `src/lib/clubs/activities/criteria-challenge.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countForChallenge, type CompletedItem } from "@/lib/challenges/match";
import type { Challenge } from "@/lib/challenges/types";
import { loadGenres, loadSagaIds, type ItemRef } from "@/lib/challenges/load-catalog-facets";
import { parseCriteriaConfig } from "./criteria-challenge-types";
import type {
  CriteriaChallengeConfig,
  CriteriaChallengeView,
  CriteriaParticipantProgress,
} from "./criteria-challenge-types";

// Progreso de un reto por criterio (EPIC-05, Bloque H4). Hermano de checkpoints.ts (H1) y
// list-challenge.ts (H3): "use server" plano, SOLO LECTURA -- no hay nada que escribir, el
// progreso es 100% derivado de los pases de diario.
//
// Un criteria_challenge ES, literalmente, un challenge personal (§7.10) evaluado sobre varias
// personas: por eso el conteo NO se reimplementa aquí, se llama a countForChallenge
// (src/lib/challenges/match.ts) con un Challenge sintético construido desde config + la
// ventana de la actividad. Un solo motor de conteo, ya testeado.
//
// La RPC get_activity_diary_passes (SECURITY DEFINER) solo hace de LECTOR que salta la
// privacidad: sin ella, un participante con perfil privado sería invisible para sus
// compañeros y saldría en 0 (falso negativo silencioso). No cuenta nada -- ver la migración.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function getCriteriaChallengeProgress(
  activityId: string,
): Promise<CriteriaChallengeView | null> {
  const { supabase, userId } = await requireUser();

  const { data: activityRow, error: activityError } = await supabase
    .from("club_activities")
    .select("config")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) throw activityError;

  const config = parseCriteriaConfig(activityRow?.config ?? null);
  if (!config) return null; // sin criterio todavía (propuesta a medias) -- la UI lo dice

  const [windowResult, passesResult, participantResult] = await Promise.all([
    supabase.rpc("activity_window", { p_activity_id: activityId }),
    supabase.rpc("get_activity_diary_passes", { p_activity_id: activityId }),
    supabase.from("club_activity_participants").select("user_id").eq("activity_id", activityId),
  ]);
  if (windowResult.error) throw windowResult.error;
  if (passesResult.error) throw passesResult.error;
  if (participantResult.error) throw participantResult.error;

  const windowRow = windowResult.data?.[0];
  if (!windowRow) return null;

  const participantIds = (participantResult.data ?? []).map((p) => p.user_id);
  if (participantIds.length === 0) {
    return {
      config,
      windowStart: windowRow.window_start,
      windowEnd: windowRow.window_end,
      participants: [],
      clubTotal: 0,
    };
  }

  const passes = passesResult.data ?? [];

  // Enriquecer con géneros/sagas SOLO si el criterio los necesita -- un reto de "N ítems de
  // cualquier tipo" no paga ninguna query de catálogo. Misma optimización que
  // get-challenge-progress.ts (§7.10).
  const refs: ItemRef[] = passes.map((p) => ({ itemType: p.item_type, itemId: p.item_id }));
  const [genresByKey, sagasByKey] = await Promise.all([
    config.genre ? loadGenres(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
    config.sagaId ? loadSagaIds(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
  ]);

  // El Challenge sintético: config + ventana de la actividad. Los campos que countForChallenge
  // no mira (id, name, archivedAt) se rellenan con valores inertes.
  const challenge: Challenge = {
    id: activityId,
    name: "",
    itemType: config.itemType,
    targetCount: config.targetCount,
    criteria: { genre: config.genre, sagaId: config.sagaId },
    startDate: windowRow.window_start,
    endDate: windowRow.window_end,
    archivedAt: null,
  };

  const itemsByUser = new Map<string, CompletedItem[]>();
  for (const p of passes) {
    const key = `${p.item_type}:${p.item_id}`;
    const list = itemsByUser.get(p.user_id) ?? [];
    list.push({
      itemType: p.item_type,
      itemId: p.item_id,
      finishedOn: p.finished_on,
      genres: genresByKey.get(key) ?? [],
      sagaIds: sagasByKey.get(key) ?? [],
    });
    itemsByUser.set(p.user_id, list);
  }

  const { data: identities } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", participantIds);

  const identityById = new Map(
    (identities ?? [])
      .filter((i): i is typeof i & { user_id: string; username: string } =>
        i.user_id != null && i.username != null,
      )
      .map((i) => [i.user_id, i]),
  );

  const participants: CriteriaParticipantProgress[] = participantIds
    .map((id): CriteriaParticipantProgress | null => {
      const identity = identityById.get(id);
      if (!identity) return null;
      const rawCompleted = countForChallenge(itemsByUser.get(id) ?? [], challenge);
      return {
        userId: id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        isViewer: id === userId,
        rawCompleted,
        completed: Math.min(rawCompleted, config.targetCount),
      };
    })
    .filter((p): p is CriteriaParticipantProgress => p !== null)
    // Clasificación: quien más lleva, primero. Desempate estable por username. (En modo
    // cooperativo el orden no significa ranking, pero mantenerlo hace la lista predecible.)
    .sort((a, b) => {
      if (a.rawCompleted !== b.rawCompleted) return b.rawCompleted - a.rawCompleted;
      return a.username.localeCompare(b.username);
    });

  const clubTotal = participants.reduce((sum, p) => sum + p.rawCompleted, 0);

  return {
    config,
    windowStart: windowRow.window_start,
    windowEnd: windowRow.window_end,
    participants,
    clubTotal,
  };
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs/activities/criteria-challenge.ts src/lib/clubs/activities/criteria-challenge-types.ts
git commit -m "feat(h4): fetcher del tablero — reutiliza countForChallenge sobre los pases de la RPC"
```

---

### Task 6: `SagaPicker` + los campos del criterio en el composer

**Files:**
- Create: `src/lib/sagas/search-sagas.ts`
- Create: `src/components/saga-picker.tsx`
- Modify: `src/components/clubs/criteria-challenge/criteria-challenge-fields.tsx` (rellenar el stub)

**Interfaces:**
- Consumes: `CriteriaChallengeConfig`, `CRITERIA_MODES`, `parseCriteriaConfig` (Task 4).
- Produces: `searchSagas(query: string): Promise<{ id: string; name: string }[]>`; `<SagaPicker value={{id,name} | null} onChange={(saga) => void} />`.

**Contexto:** no existe ningún selector de sagas. El único formulario que las toca (`saga-assign-form.tsx`) usa texto libre y **crea** la saga por nombre — aquí necesitamos **elegir una existente** y quedarnos su `id`. El componente vive en `src/components/` (no bajo `clubs/`) porque es reutilizable: el reto personal (§7.10) soporta el filtro de saga en su motor pero no lo expone por falta justo de este selector.

- [ ] **Step 1: La server action de búsqueda**

Crear `src/lib/sagas/search-sagas.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

// Búsqueda de sagas por nombre para el selector (EPIC-05 Bloque H4). El catálogo es legible
// por cualquiera (misma RLS que books/movies/series), así que no hace falta gate propio.
export async function searchSagas(query: string): Promise<{ id: string; name: string }[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sagas")
    .select("id, name")
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(10);
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: El componente**

Crear `src/components/saga-picker.tsx` (mismo patrón de búsqueda con debounce que `LibraryItemPicker`):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { searchSagas } from "@/lib/sagas/search-sagas";

// Selector de saga existente -> devuelve su id (EPIC-05 Bloque H4). Reutilizable: el reto
// personal (§7.10) soporta el filtro por saga en su motor pero no lo expone porque no había
// selector -- este lo es.
export function SagaPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (saga: { id: string; name: string } | null) => void;
}) {
  const t = useTranslations("sagaPicker");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchSagas(search).then(setResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("clear")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("placeholder")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {results.length > 0 && (
        <div className="flex max-h-40 flex-col overflow-y-auto rounded-md border border-border">
          {results.map((saga) => (
            <button
              key={saga.id}
              type="button"
              onClick={() => {
                onChange(saga);
                setSearch("");
                setResults([]);
              }}
              className="px-3 py-2 text-left text-sm hover:bg-surface-muted"
            >
              {saga.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Los campos del criterio**

Reescribir `src/components/clubs/criteria-challenge/criteria-challenge-fields.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import {
  CRITERIA_MODES,
  parseCriteriaConfig,
  type CriteriaChallengeConfig,
  type CriteriaMode,
} from "@/lib/clubs/activities/criteria-challenge-types";
import { SagaPicker } from "@/components/saga-picker";
import { Input } from "@/components/ui/input";

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// Campos del criterio en el composer de actividades (EPIC-05 Bloque H4). Se enchufan vía
// ActivityKindDefinition.ConfigFields -- el composer genérico no sabe nada de retos.
//
// El criterio se serializa a club_activities.config en cada cambio, así que el composer solo
// tiene que mandarlo tal cual al proponer.
export function CriteriaChallengeFields({
  value,
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const tTypes = useTranslations("search.types");

  const parsed = parseCriteriaConfig(value);
  const [mode, setMode] = useState<CriteriaMode>(parsed?.mode ?? "competitive");
  const [itemType, setItemType] = useState<ItemType | "">(parsed?.itemType ?? "");
  const [targetCount, setTargetCount] = useState(parsed ? String(parsed.targetCount) : "");
  const [genre, setGenre] = useState(parsed?.genre ?? "");
  const [saga, setSaga] = useState<{ id: string; name: string } | null>(null);

  // Emite el config completo en cada cambio -- el composer no tiene que recomponerlo.
  function emit(next: Partial<CriteriaChallengeConfig> & { sagaId?: string | null }) {
    const target = Number(next.targetCount ?? targetCount);
    const config: CriteriaChallengeConfig = {
      mode: (next.mode ?? mode) as CriteriaMode,
      itemType: (next.itemType !== undefined ? next.itemType : itemType || null) as ItemType | null,
      targetCount: Number.isInteger(target) && target > 0 ? target : 0,
      ...(((next.genre ?? genre) || "").trim() ? { genre: ((next.genre ?? genre) || "").trim() } : {}),
      ...((next.sagaId !== undefined ? next.sagaId : saga?.id)
        ? { sagaId: (next.sagaId !== undefined ? next.sagaId : saga?.id) as string }
        : {}),
    };
    onChange(config as unknown as Json);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaMode")}
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as CriteriaMode;
            setMode(next);
            emit({ mode: next });
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {CRITERIA_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`criteriaMode_${m}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("criteriaItemType")}
          <select
            value={itemType}
            onChange={(e) => {
              const next = (e.target.value || "") as ItemType | "";
              setItemType(next);
              emit({ itemType: next || null });
            }}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="">{t("criteriaAnyType")}</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("criteriaTarget")}
          <Input
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => {
              setTargetCount(e.target.value);
              emit({ targetCount: Number(e.target.value) });
            }}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaGenre")}
        <Input
          value={genre}
          onChange={(e) => {
            setGenre(e.target.value);
            emit({ genre: e.target.value });
          }}
          placeholder={t("criteriaGenrePlaceholder")}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaSaga")}
        <SagaPicker
          value={saga}
          onChange={(next) => {
            setSaga(next);
            emit({ sagaId: next?.id ?? null });
          }}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (las claves i18n se añaden en la Task 8; `useTranslations` no falla en compilación por claves que faltan).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/search-sagas.ts src/components/saga-picker.tsx src/components/clubs/criteria-challenge/criteria-challenge-fields.tsx
git commit -m "feat(h4): SagaPicker reutilizable + campos del criterio en el composer"
```

---

### Task 7: El tablero — leaderboard competitivo y meta colectiva cooperativa

**Files:**
- Modify: `src/components/clubs/criteria-challenge/criteria-challenge-board.tsx` (rellenar el stub)

**Interfaces:**
- Consumes: `getCriteriaChallengeProgress` (Task 5); `CriteriaChallengeView` (Task 4/5); `ProgressBar` de `@/components/ui/progress-bar` (props: `{ current: number; total: number; label?: string }`).

- [ ] **Step 1: El componente**

Reescribir `src/components/clubs/criteria-challenge/criteria-challenge-board.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getCriteriaChallengeProgress } from "@/lib/clubs/activities/criteria-challenge";
import type { CriteriaChallengeView } from "@/lib/clubs/activities/criteria-challenge-types";
import { ProgressBar } from "@/components/ui/progress-bar";

// DetailExtension de criteria_challenge (EPIC-05 Bloque H4). Mismo patrón de montaje que
// BuddyReadCheckpoints (H1) y ListChallengeBoard (H3): estado propio + refresh.
//
// Solo para participantes -- coherente con la RPC (que no devuelve nada a un no-participante).
// Sin botón de "marcar": el progreso es derivado de los pases de diario.
export function CriteriaChallengeBoard({
  activity,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<CriteriaChallengeView | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getCriteriaChallengeProgress(activity.id);
      setView(fresh);
    });
  }, [activity.id, activity.status]);

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("criteriaJoinToSee")}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("criteriaNoConfig")}</p>
      </div>
    );
  }

  const { config, participants, clubTotal } = view;
  const viewer = participants.find((p) => p.isViewer);
  const isCooperative = config.mode === "cooperative";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>

      {isCooperative ? (
        // Meta colectiva: una sola barra, la suma de todos contra el objetivo.
        <ProgressBar
          current={Math.min(clubTotal, config.targetCount)}
          total={config.targetCount}
          label={t("criteriaClubProgress", { done: clubTotal, total: config.targetCount })}
        />
      ) : (
        viewer && (
          <ProgressBar
            current={viewer.completed}
            total={config.targetCount}
            label={t("criteriaMyProgress", { done: viewer.rawCompleted, total: config.targetCount })}
          />
        )
      )}

      <div className="flex flex-col gap-2">
        {participants.map((p, index) => {
          const percent =
            config.targetCount > 0
              ? Math.min(100, Math.round((p.rawCompleted / config.targetCount) * 100))
              : 0;
          return (
            <div
              key={p.userId}
              className={`flex items-center gap-3 rounded-md border border-border p-2 ${
                p.isViewer ? "bg-accent/5" : ""
              }`}
            >
              {/* La posición solo significa ranking en modo competitivo. */}
              {!isCooperative && (
                <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {p.displayName || p.username}
              </span>
              <div className="w-24 shrink-0">
                <ProgressBar current={p.completed} total={config.targetCount} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {p.rawCompleted}/{config.targetCount}
                {!isCooperative && ` · ${percent}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Igual que en H3: sin esta línea el tablero es un misterio, porque no hay nada que
          pulsar -- el progreso sale solo de lo que registres en tu diario. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("criteriaRule", { start: view.windowStart, end: view.windowEnd })}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/clubs/criteria-challenge/criteria-challenge-board.tsx
git commit -m "feat(h4): tablero — leaderboard competitivo y meta colectiva cooperativa"
```

---

### Task 8: i18n, lint y build

**Files:**
- Modify: `messages/es.json`

- [ ] **Step 1: Claves nuevas**

En `messages/es.json`, dentro del objeto `"activity"` (tras las claves `listChallenge*`):

```json
    "criteriaMode": "Modo",
    "criteriaMode_competitive": "Competitivo (clasificación)",
    "criteriaMode_cooperative": "Cooperativo (meta común)",
    "criteriaItemType": "Tipo",
    "criteriaAnyType": "Cualquiera",
    "criteriaTarget": "Meta",
    "criteriaGenre": "Género (opcional)",
    "criteriaGenrePlaceholder": "Terror, ciencia ficción…",
    "criteriaSaga": "Saga (opcional)",
    "criteriaProgress": "Progreso del reto",
    "criteriaJoinToSee": "Únete al reto para ver el progreso de los participantes.",
    "criteriaNoConfig": "Este reto todavía no tiene criterio definido.",
    "criteriaMyProgress": "Tu progreso: {done} de {total}",
    "criteriaClubProgress": "Entre todos: {done} de {total}",
    "criteriaRule": "Cuenta lo que termines entre {start} y {end}: el progreso sale de tu diario, no hay nada que marcar aquí."
```

Y un objeto nuevo al nivel raíz (hermano de `"activity"`):

```json
  "sagaPicker": {
    "placeholder": "Buscar una saga…",
    "clear": "Quitar"
  },
```

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Typecheck, lint y build**

```bash
npx tsc --noEmit
npx eslint src/lib/clubs src/lib/challenges src/lib/sagas src/components/clubs src/components/saga-picker.tsx
npx next build
```

Expected: los tres sin errores. *(Recordatorio de H3: un helper **síncrono** exportado desde un módulo `"use server"` rompe el build — por eso los tipos y `parseCriteriaConfig` viven en `criteria-challenge-types.ts`, que es un módulo plano.)*

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "feat(h4): i18n del reto por criterio y del selector de sagas"
```

---

### Task 9: Checklist manual, backlog y PR

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-epic05-bloque-h4-criteria-challenge-manual-test.md`
- Modify: `docs/requirements/social-epic.md`

- [ ] **Step 1: Checklist manual**

Crear el checklist siguiendo el formato de
`docs/superpowers/plans/2026-07-13-epic05-bloque-h3-list-challenge-manual-test.md`. Debe cubrir:

1. **Setup**: club con A (owner/mod), R (miembro raso), P (miembro), y una cuenta con **perfil privado**.
2. **Proponer**: R propone un `criteria_challenge` con criterio (modo competitivo, tipo=libro, meta=3, género="terror"). Los campos del criterio aparecen en el composer al elegir ese tipo, y **desaparecen** si cambia a otro kind.
3. **Editar en `proposed`**: R cambia la meta → funciona. A (moderador) también.
4. **Congelado al activar**: A activa; ahora ni R ni A pueden editar el criterio (el formulario ya no se ofrece / la acción falla con `config_frozen`).
5. **Sin pool ni opiniones**: la ficha del reto **no** muestra la sección "Ítems" ni "Opiniones" (a diferencia de un `list_challenge`). Un `list_challenge` sí las sigue mostrando (regresión).
6. **Unirse y avanzar**: P se une; registra un pase de un libro de terror con fecha **dentro** de la ventana → su fila del leaderboard sube. Un pase **fuera** de la ventana → no cuenta. Un libro que **no** es de terror → no cuenta.
7. **Perfil privado**: la cuenta privada participa y registra un pase → **se ve en el leaderboard** de los demás con su progreso real.
8. **Modo cooperativo**: crear otro reto con `mode=cooperative` → una sola barra colectiva (suma de todos), sin posiciones.
9. **Saga**: crear un reto con filtro de saga usando el buscador; comprobar que solo cuentan ítems de esa saga.
10. **Regresión H3**: un `list_challenge` existente sigue funcionando (la ventana se renombró).
11. Sin errores de consola; limpieza de datos.

- [ ] **Step 2: Backlog**

En `docs/requirements/social-epic.md`:
- Marcar `[x]` **E5.H4a**, **E5.H4b**, **E5.H4c** y añadir nota de estado del bloque (mismo formato que H1/H3): cero tablas nuevas; `config jsonb` **tiene por fin su primer consumidor** (cierra el hueco de Bloque G); el conteo reutiliza `countForChallenge` sin duplicarse; la RPC lectora es `SECURITY DEFINER` y **es** la política de lectura del tablero (perfiles privados, Q5); `list_challenge_window` → `activity_window`.
- En **E5.H4b**, anotar que las **notificaciones quedan diferidas** con la razón estructural: *"te han adelantado"* no tiene un momento en el que dispararse si el progreso es derivado (haría falta un snapshot del ranking o un cron), y se difiere en coherencia con H1 y H3.
- En la tabla §5, añadir la fila de `get_activity_diary_passes` / `update_activity_config` y renombrar `list_challenge_window` → `activity_window`.
- Anotar que del Bloque H **solo queda H2 (tierlist)**.

- [ ] **Step 3: Commit, push y PR draft**

```bash
git add docs/
git commit -m "docs(h4): checklist manual y backlog actualizado"
git push -u origin worktree-epic05-bloque-h4-criteria-challenge
```

Abrir el PR draft contra `main` (vía `mcp__github__create_pull_request`, `draft: true`) resumiendo: los dos modos, el criterio congelado al activar vía RPC (porque G no dejó política UPDATE), el motor de conteo reutilizado sin duplicar, la RPC lectora que resuelve el problema de los perfiles privados, `config jsonb` estrenado, y el `SagaPicker` reutilizable. Enlazar el checklist manual en el test plan.

---

## Self-Review

**Cobertura del spec:**
- §2.1 dos modos → Tasks 4 (`CriteriaMode`), 6 (selector), 7 (render dividido).
- §2.2 criterio en el composer, congelado al activar → Tasks 1 (RPC `update_activity_config` con la guarda `proposed`), 2 (`proposeActivity` con config), 3 (`ConfigFields`), 6 (los campos).
- §2.3 tipo+meta+género+saga → Tasks 4 (tipo del config) y 6 (`SagaPicker` + campos).
- §2.4 sin notificaciones → constraint global; ningún task añade `notification_type`.
- §2.5 un solo motor de conteo → Task 5 (`countForChallenge` importado, no reescrito) y Task 1 (la RPC no cuenta).
- §3.1 `config` → Tasks 2 y 4. §3.2 ventana renombrada → Task 1. §3.3 RPC lectora → Task 1.
- §4 dominio → Tasks 4 y 5 (incluida la extracción DRY de `loadGenres`/`loadSagaIds`).
- §5 registro (`ConfigFields`, `usesItemPool`) + los tres componentes → Tasks 3, 6, 7.
- §6 razón de no notificar → Task 9 (queda escrita en el backlog).
- §7 verificación → Task 1 (batería RLS, 13 casos) y Task 9 (checklist manual).
- §8 enganches al backlog → Task 9.

**Consistencia de tipos:** `CriteriaChallengeConfig`/`CriteriaChallengeView`/`CriteriaParticipantProgress` se definen en `criteria-challenge-types.ts` (Tasks 4 y 5) y se consumen con esos mismos nombres en Tasks 5, 6 y 7. `usesItemPool`/`ConfigFields` se definen en Task 3 y se consumen en Tasks 3 (composer/detalle) y 6. `activity_window` se crea en Task 1 y se consume en Task 1 (H3) y Task 5.

**Riesgo conocido:** la Task 3 introduce stubs que las Tasks 6 y 7 rellenan — es deliberado, para que el árbol compile en cada commit.
