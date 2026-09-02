# Mascota fase 2 (misiones diarias y logros) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tres misiones diarias generadas (primario / flojo / azar) que se cumplen solas con la actividad del día y dan XP al atributo, más una galería de logros por umbral, todo en `/mascota`.

**Architecture:** La única decisión guardada es qué tres misiones te tocaron hoy (`pet_daily_missions`); progreso, XP y logros se derivan de las tablas existentes en funciones puras (`src/lib/pet/missions/*`, `achievements.ts`). `getPetSnapshot` sigue siendo el único punto de escritura: genera las misiones del día, marca `completed_at`, y gana celebraciones `pet_mission_done` / `pet_achievement` (scope nuevo `key`) por el canal ganar → drenar que ya existe.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), TypeScript, Vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-02-mascota-misiones-logros-design.md`. Fase 1 en `docs/superpowers/specs/2026-09-02-mascota-rpg-design.md` y `src/lib/pet/`.

## Global Constraints

- **Rama `feat/mascota-rpg`** (PR #1027 abierta). Todo commit va ahí. **Nada sube a producción**: la migración se aplica **solo en `supabase-dev`**; prod al mergear la rama (queda anotado en `data-model.md`).
- **Nada de `use cache`** en nada que toque estas tablas (RLS por `auth.uid()`, regla #437).
- **Números solo en `src/lib/pet/balance.ts`** (`BALANCE.missions`). La XP de cada plantilla se **deriva** de los pesos existentes de `BALANCE` (spec §1.1): `rating` 1, `vote` 1, `new_work` 2, `any_activity` 2, `session_minutes` 2, `note` 3, `quote` 3, `post` 3, `session_pages` 3, `daily_goal` 5, `episodes` 6, `review` 8, `finish_pass` 10. Objetivos: `session_minutes` 20, `session_pages` 30, `episodes` 2, `daily_goal` = objetivo del perfil, resto 1. `finishThreshold` 0.7, `seriesEpisodesLeft` 2, `reviewWindowDays` 7.
- **Reparto**: hueco 0 = primario (ligera/media), hueco 1 = flojo distinto del primario (ligera/media), hueco 2 = azar entre atributos no usados (media, o dura si hay elegible). Máximo una dura, siempre en hueco 2. Sin repetir plantilla ni atributo. Azar determinista por `hash(userId + day)` FNV-1a 32 bits.
- **Duras solo si alcanzables hoy** (spec §1.2) y cuentan progreso **sobre la obra asignada**.
- **Día local**: `todayISO()` / `toISODate(new Date(ts))` de `src/lib/stats/dates.ts`. Nunca `.slice(0, 10)` sobre un timestamptz.
- **`passes.review` NUNCA se lee en la tabla**: solo vía la vista `pass_reviews` (42501 si no).
- **`"use server"`** solo exporta funciones async; `revalidatePath` solo dentro de `src/lib/reactivity/revalidate.ts` (test guardián).
- **Grants por columna** en la migración y fila en `docs/DRIFT-CHECK.md` §6; `data-model.md` §8bis.2; `supabase/schema-baseline.sql`; `database.types.ts` regenerado desde dev.
- **Sin XP por logro; sin logros ocultos; sin botón de reclamar; misiones solo en `/mascota`.**
- **Tests** antes del código (TDD). Suite: `npx vitest run <ruta>`; tipos: `npx tsc --noEmit -p .`.
- **Commits**: mensaje en español, tipo convencional (`feat(pet)`, `test(pet)`, `docs(pet)`), trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`.
- **Desviación consciente de la spec** (registrar en `decisiones.md`, Task 9): la tabla lleva además `item_title text null` para que la tarjeta pinte «Termina *Dune*» sin consultar el catálogo en cada visita ni perder el título si la obra cambia.

---

## File structure

| Fichero | Responsabilidad |
|---|---|
| `src/lib/celebrations/types.ts`, `registry.ts`, `registry.test.ts` | eventos `pet_mission_done`, `pet_achievement`; scope `key` |
| `src/components/celebrations/celebration-overlay.tsx` | texto/glifo/visual de los dos eventos |
| `supabase/migrations/20260903_pet_daily_missions.sql` | tabla, RLS, grants |
| `src/lib/pet/balance.ts` | `BALANCE.missions` |
| `src/lib/pet/missions/templates.ts` | ids, atributo, coste, objetivo y XP por plantilla (derivados) |
| `src/lib/pet/missions/generate.ts` (+ test) | `hashSeed`, `eligibleTemplates`, `pickDailyMissions` |
| `src/lib/pet/missions/progress.ts` (+ test) | `PetDayCounts`, `dayCounts`, `missionProgress` |
| `src/lib/pet/achievements.ts` (+ test) | lista de logros, `achievementProgress`, `unlockedAchievements` |
| `src/lib/pet/counts.ts`, `derive.ts` (+ tests) | `missionXp`, `missionsCompleted`, `bestStreak` en `PetCounts` |
| `src/lib/pet/get-pet-counts.ts` | columnas nuevas, contadores del día, elegibilidad, XP de misiones |
| `src/lib/pet/missions/sync.ts` | generar/insertar/marcar misiones y ganar celebraciones |
| `src/lib/pet/get-pet-snapshot.ts` | orquesta misiones y logros; devuelve vistas |
| `src/components/pet/mission-board.tsx`, `achievement-grid.tsx`, `pet-detail.tsx` | UI |
| `messages/es.json` | `pet.missions.*`, `pet.achievements.*` |
| `e2e/mascota-misiones.spec.ts` | e2e |
| docs: `data-model.md`, `DRIFT-CHECK.md`, `schema-baseline.sql`, `decisiones.md`, `backlog.md`, `docs/architecture/graph.json` | sincronía documental |

---

### Task 1: Celebraciones — scope `key` y eventos `pet_mission_done` / `pet_achievement`

**Files:**
- Modify: `src/lib/celebrations/types.ts`
- Modify: `src/lib/celebrations/registry.ts`
- Modify: `src/components/celebrations/celebration-overlay.tsx`
- Test: `src/lib/celebrations/registry.test.ts`

**Interfaces:**
- Produces: `CelebrationEvent` incluye `"pet_mission_done" | "pet_achievement"`; `CelebrationScope` incluye `"key"`; `CelebrationPayload.key?: string`; `getCelebrationKey({ event: "pet_achievement", key: "notes_50" })` → `"pet_achievement:notes_50"`.

- [ ] **Step 1: Test que falla**

Añade al final de `src/lib/celebrations/registry.test.ts`:

```ts
describe("scope key (misiones y logros de la mascota)", () => {
  it("la clave es evento:key", () => {
    expect(getCelebrationKey({ event: "pet_mission_done", key: "2026-09-03:1" })).toBe("pet_mission_done:2026-09-03:1");
    expect(getCelebrationKey({ event: "pet_achievement", key: "notes_50" })).toBe("pet_achievement:notes_50");
    expect(CELEBRATIONS.pet_mission_done.scope).toBe("key");
    expect(CELEBRATIONS.pet_achievement.scope).toBe("key");
  });
  it("falla si falta key", () => {
    expect(() => getCelebrationKey({ event: "pet_mission_done" })).toThrow();
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/celebrations/registry.test.ts`
Expected: FAIL (tipo `"pet_mission_done"` no asignable / `CELEBRATIONS.pet_mission_done` undefined).

- [ ] **Step 3: Tipos**

En `src/lib/celebrations/types.ts`:

```ts
export type CelebrationEvent =
  | "first_activity_of_day"
  | "daily_goal_completed"
  | "streak_milestone"
  | "first_club_participation"
  | "pet_level_up"
  | "pet_evolved"
  | "pet_mission_done"
  | "pet_achievement";

export type CelebrationScope =
  | "day" // una vez al día — clave incluye la fecha
  | "milestone" // una vez por hito — clave incluye el número
  | "ever" // una sola vez por usuario
  | "key"; // una vez por clave libre — clave incluye payload.key (misión del día y hueco, id de logro)
```

Y en `CelebrationPayload`, tras `date?: string;`:

```ts
  /** Clave libre para los eventos de alcance `key` ("2026-09-03:1", "notes_50"). */
  key?: string;
```

- [ ] **Step 4: Registro**

En `src/lib/celebrations/registry.ts`, añade a `CELEBRATIONS` tras `pet_evolved`:

```ts
  // Mascota fase 2 (spec 2026-09-02-mascota-misiones-logros): se ganan en
  // getPetSnapshot. `key` = "<day>:<slot>" para misiones, id del logro para logros.
  pet_mission_done: {
    event: "pet_mission_done",
    intensity: "medium",
    durationMs: 1400,
    scope: "key",
    reducedMotionFallback: "fade",
  },
  pet_achievement: {
    event: "pet_achievement",
    intensity: "high",
    durationMs: 1800,
    scope: "key",
    reducedMotionFallback: "static",
  },
```

Y en `getCelebrationKey`, un caso más antes de `case "ever"`:

```ts
    case "key": {
      if (!payload.key) {
        throw new Error(`${payload.event} necesita 'key' para su clave`);
      }
      return `${payload.event}:${payload.key}`;
    }
```

Actualiza el comentario de ejemplos de clave encima de la función con dos líneas:

```
//   pet_mission_done:2026-09-03:1
//   pet_achievement:notes_50
```

- [ ] **Step 5: Overlay**

En `src/components/celebrations/celebration-overlay.tsx`:

`messageFor`, tras `case "pet_evolved"`:

```ts
    case "pet_mission_done":
      return "Misión cumplida.";
    case "pet_achievement":
      return "Logro desbloqueado.";
```

`staticGlyph`, tras `case "pet_evolved"`:

```ts
    case "pet_mission_done":
      return "✓";
    case "pet_achievement":
      return "🏆";
```

`Visual`: amplía el caso de la pila de libros para que cubra los cuatro eventos de mascota:

```tsx
    case "pet_level_up":
    case "pet_evolved":
    case "pet_mission_done":
    case "pet_achievement":
      return (
        <div className={styles.stack} aria-hidden="true">
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.stackNum}>{staticGlyph(payload)}</div>
        </div>
      );
```

(`staticGlyph` ya devuelve el nivel para `pet_level_up` y `✦` para `pet_evolved`: el comportamiento anterior se conserva.) El `title` del payload ya se pinta en `<strong>` — la misión y el logro lo rellenan.

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/lib/celebrations && npx tsc --noEmit -p .`
Expected: PASS, sin errores de tipos (el `switch` de `messageFor`/`staticGlyph` es exhaustivo: si falta un caso, `tsc` avisa).

- [ ] **Step 7: Commit**

```bash
git add src/lib/celebrations/types.ts src/lib/celebrations/registry.ts src/lib/celebrations/registry.test.ts src/components/celebrations/celebration-overlay.tsx
git commit -m "feat(celebrations): scope key y eventos pet_mission_done / pet_achievement"
```

---

### Task 2: Migración `pet_daily_missions` (solo dev) + tipos + docs de esquema

**Files:**
- Create: `supabase/migrations/20260903_pet_daily_missions.sql`
- Modify: `supabase/schema-baseline.sql` (anexar al final, misma sentencia)
- Modify: `src/lib/supabase/database.types.ts` (regenerar desde dev)
- Modify: `docs/requirements/data-model.md` (nueva §8bis.2 tras §8bis.1)
- Modify: `docs/DRIFT-CHECK.md` (fila en la tabla de la superficie 6, junto a `pet_state`)

**Interfaces:**
- Produces: tabla `public.pet_daily_missions` con columnas `id, user_id, day, slot, template, target, xp, item_type, item_id, item_title, completed_at, created_at`; `Database["public"]["Tables"]["pet_daily_missions"]`.

- [ ] **Step 1: Migración**

`supabase/migrations/20260903_pet_daily_missions.sql`:

```sql
-- Mascota fase 2 (spec 2026-09-02-mascota-misiones-logros-design.md, §3).
--
-- La única DECISIÓN que se guarda de las misiones: qué tres te tocaron hoy
-- (si se derivaran, mutarían a mediodía al cambiar de clase o subir un
-- atributo). Progreso y XP se derivan en src/lib/pet/missions. `completed_at`
-- lo pone getPetSnapshot cuando el progreso del día alcanza `target`.
-- Objetivo, XP y título se CONGELAN al asignar para que un cambio de balance
-- o de catálogo no reescriba una misión ya vista.

create table public.pet_daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Día LOCAL del usuario (todayISO()), como session_date.
  day date not null,
  slot smallint not null check (slot between 0 and 2),
  -- text, no enum: los ids válidos los fija src/lib/pet/missions/templates.ts.
  template text not null,
  target integer not null check (target > 0),
  xp integer not null check (xp >= 0),
  -- Solo las duras con obra («Termina Dune»): sin FK porque una obra fusionada
  -- o borrada no debe borrar la misión; se compara como "tipo:id".
  item_type text,
  item_id uuid,
  item_title text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day, slot)
);

comment on table public.pet_daily_missions is
  'Mascota fase 2: las tres misiones asignadas por día y usuario. Progreso y XP se derivan (src/lib/pet/missions); completed_at lo sella getPetSnapshot. Ver spec 2026-09-02-mascota-misiones-logros.';

-- Suma de XP de misiones completadas por usuario (getPetCounts).
create index pet_daily_missions_user_completed_idx
  on public.pet_daily_missions (user_id, completed_at);

alter table public.pet_daily_missions enable row level security;

create policy "pet_daily_missions select own" on public.pet_daily_missions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "pet_daily_missions insert own" on public.pet_daily_missions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "pet_daily_missions update own" on public.pet_daily_missions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sin DELETE: las misiones caducan solas (solo se evalúan hoy y ayer).

-- Grant POR COLUMNA (issue #375): una columna nueva sin su grant rompe la
-- escritura entera de la tabla. Al añadir una columna, añádela aquí y pasa la
-- superficie 6 de docs/DRIFT-CHECK.md.
revoke all on public.pet_daily_missions from anon, authenticated;
grant select on public.pet_daily_missions to authenticated;
grant insert (user_id, day, slot, template, target, xp, item_type, item_id, item_title)
  on public.pet_daily_missions to authenticated;
grant update (completed_at) on public.pet_daily_missions to authenticated;
```

- [ ] **Step 2: Aplicar SOLO en dev**

Con el MCP `supabase-dev` → `apply_migration` con `name = "20260903_pet_daily_missions"` y el SQL anterior. **No** tocar `supabase-prod`.

- [ ] **Step 3: Verificar contra objetos reales (no el ledger)**

`supabase-dev` → `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='pet_daily_missions') as columnas,
  (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='pet_daily_missions' and grantee='authenticated' and privilege_type='INSERT') as ins,
  (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='pet_daily_missions' and grantee='authenticated' and privilege_type='UPDATE') as upd,
  (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='pet_daily_missions' and grantee='anon') as anon,
  (select count(*) from pg_policies where tablename='pet_daily_missions') as politicas,
  (select relrowsecurity from pg_class where relname='pet_daily_missions') as rls;
```

Expected: `12 | 9 | 1 | 0 | 3 | true`.

- [ ] **Step 4: Regenerar tipos desde dev**

`supabase-dev` → `generate_typescript_types`; sobrescribe `src/lib/supabase/database.types.ts` con el resultado. Comprueba con `git diff --stat src/lib/supabase/database.types.ts` que el diff es solo `pet_daily_missions` (si aparece otra deriva, no la quites: anótala en el informe).

- [ ] **Step 5: Baseline y docs**

Anexa el SQL de la migración completo al final de `supabase/schema-baseline.sql` bajo un comentario `-- 20260903_pet_daily_missions`.

En `docs/requirements/data-model.md`, tras el párrafo final de §8bis.1 y antes de `## 9. Seguridad`:

```markdown
### 8bis.2. `pet_daily_missions` (**solo dev**, 2026-09-03 — prod al mergear `feat/mascota-rpg`)

Mascota fase 2 (spec `docs/superpowers/specs/2026-09-02-mascota-misiones-logros-design.md`). Tres
filas por usuario y día: `id`, `user_id` (FK cascade), `day` (date, **día local** del usuario),
`slot` (0-2, CHECK), `template` (text; ids en `src/lib/pet/missions/templates.ts`, sin enum),
`target`, `xp` (congelados al asignar), `item_type`/`item_id`/`item_title` (solo las duras con obra;
sin FK a propósito), `completed_at` (lo sella `getPetSnapshot`), `created_at`.
`unique (user_id, day, slot)`; índice `(user_id, completed_at)`.

**Solo la asignación es decisión.** Progreso (`src/lib/pet/missions/progress.ts`) y XP
(`missionXp` en `PetCounts`) se derivan; los logros no tienen tabla: su rastro es la celebración
`pet_achievement:<id>` en `user_celebrations`. Las misiones se evalúan para hoy y ayer; más atrás
caducan sin más.

**RLS**: select/insert/update propias; sin delete. **Grant por columna** (superficie 6): insert
sin `id`/`completed_at`/`created_at`; update solo `completed_at`. Migración
`supabase/migrations/20260903_pet_daily_missions.sql`. Verificado en dev: 12 columnas, 9 con
INSERT, 1 con UPDATE, 0 para `anon`, 3 políticas, RLS activa. **Pendiente en prod** hasta mergear la
rama.
```

En `docs/DRIFT-CHECK.md`, justo debajo de la fila de `pet_state` en la tabla de la superficie 6:

```markdown
| `pet_daily_missions` | 12 | 9 | 1 | `id`/`completed_at`/`created_at` sin INSERT; UPDATE solo `completed_at` (la asignación se congela) |
```

- [ ] **Step 6: Verificar tipos y commit**

Run: `npx tsc --noEmit -p .`
Expected: sin errores.

```bash
git add supabase/migrations/20260903_pet_daily_missions.sql supabase/schema-baseline.sql src/lib/supabase/database.types.ts docs/requirements/data-model.md docs/DRIFT-CHECK.md
git commit -m "feat(pet): tabla pet_daily_missions (dev) con RLS y grants por columna"
```

---

### Task 3: Plantillas, balance y generador determinista

**Files:**
- Modify: `src/lib/pet/balance.ts`
- Create: `src/lib/pet/missions/templates.ts`
- Create: `src/lib/pet/missions/generate.ts`
- Test: `src/lib/pet/missions/generate.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `PET_ATTRIBUTES`, `PetAttribute`, `PetAttributes` (`src/lib/pet/classes.ts`).
- Produces:
  - `MISSION_TEMPLATES`, `MissionTemplate`, `MissionCost`, `MISSION_ATTR`, `MISSION_COST`, `missionXp(t)`, `missionTarget(t, dailyGoal)`, `isMissionTemplate(s)`.
  - `MissionEligibility`, `MissionCandidate`, `MissionPick`, `hashSeed(s)`, `eligibleTemplates(e)`, `pickDailyMissions(seed, primary, attributes, eligibility)`.

- [ ] **Step 1: Balance**

En `src/lib/pet/balance.ts`, dentro de `BALANCE` tras `history`:

```ts
  // Misiones diarias (spec fase 2 §1). La XP de cada plantilla NO se lista
  // aquí: se deriva de los pesos de arriba en missions/templates.ts.
  missions: {
    targets: { session_minutes: 20, session_pages: 30, episodes: 2 },
    // finish_pass elegible: libro con posición >= 70 % de sus páginas o serie
    // con <= 2 episodios sin ver. review elegible: terminado en los últimos 7 días.
    finishThreshold: 0.7,
    seriesEpisodesLeft: 2,
    reviewWindowDays: 7,
  },
```

- [ ] **Step 2: Plantillas**

`src/lib/pet/missions/templates.ts`:

```ts
import { BALANCE } from "../balance";
import type { PetAttribute } from "../classes";

// Una plantilla por línea, sin lógica (spec fase 2 §1.1). Los números viven
// en BALANCE; la XP se deriva de los pesos orgánicos: una misión duplica lo que
// la acción ya da, nunca más.
export const MISSION_TEMPLATES = [
  "rating",
  "vote",
  "new_work",
  "any_activity",
  "session_minutes",
  "note",
  "quote",
  "post",
  "session_pages",
  "daily_goal",
  "episodes",
  "review",
  "finish_pass",
] as const;

export type MissionTemplate = (typeof MISSION_TEMPLATES)[number];
export type MissionCost = "light" | "medium" | "hard";

export function isMissionTemplate(s: string): s is MissionTemplate {
  return (MISSION_TEMPLATES as readonly string[]).includes(s);
}

export const MISSION_ATTR: Record<MissionTemplate, PetAttribute> = {
  rating: "SAB",
  vote: "CAR",
  new_work: "DES",
  any_activity: "CON",
  session_minutes: "FUE",
  note: "SAB",
  quote: "SAB",
  post: "CAR",
  session_pages: "FUE",
  daily_goal: "CON",
  episodes: "FUE",
  review: "SAB",
  finish_pass: "INT",
};

export const MISSION_COST: Record<MissionTemplate, MissionCost> = {
  rating: "light",
  vote: "light",
  new_work: "light",
  any_activity: "light",
  session_minutes: "light",
  note: "medium",
  quote: "medium",
  post: "medium",
  session_pages: "medium",
  daily_goal: "medium",
  episodes: "medium",
  review: "hard",
  finish_pass: "hard",
};

/** Objetivo de la plantilla. `daily_goal` copia el objetivo del perfil (minutos). */
export function missionTarget(t: MissionTemplate, dailyGoal: number | null): number {
  const T = BALANCE.missions.targets;
  switch (t) {
    case "session_minutes":
      return T.session_minutes;
    case "session_pages":
      return T.session_pages;
    case "episodes":
      return T.episodes;
    case "daily_goal":
      return Math.max(1, dailyGoal ?? 1);
    default:
      return 1;
  }
}

/** XP de la misión = la orgánica que ya da la acción (spec §1.1). */
export function missionXp(t: MissionTemplate): number {
  const B = BALANCE;
  const T = B.missions.targets;
  switch (t) {
    case "rating":
      return B.SAB.perRating;
    case "vote":
      return B.CAR.perVote;
    case "new_work":
      return B.DES.perNewWork;
    case "any_activity":
      return B.CON.perActiveDay;
    case "session_minutes":
      return Math.floor(T.session_minutes / 10) * B.FUE.perSessionUnit;
    case "note":
      return B.SAB.perNote;
    case "quote":
      return B.SAB.perQuote;
    case "post":
      return B.CAR.perPost;
    case "session_pages":
      return Math.floor(T.session_pages / 10) * B.FUE.perSessionUnit;
    case "daily_goal":
      return B.CON.perDailyGoalDay;
    case "episodes":
      return T.episodes * B.FUE.perEpisode;
    case "review":
      return B.SAB.perReview;
    case "finish_pass":
      return B.INT.perFinishedPass;
  }
}
```

- [ ] **Step 3: Test del generador (falla)**

`src/lib/pet/missions/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { PET_ATTRIBUTES, type PetAttributes } from "../classes";
import { eligibleTemplates, hashSeed, pickDailyMissions, type MissionEligibility } from "./generate";
import { MISSION_ATTR, MISSION_COST, missionXp } from "./templates";

const ALL: MissionEligibility = {
  hasClub: true,
  hasOpenSeries: true,
  dailyGoal: 30,
  finishCandidate: { itemType: "book", itemId: "b1", title: "Dune" },
  reviewCandidate: { itemType: "book", itemId: "b2", title: "Emma" },
};
const NONE: MissionEligibility = { hasClub: false, hasOpenSeries: false, dailyGoal: null, finishCandidate: null, reviewCandidate: null };
const flat: PetAttributes = { FUE: 10, CON: 10, INT: 10, SAB: 10, CAR: 10, DES: 10 };

describe("hashSeed", () => {
  it("es determinista y distingue seeds", () => {
    expect(hashSeed("u1:2026-09-03")).toBe(hashSeed("u1:2026-09-03"));
    expect(hashSeed("u1:2026-09-03")).not.toBe(hashSeed("u1:2026-09-04"));
  });
});

describe("eligibleTemplates", () => {
  it("sin club, sin serie, sin objetivo y sin candidatas quita post/vote/episodes/daily_goal/review/finish_pass", () => {
    const e = eligibleTemplates(NONE);
    expect(e).toEqual(["rating", "new_work", "any_activity", "session_minutes", "note", "quote", "session_pages"]);
  });
  it("con todo, todas", () => {
    expect(eligibleTemplates(ALL)).toHaveLength(13);
  });
});

describe("pickDailyMissions", () => {
  it("devuelve 3 huecos: primario, flojo (distinto del primario) y azar, sin repetir atributo ni plantilla", () => {
    const attrs: PetAttributes = { ...flat, SAB: 0 };
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", attrs, ALL);
    expect(picks).toHaveLength(3);
    expect(MISSION_ATTR[picks[0].template]).toBe("FUE");
    expect(MISSION_ATTR[picks[1].template]).toBe("SAB");
    const attrsUsed = picks.map((p) => MISSION_ATTR[p.template]);
    expect(new Set(attrsUsed).size).toBe(3);
    expect(new Set(picks.map((p) => p.template)).size).toBe(3);
  });

  it("es determinista por seed y cambia con el seed", () => {
    const a = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    const b = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    expect(a).toEqual(b);
    const seeds = Array.from({ length: 30 }, (_, i) => `u1:2026-09-${String(i + 1).padStart(2, "0")}`);
    const distinct = new Set(seeds.map((s) => JSON.stringify(pickDailyMissions(s, "FUE", flat, ALL))));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("los huecos 0 y 1 nunca son duras; la dura solo va en el hueco 2 y como mucho una", () => {
    for (let i = 0; i < 40; i++) {
      const picks = pickDailyMissions(`u${i}:2026-09-03`, "SAB", { ...flat, INT: 0 }, ALL);
      expect(MISSION_COST[picks[0].template]).not.toBe("hard");
      expect(MISSION_COST[picks[1].template]).not.toBe("hard");
      expect(picks.filter((p) => MISSION_COST[p.template] === "hard").length).toBeLessThanOrEqual(1);
    }
  });

  it("con una dura elegible cuyo atributo no está usado, el hueco 2 es esa dura y lleva la obra", () => {
    // Primario FUE, flojo CAR (0). INT queda libre → finish_pass.
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", { ...flat, CAR: 0 }, { ...ALL, reviewCandidate: null });
    expect(picks[2].template).toBe("finish_pass");
    expect(picks[2]).toMatchObject({ itemType: "book", itemId: "b1", title: "Dune", target: 1, xp: BALANCE.INT.perFinishedPass });
  });

  it("sin duras elegibles, el hueco 2 es media (o ligera si no queda media)", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", { ...flat, CAR: 0 }, { ...ALL, finishCandidate: null, reviewCandidate: null });
    expect(MISSION_COST[picks[2].template]).not.toBe("hard");
  });

  it("si el flojo empata, gana el primero en el orden de PET_ATTRIBUTES distinto del primario", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    // Todos empatan: el primero distinto de FUE en el orden es CON.
    expect(MISSION_ATTR[picks[1].template]).toBe(PET_ATTRIBUTES.filter((a) => a !== "FUE")[0]);
  });

  it("un atributo sin plantilla elegible cede el hueco al siguiente del orden", () => {
    // Sin club: CAR no tiene plantillas. Primario CAR → hueco 0 toma el siguiente con plantillas.
    const picks = pickDailyMissions("u1:2026-09-03", "CAR", flat, NONE);
    expect(MISSION_ATTR[picks[0].template]).not.toBe("CAR");
    expect(picks).toHaveLength(3);
  });

  it("congela objetivo y XP: daily_goal copia el objetivo del perfil", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "CON", { ...flat, CON: 0 }, { ...NONE, dailyGoal: 45 });
    const dg = picks.find((p) => p.template === "daily_goal");
    if (dg) expect(dg.target).toBe(45);
    for (const p of picks) expect(p.xp).toBe(missionXp(p.template));
  });
});
```

- [ ] **Step 4: Comprobar que falla**

Run: `npx vitest run src/lib/pet/missions/generate.test.ts`
Expected: FAIL (`./generate` no existe).

- [ ] **Step 5: Generador**

`src/lib/pet/missions/generate.ts`:

```ts
import { PET_ATTRIBUTES, type PetAttribute, type PetAttributes } from "../classes";
import {
  MISSION_ATTR,
  MISSION_COST,
  MISSION_TEMPLATES,
  missionTarget,
  missionXp,
  type MissionTemplate,
} from "./templates";

// Generación PURA de las tres misiones del día (spec fase 2 §1.3). Quien llama
// trae el seed (userId + día), el primario, los atributos y qué es elegible.

export interface MissionCandidate {
  itemType: string;
  itemId: string;
  title: string;
}

export interface MissionEligibility {
  hasClub: boolean;
  hasOpenSeries: boolean;
  /** `profiles.daily_goal_minutes`, null si no hay objetivo. */
  dailyGoal: number | null;
  /** Pase a punto de acabar (libro >= 70 % o serie con <= 2 episodios), o null. */
  finishCandidate: MissionCandidate | null;
  /** Terminado en los últimos 7 días sin reseña, o null. */
  reviewCandidate: MissionCandidate | null;
}

export interface MissionPick {
  template: MissionTemplate;
  target: number;
  xp: number;
  itemType?: string;
  itemId?: string;
  title?: string;
}

/** FNV-1a de 32 bits: determinista, sin dependencias. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Plantillas que tienen sentido HOY para este usuario (spec §1.2), en el orden de MISSION_TEMPLATES. */
export function eligibleTemplates(e: MissionEligibility): MissionTemplate[] {
  return MISSION_TEMPLATES.filter((t) => {
    switch (t) {
      case "daily_goal":
        return e.dailyGoal != null && e.dailyGoal > 0;
      case "post":
      case "vote":
        return e.hasClub;
      case "episodes":
        return e.hasOpenSeries;
      case "finish_pass":
        return e.finishCandidate != null;
      case "review":
        return e.reviewCandidate != null;
      default:
        return true;
    }
  });
}

function makeRng(seed: string): () => number {
  // xorshift32 sembrado con FNV-1a; devuelve enteros no negativos.
  let x = hashSeed(seed) || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

function toPick(t: MissionTemplate, e: MissionEligibility): MissionPick {
  const base: MissionPick = { template: t, target: missionTarget(t, e.dailyGoal), xp: missionXp(t) };
  const c = t === "finish_pass" ? e.finishCandidate : t === "review" ? e.reviewCandidate : null;
  return c ? { ...base, itemType: c.itemType, itemId: c.itemId, title: c.title } : base;
}

export function pickDailyMissions(
  seed: string,
  primary: PetAttribute,
  attributes: PetAttributes,
  eligibility: MissionEligibility,
): MissionPick[] {
  const rng = makeRng(seed);
  const eligible = eligibleTemplates(eligibility);
  const usedTemplates = new Set<MissionTemplate>();
  const usedAttrs = new Set<PetAttribute>();
  const picks: MissionPick[] = [];

  const pool = (attr: PetAttribute, costs: readonly ("light" | "medium" | "hard")[]) =>
    eligible.filter((t) => MISSION_ATTR[t] === attr && costs.includes(MISSION_COST[t]) && !usedTemplates.has(t));

  const take = (candidates: MissionTemplate[]) => {
    const t = candidates[rng() % candidates.length];
    usedTemplates.add(t);
    usedAttrs.add(MISSION_ATTR[t]);
    picks.push(toPick(t, eligibility));
  };

  // Hueco 0 y 1: un atributo preferido; si no tiene plantilla elegible, el
  // siguiente del orden de PET_ATTRIBUTES que sí tenga (spec §1.3).
  const fillFrom = (preferred: PetAttribute[], costs: readonly ("light" | "medium")[]) => {
    for (const attr of preferred) {
      if (usedAttrs.has(attr)) continue;
      const c = pool(attr, costs);
      if (c.length > 0) {
        take(c);
        return;
      }
    }
  };

  const order = [...PET_ATTRIBUTES];
  // Hueco 0: primario.
  fillFrom([primary, ...order.filter((a) => a !== primary)], ["light", "medium"]);

  // Hueco 1: el más flojo distinto del primario (empate: orden de la tabla).
  const weakestFirst = order
    .filter((a) => a !== primary)
    .sort((a, b) => attributes[a] - attributes[b] || order.indexOf(a) - order.indexOf(b));
  fillFrom(weakestFirst, ["light", "medium"]);

  // Hueco 2: azar entre atributos no usados; dura si hay alguna elegible.
  const free = order.filter((a) => !usedAttrs.has(a));
  const hard = free.flatMap((a) => pool(a, ["hard"]));
  if (hard.length > 0) take(hard);
  else {
    const medium = free.flatMap((a) => pool(a, ["medium"]));
    if (medium.length > 0) take(medium);
    else {
      const light = free.flatMap((a) => pool(a, ["light"]));
      if (light.length > 0) take(light);
    }
  }

  // Red de seguridad: si algún hueco quedó vacío (elegibilidad mínima), rellena
  // con cualquier plantilla no usada, aunque repita atributo.
  while (picks.length < 3) {
    const rest = eligible.filter((t) => !usedTemplates.has(t) && MISSION_COST[t] !== "hard");
    if (rest.length === 0) break;
    take(rest);
  }
  return picks;
}
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/lib/pet/missions/generate.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pet/balance.ts src/lib/pet/missions/templates.ts src/lib/pet/missions/generate.ts src/lib/pet/missions/generate.test.ts
git commit -m "feat(pet): plantillas de misión y generador determinista primario/flojo/azar"
```

---

### Task 4: Contadores del día y progreso de misión (puros)

**Files:**
- Create: `src/lib/pet/missions/progress.ts`
- Test: `src/lib/pet/missions/progress.test.ts`

**Interfaces:**
- Consumes: `SessionRow`, `PassRow` de `src/lib/pet/counts.ts`; `MissionTemplate`.
- Produces: `PetDayCounts`, `DayRows`, `dayCounts(rows, dayISO, toDay)`, `MissionLike`, `missionProgress(m, day)`, `EMPTY_DAY_COUNTS`.

- [ ] **Step 1: Test (falla)**

`src/lib/pet/missions/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayCounts, missionProgress, type DayRows, type PetDayCounts } from "./progress";

const day = (ts: string) => ts.slice(0, 10);

const ROWS: DayRows = {
  sessions: [
    { pass_id: "A", duration_minutes: 15, position: 100, session_date: "2026-09-02", started_at: "2026-09-02T20:00:00Z" },
    { pass_id: "A", duration_minutes: 10, position: 130, session_date: "2026-09-03", started_at: "2026-09-03T08:00:00Z" },
    { pass_id: "A", duration_minutes: 12, position: 120, session_date: "2026-09-03", started_at: "2026-09-03T09:00:00Z" },
    { pass_id: "B", duration_minutes: 5, position: null, session_date: "2026-09-03", started_at: null },
  ],
  episodes: [
    { watched_on: "2026-09-03", rating: 4 },
    { watched_on: "2026-09-02", rating: null },
  ],
  passes: [
    { item_type: "book", item_id: "b1", status: "completed", finished_on: "2026-09-03", rating: 5, created_at: "2026-08-01T10:00:00.5Z", updated_at: "2026-09-03T10:00:00.5Z", lived: true },
    { item_type: "book", item_id: "b2", status: "in_progress", finished_on: null, rating: null, created_at: "2026-09-03T11:00:00.5Z", updated_at: "2026-09-03T11:00:00.5Z", lived: true },
    { item_type: "book", item_id: "b3", status: "completed", finished_on: "2020-01-01", rating: 3, created_at: "2026-09-03T11:00:00.5Z", updated_at: "2026-09-03T11:00:00.5Z", lived: false },
  ],
  notes: [
    { kind: "note", created_at: "2026-09-03T12:00:00.5Z" },
    { kind: "quote", created_at: "2026-09-03T12:30:00.5Z" },
    { kind: "note", created_at: "2026-09-02T12:00:00.5Z" },
  ],
  posts: [{ kind: "text", created_at: "2026-09-03T13:00:00.5Z" }, { kind: "poll", created_at: "2026-09-03T13:00:00.5Z" }],
  votes: [{ voted_at: "2026-09-03T14:00:00.5Z" }],
  reviewedKeys: ["book:b1"],
};

describe("dayCounts", () => {
  it("solo cuenta las filas del día pedido; las páginas se miden contra la sesión anterior aunque sea de otro día", () => {
    const d = dayCounts(ROWS, "2026-09-03", day);
    expect(d.minutes).toBe(10 + 12 + 5);
    // A: 100 (ayer) → 130 hoy = 30; 130 → 120 = retroceso = 0. B sin posición.
    expect(d.pages).toBe(30);
    expect(d.episodes).toBe(1);
    expect(d.finishedKeys).toEqual(["book:b1"]);
    expect(d.notes).toBe(1);
    expect(d.quotes).toBe(1);
    // b1 valorado hoy (updated_at hoy) + episodio con nota hoy; b3 es historial y no cuenta
    expect(d.ratings).toBe(2);
    expect(d.posts).toBe(1);
    expect(d.votes).toBe(1);
    // b2 creado hoy y vivido; b3 creado hoy pero historial
    expect(d.newWorks).toBe(1);
    expect(d.reviewedKeys).toEqual(["book:b1"]);
  });

  it("otro día: vacío salvo lo suyo", () => {
    const d = dayCounts(ROWS, "2026-09-02", day);
    expect(d.minutes).toBe(15);
    expect(d.pages).toBe(100);
    expect(d.notes).toBe(1);
    expect(d.finishedKeys).toEqual([]);
  });
});

describe("missionProgress", () => {
  const d: PetDayCounts = {
    minutes: 25, pages: 30, episodes: 1, finishedKeys: ["book:b1"], notes: 1, quotes: 0, ratings: 2,
    reviewedKeys: ["book:b1"], posts: 0, votes: 1, newWorks: 1,
  };
  it("cada plantilla lee su contador", () => {
    expect(missionProgress({ template: "session_minutes", target: 20, item_type: null, item_id: null }, d)).toBe(25);
    expect(missionProgress({ template: "session_pages", target: 30, item_type: null, item_id: null }, d)).toBe(30);
    expect(missionProgress({ template: "daily_goal", target: 30, item_type: null, item_id: null }, d)).toBe(25);
    expect(missionProgress({ template: "episodes", target: 2, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "note", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "quote", target: 1, item_type: null, item_id: null }, d)).toBe(0);
    expect(missionProgress({ template: "rating", target: 1, item_type: null, item_id: null }, d)).toBe(2);
    expect(missionProgress({ template: "post", target: 1, item_type: null, item_id: null }, d)).toBe(0);
    expect(missionProgress({ template: "vote", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "new_work", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "any_activity", target: 1, item_type: null, item_id: null }, d)).toBe(1);
  });
  it("las duras solo cuentan la obra asignada", () => {
    expect(missionProgress({ template: "finish_pass", target: 1, item_type: "book", item_id: "b1" }, d)).toBe(1);
    expect(missionProgress({ template: "finish_pass", target: 1, item_type: "book", item_id: "b9" }, d)).toBe(0);
    expect(missionProgress({ template: "review", target: 1, item_type: "book", item_id: "b1" }, d)).toBe(1);
    expect(missionProgress({ template: "review", target: 1, item_type: "book", item_id: "b9" }, d)).toBe(0);
  });
  it("any_activity es 0 sin nada", () => {
    const empty: PetDayCounts = { minutes: 0, pages: 0, episodes: 0, finishedKeys: [], notes: 0, quotes: 0, ratings: 0, reviewedKeys: [], posts: 0, votes: 0, newWorks: 0 };
    expect(missionProgress({ template: "any_activity", target: 1, item_type: null, item_id: null }, empty)).toBe(0);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/pet/missions/progress.test.ts`
Expected: FAIL (`./progress` no existe).

- [ ] **Step 3: Implementación**

`src/lib/pet/missions/progress.ts`:

```ts
import type { SessionRow } from "../counts";
import type { MissionTemplate } from "./templates";

// Contadores de UN día local y progreso de una misión (spec fase 2 §1.4).
// Puros: getPetCounts trae las filas y la función que convierte un timestamp
// en día local (toISODate); aquí no hay fechas del sistema.

export interface PetDayCounts {
  minutes: number;
  pages: number;
  episodes: number;
  /** Obras terminadas ese día, como "tipo:id" (para «Termina X»). */
  finishedKeys: string[];
  notes: number;
  quotes: number;
  ratings: number;
  /** Obras con reseña no vacía AHORA (estado, no día): para «Reseña X». */
  reviewedKeys: string[];
  posts: number;
  votes: number;
  newWorks: number;
}

export const EMPTY_DAY_COUNTS: PetDayCounts = {
  minutes: 0, pages: 0, episodes: 0, finishedKeys: [], notes: 0, quotes: 0, ratings: 0,
  reviewedKeys: [], posts: 0, votes: 0, newWorks: 0,
};

export interface DayRows {
  sessions: SessionRow[];
  episodes: { watched_on: string; rating: number | null }[];
  passes: {
    item_type: string;
    item_id: string;
    status: string;
    finished_on: string | null;
    rating: number | null;
    created_at: string;
    updated_at: string;
    /** false = historial (splitPassHistory): no cuenta como obra nueva ni valoración del día. */
    lived: boolean;
  }[];
  notes: { kind: string; created_at: string }[];
  posts: { kind: string; created_at: string }[];
  votes: { voted_at: string }[];
  reviewedKeys: string[];
}

/** Páginas avanzadas en las sesiones de `dayISO`, con la misma regla que
 *  sessionUnits (diferencia con la sesión anterior del MISMO pase, retroceso =
 *  0 y no baja la referencia), pero sumando solo las del día. */
function pagesOn(rows: SessionRow[], dayISO: string): number {
  const byPass = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = byPass.get(r.pass_id) ?? [];
    list.push(r);
    byPass.set(r.pass_id, list);
  }
  let pages = 0;
  for (const list of byPass.values()) {
    list.sort((a, b) =>
      `${a.session_date}${a.started_at ?? ""}`.localeCompare(`${b.session_date}${b.started_at ?? ""}`),
    );
    let prev = 0;
    for (const r of list) {
      const advanced = r.position == null ? 0 : Math.max(0, r.position - prev);
      if (r.position != null) prev = Math.max(prev, r.position);
      if (r.session_date === dayISO) pages += advanced;
    }
  }
  return pages;
}

export function dayCounts(rows: DayRows, dayISO: string, toDay: (ts: string) => string): PetDayCounts {
  const isDay = (ts: string) => toDay(ts) === dayISO;
  const todaySessions = rows.sessions.filter((s) => s.session_date === dayISO);
  const todayEpisodes = rows.episodes.filter((e) => e.watched_on === dayISO);
  const livedToday = rows.passes.filter((p) => p.lived);
  return {
    minutes: todaySessions.reduce((n, s) => n + (s.duration_minutes ?? 0), 0),
    pages: pagesOn(rows.sessions, dayISO),
    episodes: todayEpisodes.length,
    finishedKeys: rows.passes.filter((p) => p.finished_on === dayISO).map((p) => `${p.item_type}:${p.item_id}`),
    notes: rows.notes.filter((n) => n.kind === "note" && isDay(n.created_at)).length,
    quotes: rows.notes.filter((n) => n.kind === "quote" && isDay(n.created_at)).length,
    ratings:
      livedToday.filter((p) => p.rating != null && isDay(p.updated_at)).length +
      todayEpisodes.filter((e) => e.rating != null).length,
    reviewedKeys: [...rows.reviewedKeys],
    posts: rows.posts.filter((p) => p.kind !== "poll" && isDay(p.created_at)).length,
    votes: rows.votes.filter((v) => isDay(v.voted_at)).length,
    newWorks: new Set(livedToday.filter((p) => isDay(p.created_at)).map((p) => `${p.item_type}:${p.item_id}`)).size,
  };
}

export interface MissionLike {
  template: MissionTemplate;
  target: number;
  item_type: string | null;
  item_id: string | null;
}

export function missionProgress(m: MissionLike, d: PetDayCounts): number {
  const key = m.item_type && m.item_id ? `${m.item_type}:${m.item_id}` : null;
  switch (m.template) {
    case "rating":
      return d.ratings;
    case "vote":
      return d.votes;
    case "new_work":
      return d.newWorks;
    case "any_activity":
      return d.minutes > 0 || d.episodes > 0 || d.finishedKeys.length > 0 || d.notes > 0 || d.quotes > 0 || d.posts > 0 || d.votes > 0 ? 1 : 0;
    case "session_minutes":
    case "daily_goal":
      return d.minutes;
    case "note":
      return d.notes;
    case "quote":
      return d.quotes;
    case "post":
      return d.posts;
    case "session_pages":
      return d.pages;
    case "episodes":
      return d.episodes;
    case "review":
      return key && d.reviewedKeys.includes(key) ? 1 : 0;
    case "finish_pass":
      return key && d.finishedKeys.includes(key) ? 1 : 0;
  }
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/pet/missions/progress.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/missions/progress.ts src/lib/pet/missions/progress.test.ts
git commit -m "feat(pet): contadores del día y progreso de misión (puros)"
```

---

### Task 5: Logros por umbral (puros)

**Files:**
- Modify: `src/lib/pet/counts.ts` (tres contadores nuevos en `PetCounts`/`EMPTY_COUNTS`)
- Modify: `src/lib/pet/derive.ts` (suma `missionXp`)
- Modify: `src/lib/pet/derive.test.ts`
- Create: `src/lib/pet/achievements.ts`
- Test: `src/lib/pet/achievements.test.ts`

**Interfaces:**
- Produces: `PetCounts.missionXp: Record<PetAttribute, number>`, `PetCounts.missionsCompleted: number`, `PetCounts.bestStreak: number`; `ACHIEVEMENTS`, `AchievementId`, `AchievementProgress`, `achievementProgress(counts, level)`, `unlockedAchievements(counts, level)`.

- [ ] **Step 1: Contadores en `counts.ts`**

En `PetCounts`, tras `historicalWorks: number;`:

```ts
  /** XP ganada con misiones completadas, ya agrupada por el atributo de su plantilla. */
  missionXp: Record<PetAttribute, number>;
  missionsCompleted: number;
  /** Mejor racha de días activos (getStreaks().best). */
  bestStreak: number;
```

Añade el import al principio de `counts.ts`: `import type { PetAttribute } from "./classes";`

En `EMPTY_COUNTS`, tras `historicalWorks: 0,`:

```ts
  missionXp: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  missionsCompleted: 0,
  bestStreak: 0,
```

- [ ] **Step 2: Derivación**

En `src/lib/pet/derive.ts`, `deriveAttributes` pasa a sumar la XP de misiones a cada atributo. Sustituye el cuerpo por:

```ts
export function deriveAttributes(c: PetCounts): PetAttributes {
  const B = BALANCE;
  const m = c.missionXp;
  return {
    FUE: c.sessionUnits * B.FUE.perSessionUnit + c.episodes * B.FUE.perEpisode + m.FUE,
    CON:
      c.activeDays * B.CON.perActiveDay +
      c.dailyGoalDays * B.CON.perDailyGoalDay +
      c.streakMilestones * B.CON.perStreakMilestone +
      m.CON,
    INT:
      c.finishedPasses * B.INT.perFinishedPass +
      c.completedSagas * B.INT.perCompletedSaga +
      c.distinctGenres * B.INT.perDistinctGenre +
      Math.min(c.historicalPasses, B.INT.historicalPassCap) * B.INT.perHistoricalPass +
      m.INT,
    SAB:
      c.notes * B.SAB.perNote +
      c.quotes * B.SAB.perQuote +
      c.reviews * B.SAB.perReview +
      c.ratings * B.SAB.perRating +
      m.SAB,
    CAR:
      c.posts * B.CAR.perPost +
      c.votes * B.CAR.perVote +
      c.polls * B.CAR.perPoll +
      c.events * B.CAR.perEvent +
      c.follows * B.CAR.perFollow +
      m.CAR,
    DES:
      c.newWorks * B.DES.perNewWork +
      c.newAuthors * B.DES.perNewAuthor +
      Math.min(c.historicalWorks, B.DES.historicalWorkCap) * B.DES.perHistoricalWork +
      m.DES,
  };
}
```

Test en `src/lib/pet/derive.test.ts`, dentro de `describe("deriveAttributes")`:

```ts
  it("la XP de misiones entra en su atributo sin tope", () => {
    const a = deriveAttributes({ ...EMPTY_COUNTS, missionXp: { FUE: 0, CON: 0, INT: 0, SAB: 7, CAR: 0, DES: 100_000 } });
    expect(a.SAB).toBe(7);
    expect(a.DES).toBe(100_000);
  });
```

- [ ] **Step 3: Test de logros (falla)**

`src/lib/pet/achievements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, achievementProgress, unlockedAchievements } from "./achievements";
import { EMPTY_COUNTS } from "./counts";

describe("achievements", () => {
  it("con cero nada, y el progreso enseña valor y umbral de todos", () => {
    expect(unlockedAchievements(EMPTY_COUNTS, 1)).toEqual([]);
    const p = achievementProgress(EMPTY_COUNTS, 1);
    expect(p).toHaveLength(ACHIEVEMENTS.length);
    expect(p.every((a) => a.value === 0 && a.threshold > 0 && !a.unlocked)).toBe(true);
  });

  it("umbrales: justo debajo no, en el umbral sí", () => {
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 9 }, 1)).toEqual([]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 10 }, 1)).toEqual(["finished_10"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 100 }, 1)).toEqual(["finished_10", "finished_50", "finished_100"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, notes: 30, quotes: 20 }, 1)).toEqual(["notes_50"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, bestStreak: 30 }, 1)).toEqual(["streak_30"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, missionsCompleted: 50 }, 1)).toEqual(["missions_50"]);
  });

  it("adult y veteran salen del nivel", () => {
    expect(unlockedAchievements(EMPTY_COUNTS, 10)).toEqual(["adult"]);
    expect(unlockedAchievements(EMPTY_COUNTS, 40)).toEqual(["adult", "veteran"]);
  });

  it("ids únicos", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
```

- [ ] **Step 4: Comprobar que falla**

Run: `npx vitest run src/lib/pet/achievements.test.ts`
Expected: FAIL (`./achievements` no existe).

- [ ] **Step 5: Logros**

`src/lib/pet/achievements.ts`:

```ts
import type { PetCounts } from "./counts";

// Logros = umbrales sobre contadores que ya existen (spec fase 2 §2). Sin XP,
// sin tabla: desbloqueado ⟺ valor >= umbral. El rastro (y la fecha) es la
// celebración pet_achievement:<id> en user_celebrations.

export const ACHIEVEMENTS = [
  { id: "finished_10", threshold: 10, value: (c: PetCounts) => c.finishedPasses },
  { id: "finished_50", threshold: 50, value: (c: PetCounts) => c.finishedPasses },
  { id: "finished_100", threshold: 100, value: (c: PetCounts) => c.finishedPasses },
  { id: "sessions_100", threshold: 100, value: (c: PetCounts) => c.sessionUnits },
  { id: "episodes_100", threshold: 100, value: (c: PetCounts) => c.episodes },
  { id: "notes_50", threshold: 50, value: (c: PetCounts) => c.notes + c.quotes },
  { id: "reviews_10", threshold: 10, value: (c: PetCounts) => c.reviews },
  { id: "genres_10", threshold: 10, value: (c: PetCounts) => c.distinctGenres },
  { id: "streak_30", threshold: 30, value: (c: PetCounts) => c.bestStreak },
  { id: "streak_100", threshold: 100, value: (c: PetCounts) => c.bestStreak },
  { id: "posts_50", threshold: 50, value: (c: PetCounts) => c.posts },
  { id: "sagas_3", threshold: 3, value: (c: PetCounts) => c.completedSagas },
  { id: "missions_50", threshold: 50, value: (c: PetCounts) => c.missionsCompleted },
  { id: "adult", threshold: 10, value: (_c: PetCounts, level: number) => level },
  { id: "veteran", threshold: 40, value: (_c: PetCounts, level: number) => level },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

export function isAchievementId(s: string): s is AchievementId {
  return ACHIEVEMENTS.some((a) => a.id === s);
}

export interface AchievementProgress {
  id: AchievementId;
  value: number;
  threshold: number;
  unlocked: boolean;
}

export function achievementProgress(counts: PetCounts, level: number): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const value = a.value(counts, level);
    return { id: a.id, value, threshold: a.threshold, unlocked: value >= a.threshold };
  });
}

export function unlockedAchievements(counts: PetCounts, level: number): AchievementId[] {
  return achievementProgress(counts, level).filter((a) => a.unlocked).map((a) => a.id);
}
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/lib/pet && npx tsc --noEmit -p .`
Expected: PASS. Si `tsc` se queja de `EMPTY_COUNTS` en algún test antiguo que construye `PetCounts` a mano, es porque falta `missionXp`/`missionsCompleted`/`bestStreak`: usa `{ ...EMPTY_COUNTS, ... }`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pet/counts.ts src/lib/pet/derive.ts src/lib/pet/derive.test.ts src/lib/pet/achievements.ts src/lib/pet/achievements.test.ts
git commit -m "feat(pet): logros por umbral y XP de misiones en la derivación"
```

---

### Task 6: `getPetCounts` — columnas nuevas, contadores del día, elegibilidad y XP de misiones

**Files:**
- Modify: `src/lib/pet/get-pet-counts.ts`

**Interfaces:**
- Consumes: `dayCounts`, `DayRows` (Task 4); `MissionEligibility`, `MissionCandidate` (Task 3); `splitPassHistory`, `PassRow` (existentes); `isMissionTemplate`, `MISSION_ATTR` (Task 3).
- Produces: `PetCountsResult` pasa a ser `{ counts, lastActivityISO, days: { today: PetDayCounts; yesterday: PetDayCounts }, eligibility: MissionEligibility }`.

Sin consultas nuevas salvo tres pequeñas y acotadas: `pet_daily_missions` completadas (para la XP), `club_members` (`limit(1)`), y `book_editions`/`series` solo si hay pases abiertos de ese tipo (para la candidata de `finish_pass`). Las demás fuentes ya se leían: se añaden columnas.

- [ ] **Step 1: Imports y tipo de resultado**

Al principio de `src/lib/pet/get-pet-counts.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { pagesForPass } from "@/lib/editions/edition-label";
import { addDaysISO, todayISO, toISODate } from "@/lib/stats/dates";
import { getStreaks } from "@/lib/stats/get-streaks";
import { BALANCE } from "./balance";
import type { PetAttribute } from "./classes";
import {
  countCompletedSagas,
  sessionUnits,
  splitPassHistory,
  type PetCounts,
  type SagaItemRow,
  type SessionRow,
} from "./counts";
import type { MissionCandidate, MissionEligibility } from "./missions/generate";
import { dayCounts, type DayRows, type PetDayCounts } from "./missions/progress";
import { isMissionTemplate, MISSION_ATTR } from "./missions/templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PetCountsResult {
  counts: PetCounts;
  /** Último día "YYYY-MM-DD" con actividad global, o null. */
  lastActivityISO: string | null;
  /** Contadores de hoy y de ayer (las misiones de ayer sin completar se evalúan también). */
  days: { today: PetDayCounts; yesterday: PetDayCounts };
  eligibility: MissionEligibility;
}
```

- [ ] **Step 2: Consultas**

Sustituye el bloque `Promise.all` por este (cambian los `select` de `passes`, `episode_watches`, `notes`, y se añaden `missions` y `clubMember`):

```ts
  const [
    sessions,
    passes,
    episodes,
    notes,
    posts,
    votes,
    events,
    follows,
    profile,
    streaks,
    sagaFollows,
    reviewRows,
    missions,
    clubMember,
  ] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("pass_id, duration_minutes, position, session_date, started_at")
      .eq("user_id", userId),
    supabase
      .from("passes")
      .select("id, item_type, item_id, status, finished_on, rating, created_at, updated_at, position, edition_id")
      .eq("user_id", userId),
    supabase.from("episode_watches").select("id, rating, pass_id, watched_on").eq("user_id", userId),
    supabase.from("notes").select("kind, created_at").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
    getStreaks(supabase, userId),
    supabase.from("saga_follows").select("saga_id").eq("user_id", userId),
    // Las reseñas se leen SIEMPRE por la vista pass_reviews: passes.review no tiene grant select para authenticated a propósito (20260714_passes_review_privacy.sql); leerla en la tabla revienta la consulta entera con 42501.
    supabase.from("pass_reviews").select("id, item_type, item_id, review").eq("user_id", userId),
    supabase.from("pet_daily_missions").select("template, xp").eq("user_id", userId).not("completed_at", "is", null),
    supabase.from("club_members").select("club_id").eq("user_id", userId).eq("status", "active").limit(1),
  ]);

  for (const r of [sessions, passes, episodes, notes, posts, votes, events, follows, profile, sagaFollows, reviewRows, missions, clubMember]) {
    if (r.error) throw r.error;
  }
```

- [ ] **Step 3: XP de misiones y mejor racha**

Justo antes de `const counts: PetCounts = {`:

```ts
  // XP de misiones completadas, agrupada por el atributo de la plantilla. Una
  // plantilla retirada del catálogo (isMissionTemplate=false) no suma: su XP se
  // pierde a propósito, igual que un peso que se pone a cero.
  const missionXp: Record<PetAttribute, number> = { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 };
  for (const m of missions.data ?? []) {
    if (isMissionTemplate(m.template)) missionXp[MISSION_ATTR[m.template]] += m.xp;
  }
```

Y en el literal `counts`, tras `historicalWorks: ...,`:

```ts
    missionXp,
    missionsCompleted: (missions.data ?? []).length,
    bestStreak: streaks.best,
```

- [ ] **Step 4: Contadores del día**

Tras el cálculo de `counts` y antes del `return`:

```ts
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const livedIds = new Set(livedPasses.map((p) => p.id));
  const dayRows: DayRows = {
    sessions: sessionRows,
    episodes: (episodes.data ?? []).map((e) => ({ watched_on: e.watched_on, rating: e.rating })),
    passes: passRows.map((p) => ({
      item_type: p.item_type,
      item_id: p.item_id,
      status: p.status,
      finished_on: p.finished_on,
      rating: p.rating,
      created_at: p.created_at,
      updated_at: p.updated_at,
      lived: livedIds.has(p.id),
    })),
    notes: (notes.data ?? []).map((n) => ({ kind: n.kind, created_at: n.created_at })),
    posts: postRows.map((p) => ({ kind: p.kind, created_at: p.created_at })),
    votes: (votes.data ?? []).map((v) => ({ voted_at: v.voted_at })),
    reviewedKeys: (reviewRows.data ?? [])
      .filter((r) => (r.review ?? "").trim().length > 0)
      .map((r) => `${r.item_type}:${r.item_id}`),
  };
  const toDay = (ts: string) => toISODate(new Date(ts));
  const days = { today: dayCounts(dayRows, today, toDay), yesterday: dayCounts(dayRows, yesterday, toDay) };
```

Nota: `splitPassHistory` recibe `passRows` con más columnas de las que declara `PassRow`; TypeScript lo acepta (subtipo estructural). `livedPasses` conserva `id`.

- [ ] **Step 5: Elegibilidad**

A continuación:

```ts
  const eligibility = await missionEligibility(supabase, {
    passRows,
    livedIds,
    episodeRows: (episodes.data ?? []).map((e) => ({ pass_id: e.pass_id })),
    reviewedKeys: new Set(dayRows.reviewedKeys),
    dailyGoal: goal,
    hasClub: (clubMember.data ?? []).length > 0,
    today,
  });

  return { counts, lastActivityISO: lastDates.at(-1) ?? null, days, eligibility };
}
```

Y al final del fichero, la función:

```ts
type EligibilityInput = {
  passRows: {
    id: string;
    item_type: string;
    item_id: string;
    status: string;
    finished_on: string | null;
    position: unknown;
    edition_id: string | null;
  }[];
  livedIds: Set<string>;
  episodeRows: { pass_id: string | null }[];
  reviewedKeys: Set<string>;
  dailyGoal: number | null;
  hasClub: boolean;
  today: string;
};

// Qué misiones tienen sentido HOY (spec fase 2 §1.2). Las candidatas de las
// duras salen del estado: libro >= 70 % de sus páginas (regla de páginas =
// pagesForPass: edición del pase o books.total_pages), serie con <= 2
// episodios sin ver (series.total_episodes − vistos del pase), y terminado en
// los últimos 7 días sin reseña. Una consulta por tipo, solo si hay pases abiertos de ese tipo.
async function missionEligibility(supabase: SupabaseServerClient, input: EligibilityInput): Promise<MissionEligibility> {
  const { passRows, livedIds, episodeRows, reviewedKeys, dailyGoal, hasClub, today } = input;
  const open = passRows.filter((p) => p.status === "in_progress");
  const openBooks = open.filter((p) => p.item_type === "book");
  const openSeries = open.filter((p) => p.item_type === "series");

  let finishCandidate: MissionCandidate | null = null;
  let bestRatio = 0;

  if (openBooks.length > 0) {
    const editionIds = openBooks.map((p) => p.edition_id).filter((id): id is string => id != null);
    const [books, editions] = await Promise.all([
      supabase.from("books").select("id, title, total_pages").in("id", openBooks.map((p) => p.item_id)),
      editionIds.length > 0
        ? supabase.from("book_editions").select("id, total_pages").in("id", editionIds)
        : Promise.resolve({ data: [] as { id: string; total_pages: number | null }[], error: null }),
    ]);
    if (books.error) throw books.error;
    if (editions.error) throw editions.error;
    const bookById = new Map((books.data ?? []).map((b) => [b.id, b]));
    const editionPages = new Map((editions.data ?? []).map((e) => [e.id, e.total_pages]));
    for (const p of openBooks) {
      const raw = p.position;
      const page = raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { page?: unknown }).page === "number" ? (raw as { page: number }).page : null;
      const book = bookById.get(p.item_id);
      const total = pagesForPass(p.edition_id ? { totalUnits: editionPages.get(p.edition_id) ?? null } : null, book?.total_pages);
      if (page == null || !total || total <= 0 || !book) continue;
      const ratio = page / total;
      if (ratio >= BALANCE.missions.finishThreshold && ratio > bestRatio) {
        bestRatio = ratio;
        finishCandidate = { itemType: "book", itemId: p.item_id, title: book.title };
      }
    }
  }

  if (openSeries.length > 0) {
    const { data: series, error } = await supabase.from("series").select("id, title, total_episodes").in("id", openSeries.map((p) => p.item_id));
    if (error) throw error;
    const watchedByPass = new Map<string, number>();
    for (const e of episodeRows) if (e.pass_id) watchedByPass.set(e.pass_id, (watchedByPass.get(e.pass_id) ?? 0) + 1);
    for (const p of openSeries) {
      const s = (series ?? []).find((x) => x.id === p.item_id);
      if (!s || !s.total_episodes || s.total_episodes <= 0) continue;
      const watched = watchedByPass.get(p.id) ?? 0;
      const left = s.total_episodes - watched;
      const ratio = watched / s.total_episodes;
      if (left >= 0 && left <= BALANCE.missions.seriesEpisodesLeft && ratio > bestRatio) {
        bestRatio = ratio;
        finishCandidate = { itemType: "series", itemId: p.item_id, title: s.title };
      }
    }
  }

  // review: el terminado más reciente de los últimos 7 días sin reseña (solo vividos).
  const since = addDaysISO(today, -BALANCE.missions.reviewWindowDays);
  const recent = passRows
    .filter((p) => p.status === "completed" && p.finished_on != null && p.finished_on >= since && livedIds.has(p.id))
    .filter((p) => !reviewedKeys.has(`${p.item_type}:${p.item_id}`))
    .sort((a, b) => (b.finished_on ?? "").localeCompare(a.finished_on ?? ""));
  let reviewCandidate: MissionCandidate | null = null;
  if (recent.length > 0) {
    const p = recent[0];
    const table = p.item_type === "book" ? "books" : p.item_type === "movie" ? "movies" : "series";
    const { data, error } = await supabase.from(table).select("title").eq("id", p.item_id).maybeSingle();
    if (error) throw error;
    if (data) reviewCandidate = { itemType: p.item_type, itemId: p.item_id, title: data.title };
  }

  return { hasClub, hasOpenSeries: openSeries.length > 0, dailyGoal, finishCandidate, reviewCandidate };
}
```

- [ ] **Step 6: Verificar tipos y suite**

Run: `npx tsc --noEmit -p . && npx vitest run src/lib/pet`
Expected: sin errores; PASS. Si `tsc` protesta por `supabase.from(table)` con `table` unión, cambia por tres ramas explícitas (`if (p.item_type === "book") ... else if ...`) con `.from("books")`, `.from("movies")`, `.from("series")`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pet/get-pet-counts.ts
git commit -m "feat(pet): getPetCounts trae contadores del día, elegibilidad de misiones y XP de misiones"
```

---

### Task 7: `missions/sync.ts` + `getPetSnapshot` con misiones y logros

**Files:**
- Create: `src/lib/pet/missions/sync.ts`
- Modify: `src/lib/pet/get-pet-snapshot.ts`

**Interfaces:**
- Consumes: `pickDailyMissions`, `MissionPick` (Task 3); `missionProgress`, `PetDayCounts` (Task 4); `achievementProgress`, `AchievementId`, `isAchievementId` (Task 5); `PetCountsResult.days/eligibility` (Task 6); `earnCelebration`.
- Produces: `MissionView`, `syncDailyMissions(...)`; `PetSnapshot.missions: MissionView[]`, `PetSnapshot.achievements: AchievementView[]`, `PetSnapshot.missionsCompletedNow: boolean`, `PetSnapshot.achievementsUnlockedNow: boolean`.

- [ ] **Step 1: sync**

`src/lib/pet/missions/sync.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { earnCelebration } from "@/lib/celebrations/earn";
import { addDaysISO } from "@/lib/stats/dates";
import type { PetAttribute, PetAttributes } from "../classes";
import { pickDailyMissions, type MissionEligibility } from "./generate";
import { missionProgress, type PetDayCounts } from "./progress";
import { isMissionTemplate, type MissionTemplate } from "./templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface MissionView {
  slot: number;
  template: MissionTemplate;
  target: number;
  xp: number;
  progress: number;
  completed: boolean;
  itemType: string | null;
  itemId: string | null;
  title: string | null;
}

export interface SyncInput {
  today: string;
  primary: PetAttribute;
  attributes: PetAttributes;
  eligibility: MissionEligibility;
  days: { today: PetDayCounts; yesterday: PetDayCounts };
}

export interface SyncResult {
  missions: MissionView[];
  /** true si ESTA lectura ha completado alguna (para pedir el drenado en cliente). */
  completedNow: boolean;
}

// Único punto de escritura de las misiones (spec fase 2 §4):
// 1) si hoy no tiene filas, genera e inserta (on conflict do nothing: dos
//    pestañas a la vez → la primera gana, la segunda relee);
// 2) evalúa hoy Y ayer sin completar (una cumplida a las 23:59 y vista mañana
//    sigue contando); más atrás caduca;
// 3) marca completed_at y gana pet_mission_done con key "<day>:<slot>".
export async function syncDailyMissions(
  supabase: SupabaseServerClient,
  userId: string,
  input: SyncInput,
): Promise<SyncResult> {
  const { today } = input;
  const yesterday = addDaysISO(today, -1);
  const select = "id, day, slot, template, target, xp, item_type, item_id, item_title, completed_at";

  const read = async () => {
    const { data, error } = await supabase
      .from("pet_daily_missions")
      .select(select)
      .eq("user_id", userId)
      .in("day", [yesterday, today])
      .order("day")
      .order("slot");
    if (error) throw error;
    return data ?? [];
  };

  let rows = await read();
  if (!rows.some((r) => r.day === today)) {
    const picks = pickDailyMissions(`${userId}:${today}`, input.primary, input.attributes, input.eligibility);
    const { error } = await supabase.from("pet_daily_missions").upsert(
      picks.map((p, slot) => ({
        user_id: userId,
        day: today,
        slot,
        template: p.template,
        target: p.target,
        xp: p.xp,
        item_type: p.itemType ?? null,
        item_id: p.itemId ?? null,
        item_title: p.title ?? null,
      })),
      { onConflict: "user_id,day,slot", ignoreDuplicates: true },
    );
    if (error) throw error;
    rows = await read();
  }

  let completedNow = false;
  const views: MissionView[] = [];
  for (const r of rows) {
    if (!isMissionTemplate(r.template)) continue; // plantilla retirada: se ignora
    const counts = r.day === today ? input.days.today : input.days.yesterday;
    const progress = missionProgress({ template: r.template, target: r.target, item_type: r.item_type, item_id: r.item_id }, counts);
    let completed = r.completed_at != null;
    if (!completed && progress >= r.target) {
      const { error } = await supabase
        .from("pet_daily_missions")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("completed_at", null);
      if (error) console.error("syncDailyMissions update", error);
      else {
        completed = true;
        completedNow = true;
        await earnCelebration(supabase, userId, {
          event: "pet_mission_done",
          key: `${r.day}:${r.slot}`,
          title: r.item_title ?? undefined,
          metadata: { template: r.template, xp: r.xp },
        });
      }
    }
    if (r.day === today) {
      views.push({
        slot: r.slot,
        template: r.template,
        target: r.target,
        xp: r.xp,
        progress: Math.min(progress, r.target),
        completed,
        itemType: r.item_type,
        itemId: r.item_id,
        title: r.item_title,
      });
    }
  }
  return { missions: views, completedNow };
}
```

- [ ] **Step 2: Snapshot**

En `src/lib/pet/get-pet-snapshot.ts`:

Imports nuevos:

```ts
import { achievementProgress, isAchievementId, type AchievementId } from "./achievements";
import { CLASS_PRIMARY, ... } from "./classes"; // añade CLASS_PRIMARY al import existente de ./classes
import { syncDailyMissions, type MissionView } from "./missions/sync";
```

Tipo:

```ts
export interface AchievementView {
  id: AchievementId;
  value: number;
  threshold: number;
  unlocked: boolean;
  /** ISO de user_celebrations.first_triggered_at; null si bloqueado. */
  unlockedAt: string | null;
}
```

Y en `PetSnapshot`, tras `evolved: boolean;`:

```ts
  missions: MissionView[];
  achievements: AchievementView[];
  /** true en la lectura que completa una misión / desbloquea un logro (para pedir el drenado). */
  missionsCompletedNow: boolean;
  achievementsUnlockedNow: boolean;
```

En el cuerpo de `getPetSnapshot`, cambia la lectura de contadores y añade la orquestación **después** del bloque de nivel/etapa y antes del `return`:

```ts
  const { counts, lastActivityISO, days, eligibility } = await getPetCounts(supabase, userId);
```

```ts
  // Misiones del día (spec fase 2 §4): generar si faltan, evaluar hoy y ayer.
  const { missions, completedNow } = await syncDailyMissions(supabase, userId, {
    today: todayISO(),
    primary: CLASS_PRIMARY[pet.class],
    attributes,
    eligibility,
    days,
  });

  // Logros: solo se gana lo NUEVO (ninguna escritura en una visita sin novedades).
  const { data: earnedRows, error: earnedErr } = await supabase
    .from("user_celebrations")
    .select("event_key, first_triggered_at")
    .eq("user_id", userId)
    .eq("event_type", "pet_achievement");
  if (earnedErr) throw earnedErr;
  const earnedAt = new Map<string, string>();
  for (const r of earnedRows ?? []) {
    const id = r.event_key.replace(/^pet_achievement:/, "");
    if (isAchievementId(id)) earnedAt.set(id, r.first_triggered_at);
  }
  const progressList = achievementProgress(counts, level);
  let achievementsUnlockedNow = false;
  for (const a of progressList) {
    if (a.unlocked && !earnedAt.has(a.id)) {
      achievementsUnlockedNow = true;
      await earnCelebration(supabase, userId, { event: "pet_achievement", key: a.id, metadata: { threshold: a.threshold } });
      earnedAt.set(a.id, new Date().toISOString());
    }
  }
  const achievements: AchievementView[] = progressList.map((a) => ({ ...a, unlockedAt: earnedAt.get(a.id) ?? null }));
```

Y en el `return`, tras `evolved,`:

```ts
    missions,
    achievements,
    missionsCompletedNow: completedNow,
    achievementsUnlockedNow,
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p . && npx vitest run src/lib/pet src/lib/celebrations`
Expected: sin errores; PASS. Comprueba también que `src/lib/pet/get-companion-state.ts` no se ha tocado (la lectura ligera del shell sigue sin misiones).

- [ ] **Step 4: Commit**

```bash
git add src/lib/pet/missions/sync.ts src/lib/pet/get-pet-snapshot.ts
git commit -m "feat(pet): el snapshot genera y evalúa las misiones del día y gana los logros nuevos"
```

---

### Task 8: UI — tablón de misiones y galería de logros en `/mascota`

**Files:**
- Create: `src/components/pet/mission-board.tsx`
- Create: `src/components/pet/achievement-grid.tsx`
- Modify: `src/components/pet/pet-detail.tsx`
- Modify: `messages/es.json` (namespace `pet`)

**Interfaces:**
- Consumes: `PetSnapshot.missions/achievements/missionsCompletedNow/achievementsUnlockedNow` (Task 7); `MISSION_ATTR` (Task 3); `ACHIEVEMENTS` (Task 5).

- [ ] **Step 1: Mensajes**

En `messages/es.json`, dentro de `"pet"`, tras el bloque `"sources"`:

```json
    "missions": {
      "title": "Misiones de hoy",
      "empty": "Hoy no hay misiones: vuelve mañana.",
      "xp": "+{xp} XP",
      "progress": "{progress} / {target}",
      "done": "Cumplida",
      "rating": "Valora algo",
      "vote": "Vota en una encuesta",
      "new_work": "Añade una obra nueva",
      "any_activity": "Da señales de vida",
      "session_minutes": "Lee o ve {target} minutos",
      "note": "Apunta una nota",
      "quote": "Guarda una cita",
      "post": "Escribe en un club",
      "session_pages": "Avanza {target} páginas",
      "daily_goal": "Cumple tu objetivo de hoy ({target} min)",
      "episodes": "Ve {target} episodios",
      "review": "Reseña «{title}»",
      "finish_pass": "Termina «{title}»"
    },
    "achievements": {
      "title": "Logros",
      "unlockedOn": "Conseguido el {date}",
      "locked": "{value} / {threshold}",
      "finished_10": "Termina 10 obras",
      "finished_50": "Termina 50 obras",
      "finished_100": "Termina 100 obras",
      "sessions_100": "100 unidades de sesión",
      "episodes_100": "Ve 100 episodios",
      "notes_50": "50 notas o citas",
      "reviews_10": "Escribe 10 reseñas",
      "genres_10": "Termina obras de 10 géneros",
      "streak_30": "Racha de 30 días",
      "streak_100": "Racha de 100 días",
      "posts_50": "50 posts en clubes",
      "sagas_3": "Completa 3 sagas",
      "missions_50": "Cumple 50 misiones",
      "adult": "Mascota adulta",
      "veteran": "Mascota veterana"
    },
```

Comprueba que el JSON sigue siendo válido: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`.

- [ ] **Step 2: Tablón**

`src/components/pet/mission-board.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { MISSION_ATTR } from "@/lib/pet/missions/templates";
import type { MissionView } from "@/lib/pet/missions/sync";

export function MissionBoard({ missions }: { missions: MissionView[] }) {
  const t = useTranslations("pet");
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="mission-board">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("missions.title")}</h3>
      {missions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("missions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((m) => {
            const pct = Math.max(0, Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100)));
            return (
              <li
                key={m.slot}
                className="flex flex-col gap-1"
                data-testid={`mission-${m.template}`}
                data-completed={m.completed ? "true" : "false"}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={m.completed ? "line-through text-muted-foreground" : "font-medium text-foreground"}>
                    <span className="mr-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t(`attributes.${MISSION_ATTR[m.template]}`)}
                    </span>
                    {t(`missions.${m.template}`, { target: m.target, title: m.title ?? "" })}
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">
                    {m.completed ? `✓ ${t("missions.done")}` : t("missions.xp", { xp: m.xp })}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={m.completed ? "h-full bg-accent" : "h-full bg-muted-foreground"} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[12px] text-muted-foreground">{t("missions.progress", { progress: m.progress, target: m.target })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Galería**

`src/components/pet/achievement-grid.tsx`:

```tsx
"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { AchievementView } from "@/lib/pet/get-pet-snapshot";

export function AchievementGrid({ achievements }: { achievements: AchievementView[] }) {
  const t = useTranslations("pet");
  const format = useFormatter();
  // Desbloqueados primero por fecha; luego bloqueados por cercanía al umbral.
  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
    return b.value / b.threshold - a.value / a.threshold;
  });
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="achievement-grid">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sorted.map((a) => (
          <li
            key={a.id}
            className={
              a.unlocked
                ? "flex flex-col gap-0.5 rounded-lg border border-accent bg-surface p-3"
                : "flex flex-col gap-0.5 rounded-lg border border-border bg-surface-muted p-3 text-muted-foreground"
            }
            data-testid={`achievement-${a.id}`}
            data-unlocked={a.unlocked ? "true" : "false"}
          >
            <span className="text-sm font-medium">{t(`achievements.${a.id}`)}</span>
            <span className="text-[12px]">
              {a.unlocked && a.unlockedAt
                ? t("achievements.unlockedOn", { date: format.dateTime(new Date(a.unlockedAt), { day: "numeric", month: "short", year: "numeric" }) })
                : t("achievements.locked", { value: Math.min(a.value, a.threshold), threshold: a.threshold })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Integrar en el detalle**

En `src/components/pet/pet-detail.tsx`:

Imports:

```ts
import { AchievementGrid } from "./achievement-grid";
import { MissionBoard } from "./mission-board";
```

El `useEffect` de drenado pasa a cubrir misiones y logros:

```ts
  useEffect(() => {
    if (pet.leveledUp || pet.evolved || pet.missionsCompletedNow || pet.achievementsUnlockedNow) checkCelebrations();
  }, [pet.leveledUp, pet.evolved, pet.missionsCompletedNow, pet.achievementsUnlockedNow]);
```

Y entre la sección «Qué la sube» (`sources`) y la de renombrar/cambiar clase:

```tsx
      <MissionBoard missions={pet.missions} />
      <AchievementGrid achievements={pet.achievements} />
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit -p . && npx eslint src/components/pet src/lib/pet && npx vitest run src/components/pet src/lib/pet`
Expected: sin errores; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/pet/mission-board.tsx src/components/pet/achievement-grid.tsx src/components/pet/pet-detail.tsx messages/es.json
git commit -m "feat(pet): tablón de misiones y galería de logros en /mascota"
```

---

### Task 9: E2E, docs de cierre e issues

**Files:**
- Create: `e2e/mascota-misiones.spec.ts`
- Modify: `docs/requirements/decisiones.md` (append), `docs/requirements/backlog.md`, `docs/architecture/graph.json`
- GitHub: cerrar #1013 al mergear (comentar en la PR); abrir las issues de spec §8

- [ ] **Step 1: E2E**

`e2e/mascota-misiones.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 2 (spec 2026-09-02-mascota-misiones-logros): abrir /mascota
// crea tres misiones; registrar 20 minutos cumple session_minutes si tocó (si
// no tocó, se fuerza la fila) y la celebración se drena; la galería enseña
// logros bloqueados con progreso. Mismo patrón de sesión/limpieza que
// mascota.spec.ts: fetch nativo con service-role y filas devueltas a como estaban.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let userId: string;
let hadPet = false;

test.beforeAll(async () => {
  const perfiles = (await (await api(`profiles?username=eq.${USERNAME}&select=user_id`)).json()) as Array<{ user_id: string }>;
  if (perfiles.length !== 1) throw new Error(`no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  const pets = (await (await api(`pet_state?user_id=eq.${userId}&select=user_id`)).json()) as unknown[];
  hadPet = pets.length === 1;
  if (!hadPet) {
    await api("pet_state", { method: "POST", body: JSON.stringify({ user_id: userId, name: "Nuez", class: "barbarian" }) });
  }
  await api(`pet_daily_missions?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`user_celebrations?user_id=eq.${userId}&event_type=in.(pet_mission_done,pet_achievement)`, { method: "DELETE" });
});

test.afterAll(async () => {
  await api(`pet_daily_missions?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`user_celebrations?user_id=eq.${userId}&event_type=in.(pet_mission_done,pet_achievement)`, { method: "DELETE" });
  await api(`progress_sessions?user_id=eq.${userId}&session_date=eq.${localDay()}&duration_minutes=eq.20`, { method: "DELETE" });
  if (!hadPet) await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
});

test("abrir /mascota crea tres misiones del día y pinta la galería de logros", async ({ page }) => {
  await login(page);
  await page.goto("/mascota");
  await expect(page.getByTestId("mission-board")).toBeVisible();
  await expect(page.getByTestId("mission-board").locator("li")).toHaveCount(3);
  const rows = (await (await api(`pet_daily_missions?user_id=eq.${userId}&day=eq.${localDay()}&select=slot,template`)).json()) as Array<{ slot: number; template: string }>;
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((r) => r.template)).size).toBe(3);

  await expect(page.getByTestId("achievement-grid")).toBeVisible();
  await expect(page.getByTestId("achievement-finished_100")).toHaveAttribute("data-unlocked", "false");
});

test("una sesión de 20 minutos cumple session_minutes y se gana la celebración", async ({ page }) => {
  await login(page);
  await page.goto("/mascota");
  await expect(page.getByTestId("mission-board")).toBeVisible();

  // Fuerza que el hueco 0 sea session_minutes (el sorteo es determinista pero
  // depende del usuario de prueba): la fila manda sobre el generador.
  await api(`pet_daily_missions?user_id=eq.${userId}&day=eq.${localDay()}&slot=eq.0`, {
    method: "PATCH",
    body: JSON.stringify({ template: "session_minutes", target: 20, xp: 2, item_type: null, item_id: null, item_title: null, completed_at: null }),
  });

  // Un pase abierto cualquiera del usuario para colgar la sesión.
  const passes = (await (await api(`passes?user_id=eq.${userId}&status=eq.in_progress&select=id&limit=1`)).json()) as Array<{ id: string }>;
  test.skip(passes.length === 0, "el usuario de prueba no tiene ningún pase en curso");
  await api("progress_sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, pass_id: passes[0].id, duration_minutes: 20, session_date: localDay(), position: {} }),
  });

  await page.goto("/mascota");
  const mission = page.getByTestId("mission-session_minutes");
  await expect(mission).toHaveAttribute("data-completed", "true");

  const won = (await (await api(`user_celebrations?user_id=eq.${userId}&event_type=eq.pet_mission_done&select=event_key`)).json()) as Array<{ event_key: string }>;
  expect(won.some((w) => w.event_key === `pet_mission_done:${localDay()}:0`)).toBe(true);
});
```

Comprueba antes de ejecutar que `progress_sessions` acepta ese `POST` con service-role (columnas `user_id, pass_id, duration_minutes, session_date, position`): si la tabla exige otra columna `not null`, añádela al body con el valor que use `addSession` (`src/lib/passes/actions.ts` o `src/lib/sessions/`). Si `position` no admite `{}` para libros, usa `{ "page": 1 }`.

- [ ] **Step 2: Ejecutar e2e contra build de producción**

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess   # debe estar libre
npx next build
Start-Process -NoNewWindow npx -ArgumentList "next start -p 3000"
npx playwright test e2e/mascota-misiones.spec.ts e2e/mascota.spec.ts
```

Expected: 5 passed (o 4 + 1 skipped si el usuario de prueba no tiene pase en curso; en ese caso anótalo en el informe). Después: mata el `next start` (`Get-Process node | Stop-Process`) y comprueba que 3000 queda libre.

- [ ] **Step 3: Docs de cierre**

`docs/requirements/decisiones.md`, **al final**:

```markdown
## 2026-09-03 — Mascota fase 2: misiones con asignación guardada, progreso derivado; logros sin tabla

Spec `docs/superpowers/specs/2026-09-02-mascota-misiones-logros-design.md`. Se guarda SOLO qué tres
misiones tocaron hoy (`pet_daily_missions`): derivarlas haría que mutaran a mediodía al cambiar de
clase o subir un atributo. Progreso (`missions/progress.ts`), XP (`missionXp` en `PetCounts`) y
logros (`achievements.ts`) se derivan; el rastro de un logro es la celebración
`pet_achievement:<id>`, cuya `first_triggered_at` es la fecha de la galería. Celebraciones ganan un
scope `key` (clave libre) porque ni `day` ni `milestone` distinguen «misión 2 del 3 de septiembre».

**XP de misión = la orgánica de la acción, duplicada** (`missionXp()` en `templates.ts` lee los pesos
de `BALANCE`; no hay tabla de premios aparte): bonus, no motor. **Las duras solo se asignan si son
alcanzables hoy** (libro ≥ 70 %, serie con ≤ 2 episodios, terminado en 7 días sin reseña) y cuentan
sobre la obra asignada. Máximo una dura al día, siempre en el hueco de azar.

**Desviación de la spec**: la tabla lleva `item_title` congelado al asignar, para pintar «Termina
*Dune*» sin consultar el catálogo en cada visita ni perder el título si la obra se fusiona.

**Límite asumido**: todo se detecta al abrir `/mascota` (#1020). Las misiones de ayer sin completar
se evalúan también; a los dos días caducan.

**Migración solo en dev** por decisión del usuario (la rama no sube hasta estar estable). Se aplica en
prod al mergear `feat/mascota-rpg` y se actualiza `data-model.md` §8bis.2 entonces.
```

`docs/requirements/backlog.md`: en la entrada de la mascota, añade una línea `- [x] Fase 2: misiones diarias + logros (spec 2026-09-02-mascota-misiones-logros; rama feat/mascota-rpg, pendiente de merge)`. Sin narrativa.

`docs/architecture/graph.json`: añade al nodo de `src/lib/pet` (o crea nodo `pet-missions`) los ficheros `missions/templates.ts`, `missions/generate.ts`, `missions/progress.ts`, `missions/sync.ts`, `achievements.ts`, la tabla `pet_daily_missions` y un flujo «abrir /mascota → getPetSnapshot → syncDailyMissions → earnCelebration». Sigue el formato de los nodos vecinos; regenera `map.html` si `docs/architecture/README.md` lo indica.

- [ ] **Step 4: Issues de la spec §8 (una por línea, tres etiquetas)**

```sh
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: misión semanal para las duras sin obra a punto de acabar" --body "Spec fase 2 §8. Hoy finish_pass/review solo se asignan si hay candidata (libro >= 70 %, serie <= 2 episodios, terminado en 7 días sin reseña). Falta una ventana semanal para quien no tiene nada a punto."
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: logros ocultos" --body "Spec fase 2 §8. Logros que no se ven hasta lograrlos (p. ej. leer de madrugada). Necesitan datos con hora y textos propios."
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: tarjeta «Misiones de hoy» en la portada" --body "Spec fase 2 §8. Decidido no hacerlo en fase 2 (solo /mascota). Medir antes si la gente entra a /mascota."
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: escalar objetivos de misión por nivel o historial" --body "Spec fase 2 §8. Objetivos fijos (20 min, 30 páginas, 2 episodios). Cuando haya datos, escalar por nivel o por media del usuario."
gh issue create --label "area:ui,tipo:deuda,P2" --title "Mascota: finish_pass no contempla películas" --body "Spec fase 2 §8. Solo libros (posición/páginas) y series (episodios) tienen «a punto de acabar». Películas quedan fuera del candidato."
gh issue create --label "area:ui,tipo:deuda,P2" --title "Mascota: falso positivo de «valoración de hoy» por passes.updated_at" --body "Spec fase 2 §1.4. dayCounts cuenta como valorado hoy un pase con rating cuyo updated_at es hoy; editar otro campo del pase lo mueve. Si molesta: columna rated_at."
```

Comprueba que #1014 (push) ya recoge «push por misión pendiente»; si no, añade un comentario en #1014.

- [ ] **Step 5: Suite completa y commit**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src e2e`
Expected: todo verde.

```bash
git add e2e/mascota-misiones.spec.ts docs/requirements/decisiones.md docs/requirements/backlog.md docs/architecture/graph.json docs/architecture/map.html
git commit -m "test(pet): e2e de misiones y logros; docs de cierre de la fase 2"
git push origin feat/mascota-rpg
```

Añade a la descripción de la PR #1027 una sección «Fase 2: misiones y logros» con el resumen y la nota de que la migración `20260903_pet_daily_missions` está **solo en dev**.

---

## Self-review

**Spec coverage.** §1.1 plantillas/XP → Task 3; §1.2 elegibilidad → Task 3 (`eligibleTemplates`) + Task 6 (candidatas); §1.3 generación → Task 3; §1.4 progreso y `PetDayCounts` → Task 4 + Task 6; §2 logros → Task 5 + Task 7; §3 tabla, `missionXp`, `bestStreak`, `BALANCE.missions` → Tasks 2, 3, 5, 6; §4 flujo (generar, evaluar hoy y ayer, ganar solo lo nuevo) → Task 7; §5 celebraciones → Task 1; §6 UI → Task 8; §7 tests → cada task + Task 9; §8 issues → Task 9. La spec no pide `item_title`: desviación registrada en Global Constraints y en `decisiones.md` (Task 9).

**Placeholders.** Ninguno: cada paso lleva el código o el comando.

**Type consistency.** `MissionEligibility`/`MissionCandidate`/`MissionPick` (Task 3) los consumen Tasks 6 y 7 con los mismos nombres; `PetDayCounts`/`DayRows`/`missionProgress` (Task 4) los usan Tasks 6 y 7; `PetCounts.missionXp/missionsCompleted/bestStreak` (Task 5) los rellena Task 6; `MissionView` (Task 7) lo pinta Task 8; `AchievementView` (Task 7) lo pinta Task 8; `PetCountsResult.days/eligibility` (Task 6) los lee Task 7. `SessionRow.position` es `number | null` (página ya extraída en `getPetCounts`), igual que en `sessionUnits`.
