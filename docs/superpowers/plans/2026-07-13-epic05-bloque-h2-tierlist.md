# EPIC-05 Bloque H2 — Tierlist de club (`tierlist`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cuarto y último tipo de actividad de club: cada participante coloca el pool de ítems en tiers y ve las tierlists de los demás. Cierra el Bloque H.

**Architecture:** Única tabla nueva del Bloque H (`club_activity_placements`), y precisamente por eso **sin ninguna función `SECURITY DEFINER`**: al no leer `diary_entries`/`library_entries` de nadie, `can_view_profile()` nunca entra en juego y basta una RLS acotada con `is_activity_participant()` — el patrón exacto de `club_activity_opinions` (Bloque G). Los tiers viven en `config` (segundo consumidor, tras H4) y se congelan al activar reutilizando la RPC `update_activity_config` sin cambios. Es el **primer tipo con mutaciones en su capa de dominio** (H3 y H4 eran de solo lectura porque su progreso era derivado; aquí la colocación *es* el dato).

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + RLS), TypeScript, `@dnd-kit` (ya en el proyecto por 7.22), next-intl, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-13-epic05-bloque-h2-tierlist-design.md`

## Global Constraints

- **Worktree:** `.claude/worktrees/epic05-bloque-h2-tierlist`, rama `worktree-epic05-bloque-h2-tierlist` (ya creado, basado en `origin/main`).
- **Supabase dev** (`tyvzpuhxfwxrnkcpzxyg`): SQL vía Management API con `$SUPABASE_ACCESS_TOKEN` (`POST https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query`, body `{"query": "..."}`). **El MCP de Supabase apunta a PROD** (`vmutcradmodhiltuohys`): usarlo solo para aplicar a prod al final. `jq` no está instalado; construir JSON con `node -e`.
- **Tras regenerar `src/lib/supabase/database.types.ts`**: reaplicar siempre a mano `reorder_queue: { Args: { entry_ids: string[]; target_queue: string | null } }` — el generador lo emite no-null.
- **Módulos `"use server"`**: todo export debe ser una función asíncrona. Tipos y helpers síncronos van en un módulo plano aparte (`*-types.ts`) — en H3 ese error llegó a romper el build.
- **Sin consenso del club** (decisión de diseño, §1 del spec): no se calcula ni se muestra ninguna tierlist agregada.
- **Sin notificaciones**: ningún valor nuevo en `notification_type`.
- **Convención de verificación** (`docs/TESTING.md`): checklist manual en navegador ejecutada por el humano, no E2E automático.
- **Comentarios en español**, como el resto del epic.

---

### Task 1: Migración — `club_activity_placements` y el gate de curación

**Files:**
- Create: `supabase/migrations/20260714_tierlist.sql`
- Modify: `supabase/schema-baseline.sql` (append)
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces (SQL): tabla `club_activity_placements(activity_id, user_id, item_type, item_id, tier text, position smallint)`, PK `(activity_id, user_id, item_type, item_id)`.
- Produces (SQL): políticas RLS reescritas de `club_activity_items` que añaden `tierlist` a la rama de curadores.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260714_tierlist.sql`:

```sql
-- EPIC-05 Bloque H2 — Tierlist de club. Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h2-tierlist-design.md
--
-- Cuarto y último tipo de actividad de club: cierra el Bloque H.
--
-- Es el ÚNICO tipo del bloque con tabla nueva -- y precisamente por eso es el único que NO
-- necesita ninguna función SECURITY DEFINER. H3 y H4 la necesitaron porque leían
-- diary_entries/library_entries, cuya RLS pasa por can_view_profile(): un participante con
-- perfil privado habría salido vacío para sus compañeros (falso negativo silencioso). Aquí la
-- colocación vive en tabla propia, así que basta acotar su RLS con is_activity_participant()
-- -- el patrón exacto de club_activity_opinions (Bloque G).
--
-- Los tiers viven en club_activities.config (segundo consumidor de ese campo, tras H4) y se
-- congelan al activar reutilizando la RPC update_activity_config, sin cambios.


-- ── 1. Las colocaciones ──────────────────────────────────────────────────────
create table public.club_activity_placements (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  tier text not null,          -- la ETIQUETA del tier ("S"), no un índice: config es opaco a
                                -- SQL, así que la BD no puede validar contra la lista de tiers.
                                -- Lo valida la app al escribir, y al leer una colocación con un
                                -- tier desconocido se trata como "sin colocar" -- ningún dato
                                -- raro puede romper el tablero.
  position smallint not null,  -- orden dentro de la fila del tier
  created_at timestamptz not null default now(),
  -- La PK compuesta ES la unicidad que pedía el backlog: una colocación por ítem y persona.
  primary key (activity_id, user_id, item_type, item_id)
);

create index idx_club_activity_placements_activity on public.club_activity_placements (activity_id);

comment on table public.club_activity_placements is 'Colocación de cada participante en la tierlist de una actividad (EPIC-05 Bloque H2). Una fila por (actividad, persona, ítem). Visible entre participantes; cada cual solo escribe las suyas. Sin SECURITY DEFINER: al ser tabla propia no hay que saltarse la RLS de perfil, a diferencia de H3/H4.';

alter table public.club_activity_placements enable row level security;

-- Todos los participantes ven las tierlists de todos -- la gracia del bloque es comparar y
-- discutir (mismo criterio que club_activity_opinions, Bloque G).
create policy "club_activity_placements select participant" on public.club_activity_placements
  for select to authenticated
  using (public.is_activity_participant(activity_id));

-- Pero cada cual solo escribe LA SUYA. El caso de riesgo de este bloque es colar el user_id
-- de otro: el `with check` lo corta.
create policy "club_activity_placements insert own" on public.club_activity_placements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

create policy "club_activity_placements update own" on public.club_activity_placements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "club_activity_placements delete own" on public.club_activity_placements
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ── 2. El gate de curación del pool se extiende a tierlist ───────────────────
--
-- El pool ES el enunciado de la tierlist: si cualquier participante lo hace crecer a mitad,
-- las tierlists ya hechas quedan incompletas y hay que volver a colocar. Mismo razonamiento
-- que el reto por lista (H3).
--
-- La política que escribió H3 es kind-scoped ("when ca.kind = 'list_challenge' then ... else
-- is_activity_participant"), así que hay que REESCRIBIRLA para meter tierlist en la rama de
-- curadores. El resto de kinds (buddy_read, criteria_challenge) conserva la semántica de G.
--
-- Recordatorio de por qué es RLS y no un trigger (ver H3): un trigger solo puede RECHAZAR lo
-- que la RLS ya dejó pasar, nunca RELAJAR -- y aquí hace falta relajar, porque la condición de
-- G exige is_activity_participant() y solo puedes unirte a una actividad ya 'active'; sin esta
-- rama, quien propone no podría curar su propio pool en 'proposed'.

drop policy "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and case
          when ca.kind in ('list_challenge', 'tierlist') then
            ca.created_by = (select auth.uid())
            or public.has_min_club_role(ca.club_id, 'moderator')
          else public.is_activity_participant(ca.id)
        end
    )
  );

drop policy "club_activity_items delete own or moderate or curator" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind in ('list_challenge', 'tierlist') and ca.created_by = (select auth.uid()))
        )
    )
  );
```

- [ ] **Step 2: Aplicar a dev**

```bash
cd .claude/worktrees/epic05-bloque-h2-tierlist
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260714_tierlist.sql', 'utf8');
fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h2-mig.json', JSON.stringify({ query: sql }));
"
curl -s -X POST "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$CLAUDE_JOB_DIR/tmp/h2-mig.json"
```

Expected: `[]` (DDL sin filas).

- [ ] **Step 3: Batería de impersonación RLS**

Escribir `$CLAUDE_JOB_DIR/tmp/h2-rls-battery.sql` con el idiom de H1/H3/H4 (`begin; ... set local role authenticated; set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true); ... set_config('app.tN', ...); ... reset role; select current_setting('app.tN', true) ...; rollback;`).

Semilla: club privado; **O** owner, **M** moderator, **R** creador (miembro raso), **P1**/**P2** participantes, **X** miembro no participante, **Z** no miembro. Una `tierlist` TL (creada por R, activada por M, con 2 ítems en el pool) y un `list_challenge` LC (para la regresión).

Casos:

1. **R cura el pool de TL estando aún en `proposed`** (R no es participante) → **OK**. *(La relajación: con la política de G habría fallado.)*
2. M (moderador, no creador, no participante) añade un ítem a TL → **OK**.
3. **P1 (participante raso) añade un ítem a TL → denegado.** *(El gate nuevo.)*
4. R borra de TL un ítem que metió M → **OK** (rama de curador en el DELETE).
5. **Regresión H3**: en LC, R (su creador) cura en `proposed` → OK; un participante raso → denegado. *(La reescritura no rompió el reto por lista.)*
6. **Regresión kind-scope**: en un `buddy_read`, un participante raso **sí** puede añadir su ítem (la rama `else` conserva la semántica de G).
7. P1 (participante) inserta su propia colocación en TL → **OK**.
8. **P1 intenta insertar una colocación con `user_id` = P2 → denegado.** *(El caso de riesgo del bloque.)*
9. P1 intenta **actualizar** la colocación de P2 → 0 filas afectadas (el `using` la filtra).
10. P1 intenta **borrar** la colocación de P2 → 0 filas afectadas.
11. P1 **ve** las colocaciones de P2 (`select` → ≥1 fila) — todos ven las de todos.
12. X (miembro del club, **no** participante) → `select` devuelve **0 filas**, e insertar → denegado.
13. Z (no miembro) → 0 filas. Anon (`set local role anon`) → 0 filas.
14. **Regresión Q8**: P1 se une a TL → **no** se crea ninguna fila en `library_entries` (la exclusión de `tierlist` que decidió H3 sigue en pie). Assertar contando `library_entries` de P1 para los ítems del pool → `0`.

Ejecutar:
```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h2-rls-battery.sql', 'utf8');
fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/h2-bat.json', JSON.stringify({ query: sql }));
"
curl -s -X POST "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$CLAUDE_JOB_DIR/tmp/h2-bat.json"
```

Expected: los 14 casos con su resultado esperado. **Ojo con un falso positivo conocido** (pasó en H3): si una query de conteo del propio test corre bajo impersonación de alguien que no puede ver a otro perfil, la RLS filtra la fila y el conteo sale bajo. Para asertar la verdad de fondo, contar con `reset role` (sin RLS).

- [ ] **Step 4: Advisors**

```bash
curl -s -X GET "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/advisors/security" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -o "$CLAUDE_JOB_DIR/tmp/adv.json"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/adv.json','utf8'));
const mine = d.lints.filter(l => /placements/.test(JSON.stringify(l)));
console.log('findings on the new table:', mine.map(l => l.name).join(', ') || '(none)');
"
```

Expected: `(none)`. Este bloque no añade funciones, así que no debería aparecer ningún aviso nuevo — a diferencia de H1/H3/H4, cuyos `*_security_definer_function_executable` son el falso positivo ya aceptado.

- [ ] **Step 5: Aplicar a prod y regenerar tipos + baseline**

Aplicar la misma SQL a prod con `mcp__supabase__apply_migration` (name: `tierlist`). Luego:

```bash
curl -s -X GET "https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/types/typescript?included_schemas=public" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -o "$CLAUDE_JOB_DIR/tmp/types.json"
node -e "
const fs = require('fs');
let t = JSON.parse(fs.readFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/types.json','utf8')).types;
t = t.replace('Args: { entry_ids: string[]; target_queue: string }', 'Args: { entry_ids: string[]; target_queue: string | null }');
fs.writeFileSync('src/lib/supabase/database.types.ts', t);
console.log('placements in types:', /club_activity_placements/.test(t));
const mig = fs.readFileSync('supabase/migrations/20260714_tierlist.sql','utf8');
fs.appendFileSync('supabase/schema-baseline.sql',
  '\n\n-- ============================================================\n-- 20260714_tierlist.sql (EPIC-05 Bloque H2)\n-- ============================================================\n\n' + mig);
"
```

Expected: `placements in types: true`.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
git add supabase/ src/lib/supabase/database.types.ts
git commit -m "feat(h2): migracion — club_activity_placements y gate de curacion extendido a tierlist"
```

---

### Task 2: Tipos y dominio de la tierlist

**Files:**
- Create: `src/lib/clubs/activities/tierlist-types.ts`
- Create: `src/lib/clubs/activities/tierlist.ts`

**Interfaces:**
- Consumes: tabla `club_activity_placements` (Task 1); `ActivityItem`/`ActivityDetail` de `@/lib/clubs/activities/core`; `itemKey` de `@/lib/clubs/activities/list-challenge-types` (H3) — `itemKey(itemType, itemId) => \`${itemType}:${itemId}\``.
- Produces: `TierlistConfig`, `parseTierlistConfig`, `DEFAULT_TIERS`, `ParticipantBoard`, `TierlistView` (módulo plano); `getTierlists(activityId)`, `setPlacement(...)`, `clearPlacement(...)` (`"use server"`).

- [ ] **Step 1: El módulo plano de tipos**

Crear `src/lib/clubs/activities/tierlist-types.ts`:

```ts
import type { Json } from "@/lib/supabase/database.types";

// Tipos y parser de la tierlist de club (EPIC-05, Bloque H2).
//
// Módulo PLANO a propósito (no "use server"): en un módulo de server actions todo export debe
// ser una función asíncrona, y aquí hay tipos y un parser síncrono que los componentes cliente
// importan. Misma separación que list-challenge-types.ts (H3) y criteria-challenge-types.ts
// (H4) -- en H3 ese error llegó a romper el build.
//
// Los tiers viven en club_activities.config (jsonb, opaco a SQL/RLS): segundo consumidor de
// ese campo tras el criterio de H4.

export const DEFAULT_TIERS = ["S", "A", "B", "C", "D"];

export type TierlistConfig = {
  tiers: string[];
};

// config es jsonb sin validar en BD -- esta es la única puerta de entrada tipada. Devuelve
// null si no hay tiers utilizables, y el tablero muestra "sin configurar" en vez de romperse.
export function parseTierlistConfig(raw: Json | null): TierlistConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).tiers;
  if (!Array.isArray(value)) return null;

  const tiers = value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);

  return tiers.length > 0 ? { tiers } : null;
}

export type ParticipantBoard = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  // itemKeys (`${itemType}:${itemId}`) por tier, ya ordenados por `position`.
  itemKeysByTier: Record<string, string[]>;
  // Ítems del pool que esta persona todavía no ha colocado (la "bandeja").
  unplacedItemKeys: string[];
};

export type TierlistView = {
  tiers: string[];
  boards: ParticipantBoard[]; // roster COMPLETO, viewer primero
};
```

- [ ] **Step 2: El dominio**

Crear `src/lib/clubs/activities/tierlist.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemKey } from "./list-challenge-types";
import { parseTierlistConfig } from "./tierlist-types";
import type { ParticipantBoard, TierlistView } from "./tierlist-types";

// Tierlist de club (EPIC-05, Bloque H2). Hermano de checkpoints.ts (H1), list-challenge.ts
// (H3) y criteria-challenge.ts (H4) -- pero el PRIMERO con mutaciones: H3 y H4 son de solo
// lectura porque su progreso es derivado de los pases de diario; aquí la colocación ES el dato.
//
// Sin SECURITY DEFINER en ninguna parte: club_activity_placements es tabla propia, así que su
// RLS (participante ve todas, cada cual escribe la suya) basta -- no hay que saltarse la RLS
// de perfil como en H3/H4, que leían diary_entries.
//
// Sin consenso del club (decisión de diseño): promediar los tiers aplanaría justo el
// desacuerdo, que es el punto de una tierlist.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function getTierlists(activityId: string): Promise<TierlistView | null> {
  const { supabase, userId } = await requireUser();

  const { data: activityRow, error: activityError } = await supabase
    .from("club_activities")
    .select("config")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) throw activityError;

  const config = parseTierlistConfig(activityRow?.config ?? null);
  if (!config) return null; // sin tiers todavía -- la UI lo dice en vez de romperse

  const [itemResult, placementResult, participantResult] = await Promise.all([
    supabase.from("club_activity_items").select("item_type, item_id").eq("activity_id", activityId),
    supabase
      .from("club_activity_placements")
      .select("user_id, item_type, item_id, tier, position")
      .eq("activity_id", activityId)
      .order("position", { ascending: true }),
    supabase.from("club_activity_participants").select("user_id").eq("activity_id", activityId),
  ]);
  if (itemResult.error) throw itemResult.error;
  if (placementResult.error) throw placementResult.error;
  if (participantResult.error) throw participantResult.error;

  const poolKeys = (itemResult.data ?? []).map((i) => itemKey(i.item_type, i.item_id));
  const participantIds = (participantResult.data ?? []).map((p) => p.user_id);
  if (participantIds.length === 0) return { tiers: config.tiers, boards: [] };

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

  // Colocaciones por persona. Una fila con un tier que NO está en config se ignora (queda
  // como "sin colocar") -- config es opaco a SQL y no puede validarlo, así que ningún dato
  // raro debe poder romper el tablero.
  const placedByUser = new Map<string, Record<string, string[]>>();
  for (const p of placementResult.data ?? []) {
    if (!config.tiers.includes(p.tier)) continue;
    const key = itemKey(p.item_type, p.item_id);
    if (!poolKeys.includes(key)) continue; // el ítem se quitó del pool después de colocarlo
    const byTier = placedByUser.get(p.user_id) ?? {};
    byTier[p.tier] = [...(byTier[p.tier] ?? []), key];
    placedByUser.set(p.user_id, byTier);
  }

  const boards: ParticipantBoard[] = participantIds
    .map((id): ParticipantBoard | null => {
      const identity = identityById.get(id);
      if (!identity) return null;

      const itemKeysByTier: Record<string, string[]> = {};
      const placed = placedByUser.get(id) ?? {};
      for (const tier of config.tiers) itemKeysByTier[tier] = placed[tier] ?? [];

      const placedKeys = new Set(Object.values(itemKeysByTier).flat());
      return {
        userId: id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        isViewer: id === userId,
        itemKeysByTier,
        unplacedItemKeys: poolKeys.filter((k) => !placedKeys.has(k)),
      };
    })
    .filter((b): b is ParticipantBoard => b !== null)
    // El viewer primero: su tablero es el que edita y el que más mira.
    .sort((a, b) => {
      if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
      return a.username.localeCompare(b.username);
    });

  return { tiers: config.tiers, boards };
}

// Upsert de TU colocación. Sin chequeo de rol en la app: la RLS es la autoridad (`insert own`
// / `update own` exigen user_id = auth.uid() y ser participante).
export async function setPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
  tier: string,
  position: number,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("club_activity_placements").upsert(
    {
      activity_id: activityId,
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      tier,
      position,
    },
    { onConflict: "activity_id,user_id,item_type,item_id" },
  );
  if (error) throw error;
}

// Devolver un ítem a la bandeja de "sin colocar".
export async function clearPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_placements")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs/activities/tierlist-types.ts src/lib/clubs/activities/tierlist.ts
git commit -m "feat(h2): tipos y dominio de la tierlist (primer kind con mutaciones)"
```

---

### Task 3: Los campos de config en el composer

**Files:**
- Create: `src/components/clubs/tierlist/tierlist-fields.tsx`

**Interfaces:**
- Consumes: `DEFAULT_TIERS`, `TierlistConfig` (Task 2); el contrato `ConfigFields` del registro (H4): `ComponentType<{ value: Json | null; onChange: (config: Json) => void }>`.
- Produces: `TierlistFields` — se enchufa en `tierlistKind.ConfigFields` (Task 5).

- [ ] **Step 1: El componente**

Crear `src/components/clubs/tierlist/tierlist-fields.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_TIERS, type TierlistConfig } from "@/lib/clubs/activities/tierlist-types";
import { Input } from "@/components/ui/input";

// Campos de configuración de una tierlist en el composer (EPIC-05, Bloque H2). Se enchufan vía
// ActivityKindDefinition.ConfigFields, el hueco que estrenó H4 -- este es su segundo
// consumidor, lo que confirma que la abstracción era la correcta.
//
// Los tiers se escriben como texto separado por comas: es un campo que se rellena UNA vez al
// proponer (luego se congela al activar), así que no merece una UI de chips arrastrables.
export function TierlistFields({
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const [raw, setRaw] = useState(DEFAULT_TIERS.join(", "));

  // El config se recompone en cada cambio y sube al composer, que lo pasa tal cual a
  // proposeActivity. `onChange` es el setState del composer (estable).
  useEffect(() => {
    const tiers = raw
      .split(",")
      .map((tier) => tier.trim())
      .filter(Boolean);
    const config: TierlistConfig = { tiers };
    onChange(config as unknown as Json);
  }, [raw, onChange]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("tierlistTiers")}
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t("tierlistTiersPlaceholder")}
        />
      </label>
      <p className="text-[11px] text-muted-foreground">{t("tierlistTiersHint")}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (las claves i18n llegan en la Task 6; `useTranslations` no falla en compilación por claves que falten).

- [ ] **Step 3: Commit**

```bash
git add src/components/clubs/tierlist/tierlist-fields.tsx
git commit -m "feat(h2): campos de tiers en el composer"
```

---

### Task 4: El tablero — drag & drop entre tiers y botones de tier

**Files:**
- Create: `src/components/clubs/tierlist/tierlist-board.tsx`
- Create: `src/components/clubs/tierlist/tierlist-item.tsx`
- Create: `src/components/clubs/tierlist/tier-row.tsx`

**Interfaces:**
- Consumes: `getTierlists`, `setPlacement`, `clearPlacement` (Task 2); `TierlistView`, `ParticipantBoard` (Task 2); `ActivityDetail` y `ActivityItem` de `@/lib/clubs/activities/core`; `itemKey` de `./list-challenge-types`.
- Produces: `TierlistBoard` — se enchufa en `tierlistKind.DetailExtension` (Task 5), con el contrato del registro: `{ activity: ActivityDetail; viewerId: string; isModerator: boolean; onChanged: () => void }`.

**Contexto de dnd-kit:** el precedente del proyecto es `src/app/cola/queue-list.tsx` (7.22) — una **lista ordenable simple**. Aquí es DnD **entre contenedores** (mover un ítem de un tier a otro, o a la bandeja). Del precedente se reutiliza lo que ya está resuelto allí y aplica igual: `DndContext` con **`id` fijo** (el contador incremental por defecto de dnd-kit rompe la hidratación), `PointerSensor` + `KeyboardSensor`, y **actualización optimista con rollback** si la escritura falla.

- [ ] **Step 1: La ficha de un ítem (arrastrable + botones de tier)**

Crear `src/components/clubs/tierlist/tierlist-item.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ActivityItem } from "@/lib/clubs/activities/core";

// Una portada dentro del tablero. Arrastrable solo si el tablero es el del viewer (las
// tierlists ajenas son de solo lectura).
//
// Los botones de tier NO viven aquí sino en el padre (TierRow / la bandeja), para no repetir
// N botones por cada ítem: en móvil se toca el ítem y se elige tier abajo. Aquí solo el
// arrastre y la portada.
export function TierlistItem({
  item,
  editable,
  selected,
  onSelect,
}: {
  item: ActivityItem;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = `${item.itemType}:${item.itemId}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: !editable,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...(editable ? attributes : {})}
      {...(editable ? listeners : {})}
      onClick={editable ? onSelect : undefined}
      aria-pressed={selected}
      title={item.itemTitle}
      className={`relative h-16 w-11 shrink-0 overflow-hidden rounded border bg-surface-muted ${
        selected ? "border-accent ring-1 ring-accent" : "border-border"
      } ${isDragging ? "opacity-60" : ""} ${editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default"}`}
    >
      {item.itemCoverUrl && (
        <Image src={item.itemCoverUrl} alt={item.itemTitle} fill sizes="44px" className="object-cover" />
      )}
    </button>
  );
}
```

- [ ] **Step 2: La fila de un tier (contenedor soltable)**

Crear `src/components/clubs/tierlist/tier-row.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { TierlistItem } from "./tierlist-item";

// Una fila del tablero: la etiqueta del tier a la izquierda y sus portadas a la derecha.
// `id` es el tier ("S") o "unplaced" para la bandeja -- es lo que dnd-kit devuelve en `over`.
export function TierRow({
  id,
  label,
  items,
  editable,
  selectedKey,
  onSelect,
}: {
  id: string;
  label: string;
  items: ActivityItem[];
  editable: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-sm font-semibold text-foreground">
        {label}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[4.5rem] flex-1 flex-wrap items-center gap-2 rounded-md border p-2 ${
          isOver ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        {items.map((item) => (
          <TierlistItem
            key={`${item.itemType}:${item.itemId}`}
            item={item}
            editable={editable}
            selected={selectedKey === `${item.itemType}:${item.itemId}`}
            onSelect={() => onSelect(`${item.itemType}:${item.itemId}`)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: El tablero**

Crear `src/components/clubs/tierlist/tierlist-board.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import type { ActivityDetail, ActivityItem } from "@/lib/clubs/activities/core";
import { getTierlists, setPlacement, clearPlacement } from "@/lib/clubs/activities/tierlist";
import type { TierlistView } from "@/lib/clubs/activities/tierlist-types";
import { TierRow } from "./tier-row";

const UNPLACED = "unplaced";

// DetailExtension de tierlist (EPIC-05, Bloque H2). Mismo patrón de montaje que los otros tres
// tipos: estado propio con su propio fetch.
//
// Dos caminos para colocar (decisión de diseño):
//   - Arrastrar entre filas (escritorio). DnD ENTRE CONTENEDORES, no una lista ordenable como
//     la cola (7.22) -- de ese precedente se reutiliza el id fijo del DndContext (el contador
//     por defecto de dnd-kit rompe la hidratación) y el patrón optimista con rollback.
//   - Tocar una portada y pulsar un tier abajo (táctil y teclado). En móvil ES la vía principal.
export function TierlistBoard({
  activity,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<TierlistView | null>(null);
  const [shownUserId, setShownUserId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  function refresh() {
    startTransition(async () => {
      const fresh = await getTierlists(activity.id);
      setView(fresh);
    });
  }

  useEffect(() => {
    refresh();
    // refresh se recrea cada render; solo debe re-disparar si cambia la actividad o el pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, activity.items.length]);

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tierlistJoinToSee")}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tierlistNoConfig")}</p>
      </div>
    );
  }

  const board = view.boards.find((b) => b.userId === (shownUserId ?? "")) ?? view.boards[0];
  if (!board) return null;

  const editable = board.isViewer;
  const itemByKey = new Map(activity.items.map((i) => [`${i.itemType}:${i.itemId}`, i]));
  const itemsOf = (keys: string[]): ActivityItem[] =>
    keys.map((k) => itemByKey.get(k)).filter((i): i is ActivityItem => i !== undefined);

  // Mueve un ítem a un tier (o a la bandeja) y persiste. Optimista con rollback: si la
  // escritura falla, se recarga el estado real del servidor.
  function move(key: string, target: string) {
    if (!editable || !view) return;
    const item = itemByKey.get(key);
    if (!item) return;

    const previous = view;
    const next: TierlistView = {
      ...view,
      boards: view.boards.map((b) => {
        if (!b.isViewer) return b;
        const itemKeysByTier = Object.fromEntries(
          Object.entries(b.itemKeysByTier).map(([tier, keys]) => [
            tier,
            keys.filter((k) => k !== key),
          ]),
        );
        const unplaced = b.unplacedItemKeys.filter((k) => k !== key);
        if (target === UNPLACED) {
          return { ...b, itemKeysByTier, unplacedItemKeys: [...unplaced, key] };
        }
        return {
          ...b,
          itemKeysByTier: { ...itemKeysByTier, [target]: [...(itemKeysByTier[target] ?? []), key] },
          unplacedItemKeys: unplaced,
        };
      }),
    };
    setView(next);
    setSelectedKey(null);

    startTransition(async () => {
      try {
        if (target === UNPLACED) {
          await clearPlacement(activity.id, item.itemType, item.itemId);
        } else {
          const position =
            next.boards.find((b) => b.isViewer)?.itemKeysByTier[target].indexOf(key) ?? 0;
          await setPlacement(activity.id, item.itemType, item.itemId, target, position);
        }
      } catch {
        setView(previous); // rollback
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    move(String(active.id), String(over.id));
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>

      {/* Conmutador de participante: la tuya es editable, las demás solo lectura. */}
      <div className="flex flex-wrap gap-2">
        {view.boards.map((b) => (
          <button
            key={b.userId}
            type="button"
            onClick={() => {
              setShownUserId(b.userId);
              setSelectedKey(null);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              b.userId === board.userId
                ? "border-accent text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {b.isViewer ? t("tierlistMine") : b.displayName || b.username}
          </button>
        ))}
      </div>

      <DndContext
        id="tierlist-board"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-2">
          {view.tiers.map((tier) => (
            <TierRow
              key={tier}
              id={tier}
              label={tier}
              items={itemsOf(board.itemKeysByTier[tier] ?? [])}
              editable={editable}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          ))}

          <TierRow
            id={UNPLACED}
            label={t("tierlistUnplacedShort")}
            items={itemsOf(board.unplacedItemKeys)}
            editable={editable}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>
      </DndContext>

      {/* Camino táctil y accesible: seleccionas una portada y eliges tier aquí. En móvil esta
          es la vía principal -- arrastrar entre contenedores compite con el scroll. */}
      {editable && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-muted-foreground">
            {selectedKey ? t("tierlistPickTier") : t("tierlistSelectItem")}
          </p>
          <div className="flex flex-wrap gap-1">
            {view.tiers.map((tier) => (
              <button
                key={tier}
                type="button"
                disabled={!selectedKey}
                onClick={() => selectedKey && move(selectedKey, tier)}
                className="rounded-md border border-border px-3 py-1 text-xs text-foreground disabled:opacity-40 hover:bg-surface-muted"
              >
                {tier}
              </button>
            ))}
            <button
              type="button"
              disabled={!selectedKey}
              onClick={() => selectedKey && move(selectedKey, UNPLACED)}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground disabled:opacity-40 hover:bg-surface-muted"
            >
              {t("tierlistUnplace")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/tierlist/
git commit -m "feat(h2): tablero de tierlist con drag&drop entre tiers y botones de tier"
```

---

### Task 5: Enchufar el kind en el registro

**Files:**
- Modify: `src/lib/clubs/activities/kinds/tierlist.ts`

**Interfaces:**
- Consumes: `TierlistFields` (Task 3), `TierlistBoard` (Task 4).
- Produces: `tierlistKind` completo — `ActivityDetailView` y `ActivityComposer` lo consumen ya, sin cambios (el registro hace el trabajo).

**Contexto:** hoy el fichero es un stub con `itemCuration: "participants"` y `usesItemPool: true`. Nada más del árbol de UI necesita tocarse: `activity-detail.tsx` y `activity-composer.tsx` ya leen `DetailExtension`, `ConfigFields`, `usesItemPool` e `itemCuration` del registro. Ese es el objetivo del dispatcher.

- [ ] **Step 1: Rellenar el kind**

Reescribir `src/lib/clubs/activities/kinds/tierlist.ts`:

```ts
import { TierlistFields } from "@/components/clubs/tierlist/tierlist-fields";
import { TierlistBoard } from "@/components/clubs/tierlist/tierlist-board";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H2 -- tierlist de club: cada participante coloca el pool en tiers y ve las
// tierlists de los demás. Cierra el Bloque H.
//
// itemCuration "curators": el pool ES el enunciado de la tierlist -- si crece a mitad, las
// tierlists ya hechas quedan incompletas. Mismo razonamiento que list_challenge (H3), y espejo
// de la política RLS "club_activity_items insert participant or curator", que este bloque
// reescribió para incluir también tierlist.
export const tierlistKind: ActivityKindDefinition = {
  kind: "tierlist",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "curators",
  usesItemPool: true,
  ConfigFields: TierlistFields,
  DetailExtension: TierlistBoard,
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clubs/activities/kinds/tierlist.ts
git commit -m "feat(h2): enchufar tierlist en el registro de kinds"
```

---

### Task 6: i18n, lint y build

**Files:**
- Modify: `messages/es.json`

- [ ] **Step 1: Claves nuevas**

En `messages/es.json`, dentro del objeto `"activity"` (tras las claves `criteria*`):

```json
    "tierlistTiers": "Tiers",
    "tierlistTiersPlaceholder": "S, A, B, C, D",
    "tierlistTiersHint": "Sepáralos por comas. No se podrán cambiar una vez activada la tierlist.",
    "tierlistTitle": "Tierlist",
    "tierlistJoinToSee": "Únete a la actividad para hacer tu tierlist y ver las de los demás.",
    "tierlistNoConfig": "Esta tierlist todavía no tiene tiers definidos.",
    "tierlistMine": "La mía",
    "tierlistUnplacedShort": "—",
    "tierlistSelectItem": "Toca una portada para colocarla.",
    "tierlistPickTier": "Elige el tier:",
    "tierlistUnplace": "Quitar"
```

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Typecheck, lint y build**

```bash
npx tsc --noEmit
npx eslint src/lib/clubs src/components/clubs
npx next build
```

Expected: los tres sin errores.

Dos avisos de lint que ya mordieron en bloques anteriores y hay que evitar:
- **`react-hooks/set-state-in-effect`**: no llamar a `setState` directamente en el cuerpo de un `useEffect` (mordió en el `SagaPicker` de H4). En `TierlistBoard` el `setView` va dentro de `startTransition`, que es una callback — correcto.
- Un **helper síncrono exportado desde un módulo `"use server"`** rompe el build (mordió en H3). Por eso los tipos y `parseTierlistConfig` viven en `tierlist-types.ts`, que es un módulo plano.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "feat(h2): i18n de la tierlist"
```

---

### Task 7: Checklist manual, backlog y PR

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-epic05-bloque-h2-tierlist-manual-test.md`
- Modify: `docs/requirements/social-epic.md`

- [ ] **Step 1: Checklist manual**

Crear el checklist con el formato de `docs/superpowers/plans/2026-07-13-epic05-bloque-h4-criteria-challenge-manual-test.md`. Debe cubrir:

1. **Setup**: club con A (owner/mod), R (miembro raso) y P (miembro).
2. **Proponer**: R propone una `tierlist`; al elegir ese tipo aparece el campo de **tiers** (con `S, A, B, C, D` por defecto); cambiarlos a otra escala (p.ej. `Top, Bien, Meh`) y proponer.
3. **Curar el pool en `proposed`**: R añade 3-4 ítems **antes** de que nadie active — ✅ funciona (es la relajación de la política).
4. **Un participante raso no cura**: A activa; P se une; ✅ P **no** ve el botón "Añadir ítem", y sí el texto de que solo el creador y los moderadores cambian la lista.
5. **Congelado al activar**: ✅ los tiers ya no se pueden cambiar con la actividad activa.
6. **Colocar arrastrando** (escritorio): arrastrar portadas de la bandeja a los tiers y entre tiers → ✅ se guardan (recargar la página y comprobar que persisten).
7. **Colocar con botones** (⚠️ **viewport estrecho**, DevTools móvil): tocar una portada → se marca; pulsar un tier → ✅ se coloca. Comprobar que la página **no** se rompe ni scrollea raro.
8. **Quitar**: seleccionar un ítem colocado y pulsar "Quitar" → ✅ vuelve a la bandeja.
9. **Ver la de otro**: P coloca su tierlist; A (u otra cuenta participante) cambia al conmutador de P → ✅ ve la tierlist de P, **en solo lectura** (no puede arrastrar ni le salen los botones de tier).
10. **Opiniones**: ✅ la sección de opiniones por ítem sigue apareciendo (viene gratis de Bloque G y es la superficie de debate).
11. **Regresión Q8**: unirse a la tierlist ✅ **no** añade nada a tu biblioteca.
12. **Regresión H3**: un reto por lista sigue funcionando igual (curación y rejilla).
13. Sin errores de consola; limpieza de datos.

- [ ] **Step 2: Backlog**

En `docs/requirements/social-epic.md`:
- Marcar `[x]` **E5.H2a**, **E5.H2b**, **E5.H2c** con nota de estado del bloque (formato de H1/H3/H4).
- **Corregir el texto de E5.H2b**: la **tierlist de consenso queda fuera de alcance por decisión de diseño** (promediar los tiers aplana el desacuerdo, que es justo el punto de una tierlist), **no** pendiente. Las colocaciones están todas guardadas, así que si algún día se echa en falta es un cálculo al vuelo.
- Anotar en la nota de estado: única tabla nueva del Bloque H y **el único tipo sin `SECURITY DEFINER`** (por no leer contenido de perfil); **segundo consumidor de `config`** (la RPC `update_activity_config` de H4 se reutilizó sin cambios); primer tipo con **mutaciones** en su dominio.
- Tabla §5: añadir `club_activity_placements` (H2), señalando que **no necesita `SECURITY DEFINER`** a diferencia de H3/H4.
- **Marcar el Bloque H como COMPLETO.** Del epic quedan **I** (listas colaborativas), **J** (seguridad y moderación) y **K** (extras).

- [ ] **Step 3: Commit, push y PR draft**

```bash
git add docs/
git commit -m "docs(h2): checklist manual y backlog actualizado; Bloque H completo"
git push -u origin worktree-epic05-bloque-h2-tierlist
```

Abrir el PR draft contra `main` (`mcp__github__create_pull_request`, `draft: true`) resumiendo: tierlists individuales sin consenso (y por qué), la única tabla nueva del bloque y por qué es la única sin `SECURITY DEFINER`, el gate de curación extendido a `tierlist` (con la regresión de H3 verificada), los dos caminos de colocación, y que **cierra el Bloque H**. Enlazar el checklist manual en el test plan.

---

## Self-Review

**Cobertura del spec:**
- §1 alcance (tabla propia sin DEFINER, primer kind con mutaciones, segundo consumidor de config) → Tasks 1, 2, 3.
- §1 fuera de alcance (sin consenso) → constraint global; ningún task lo calcula, y la Task 7 **corrige el backlog**.
- §2 decisión 1 (DnD + botones) → Task 4. Decisión 2 (tiers congelados al activar) → Task 3 + la RPC de H4, reutilizada sin cambios. Decisión 3 (sin consenso) → global. Decisión 4 (siempre visibles) → RLS `select participant` (Task 1). Decisión 5 (curación) → Task 1 (RLS) + Task 5 (`itemCuration`).
- §3.1 config → Tasks 2 (`parseTierlistConfig`) y 3 (campos). §3.2 tabla y RLS → Task 1. §3.2 tier desconocido = sin colocar → Task 2 (`getTierlists` lo filtra). §3.3 gate kind-scoped → Task 1.
- §4 dominio (`getTierlists`/`setPlacement`/`clearPlacement`, módulo plano de tipos) → Task 2.
- §5 UI (conmutador, tablero, bandeja, dos caminos, id fijo del DndContext, optimista con rollback) → Task 4. i18n → Task 6.
- §6 verificación (batería RLS con el caso de riesgo del `user_id` ajeno, regresiones H3/Q8; checklist manual con paso táctil) → Tasks 1 y 7.
- §7 enganches al backlog → Task 7.

**Consistencia de tipos:** `TierlistConfig`/`ParticipantBoard`/`TierlistView`/`DEFAULT_TIERS`/`parseTierlistConfig` se definen en `tierlist-types.ts` (Task 2) y se consumen con esos nombres en Tasks 2, 3 y 4. `getTierlists`/`setPlacement`/`clearPlacement` se definen en Task 2 y se consumen en Task 4. `TierlistFields`/`TierlistBoard` se crean en Tasks 3 y 4 y se registran en Task 5. `itemKey` se importa de `list-challenge-types` (H3), no se redefine.

**Nota de orden:** la Task 5 (registro) va después de las Tasks 3 y 4 a propósito, para que el árbol compile en cada commit sin necesidad de stubs.
