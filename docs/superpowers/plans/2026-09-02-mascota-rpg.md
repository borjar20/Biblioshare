# Mascota RPG (fase 1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una ardilla por usuario que crece con el uso de Biblioshare: seis clases clásicas, seis atributos derivados de las tablas existentes, humor por inactividad, arte pixel por capas con rig, compañera flotante en el shell y página `/mascota`.

**Architecture:** Todo lo derivable se deriva en TS puro (`src/lib/pet/derive.ts`) a partir de contadores leídos de tablas que ya existen; la única tabla nueva (`pet_state`) guarda decisiones (nombre, clase, ocultar) y el último nivel/etapa visto para detectar subidas. Las reacciones de la compañera cuelgan del canal de celebraciones (ganar → drenar). El arte son PNG por pieza compuestos por `<PetSprite>` según un manifiesto tipado; en esta fase los PNG los genera un script procedural y se sustituirán por arte IA curado con los mismos nombres.

**Tech Stack:** Next.js (cacheComponents, server actions), Supabase (RLS, migración SQL), React 19, next-intl, Vitest (+jsdom para componentes), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-mascota-rpg-design.md`.

## Global Constraints

- **Nada de `use cache` en ningún fichero de esta feature** (todo depende de `auth.uid()`, regla #437). Lo que lee sesión va bajo `<Suspense>`.
- **XP, atributos, nivel y etapa NO se guardan** en base de datos. Solo `pet_state` (§8 de la spec).
- **Migraciones: dev primero** (`supabase-dev`), prod después y verificando contra `pg_class`/`pg_policies`, no contra `list_migrations`.
- **Grant por columna** en `pet_state` y pasar la superficie 6 de `docs/DRIFT-CHECK.md` antes de cerrar.
- **«Hoy» = `todayISO()`** de `src/lib/stats/dates.ts` (la misma que usan rachas y celebraciones). No se introduce otra definición de día.
- **Textos de usuario en `messages/es.json`**: namespace nuevo `pet` (cargado por ruta con `<RouteMessages ns={["pet"]}>`) y claves de la compañera bajo `nav.pet` (namespace base, disponible en el shell).
- **La compañera no aparece** en rutas públicas, en `isFullscreenRoute` ni sin `pet_state`.
- **Commits pequeños** en la rama `feat/mascota-rpg`, mensajes en español con tipo (`feat(pet): …`, `test(pet): …`, `docs(pet): …`).
- **Node 22** (`fnm use 22` si el shell arranca con v20; Vitest revienta con v20).
- Valores de clase, etapa y humor son literales ingleses en código (`wizard`, `adult`, `sleepy`); las etiquetas traducidas viven en `messages/es.json`.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260902_pet_state.sql` | Tabla `pet_state`, RLS, grants por columna |
| `src/lib/pet/classes.ts` | Clases, atributos, atributo primario, orden de desempate |
| `src/lib/pet/balance.ts` | Todos los números (pesos, bonus, curva, umbrales) |
| `src/lib/pet/derive.ts` | Funciones puras: `deriveAttributes`, `xpFor`, `levelFor`, `xpForLevel`, `stageFor`, `moodFor`, `suggestClass` |
| `src/lib/pet/counts.ts` | Tipo `PetCounts` + helpers puros sobre filas (`sessionUnits`, `countCompletedSagas`, `daysBetweenISO`) |
| `src/lib/pet/get-pet-counts.ts` | Lee contadores de las tablas existentes |
| `src/lib/pet/get-pet-snapshot.ts` | Lectura completa para `/mascota`; detecta subida/evolución y gana celebración |
| `src/lib/pet/get-companion-state.ts` | Lectura ligera para el shell |
| `src/lib/pet/actions.ts` | `hatchPet`, `renamePet`, `changeClass`, `setCompanionHidden` |
| `src/lib/pet/manifest.ts` | Qué PNG va dónde, pivotes y anclas |
| `scripts/pet-sprites.mjs` | Genera los PNG provisionales en `public/pet/` |
| `src/components/pet/pet-sprite.tsx` + `.module.css` | Compone piezas y capas; animaciones por humor y reacción |
| `src/components/pet/pet-companion.tsx` | Compañera flotante (cliente) |
| `src/components/pet/hatch-form.tsx`, `pet-detail.tsx`, `class-picker.tsx`, `rename-form.tsx` | UI de `/mascota` |
| `src/components/settings/pet-companion-toggle.tsx` | Interruptor en ajustes |
| `src/app/mascota/layout.tsx`, `page.tsx` | Ruta |
| `src/components/nav/app-shell.tsx` | Monta la compañera bajo su `<Suspense>` |
| `src/components/nav/nav-items.ts` | Entrada «Mascota» en «Tú» |
| `src/lib/celebrations/{types,registry,preference}.ts`, `src/components/celebrations/{celebration-overlay,celebration-provider}.tsx` | Eventos `pet_level_up`/`pet_evolved` y señal «celebración mostrada» |
| `e2e/mascota.spec.ts` | Eclosión, compañera, ocultar |

---

### Task 1: Tabla `pet_state` (dev), tipos y doc de esquema

**Files:**
- Create: `supabase/migrations/20260902_pet_state.sql`
- Modify: `supabase/schema-baseline.sql` (anexo al final)
- Modify: `src/lib/supabase/database.types.ts` (regenerado)
- Modify: `docs/requirements/data-model.md` (nueva sección «8bis. Mascota» tras «8. Play»)

**Interfaces:**
- Produces: tabla `public.pet_state` con columnas `user_id, name, class, hatched_at, companion_hidden, last_level, last_stage, created_at, updated_at`; tipo `Database["public"]["Tables"]["pet_state"]`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Mascota RPG (spec 2026-09-02-mascota-rpg-design.md, §8).
--
-- Solo DECISIONES del usuario: nombre, clase, ocultar la compañera y el último
-- nivel/etapa que la app calculó (para detectar subidas). XP, atributos, nivel y
-- etapa NO se guardan: se derivan de progress_sessions, passes, notes, club_*…
-- en src/lib/pet/derive.ts. Una fila por usuario (PK = user_id).

create table public.pet_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  -- text, no enum: añadir una clase no exige migración de tipo. Los valores
  -- válidos los fija src/lib/pet/classes.ts.
  class text not null,
  hatched_at timestamptz not null default now(),
  companion_hidden boolean not null default false,
  last_level integer not null default 1,
  last_stage text not null default 'acorn',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pet_state is
  'Mascota RPG: decisiones del usuario (nombre, clase, ocultar) y último nivel/etapa visto. XP y atributos se derivan en la app (src/lib/pet). Ver spec 2026-09-02.';

alter table public.pet_state enable row level security;

create policy "pet_state select own" on public.pet_state
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "pet_state insert own" on public.pet_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "pet_state update own" on public.pet_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sin DELETE: la mascota se va con la cuenta (cascade), no se borra a mano.

-- Grant POR COLUMNA (issue #375): una columna nueva sin su grant rompe la
-- escritura entera de la tabla. Al añadir una columna, añádela aquí y pasa la
-- superficie 6 de docs/DRIFT-CHECK.md.
revoke all on public.pet_state from anon, authenticated;
grant select on public.pet_state to authenticated;
grant insert (user_id, name, class, hatched_at, companion_hidden, last_level, last_stage)
  on public.pet_state to authenticated;
grant update (name, class, companion_hidden, last_level, last_stage, updated_at)
  on public.pet_state to authenticated;
```

- [ ] **Step 2: Aplicar en dev**

Usar el MCP `supabase-dev` → `apply_migration` con `name: "20260902_pet_state"` y el SQL anterior. Después verificar contra objetos reales con `execute_sql`:

```sql
select c.relname, c.relrowsecurity,
       (select count(*) from pg_policies p where p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pet_state';
```

Esperado: una fila, `relrowsecurity = true`, `policies = 3`.

- [ ] **Step 3: Superficie 6 (grants por columna)**

Ejecutar en dev la consulta de `docs/DRIFT-CHECK.md` §6 (la de `has_column_privilege`). `pet_state` **debe aparecer** en la lista (tiene grant por columna: `user_id` sin UPDATE, `created_at`/`updated_at` sin INSERT). Anotar la fila de referencia en `docs/DRIFT-CHECK.md` §6 junto a las demás tablas de referencia: `pet_state | 9 | 7 | 6`.

- [ ] **Step 4: Regenerar tipos**

MCP `supabase-dev` → `generate_typescript_types`; volcar el resultado en `src/lib/supabase/database.types.ts`. Comprobar:

Run: `grep -n "pet_state" src/lib/supabase/database.types.ts | head -3`
Esperado: al menos una línea con `pet_state: {`.

- [ ] **Step 5: Anexar a `schema-baseline.sql` y documentar**

Al final de `supabase/schema-baseline.sql` añadir un bloque `-- ANEXO 2026-09-02: pet_state (migración 20260902_pet_state.sql)` con el mismo SQL de la migración.

En `docs/requirements/data-model.md`, tras «### 8.2. `play_players`», añadir:

```markdown
## 8bis. Mascota

> (Sección insertada el 2026-09-02 entre «8. Play» y «9. Seguridad», sin renumerar el resto.)

### 8bis.1. `pet_state` (dev 2026-09-02; prod pendiente)

Mascota RPG (spec `docs/superpowers/specs/2026-09-02-mascota-rpg-design.md`). Una fila por usuario
con SOLO decisiones: `user_id` (PK, FK `auth.users` cascade), `name` (text, 1-24, CHECK),
`class` (text; valores en `src/lib/pet/classes.ts`, sin enum a propósito), `hatched_at`,
`companion_hidden` (bool), `last_level` (int, default 1), `last_stage` (text, default `acorn`),
`created_at`, `updated_at`.

**XP, atributos, nivel y etapa NO están en la tabla**: se derivan en `src/lib/pet/derive.ts` de
`progress_sessions`, `passes`, `episode_watches`, `notes`, `club_posts`, `club_poll_votes`,
`club_activity_participants`, `follows`, `pending_import_rows` y `books.genres`. Rebalancear es
cambiar `src/lib/pet/balance.ts`. `last_level`/`last_stage` existen solo para detectar subida y
evolución al calcular (`get-pet-snapshot.ts`) y ganar `pet_level_up` / `pet_evolved` en
`user_celebrations`.

**RLS**: select/insert/update propias; sin delete (cascade con la cuenta). **Grant por columna**
(superficie 6 de DRIFT-CHECK): insert sin `created_at`/`updated_at`; update sin `user_id`,
`hatched_at`, `created_at`. Migración `supabase/migrations/20260902_pet_state.sql`.
```

Actualizar la fecha de verificación de la cabecera del doc.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902_pet_state.sql supabase/schema-baseline.sql src/lib/supabase/database.types.ts docs/requirements/data-model.md docs/DRIFT-CHECK.md
git commit -m "feat(pet): tabla pet_state con RLS y grants por columna (dev)"
```

---

### Task 2: Dominio puro — clases, balance y derivación

**Files:**
- Create: `src/lib/pet/classes.ts`
- Create: `src/lib/pet/balance.ts`
- Create: `src/lib/pet/counts.ts` (solo el tipo `PetCounts` y `EMPTY_COUNTS` en esta tarea)
- Create: `src/lib/pet/derive.ts`
- Test: `src/lib/pet/derive.test.ts`

**Interfaces:**
- Produces:
  - `type PetClass = "barbarian" | "fighter" | "wizard" | "cleric" | "bard" | "ranger"`
  - `type PetAttribute = "FUE" | "CON" | "INT" | "SAB" | "CAR" | "DES"`
  - `type PetStage = "acorn" | "young" | "adult" | "veteran"`; `type PetMood = "happy" | "neutral" | "sleepy" | "sad"`
  - `PET_CLASSES: readonly PetClass[]`, `CLASS_PRIMARY: Record<PetClass, PetAttribute>`, `isPetClass(x: unknown): x is PetClass`
  - `interface PetCounts { sessionUnits, episodes, activeDays, dailyGoalDays, streakMilestones, finishedPasses, completedSagas, distinctGenres, notes, quotes, reviews, ratings, posts, votes, polls, events, follows, newWorks, newAuthors, importedRows }` (todos `number`)
  - `deriveAttributes(counts: PetCounts): PetAttributes` (`Record<PetAttribute, number>`)
  - `xpFor(attrs: PetAttributes, cls: PetClass): number`
  - `levelFor(xp: number): number`; `xpForLevel(level: number): number`
  - `stageFor(level: number, hasActivitySinceHatch: boolean): PetStage`
  - `moodFor(daysSinceActivity: number | null): PetMood`
  - `suggestClass(attrs: PetAttributes): PetClass | null`

- [ ] **Step 1: Escribir los tests**

`src/lib/pet/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BALANCE } from "./balance";
import { EMPTY_COUNTS } from "./counts";
import {
  deriveAttributes,
  levelFor,
  moodFor,
  stageFor,
  suggestClass,
  xpFor,
  xpForLevel,
} from "./derive";

describe("deriveAttributes", () => {
  it("con cero contadores todo es cero", () => {
    const a = deriveAttributes(EMPTY_COUNTS);
    expect(Object.values(a).every((v) => v === 0)).toBe(true);
  });

  it("cada atributo suma sus fuentes con los pesos del balance", () => {
    const a = deriveAttributes({
      ...EMPTY_COUNTS,
      sessionUnits: 3,
      episodes: 2,
      activeDays: 4,
      notes: 1,
      quotes: 2,
      posts: 1,
      newWorks: 5,
    });
    expect(a.FUE).toBe(3 * BALANCE.FUE.perSessionUnit + 2 * BALANCE.FUE.perEpisode);
    expect(a.CON).toBe(4 * BALANCE.CON.perActiveDay);
    expect(a.SAB).toBe(1 * BALANCE.SAB.perNote + 2 * BALANCE.SAB.perQuote);
    expect(a.CAR).toBe(1 * BALANCE.CAR.perPost);
    expect(a.DES).toBe(5 * BALANCE.DES.perNewWork);
  });

  it("las filas importadas topan en importedRowCap", () => {
    const a = deriveAttributes({ ...EMPTY_COUNTS, importedRows: 10_000 });
    expect(a.DES).toBe(BALANCE.DES.importedRowCap * BALANCE.DES.perImportedRow);
  });
});

describe("xpFor", () => {
  it("aplica el bonus de clase SOLO al atributo primario", () => {
    const attrs = { FUE: 100, CON: 10, INT: 10, SAB: 10, CAR: 10, DES: 10 };
    const barbarian = xpFor(attrs, "barbarian");
    const bard = xpFor(attrs, "bard");
    expect(barbarian).toBe(Math.round(100 * BALANCE.classBonus + 50));
    expect(bard).toBe(Math.round(100 + 40 + 10 * BALANCE.classBonus));
  });
});

describe("levelFor / xpForLevel", () => {
  it("con 0 XP es nivel 1 y los umbrales de la spec cuadran", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(10))).toBe(10);
    expect(levelFor(xpForLevel(10) - 1)).toBe(9);
    expect(levelFor(xpForLevel(40))).toBe(40);
  });
  it("la curva es monótona", () => {
    let prev = 0;
    for (let xp = 0; xp < 100_000; xp += 997) {
      const lvl = levelFor(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
});

describe("stageFor", () => {
  it("sin actividad tras eclosionar es bellota, aunque el nivel sea alto", () => {
    expect(stageFor(50, false)).toBe("acorn");
  });
  it("umbrales 10 y 40", () => {
    expect(stageFor(1, true)).toBe("young");
    expect(stageFor(9, true)).toBe("young");
    expect(stageFor(10, true)).toBe("adult");
    expect(stageFor(39, true)).toBe("adult");
    expect(stageFor(40, true)).toBe("veteran");
  });
});

describe("moodFor", () => {
  it("0 contenta, 1 normal, 2-3 dormida, 4+ triste, null normal", () => {
    expect(moodFor(0)).toBe("happy");
    expect(moodFor(1)).toBe("neutral");
    expect(moodFor(2)).toBe("sleepy");
    expect(moodFor(3)).toBe("sleepy");
    expect(moodFor(4)).toBe("sad");
    expect(moodFor(30)).toBe("sad");
    expect(moodFor(null)).toBe("neutral");
  });
});

describe("suggestClass", () => {
  it("propone la clase del atributo dominante", () => {
    expect(suggestClass({ FUE: 1, CON: 1, INT: 9, SAB: 1, CAR: 1, DES: 1 })).toBe("wizard");
  });
  it("empate: gana la primera en el orden de la tabla de la spec", () => {
    expect(suggestClass({ FUE: 5, CON: 5, INT: 5, SAB: 5, CAR: 5, DES: 5 })).toBe("barbarian");
    expect(suggestClass({ FUE: 0, CON: 5, INT: 0, SAB: 5, CAR: 0, DES: 0 })).toBe("fighter");
  });
  it("todo a cero: sin sugerencia", () => {
    expect(suggestClass({ FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/pet/derive.test.ts`
Esperado: FAIL (módulos `./balance`, `./counts`, `./derive` no existen).

- [ ] **Step 3: Implementar**

`src/lib/pet/classes.ts`:

```ts
// Seis clases clásicas ↔ seis atributos (spec §2). El ORDEN de PET_CLASSES es
// el orden de desempate de suggestClass (primera de la tabla de la spec gana).
export const PET_CLASSES = [
  "barbarian",
  "fighter",
  "wizard",
  "cleric",
  "bard",
  "ranger",
] as const;
export type PetClass = (typeof PET_CLASSES)[number];

export const PET_ATTRIBUTES = ["FUE", "CON", "INT", "SAB", "CAR", "DES"] as const;
export type PetAttribute = (typeof PET_ATTRIBUTES)[number];

export type PetAttributes = Record<PetAttribute, number>;

export const CLASS_PRIMARY: Record<PetClass, PetAttribute> = {
  barbarian: "FUE",
  fighter: "CON",
  wizard: "INT",
  cleric: "SAB",
  bard: "CAR",
  ranger: "DES",
};

export type PetStage = "acorn" | "young" | "adult" | "veteran";
export type PetMood = "happy" | "neutral" | "sleepy" | "sad";

export function isPetClass(x: unknown): x is PetClass {
  return typeof x === "string" && (PET_CLASSES as readonly string[]).includes(x);
}
```

`src/lib/pet/balance.ts`:

```ts
// EL ÚNICO sitio con números (spec §3). Como todo se deriva, cambiar un peso
// recalcula a todo el mundo: nadie pierde nada. Calibrar contra los usuarios
// reales de prod antes de cerrar la fase (Task 10).
export const BALANCE = {
  // Por sesión: max(floor(minutos/10), floor(páginas/10)) → "unidad de sesión".
  // Se colapsa en el contador porque el máximo es por sesión, no sobre sumas.
  FUE: { perSessionUnit: 1, perEpisode: 3 },
  CON: { perActiveDay: 2, perDailyGoalDay: 5, perStreakMilestone: 20 },
  INT: { perFinishedPass: 10, perCompletedSaga: 25, perDistinctGenre: 5 },
  SAB: { perNote: 3, perQuote: 3, perReview: 8, perRating: 1 },
  CAR: { perPost: 3, perVote: 1, perPoll: 5, perEvent: 5, perFollow: 2 },
  DES: { perNewWork: 2, perNewAuthor: 1, perImportedRow: 1, importedRowCap: 50 },
  classBonus: 1.5,
  // nivel = floor(sqrt(xp / divisor)) + 1  → nivel 10 = 4 050 XP, nivel 40 = 76 050.
  level: { divisor: 50 },
  stages: { adult: 10, veteran: 40 },
  mood: { neutralFrom: 1, sleepyFrom: 2, sadFrom: 4 },
} as const;
```

`src/lib/pet/counts.ts` (en esta tarea solo el tipo; los helpers llegan en Task 3):

```ts
// Contadores brutos que alimentan deriveAttributes. Los lee get-pet-counts.ts
// de las tablas existentes; aquí solo la forma, para que la derivación sea pura.
export interface PetCounts {
  /** Σ por sesión de max(floor(min/10), floor(páginas/10)). */
  sessionUnits: number;
  episodes: number;
  activeDays: number;
  dailyGoalDays: number;
  streakMilestones: number;
  finishedPasses: number;
  completedSagas: number;
  distinctGenres: number;
  notes: number;
  quotes: number;
  reviews: number;
  ratings: number;
  posts: number;
  votes: number;
  polls: number;
  events: number;
  follows: number;
  newWorks: number;
  newAuthors: number;
  importedRows: number;
}

export const EMPTY_COUNTS: PetCounts = {
  sessionUnits: 0,
  episodes: 0,
  activeDays: 0,
  dailyGoalDays: 0,
  streakMilestones: 0,
  finishedPasses: 0,
  completedSagas: 0,
  distinctGenres: 0,
  notes: 0,
  quotes: 0,
  reviews: 0,
  ratings: 0,
  posts: 0,
  votes: 0,
  polls: 0,
  events: 0,
  follows: 0,
  newWorks: 0,
  newAuthors: 0,
  importedRows: 0,
};
```

`src/lib/pet/derive.ts`:

```ts
import { BALANCE } from "./balance";
import {
  CLASS_PRIMARY,
  PET_ATTRIBUTES,
  PET_CLASSES,
  type PetAttribute,
  type PetAttributes,
  type PetClass,
  type PetMood,
  type PetStage,
} from "./classes";
import type { PetCounts } from "./counts";

// Funciones PURAS (spec §3-4). Sin Supabase, sin fechas del sistema: quien las
// llama trae contadores y días. Es lo que hace que los tests las fijen entera.

export function deriveAttributes(c: PetCounts): PetAttributes {
  const B = BALANCE;
  return {
    FUE: c.sessionUnits * B.FUE.perSessionUnit + c.episodes * B.FUE.perEpisode,
    CON:
      c.activeDays * B.CON.perActiveDay +
      c.dailyGoalDays * B.CON.perDailyGoalDay +
      c.streakMilestones * B.CON.perStreakMilestone,
    INT:
      c.finishedPasses * B.INT.perFinishedPass +
      c.completedSagas * B.INT.perCompletedSaga +
      c.distinctGenres * B.INT.perDistinctGenre,
    SAB:
      c.notes * B.SAB.perNote +
      c.quotes * B.SAB.perQuote +
      c.reviews * B.SAB.perReview +
      c.ratings * B.SAB.perRating,
    CAR:
      c.posts * B.CAR.perPost +
      c.votes * B.CAR.perVote +
      c.polls * B.CAR.perPoll +
      c.events * B.CAR.perEvent +
      c.follows * B.CAR.perFollow,
    DES:
      c.newWorks * B.DES.perNewWork +
      c.newAuthors * B.DES.perNewAuthor +
      Math.min(c.importedRows, B.DES.importedRowCap) * B.DES.perImportedRow,
  };
}

/** XP total: suma de atributos con el primario de la clase multiplicado. */
export function xpFor(attrs: PetAttributes, cls: PetClass): number {
  const primary = CLASS_PRIMARY[cls];
  let xp = 0;
  for (const key of PET_ATTRIBUTES) {
    xp += key === primary ? attrs[key] * BALANCE.classBonus : attrs[key];
  }
  return Math.round(xp);
}

export function levelFor(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / BALANCE.level.divisor)) + 1;
}

/** XP mínima para ESTAR en `level`. Inversa de levelFor; para la barra. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) ** 2 * BALANCE.level.divisor;
}

export function stageFor(level: number, hasActivitySinceHatch: boolean): PetStage {
  if (!hasActivitySinceHatch) return "acorn";
  if (level >= BALANCE.stages.veteran) return "veteran";
  if (level >= BALANCE.stages.adult) return "adult";
  return "young";
}

/** `null` = nunca ha habido actividad: ni contenta ni triste, normal. */
export function moodFor(daysSinceActivity: number | null): PetMood {
  if (daysSinceActivity == null) return "neutral";
  if (daysSinceActivity >= BALANCE.mood.sadFrom) return "sad";
  if (daysSinceActivity >= BALANCE.mood.sleepyFrom) return "sleepy";
  if (daysSinceActivity >= BALANCE.mood.neutralFrom) return "neutral";
  return "happy";
}

/** Clase cuyo atributo primario domina. Empate: la primera de PET_CLASSES. */
export function suggestClass(attrs: PetAttributes): PetClass | null {
  let best: PetClass | null = null;
  let bestValue = 0;
  for (const cls of PET_CLASSES) {
    const value = attrs[CLASS_PRIMARY[cls]];
    if (value > bestValue) {
      best = cls;
      bestValue = value;
    }
  }
  return best;
}

export type { PetAttribute };
```

- [ ] **Step 4: Comprobar que pasa**

Run: `npx vitest run src/lib/pet/derive.test.ts`
Esperado: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/classes.ts src/lib/pet/balance.ts src/lib/pet/counts.ts src/lib/pet/derive.ts src/lib/pet/derive.test.ts
git commit -m "feat(pet): clases, balance y derivación pura de atributos, nivel, etapa y humor"
```

---

### Task 3: Contadores desde las tablas existentes y lecturas (completa y ligera)

**Files:**
- Modify: `src/lib/pet/counts.ts` (añadir helpers puros)
- Create: `src/lib/pet/get-pet-counts.ts`
- Create: `src/lib/pet/get-companion-state.ts`
- Test: `src/lib/pet/counts.test.ts`

**Interfaces:**
- Consumes: `PetCounts`, `EMPTY_COUNTS` (Task 2); `getStreaks(supabase, userId): Promise<Streaks>` de `src/lib/stats/get-streaks.ts`; `STREAK_MILESTONES` de `src/lib/celebrations/registry.ts`; `todayISO`, `addDaysISO` de `src/lib/stats/dates.ts`.
- Produces:
  - `sessionUnits(rows: SessionRow[]): number` con `type SessionRow = { pass_id: string; duration_minutes: number | null; position: number | null; session_date: string; started_at: string | null }`
  - `countCompletedSagas(items: SagaItemRow[], completedKeys: ReadonlySet<string>): number` con `type SagaItemRow = { saga_id: string; item_type: string; item_id: string; optional: boolean }`
  - `daysBetweenISO(fromISO: string, toISO: string): number`
  - `getPetCounts(supabase, userId): Promise<{ counts: PetCounts; lastActivityISO: string | null }>`
  - `getCompanionState(supabase, userId): Promise<CompanionState | null>` con `type CompanionState = { name: string; petClass: PetClass; stage: PetStage; mood: PetMood; hidden: boolean }`

- [ ] **Step 1: Tests de los helpers puros**

`src/lib/pet/counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countCompletedSagas, daysBetweenISO, sessionUnits } from "./counts";

describe("sessionUnits", () => {
  it("por sesión toma el máximo entre minutos/10 y páginas avanzadas/10", () => {
    const rows = [
      // pase A: 25 min, de la página 0 a la 100 → max(2, 10) = 10
      { pass_id: "A", duration_minutes: 25, position: 100, session_date: "2026-09-01", started_at: "2026-09-01T10:00:00Z" },
      // pase A: 40 min, de 100 a 110 → max(4, 1) = 4
      { pass_id: "A", duration_minutes: 40, position: 110, session_date: "2026-09-01", started_at: "2026-09-01T18:00:00Z" },
      // pase B: sin posición, 15 min → max(1, 0) = 1
      { pass_id: "B", duration_minutes: 15, position: null, session_date: "2026-09-02", started_at: null },
    ];
    expect(sessionUnits(rows)).toBe(15);
  });

  it("una posición que retrocede no resta", () => {
    const rows = [
      { pass_id: "A", duration_minutes: null, position: 200, session_date: "2026-09-01", started_at: "2026-09-01T10:00:00Z" },
      { pass_id: "A", duration_minutes: null, position: 50, session_date: "2026-09-02", started_at: "2026-09-02T10:00:00Z" },
    ];
    expect(sessionUnits(rows)).toBe(20);
  });
});

describe("countCompletedSagas", () => {
  it("una saga cuenta cuando TODOS sus ítems no opcionales están completados", () => {
    const items = [
      { saga_id: "s1", item_type: "book", item_id: "b1", optional: false },
      { saga_id: "s1", item_type: "book", item_id: "b2", optional: false },
      { saga_id: "s1", item_type: "book", item_id: "b3", optional: true },
      { saga_id: "s2", item_type: "movie", item_id: "m1", optional: false },
      { saga_id: "s2", item_type: "movie", item_id: "m2", optional: false },
    ];
    const done = new Set(["book:b1", "book:b2", "movie:m1"]);
    expect(countCompletedSagas(items, done)).toBe(1);
  });
  it("una saga sin ítems obligatorios no cuenta", () => {
    const items = [{ saga_id: "s1", item_type: "book", item_id: "b1", optional: true }];
    expect(countCompletedSagas(items, new Set(["book:b1"]))).toBe(0);
  });
});

describe("daysBetweenISO", () => {
  it("cuenta días de calendario", () => {
    expect(daysBetweenISO("2026-09-01", "2026-09-01")).toBe(0);
    expect(daysBetweenISO("2026-08-30", "2026-09-02")).toBe(3);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/pet/counts.test.ts`
Esperado: FAIL (`sessionUnits` no exportado).

- [ ] **Step 3: Helpers puros**

Añadir al final de `src/lib/pet/counts.ts`:

```ts
export type SessionRow = {
  pass_id: string;
  duration_minutes: number | null;
  position: number | null;
  session_date: string;
  started_at: string | null;
};

/** Σ por sesión de max(floor(min/10), floor(páginasAvanzadas/10)). Las páginas
 *  avanzadas son la diferencia de `position` con la sesión anterior del MISMO
 *  pase (position es acumulada); un retroceso vale 0, no resta. */
export function sessionUnits(rows: SessionRow[]): number {
  const byPass = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = byPass.get(r.pass_id) ?? [];
    list.push(r);
    byPass.set(r.pass_id, list);
  }
  let units = 0;
  for (const list of byPass.values()) {
    list.sort((a, b) =>
      `${a.session_date}${a.started_at ?? ""}`.localeCompare(`${b.session_date}${b.started_at ?? ""}`),
    );
    let prev = 0;
    for (const r of list) {
      const pages = r.position == null ? 0 : Math.max(0, r.position - prev);
      if (r.position != null) prev = r.position;
      const minutes = r.duration_minutes ?? 0;
      units += Math.max(Math.floor(minutes / 10), Math.floor(pages / 10));
    }
  }
  return units;
}

export type SagaItemRow = {
  saga_id: string;
  item_type: string;
  item_id: string;
  optional: boolean;
};

/** Sagas cuyos ítems NO opcionales están todos en `completedKeys` ("tipo:id"). */
export function countCompletedSagas(
  items: SagaItemRow[],
  completedKeys: ReadonlySet<string>,
): number {
  const required = new Map<string, string[]>();
  for (const it of items) {
    if (it.optional) continue;
    const list = required.get(it.saga_id) ?? [];
    list.push(`${it.item_type}:${it.item_id}`);
    required.set(it.saga_id, list);
  }
  let n = 0;
  for (const keys of required.values()) {
    if (keys.length > 0 && keys.every((k) => completedKeys.has(k))) n++;
  }
  return n;
}

/** Días de calendario entre dos "YYYY-MM-DD" (to − from). */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}
```

- [ ] **Step 4: Comprobar que pasa**

Run: `npx vitest run src/lib/pet/counts.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Lector de contadores**

`src/lib/pet/get-pet-counts.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { getStreaks } from "@/lib/stats/get-streaks";
import {
  countCompletedSagas,
  sessionUnits,
  type PetCounts,
  type SagaItemRow,
  type SessionRow,
} from "./counts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PetCountsResult {
  counts: PetCounts;
  /** Último día "YYYY-MM-DD" con actividad global, o null. */
  lastActivityISO: string | null;
}

// Lee los contadores de las tablas que YA existen (spec §8). Es la lectura
// COMPLETA: solo la pide /mascota. El shell usa get-companion-state.ts.
// Cliente de la petición (RLS del usuario): nada de esto se cachea (#437).
export async function getPetCounts(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PetCountsResult> {
  const [
    sessions,
    passes,
    episodes,
    notes,
    posts,
    votes,
    events,
    follows,
    imports,
    profile,
    streaks,
    sagaFollows,
  ] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("pass_id, duration_minutes, position, session_date, started_at")
      .eq("user_id", userId),
    supabase
      .from("passes")
      .select("item_type, item_id, status, finished_on, rating, review")
      .eq("user_id", userId),
    supabase.from("episode_watches").select("id, rating").eq("user_id", userId),
    supabase.from("notes").select("kind").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("pending_import_rows").select("id").eq("user_id", userId).eq("status", "resolved"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
    getStreaks(supabase, userId),
    supabase.from("saga_follows").select("saga_id").eq("user_id", userId),
  ]);

  for (const r of [sessions, passes, episodes, notes, posts, votes, events, follows, imports, profile, sagaFollows]) {
    if (r.error) throw r.error;
  }

  const sessionRows = (sessions.data ?? []) as SessionRow[];
  const passRows = passes.data ?? [];

  // Objetivo diario: días cuyos minutos (solo sesiones de lectura) alcanzan el
  // objetivo ACTUAL. Se usa el objetivo de hoy para todo el historial: es lo
  // que hay, y rebalancear no exige historia.
  const goal = profile.data?.daily_goal_minutes ?? null;
  let dailyGoalDays = 0;
  if (goal && goal > 0) {
    const minutesByDay = new Map<string, number>();
    for (const s of sessionRows) {
      minutesByDay.set(s.session_date, (minutesByDay.get(s.session_date) ?? 0) + (s.duration_minutes ?? 0));
    }
    for (const m of minutesByDay.values()) if (m >= goal) dailyGoalDays++;
  }

  const completedPasses = passRows.filter((p) => p.status === "completed");
  const completedKeys = new Set(completedPasses.map((p) => `${p.item_type}:${p.item_id}`));

  // Sagas completadas: solo las que sigues (spec §2: INT). Ítems de esas sagas
  // y comprobación en JS con el helper puro.
  let completedSagas = 0;
  const sagaIds = (sagaFollows.data ?? []).map((r) => r.saga_id);
  if (sagaIds.length > 0) {
    const { data: items, error } = await supabase
      .from("saga_items")
      .select("saga_id, item_type, item_id, optional")
      .in("saga_id", sagaIds);
    if (error) throw error;
    completedSagas = countCompletedSagas((items ?? []) as SagaItemRow[], completedKeys);
  }

  // Géneros distintos y autores: de los libros con pase (cualquier estado para
  // autores/obras = DES "exploración"; solo terminados para géneros = INT).
  const bookIds = [...new Set(passRows.filter((p) => p.item_type === "book").map((p) => p.item_id))];
  const genres = new Set<string>();
  const authors = new Set<string>();
  if (bookIds.length > 0) {
    const completedBookIds = new Set(completedPasses.filter((p) => p.item_type === "book").map((p) => p.item_id));
    const { data: books, error } = await supabase
      .from("books")
      .select("id, author, genres")
      .in("id", bookIds);
    if (error) throw error;
    for (const b of books ?? []) {
      if (b.author) authors.add(b.author.trim().toLowerCase());
      if (completedBookIds.has(b.id)) for (const g of b.genres ?? []) genres.add(g);
    }
  }

  const postRows = posts.data ?? [];
  const lastDates = [
    ...sessionRows.map((s) => s.session_date),
    ...passRows.map((p) => p.finished_on).filter((d): d is string => d != null),
    ...postRows.map((p) => p.created_at.slice(0, 10)),
    ...(votes.data ?? []).map((v) => v.voted_at.slice(0, 10)),
  ].sort();

  const counts: PetCounts = {
    sessionUnits: sessionUnits(sessionRows),
    episodes: (episodes.data ?? []).length,
    activeDays: streaks.activeDays,
    dailyGoalDays,
    streakMilestones: STREAK_MILESTONES.filter((m) => m <= streaks.best).length,
    finishedPasses: completedPasses.length,
    completedSagas,
    distinctGenres: genres.size,
    notes: (notes.data ?? []).filter((n) => n.kind === "note").length,
    quotes: (notes.data ?? []).filter((n) => n.kind === "quote").length,
    reviews: passRows.filter((p) => (p.review ?? "").trim().length > 0).length,
    ratings:
      passRows.filter((p) => p.rating != null).length +
      (episodes.data ?? []).filter((e) => e.rating != null).length,
    posts: postRows.filter((p) => p.kind !== "poll").length,
    polls: postRows.filter((p) => p.kind === "poll").length,
    votes: (votes.data ?? []).length,
    events: (events.data ?? []).length,
    follows: (follows.data ?? []).length,
    newWorks: new Set(passRows.map((p) => `${p.item_type}:${p.item_id}`)).size,
    newAuthors: authors.size,
    importedRows: (imports.data ?? []).length,
  };

  return { counts, lastActivityISO: lastDates.at(-1) ?? null };
}
```

- [ ] **Step 6: Lectura ligera para el shell**

`src/lib/pet/get-companion-state.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/stats/dates";
import { isPetClass, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO } from "./counts";
import { moodFor, stageFor } from "./derive";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CompanionState {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  mood: PetMood;
  hidden: boolean;
}

// Lectura LIGERA (spec §8): corre en cada página del shell, así que no deriva
// atributos. La etapa sale de `last_stage` (lo último que calculó /mascota) y
// el humor de la última actividad, que son cuatro consultas de una fila.
export async function getCompanionState(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<CompanionState | null> {
  const { data: pet, error } = await supabase
    .from("pet_state")
    .select("name, class, hatched_at, companion_hidden, last_level, last_stage")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!pet || !isPetClass(pet.class)) return null;

  const [session, finished, post, vote] = await Promise.all([
    supabase.from("progress_sessions").select("session_date").eq("user_id", userId).order("session_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("passes").select("finished_on").eq("user_id", userId).not("finished_on", "is", null).order("finished_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("club_posts").select("created_at").eq("author_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId).order("voted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const last = [
    session.data?.session_date,
    finished.data?.finished_on,
    post.data?.created_at?.slice(0, 10),
    vote.data?.voted_at?.slice(0, 10),
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null;

  const hatchedISO = pet.hatched_at.slice(0, 10);
  const hasActivitySinceHatch = last != null && last >= hatchedISO;
  const today = todayISO();

  return {
    name: pet.name,
    petClass: pet.class,
    stage: stageFor(pet.last_level, hasActivitySinceHatch),
    mood: moodFor(last ? daysBetweenISO(last, today) : null),
    hidden: pet.companion_hidden,
  };
}
```

- [ ] **Step 7: Typecheck y commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Esperado: sin errores.

```bash
git add src/lib/pet/counts.ts src/lib/pet/counts.test.ts src/lib/pet/get-pet-counts.ts src/lib/pet/get-companion-state.ts
git commit -m "feat(pet): contadores desde las tablas existentes y lectura ligera de la compañera"
```

---

### Task 4: Arte provisional procedural, manifiesto y test de existencia

**Files:**
- Create: `scripts/pet-sprites.mjs`
- Create: `public/pet/**` (generado)
- Create: `src/lib/pet/manifest.ts`
- Test: `src/lib/pet/manifest.test.ts`

**Interfaces:**
- Produces:
  - `PET_MANIFEST` con `stages: Record<Exclude<PetStage,"acorn">, StageSpec>`, `acorn: { src: string }`, `faces: Record<PetMood | "blink", string>`, `classes: Record<PetClass, { outfit: { attach: "hat" | "torso" }; accessory: { attach: "hand" } }>`
  - `type StageSpec = { head: PieceSpec; body: PieceSpec; tail: PieceSpec; hand: PieceSpec }`, `type PieceSpec = { src: string; pivot: [number, number]; z: number }`
  - `classLayerSrc(cls: PetClass, stage: Exclude<PetStage,"acorn">, layer: "outfit" | "accessory"): string`
  - `CANVAS = 40`

- [ ] **Step 1: Manifiesto**

`src/lib/pet/manifest.ts`:

```ts
import type { PetClass, PetMood, PetStage } from "./classes";

// Fuente de verdad de qué imagen va dónde (spec §5). Coordenadas en el lienzo
// lógico de 40×40. Los PNG de esta fase los genera scripts/pet-sprites.mjs; el
// arte IA curado los sustituirá CON LOS MISMOS NOMBRES. manifest.test.ts
// comprueba que cada fichero existe.
export const CANVAS = 40;

export type PieceSpec = { src: string; pivot: [number, number]; z: number };
export type StageSpec = { head: PieceSpec; body: PieceSpec; tail: PieceSpec; hand: PieceSpec };
export type DrawnStage = Exclude<PetStage, "acorn">;
export type ClassLayer = "outfit" | "accessory";

const stage = (name: DrawnStage): StageSpec => ({
  tail: { src: `/pet/${name}/tail.png`, pivot: [27, 33], z: 1 },
  body: { src: `/pet/${name}/body.png`, pivot: [15, 35], z: 2 },
  head: { src: `/pet/${name}/head.png`, pivot: [15, 25], z: 3 },
  hand: { src: `/pet/${name}/hand.png`, pivot: [11, 27], z: 4 },
});

export const PET_MANIFEST = {
  acorn: { src: "/pet/acorn.png" },
  stages: {
    young: stage("young"),
    adult: stage("adult"),
    veteran: stage("veteran"),
  } satisfies Record<DrawnStage, StageSpec>,
  faces: {
    happy: "/pet/face/happy.png",
    neutral: "/pet/face/neutral.png",
    sleepy: "/pet/face/sleepy.png",
    sad: "/pet/face/sad.png",
    blink: "/pet/face/blink.png",
  } satisfies Record<PetMood | "blink", string>,
  classes: {
    barbarian: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    fighter: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    wizard: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    cleric: { outfit: { attach: "torso" }, accessory: { attach: "hand" } },
    bard: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    ranger: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
  } satisfies Record<PetClass, { outfit: { attach: "hat" | "torso" }; accessory: { attach: "hand" } }>,
} as const;

export function classLayerSrc(cls: PetClass, stage: DrawnStage, layer: ClassLayer): string {
  return `/pet/class/${cls}/${stage}/${layer}.png`;
}
```

- [ ] **Step 2: Test de existencia**

`src/lib/pet/manifest.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "./classes";
import { classLayerSrc, PET_MANIFEST } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
const exists = (src: string) => existsSync(join(PUBLIC, src));

// Que falte una pieza en prod se caza AQUÍ, no mirando la app (spec §5).
describe("manifiesto de la mascota", () => {
  it("existen la bellota y las caras", () => {
    expect(exists(PET_MANIFEST.acorn.src)).toBe(true);
    for (const src of Object.values(PET_MANIFEST.faces)) expect(exists(src), src).toBe(true);
  });

  it("existen las cuatro piezas de cada etapa", () => {
    for (const spec of Object.values(PET_MANIFEST.stages)) {
      for (const piece of [spec.head, spec.body, spec.tail, spec.hand]) {
        expect(exists(piece.src), piece.src).toBe(true);
      }
    }
  });

  it("existen ropa y accesorio de cada clase en cada etapa", () => {
    for (const cls of PET_CLASSES) {
      for (const stage of ["young", "adult", "veteran"] as const) {
        expect(exists(classLayerSrc(cls, stage, "outfit")), `${cls}/${stage}/outfit`).toBe(true);
        expect(exists(classLayerSrc(cls, stage, "accessory")), `${cls}/${stage}/accessory`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 3: Comprobar que falla**

Run: `npx vitest run src/lib/pet/manifest.test.ts`
Esperado: FAIL (no existe `public/pet/acorn.png`).

- [ ] **Step 4: Generador procedural**

`scripts/pet-sprites.mjs` (rasterizador mínimo 40×40 → PNG RGBA, sin dependencias; misma ardilla que los bocetos del brainstorming):

```js
// Genera los PNG PROVISIONALES de la mascota en public/pet/ (spec §5). Mismos
// nombres que espera src/lib/pet/manifest.ts; el arte IA curado los sustituye.
//   node scripts/pet-sprites.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 40, H = 40;
const C = {
  fur: "#b0542f", furD: "#9a4526", furL: "#c96b42", cream: "#f3dcc4", creamD: "#e2c4a4",
  nose: "#7a4a2a", ink: "#2a231d", white: "#fffdf8", tailL: "#d97a4a", grey: "#b9b2a8",
  blue: "#3f5f8a", blueD: "#2c4463", gold: "#d8a83a", goldD: "#a87c22",
  green: "#4f7a4a", greenD: "#37552f", red: "#a83a3a", redD: "#7a2626",
  purple: "#6a4c8a", purpleD: "#4a3360", paper: "#fffdf8", steel: "#8a94a0", steelD: "#5c6670",
  white2: "#f4efe6", wood: "#6b4a2b", leaf: "#5e8a4a", leafD: "#3f5f33", acorn: "#8a5a2b", acornD: "#5e3d1c",
};

const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const px = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
function circle(g, cx, cy, r, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c; }
function ellipse(g, cx, cy, rx, ry, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = c; }
function rect(g, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(g, x, y, c); }
function tri(g, ax, ay, bx, by, cx, cy, c) {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y][x] = c;
  }
}
function line(g, x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) px(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); }
function outline(g, color = C.ink) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = color;
  }
  return out;
}
function shade(g, from, dark, light) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== from) continue;
    const b = g[y + 1]?.[x], r = g[y]?.[x + 1], a = g[y - 1]?.[x], l = g[y]?.[x - 1];
    if (!b || b === C.ink || !r || r === C.ink) out[y][x] = dark;
    else if ((!a || a === C.ink) && (!l || l === C.ink)) out[y][x] = light;
  }
  return out;
}
function merge(...layers) { const g = grid(); for (const l of layers) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (l[y][x]) g[y][x] = l[y][x]; return g; }

// ---- PNG RGBA sin dependencias ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
function png(g, file) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = y * (W * 4 + 1) + 1 + x * 4, c = g[y][x];
      if (!c) continue;
      raw[i] = parseInt(c.slice(1, 3), 16); raw[i + 1] = parseInt(c.slice(3, 5), 16); raw[i + 2] = parseInt(c.slice(5, 7), 16); raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

// ---- Etapas: proporciones (spec §1). Pivotes del manifiesto: cabeza [15,25], cuerpo [15,35], cola [27,33], mano [11,27]. ----
const STAGES = {
  young:   { headR: 9,  headY: 18, bodyRx: 6, bodyRy: 5, bodyY: 31, tailK: 0.75, grey: false },
  adult:   { headR: 8,  headY: 17, bodyRx: 8, bodyRy: 7, bodyY: 29, tailK: 1,    grey: false },
  veteran: { headR: 8,  headY: 17, bodyRx: 8, bodyRy: 7, bodyY: 29, tailK: 1.1,  grey: true },
};
const TAIL = [[27, 31, 3.5], [30, 27, 4], [32, 22, 4.5], [32, 16, 5], [30, 10, 4.5], [26, 6, 3.5]];

function tail(s) {
  let g = grid();
  for (const [cx, cy, r] of TAIL) circle(g, 27 + (cx - 27) * s.tailK, 33 + (cy - 33) * s.tailK, r * s.tailK, C.furD);
  for (const [cx, cy, r] of TAIL) circle(g, 27 + (cx - 27) * s.tailK - 1, 33 + (cy - 33) * s.tailK - 1, r * s.tailK - 2.2, s.grey && cy < 12 ? C.grey : C.tailL);
  return outline(g);
}
function body(s) {
  let g = grid();
  ellipse(g, 15, s.bodyY, s.bodyRx, s.bodyRy, C.fur);
  ellipse(g, 9, 34, 3.5, 2, C.furD); ellipse(g, 21, 34, 3.5, 2, C.furD);
  ellipse(g, 15, s.bodyY + 1, s.bodyRx * 0.56, s.bodyRy * 0.72, C.cream);
  g = shade(g, C.fur, C.furD, C.furL);
  return outline(g);
}
function head(s) {
  let g = grid();
  circle(g, 15, s.headY, s.headR, C.fur);
  const t = s.headY - s.headR + 3;
  tri(g, 9, t, 8, t - 8, 14, t - 2, C.fur); tri(g, 21, t, 22, t - 8, 16, t - 2, C.fur);
  tri(g, 10, t - 1, 9.5, t - 6, 13, t - 2, C.cream); tri(g, 20, t - 1, 20.5, t - 6, 17, t - 2, C.cream);
  ellipse(g, 15, s.headY + 4, 4.5, 3, C.cream);
  g = shade(g, C.fur, C.furD, C.furL);
  g = outline(g);
  if (s.grey) { px(g, 20, s.headY - 3, C.grey); px(g, 21, s.headY - 2, C.grey); }
  return g;
}
function hand() { const g = grid(); ellipse(g, 11, 27, 2, 1.5, C.fur); ellipse(g, 19, 27, 2, 1.5, C.fur); return outline(g); }

function face(mood) {
  const g = grid(), y = 17;
  if (mood === "sleepy" || mood === "blink") { line(g, 11, y, 13, y, C.ink); line(g, 17, y, 19, y, C.ink); }
  else if (mood === "sad") { rect(g, 11, y, 2, 2, C.ink); rect(g, 17, y, 2, 2, C.ink); px(g, 11, y - 1, C.ink); px(g, 18, y - 1, C.ink); }
  else { rect(g, 11, y - 1, 2, 3, C.ink); rect(g, 17, y - 1, 2, 3, C.ink); px(g, 12, y - 1, C.white); px(g, 18, y - 1, C.white); }
  rect(g, 14, y + 3, 2, 1, C.nose);
  if (mood === "happy") { px(g, 13, y + 5, C.nose); px(g, 14, y + 6, C.nose); px(g, 15, y + 6, C.nose); px(g, 16, y + 5, C.nose); px(g, 9, y + 3, "#e8a084"); px(g, 21, y + 3, "#e8a084"); }
  else if (mood === "sad") { px(g, 13, y + 6, C.nose); px(g, 14, y + 5, C.nose); px(g, 15, y + 5, C.nose); px(g, 16, y + 6, C.nose); }
  else line(g, 13, y + 5, 16, y + 5, C.nose);
  return g;
}

function acorn() {
  let g = grid();
  ellipse(g, 20, 24, 8, 10, C.acorn); ellipse(g, 20, 17, 9, 4, C.acornD); rect(g, 19, 9, 2, 5, C.wood);
  g = shade(g, C.acorn, C.acornD, "#a8703a");
  return outline(g);
}

// Ropa (pegada a cabeza o cuerpo) y accesorio (mano) por clase. Mismo dibujo
// para las tres etapas: la composición lo escala con la pieza.
function cls(name) {
  const outfit = grid(), acc = grid();
  if (name === "barbarian") {
    tri(outfit, 6, 12, 4, 3, 10, 10, C.steelD); tri(outfit, 24, 12, 26, 3, 20, 10, C.steelD);
    rect(outfit, 8, 9, 14, 3, C.steel); rect(outfit, 8, 11, 14, 1, C.steelD); line(outfit, 18, 14, 20, 16, C.redD);
    rect(acc, 3, 22, 2, 14, C.wood); ellipse(acc, 3, 22, 4, 3, C.steel); ellipse(acc, 3, 22, 2, 1.5, C.steelD);
  }
  if (name === "fighter") {
    rect(outfit, 7, 9, 16, 5, C.steel); rect(outfit, 7, 13, 16, 1, C.steelD); rect(outfit, 11, 15, 8, 1, C.ink); px(outfit, 15, 8, C.red); px(outfit, 15, 7, C.red);
    rect(acc, 3, 14, 2, 16, C.white2); rect(acc, 1, 28, 6, 2, C.gold); rect(acc, 3, 30, 2, 4, C.wood);
    rect(acc, 24, 22, 7, 9, C.red); rect(acc, 25, 23, 5, 7, C.redD); rect(acc, 27, 23, 1, 7, C.gold); rect(acc, 25, 26, 5, 1, C.gold);
  }
  if (name === "wizard") {
    tri(outfit, 6, 11, 15, -6, 24, 11, C.blue); rect(outfit, 5, 10, 20, 3, C.blueD); px(outfit, 15, 2, C.gold); px(outfit, 14, 3, C.gold); px(outfit, 16, 3, C.gold); px(outfit, 15, 4, C.gold);
    rect(acc, 26, 14, 2, 20, C.wood); circle(acc, 27, 13, 2.2, C.purple); px(acc, 26, 12, "#c9a6f0"); px(acc, 31, 10, C.gold); px(acc, 23, 9, C.gold);
  }
  if (name === "cleric") {
    ellipse(outfit, 15, 30, 8.5, 7, C.white2); rect(outfit, 8, 24, 14, 2, C.gold); rect(outfit, 14, 27, 2, 6, C.gold); rect(outfit, 12, 29, 6, 2, C.gold);
    rect(acc, 25, 20, 2, 14, C.wood); rect(acc, 23, 17, 6, 5, C.steel); px(acc, 24, 18, C.steelD); px(acc, 27, 20, C.steelD);
  }
  if (name === "bard") {
    ellipse(outfit, 15, 10, 8, 3, C.green); rect(outfit, 8, 9, 14, 2, C.greenD); tri(outfit, 7, 10, 12, 4, 16, 10, C.green); line(outfit, 19, 8, 26, 2, C.red); line(outfit, 20, 8, 27, 3, C.redD);
    ellipse(acc, 14, 30, 4, 3.5, C.goldD); ellipse(acc, 14, 30, 2.5, 2, C.gold); rect(acc, 17, 24, 2, 7, C.nose); line(acc, 14, 27, 17, 25, C.ink); px(acc, 14, 30, C.ink);
  }
  if (name === "ranger") {
    ellipse(outfit, 15, 10, 9, 4, C.leaf); rect(outfit, 6, 9, 18, 3, C.leafD); rect(outfit, 6, 11, 3, 6, C.leaf); rect(outfit, 21, 11, 3, 6, C.leaf);
    for (let y = 16; y <= 36; y++) px(acc, Math.round(3 + 3 * Math.sin((y - 16) / 20 * Math.PI)), y, C.wood);
    line(acc, 3, 16, 3, 36, C.creamD); rect(acc, 24, 22, 3, 10, C.wood); px(acc, 25, 20, C.red);
  }
  return { outfit, acc };
}

const OUT = join(process.cwd(), "public", "pet");
png(acorn(), join(OUT, "acorn.png"));
for (const mood of ["happy", "neutral", "sleepy", "sad", "blink"]) png(face(mood), join(OUT, "face", `${mood}.png`));
for (const [name, s] of Object.entries(STAGES)) {
  png(head(s), join(OUT, name, "head.png"));
  png(body(s), join(OUT, name, "body.png"));
  png(tail(s), join(OUT, name, "tail.png"));
  png(hand(), join(OUT, name, "hand.png"));
  for (const c of ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"]) {
    const { outfit, acc } = cls(c);
    png(outfit, join(OUT, "class", c, name, "outfit.png"));
    png(acc, join(OUT, "class", c, name, "accessory.png"));
  }
}
console.log("public/pet generado");
```

- [ ] **Step 5: Generar y comprobar**

Run: `node scripts/pet-sprites.mjs && npx vitest run src/lib/pet/manifest.test.ts`
Esperado: `public/pet generado` y PASS, 3 tests. Abrir `public/pet/adult/head.png` con el visor (o `Read`) y comprobar que se ve una cabeza de ardilla con orejas.

- [ ] **Step 6: Commit**

```bash
git add scripts/pet-sprites.mjs public/pet src/lib/pet/manifest.ts src/lib/pet/manifest.test.ts
git commit -m "feat(pet): manifiesto de piezas, arte provisional procedural y test de existencia"
```

---

### Task 5: `<PetSprite>` — composición de piezas, humor, reacción y reduced-motion

**Files:**
- Create: `src/components/pet/pet-sprite.tsx`
- Create: `src/components/pet/pet-sprite.module.css`
- Test: `src/components/pet/pet-sprite.test.tsx`

**Interfaces:**
- Consumes: `PET_MANIFEST`, `classLayerSrc`, `CANVAS` (Task 4); tipos de Task 2.
- Produces: `<PetSprite stage petClass mood scale reaction? label />` con `scale: 1 | 2 | 3`, `reaction?: "joy" | "evolve" | null`.

- [ ] **Step 1: Test**

`src/components/pet/pet-sprite.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PetSprite } from "./pet-sprite";

afterEach(cleanup);

describe("PetSprite", () => {
  it("bellota: una sola imagen y sin capas de clase", () => {
    const { container } = render(
      <PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/pet/acorn.png");
  });

  it("adulta maga contenta: cola, cuerpo, cabeza, cara, mano, ropa en cabeza y accesorio en mano", () => {
    const { container } = render(
      <PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />,
    );
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/pet/adult/tail.png");
    expect(srcs).toContain("/pet/adult/body.png");
    expect(srcs).toContain("/pet/adult/head.png");
    expect(srcs).toContain("/pet/face/happy.png");
    expect(srcs).toContain("/pet/adult/hand.png");
    expect(srcs).toContain("/pet/class/wizard/adult/outfit.png");
    expect(srcs).toContain("/pet/class/wizard/adult/accessory.png");
    // la ropa de maga cuelga de la cabeza: comparte contenedor con head.png
    const head = container.querySelector('[data-part="head"]')!;
    expect(head.querySelector('img[src="/pet/class/wizard/adult/outfit.png"]')).not.toBeNull();
  });

  it("clérigo: la túnica cuelga del cuerpo", () => {
    const { container } = render(
      <PetSprite stage="adult" petClass="cleric" mood="neutral" scale={1} label="Fray" />,
    );
    const body = container.querySelector('[data-part="body"]')!;
    expect(body.querySelector('img[src="/pet/class/cleric/adult/outfit.png"]')).not.toBeNull();
  });

  it("expone humor y reacción como data-attributes para el CSS y el e2e", () => {
    const { container } = render(
      <PetSprite stage="young" petClass="bard" mood="sleepy" scale={1} reaction="joy" label="Lira" />,
    );
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-mood")).toBe("sleepy");
    expect(root.getAttribute("data-reaction")).toBe("joy");
    expect(root.getAttribute("aria-label")).toBe("Lira");
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/components/pet/pet-sprite.test.tsx`
Esperado: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`src/components/pet/pet-sprite.module.css`:

```css
/* Rig por partes (spec §5). Cada pieza gira/se mueve sobre su pivote; la ropa
   viaja con la pieza a la que está pegada. Solo transform: barato y sin frames. */
.root {
  position: relative;
  display: inline-block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.part {
  position: absolute;
  inset: 0;
}
.part img,
.root > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

/* idle según humor */
.root[data-mood="happy"] [data-part="tail"],
.root[data-mood="neutral"] [data-part="tail"] { animation: tail 1.8s ease-in-out infinite; }
.root[data-mood="happy"] [data-part="head"],
.root[data-mood="neutral"] [data-part="head"] { animation: head 1.8s ease-in-out infinite; }
.root[data-mood="happy"] [data-part="body"],
.root[data-mood="neutral"] [data-part="body"] { animation: body 1.8s ease-in-out infinite; }
.root[data-mood="sleepy"] [data-part="body"] { animation: body 3.6s ease-in-out infinite; }
.root[data-mood="sleepy"] [data-part="head"] { animation: doze 3.6s ease-in-out infinite; }
/* triste: quieta; solo el parpadeo de abajo */

.blink { animation: blink 4s linear infinite; opacity: 0; }

/* reacciones */
.root[data-reaction="joy"] [data-part="head"] { animation: headJoy 0.7s ease-out; }
.root[data-reaction="joy"] [data-part="tail"] { animation: tailJoy 0.7s ease-out; }
.root[data-reaction="joy"] [data-part="body"] { animation: bodyJoy 0.7s ease-out; }
.root[data-reaction="evolve"] { animation: evolve 1.2s ease-out; }

@keyframes tail { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(6deg); } }
@keyframes head { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-2%) rotate(-3deg); } }
@keyframes body { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, 0.97); } }
@keyframes doze { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(3%) rotate(4deg); } }
@keyframes blink { 0%, 92%, 100% { opacity: 0; } 93%, 97% { opacity: 1; } }
@keyframes headJoy { 0% { transform: translateY(0); } 30% { transform: translateY(-12%) rotate(-8deg); } 60% { transform: translateY(-7%) rotate(8deg); } 100% { transform: translateY(0); } }
@keyframes tailJoy { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(14deg); } 50% { transform: rotate(-10deg); } 75% { transform: rotate(12deg); } }
@keyframes bodyJoy { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(1.08, 0.9); } 60% { transform: scale(0.96, 1.06); } }
@keyframes evolve { 0% { filter: brightness(1); transform: scale(1); } 40% { filter: brightness(2.2); transform: scale(1.15); } 100% { filter: brightness(1); transform: scale(1); } }

/* Cuerpo rígido con movimiento reducido: sin balanceo de piezas, solo parpadeo. */
@media (prefers-reduced-motion: reduce) {
  .root [data-part] { animation: none !important; }
  .root[data-reaction="joy"] { animation: nudge 0.4s ease-out; }
  @keyframes nudge { 50% { transform: translateY(-4%); } }
}
```

`src/components/pet/pet-sprite.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import type { PetClass, PetMood, PetStage } from "@/lib/pet/classes";
import { CANVAS, classLayerSrc, PET_MANIFEST, type PieceSpec } from "@/lib/pet/manifest";
import styles from "./pet-sprite.module.css";

export type PetReaction = "joy" | "evolve" | null;

export interface PetSpriteProps {
  stage: PetStage;
  petClass: PetClass;
  mood: PetMood;
  /** 1 = 40 px (compañera), 2 = 80 px (página), 3 = 120 px (eclosión). */
  scale: 1 | 2 | 3;
  reaction?: PetReaction;
  /** Nombre accesible (el nombre de la mascota). */
  label: string;
}

// Compone piezas y capas a partir del manifiesto: NADIE más sabe de PNG. Sin
// "use client": no tiene estado; las animaciones son CSS puro y la reacción
// llega por prop desde quien sí tiene estado (la compañera / la página).
export function PetSprite({ stage, petClass, mood, scale, reaction = null, label }: PetSpriteProps) {
  const size = CANVAS * scale;
  const box: CSSProperties = { width: size, height: size };

  if (stage === "acorn") {
    return (
      <div className={styles.root} style={box} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
        <img src={PET_MANIFEST.acorn.src} alt="" width={size} height={size} />
      </div>
    );
  }

  const spec = PET_MANIFEST.stages[stage];
  const cls = PET_MANIFEST.classes[petClass];
  const outfit = classLayerSrc(petClass, stage, "outfit");
  const accessory = classLayerSrc(petClass, stage, "accessory");

  const part = (name: "tail" | "body" | "head" | "hand", piece: PieceSpec, extra: ReactNode = null) => (
    <div
      key={name}
      data-part={name}
      className={styles.part}
      style={{ zIndex: piece.z, transformOrigin: `${piece.pivot[0] * scale}px ${piece.pivot[1] * scale}px` }}
    >
      <img src={piece.src} alt="" width={size} height={size} />
      {extra}
    </div>
  );

  return (
    <div className={styles.root} style={box} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
      {part("tail", spec.tail)}
      {part(
        "body",
        spec.body,
        cls.outfit.attach === "torso" ? <img src={outfit} alt="" width={size} height={size} /> : null,
      )}
      {part(
        "head",
        spec.head,
        <>
          <img src={PET_MANIFEST.faces[mood]} alt="" width={size} height={size} />
          {mood !== "sleepy" ? (
            <img className={styles.blink} src={PET_MANIFEST.faces.blink} alt="" width={size} height={size} />
          ) : null}
          {cls.outfit.attach === "hat" ? <img src={outfit} alt="" width={size} height={size} /> : null}
        </>,
      )}
      {part("hand", spec.hand, <img src={accessory} alt="" width={size} height={size} />)}
    </div>
  );
}
```

Nota: se usa `<img>` y no `next/image` a propósito: son PNG de 40×40 con `pixelated`; la optimización los reescalaría con filtro bilineal. Si ESLint se queja de `@next/next/no-img-element`, añadir `// eslint-disable-next-line @next/next/no-img-element` en cada `<img>` o un `/* eslint-disable @next/next/no-img-element */` al inicio del fichero con el comentario del porqué.

- [ ] **Step 4: Comprobar que pasa**

Run: `npx vitest run src/components/pet/pet-sprite.test.tsx`
Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/pet/pet-sprite.tsx src/components/pet/pet-sprite.module.css src/components/pet/pet-sprite.test.tsx
git commit -m "feat(pet): PetSprite compone piezas y capas con rig CSS por humor y reacción"
```

---

### Task 6: Celebraciones — eventos `pet_level_up` / `pet_evolved`, señal «mostrada» y lectura completa con detección

**Files:**
- Modify: `src/lib/celebrations/types.ts` (unión de eventos)
- Modify: `src/lib/celebrations/registry.ts` (config de los dos eventos)
- Modify: `src/lib/celebrations/preference.ts` (`emitCelebrationsShown` / `onCelebrationsShown`)
- Modify: `src/components/celebrations/celebration-overlay.tsx` (casos de texto, glifo y visual)
- Modify: `src/components/celebrations/celebration-provider.tsx` (emitir al encolar)
- Create: `src/lib/pet/get-pet-snapshot.ts`
- Test: `src/lib/celebrations/registry.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `getPetCounts` (Task 3), `deriveAttributes`, `xpFor`, `levelFor`, `stageFor`, `moodFor` (Task 2), `earnCelebration` de `src/lib/celebrations/earn.ts`.
- Produces:
  - `CelebrationEvent` amplía con `"pet_level_up" | "pet_evolved"` (scope `milestone`; `milestone` = nivel o índice de etapa 1..3).
  - `emitCelebrationsShown(items: CelebrationPayload[]): void`, `onCelebrationsShown(handler: (items: CelebrationPayload[]) => void): () => void`.
  - `getPetSnapshot(supabase, userId): Promise<PetSnapshot | null>` con `type PetSnapshot = { name: string; petClass: PetClass; hatchedAt: string; hidden: boolean; counts: PetCounts; attributes: PetAttributes; xp: number; level: number; nextLevelXp: number; levelFloorXp: number; stage: PetStage; mood: PetMood; lastActivityISO: string | null; leveledUp: boolean; evolved: boolean }`.
  - `STAGE_INDEX: Record<PetStage, number>` (`acorn 0, young 1, adult 2, veteran 3`).

- [ ] **Step 1: Test del registro**

Añadir a `src/lib/celebrations/registry.test.ts`:

```ts
describe("eventos de la mascota", () => {
  it("pet_level_up y pet_evolved se deduplican por hito", () => {
    expect(getCelebrationKey({ event: "pet_level_up", milestone: 12 })).toBe("pet_level_up:12");
    expect(getCelebrationKey({ event: "pet_evolved", milestone: 2 })).toBe("pet_evolved:2");
    expect(CELEBRATIONS.pet_level_up.scope).toBe("milestone");
    expect(CELEBRATIONS.pet_evolved.intensity).toBe("high");
  });
});
```

(Comprobar que el fichero ya importa `CELEBRATIONS` y `getCelebrationKey`; si no, añadirlos al import de `./registry`.)

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/celebrations/registry.test.ts`
Esperado: FAIL (TS: `"pet_level_up"` no es `CelebrationEvent` / `CELEBRATIONS.pet_level_up` undefined).

- [ ] **Step 3: Tipos, registro y señal**

En `src/lib/celebrations/types.ts`:

```ts
export type CelebrationEvent =
  | "first_activity_of_day"
  | "daily_goal_completed"
  | "streak_milestone"
  | "first_club_participation"
  | "pet_level_up"
  | "pet_evolved";
```

En `src/lib/celebrations/registry.ts`, dentro de `CELEBRATIONS`:

```ts
  // Mascota (spec 2026-09-02 §8): se ganan al calcular el snapshot en /mascota
  // cuando level > last_level o cambia la etapa. `milestone` = nivel / índice
  // de etapa (STAGE_INDEX en src/lib/pet/get-pet-snapshot.ts).
  pet_level_up: {
    event: "pet_level_up",
    intensity: "medium",
    durationMs: 1600,
    scope: "milestone",
    reducedMotionFallback: "fade",
  },
  pet_evolved: {
    event: "pet_evolved",
    intensity: "high",
    durationMs: 1800,
    scope: "milestone",
    reducedMotionFallback: "static",
  },
```

En `src/lib/celebrations/preference.ts`, al final:

```ts
// Señal "se acaban de encolar celebraciones para mostrar", con su payload. La
// compañera (src/components/pet/pet-companion.tsx) la escucha para saltar: es
// un consumidor más del canal ganar → drenar, sin tocar la cola del provider.
const SHOWN_EVENT = "celebrations:shown";

export function emitCelebrationsShown(items: CelebrationPayload[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  window.dispatchEvent(new CustomEvent<CelebrationPayload[]>(SHOWN_EVENT, { detail: items }));
}

export function onCelebrationsShown(handler: (items: CelebrationPayload[]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CelebrationPayload[]>).detail ?? []);
  window.addEventListener(SHOWN_EVENT, listener);
  return () => window.removeEventListener(SHOWN_EVENT, listener);
}
```

Añadir `import type { CelebrationPayload } from "./types";` arriba de `preference.ts` si no está (el fichero ya importa `CelebrationPreference` del mismo módulo; ampliar ese import).

En `src/components/celebrations/celebration-provider.tsx`: importar `emitCelebrationsShown` desde `@/lib/celebrations/preference` y cambiar `enqueue`:

```ts
  const enqueue = useCallback((items: CelebrationPayload[]) => {
    const valid = items.filter((p) => CELEBRATIONS[p.event]);
    if (valid.length) {
      setQueue((q) => [...q, ...valid]);
      emitCelebrationsShown(valid);
    }
  }, []);
```

En `src/components/celebrations/celebration-overlay.tsx`, añadir casos a las tres funciones exhaustivas:

```ts
// en messageFor
    case "pet_level_up":
      return `Tu mascota sube a nivel ${p.milestone ?? ""}.`;
    case "pet_evolved":
      return "¡Tu mascota ha evolucionado!";
// en staticGlyph
    case "pet_level_up":
      return String(p.milestone ?? "↑");
    case "pet_evolved":
      return "✦";
// en Visual (mismo bloque que streak_milestone, con el número del nivel)
    case "pet_level_up":
    case "pet_evolved":
      return (
        <div className={styles.stack} aria-hidden="true">
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.stackNum}>{payload.event === "pet_level_up" ? payload.milestone : "✦"}</div>
        </div>
      );
```

- [ ] **Step 4: Comprobar que pasa**

Run: `npx vitest run src/lib/celebrations/registry.test.ts && npx tsc --noEmit -p tsconfig.json`
Esperado: PASS y sin errores de tipos.

- [ ] **Step 5: Lectura completa con detección**

`src/lib/pet/get-pet-snapshot.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { earnCelebration } from "@/lib/celebrations/earn";
import { todayISO } from "@/lib/stats/dates";
import { isPetClass, type PetAttributes, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO, type PetCounts } from "./counts";
import { deriveAttributes, levelFor, moodFor, stageFor, xpFor, xpForLevel } from "./derive";
import { getPetCounts } from "./get-pet-counts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const STAGE_INDEX: Record<PetStage, number> = { acorn: 0, young: 1, adult: 2, veteran: 3 };

export interface PetSnapshot {
  name: string;
  petClass: PetClass;
  hatchedAt: string;
  hidden: boolean;
  counts: PetCounts;
  attributes: PetAttributes;
  xp: number;
  level: number;
  /** XP donde empieza el nivel actual y donde empieza el siguiente (barra). */
  levelFloorXp: number;
  nextLevelXp: number;
  stage: PetStage;
  mood: PetMood;
  lastActivityISO: string | null;
  /** true en la lectura que detecta la subida/evolución (para animar). */
  leveledUp: boolean;
  evolved: boolean;
}

// Lectura COMPLETA (spec §8): solo /mascota. Deriva todo y, si el nivel o la
// etapa superan lo último guardado, actualiza pet_state y GANA la celebración
// (dedupe por clave, así que repetir la lectura no la gana dos veces). Sin cron:
// la subida se detecta cuando alguien mira la mascota, y se dice en la doc.
export async function getPetSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PetSnapshot | null> {
  const { data: pet, error } = await supabase
    .from("pet_state")
    .select("name, class, hatched_at, companion_hidden, last_level, last_stage")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!pet || !isPetClass(pet.class)) return null;

  const { counts, lastActivityISO } = await getPetCounts(supabase, userId);
  const attributes = deriveAttributes(counts);
  const xp = xpFor(attributes, pet.class);
  const level = levelFor(xp);
  const hatchedISO = pet.hatched_at.slice(0, 10);
  const hasActivitySinceHatch = lastActivityISO != null && lastActivityISO >= hatchedISO;
  const stage = stageFor(level, hasActivitySinceHatch);
  const mood = moodFor(lastActivityISO ? daysBetweenISO(lastActivityISO, todayISO()) : null);

  const leveledUp = level > pet.last_level;
  const evolved = STAGE_INDEX[stage] > STAGE_INDEX[pet.last_stage as PetStage];

  if (leveledUp || evolved) {
    const { error: upErr } = await supabase
      .from("pet_state")
      .update({ last_level: level, last_stage: stage, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (upErr) console.error("getPetSnapshot update", upErr);
    if (leveledUp) await earnCelebration(supabase, userId, { event: "pet_level_up", milestone: level });
    if (evolved) await earnCelebration(supabase, userId, { event: "pet_evolved", milestone: STAGE_INDEX[stage] });
  }

  return {
    name: pet.name,
    petClass: pet.class,
    hatchedAt: pet.hatched_at,
    hidden: pet.companion_hidden,
    counts,
    attributes,
    xp,
    level,
    levelFloorXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    stage,
    mood,
    lastActivityISO,
    leveledUp,
    evolved,
  };
}
```

- [ ] **Step 6: Typecheck y commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/lib/celebrations src/lib/pet`
Esperado: sin errores; tests PASS.

```bash
git add src/lib/celebrations/types.ts src/lib/celebrations/registry.ts src/lib/celebrations/registry.test.ts src/lib/celebrations/preference.ts src/components/celebrations/celebration-overlay.tsx src/components/celebrations/celebration-provider.tsx src/lib/pet/get-pet-snapshot.ts
git commit -m "feat(pet): celebraciones de nivel y evolución, señal de mostradas y snapshot con detección"
```

---

### Task 7: Acciones de servidor y textos

**Files:**
- Create: `src/lib/pet/actions.ts`
- Modify: `messages/es.json` (namespace `pet`, claves `nav.pet.*` y `nav.you.pet`)

**Interfaces:**
- Consumes: `isPetClass`, `PET_CLASSES` (Task 2); `revalidateAppChrome` de `src/lib/reactivity/revalidate.ts`.
- Produces:
  - `hatchPet(_prev: PetActionState, formData: FormData): Promise<PetActionState>` (campos `name`, `class`)
  - `renamePet(_prev: PetActionState, formData: FormData): Promise<PetActionState>` (campo `name`)
  - `changeClass(cls: string): Promise<PetActionState>`
  - `setCompanionHidden(value: boolean): Promise<PetActionState>`
  - `type PetActionState = { error?: "invalidName" | "invalidClass" | "exists" | "generic" }`
  - `NAME_MAX = 24`

- [ ] **Step 1: Acciones**

`src/lib/pet/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateAppChrome } from "@/lib/reactivity/revalidate";
import { isPetClass } from "./classes";

export type PetActionState = {
  error?: "invalidName" | "invalidClass" | "exists" | "generic";
};

export const NAME_MAX = 24;

// Espejo del CHECK de BD (char_length entre 1 y 24). Se recorta y se colapsan
// espacios: "  Nuez  " es "Nuez".
function parseName(raw: FormDataEntryValue | null): string | null {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > NAME_MAX) return null;
  return name;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function revalidatePet() {
  revalidatePath("/mascota");
  revalidateAppChrome(); // la compañera vive en el layout raíz
}

/** Eclosión (spec §1, §7): nombre + clase. Una sola vez: si ya hay fila, `exists`. */
export async function hatchPet(_prev: PetActionState, formData: FormData): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const name = parseName(formData.get("name"));
  if (!name) return { error: "invalidName" };
  const cls = formData.get("class");
  if (!isPetClass(cls)) return { error: "invalidClass" };

  const { error } = await supabase.from("pet_state").insert({ user_id: user.id, name, class: cls });
  if (error) {
    // 23505 = unique_violation sobre la PK: ya había mascota.
    if (error.code === "23505") return { error: "exists" };
    console.error("hatchPet", error);
    return { error: "generic" };
  }
  revalidatePet();
  return {};
}

export async function renamePet(_prev: PetActionState, formData: FormData): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const name = parseName(formData.get("name"));
  if (!name) return { error: "invalidName" };
  const { error } = await supabase
    .from("pet_state")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePet();
  return {};
}

/** Cambia bonus y look; los atributos son derivados, no hay nada que perder (§2). */
export async function changeClass(cls: string): Promise<PetActionState> {
  if (!isPetClass(cls)) return { error: "invalidClass" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("pet_state")
    .update({ class: cls, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePet();
  return {};
}

/** Preferencia en BD, no en localStorage: cruza dispositivos (#460). */
export async function setCompanionHidden(value: boolean): Promise<PetActionState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("pet_state")
    .update({ companion_hidden: value, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: "generic" };
  revalidatePet();
  return {};
}
```

- [ ] **Step 2: Textos**

En `messages/es.json`:

Dentro de `nav.you` añadir `"pet": "Mascota"`. Dentro de `nav` añadir:

```json
"pet": {
  "companionLabel": "{name}, tu mascota. Abrir su página",
  "bubble": {
    "first_activity_of_day": "¡Buenos días!",
    "daily_goal_completed": "¡Objetivo!",
    "streak_milestone": "¡Racha {milestone}!",
    "first_club_participation": "¡Al club!",
    "pet_level_up": "¡Nivel {milestone}!",
    "pet_evolved": "¡He crecido!"
  }
}
```

Namespace nuevo `pet` (al nivel de `play`):

```json
"pet": {
  "title": "Mascota",
  "hatch": {
    "title": "Una bellota te espera",
    "intro": "Ponle nombre y elige su clase. Crecerá con lo que ya haces en Biblioshare: leer, escribir, hablar en los clubes.",
    "nameLabel": "Nombre",
    "namePlaceholder": "Nuez",
    "classLabel": "Clase",
    "suggested": "Sugerida por tu historial",
    "submit": "Eclosionar",
    "errors": {
      "invalidName": "El nombre necesita entre 1 y 24 caracteres.",
      "invalidClass": "Elige una clase.",
      "exists": "Ya tienes una mascota.",
      "generic": "No se ha podido guardar. Inténtalo de nuevo."
    }
  },
  "classes": {
    "barbarian": "Bárbaro",
    "fighter": "Guerrera",
    "wizard": "Maga",
    "cleric": "Clérigo",
    "bard": "Bardo",
    "ranger": "Ranger"
  },
  "classHints": {
    "barbarian": "Devora: minutos, páginas, episodios.",
    "fighter": "Constancia: rachas y objetivo diario.",
    "wizard": "Obras terminadas, sagas completas, géneros.",
    "cleric": "Notas, citas, reseñas, valoraciones.",
    "bard": "Clubes: posts, votos, encuestas, quedadas.",
    "ranger": "Exploración: obras y autores nuevos, importar."
  },
  "attributes": {
    "FUE": "Fuerza",
    "CON": "Constitución",
    "INT": "Inteligencia",
    "SAB": "Sabiduría",
    "CAR": "Carisma",
    "DES": "Destreza"
  },
  "stages": {
    "acorn": "Bellota",
    "young": "Cría",
    "adult": "Adulta",
    "veteran": "Veterana"
  },
  "moods": {
    "happy": "contenta",
    "neutral": "tranquila",
    "sleepy": "dormida",
    "sad": "triste"
  },
  "level": "Nivel {level}",
  "xpToNext": "{current} / {next} XP",
  "primary": "Atributo principal",
  "acornHint": "Sigue siendo una bellota: eclosionará con tu próxima actividad.",
  "sources": {
    "title": "Qué la sube",
    "FUE": "{units} unidades de sesión · {episodes} episodios",
    "CON": "{days} días activos · {goalDays} con objetivo · {milestones} hitos de racha",
    "INT": "{passes} obras terminadas · {sagas} sagas · {genres} géneros",
    "SAB": "{notes} notas · {quotes} citas · {reviews} reseñas · {ratings} valoraciones",
    "CAR": "{posts} posts · {votes} votos · {polls} encuestas · {events} quedadas · {follows} seguidos",
    "DES": "{works} obras · {authors} autores · {imports} filas importadas"
  },
  "rename": { "label": "Renombrar", "submit": "Guardar" },
  "changeClass": {
    "label": "Cambiar de clase",
    "confirm": "Cambiar a {cls}: cambia su aspecto y su bonus, no sus atributos."
  },
  "companion": {
    "label": "Compañera flotante",
    "hint": "La ardilla pequeña en la esquina. Reacciona a lo que registras.",
    "cta": "Abrir mi mascota"
  }
}
```

- [ ] **Step 3: Typecheck y commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Esperado: sin errores.

```bash
git add src/lib/pet/actions.ts messages/es.json
git commit -m "feat(pet): acciones de eclosión, renombrar, cambiar clase y ocultar; textos"
```

---

### Task 8: Página `/mascota` y entrada en «Tú»

**Files:**
- Create: `src/app/mascota/layout.tsx`
- Create: `src/app/mascota/page.tsx`
- Create: `src/components/pet/hatch-form.tsx`
- Create: `src/components/pet/class-picker.tsx`
- Create: `src/components/pet/rename-form.tsx`
- Create: `src/components/pet/pet-detail.tsx`
- Modify: `src/components/nav/nav-items.ts` (`youItems`)
- Modify: `src/components/ui/icons.tsx` (icono `AcornIcon`)

**Interfaces:**
- Consumes: `getPetSnapshot`, `PetSnapshot` (Task 6); `getPetCounts` (Task 3); `deriveAttributes`, `suggestClass` (Task 2); acciones (Task 7); `<PetSprite>` (Task 5); `PageHeader`, `SHELL_READ`, `buttonVariants`.

- [ ] **Step 1: Icono y entrada de navegación**

En `src/components/ui/icons.tsx`, junto a los demás (misma firma que `DiceIcon`):

```tsx
export function AcornIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 10h12c0 5-2.5 9-6 11-3.5-2-6-6-6-11Z" />
      <path d="M5 10c0-2 3-3.5 7-3.5s7 1.5 7 3.5" />
      <path d="M12 6.5V3" />
    </svg>
  );
}
```

En `src/components/nav/nav-items.ts`: importar `AcornIcon`, ampliar `YouItem.key` con `"pet"` y añadir en `youItems` **después** de `play`:

```ts
    // Mascota cuelga de «Tú»: es tuya y no es un destino diario (la compañera
    // flotante lo es). La barra de cinco no se toca (spec 2026-09-02 §7).
    { key: "pet", href: "/mascota", labelKey: "pet", Icon: AcornIcon },
```

- [ ] **Step 2: Layout de la ruta**

`src/app/mascota/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

export default function MascotaLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["pet"]}>{children}</RouteMessages>;
}
```

- [ ] **Step 3: Selector de clase (cliente, compartido por eclosión y cambio)**

`src/components/pet/class-picker.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { PET_CLASSES, type PetClass, type PetStage } from "@/lib/pet/classes";
import { PetSprite } from "./pet-sprite";

// Seis fichas con la ardilla vestida de cada clase. Radio nativo oculto tras la
// ficha: el formulario lo envía como `class` sin JS extra.
export function ClassPicker({
  value,
  onChange,
  suggested,
  stage = "adult",
  name = "class",
}: {
  value: PetClass | null;
  onChange: (cls: PetClass) => void;
  suggested?: PetClass | null;
  stage?: PetStage;
  name?: string;
}) {
  const t = useTranslations("pet");
  return (
    <div role="radiogroup" aria-label={t("hatch.classLabel")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PET_CLASSES.map((cls) => {
        const active = value === cls;
        return (
          <label
            key={cls}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border p-3 text-center transition-colors ${
              active ? "border-accent bg-surface-muted" : "border-border bg-surface hover:bg-surface-muted"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={cls}
              checked={active}
              onChange={() => onChange(cls)}
              className="sr-only"
            />
            <PetSprite stage={stage === "acorn" ? "adult" : stage} petClass={cls} mood="happy" scale={2} label={t(`classes.${cls}`)} />
            <span className="text-sm font-semibold text-foreground">{t(`classes.${cls}`)}</span>
            <span className="text-[12px] text-muted-foreground">{t(`classHints.${cls}`)}</span>
            {suggested === cls ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{t("hatch.suggested")}</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Formulario de eclosión**

`src/components/pet/hatch-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { hatchPet, NAME_MAX, type PetActionState } from "@/lib/pet/actions";
import type { PetClass } from "@/lib/pet/classes";
import { buttonVariants } from "@/components/ui/button";
import { ClassPicker } from "./class-picker";
import { PetSprite } from "./pet-sprite";

export function HatchForm({ suggested }: { suggested: PetClass | null }) {
  const t = useTranslations("pet");
  const [cls, setCls] = useState<PetClass | null>(suggested);
  const [state, action, pending] = useActionState<PetActionState, FormData>(hatchPet, {});

  return (
    <form action={action} className="flex flex-col gap-6" data-testid="hatch-form">
      <div className="flex flex-col items-center gap-3">
        <PetSprite stage="acorn" petClass={cls ?? "wizard"} mood="neutral" scale={3} label={t("stages.acorn")} />
        <h2 className="font-serif text-xl font-semibold text-foreground">{t("hatch.title")}</h2>
        <p className="max-w-prose text-center text-sm text-muted-foreground">{t("hatch.intro")}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t("hatch.nameLabel")}</span>
        <input
          name="name"
          required
          maxLength={NAME_MAX}
          placeholder={t("hatch.namePlaceholder")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </label>

      <ClassPicker value={cls} onChange={setCls} suggested={suggested} />

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">{t(`hatch.errors.${state.error}`)}</p>
      ) : null}

      <button type="submit" disabled={pending || !cls} className={buttonVariants("primary", "self-center px-6")}>
        {t("hatch.submit")}
      </button>
    </form>
  );
}
```

Si `buttonVariants` no admite `"primary"`, mirar `src/components/ui/button.tsx` y usar la variante por defecto que exista (la de acción principal); lo mismo en el resto de la tarea.

- [ ] **Step 5: Renombrar**

`src/components/pet/rename-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { NAME_MAX, renamePet, type PetActionState } from "@/lib/pet/actions";
import { buttonVariants } from "@/components/ui/button";

export function RenameForm({ name }: { name: string }) {
  const t = useTranslations("pet");
  const [state, action, pending] = useActionState<PetActionState, FormData>(renamePet, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted-foreground">{t("rename.label")}</span>
        <input name="name" defaultValue={name} required maxLength={NAME_MAX} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm" />
      </label>
      <button type="submit" disabled={pending} className={buttonVariants("secondary", "px-4")}>
        {t("rename.submit")}
      </button>
      {state.error ? <p role="alert" className="basis-full text-sm text-destructive">{t(`hatch.errors.${state.error}`)}</p> : null}
    </form>
  );
}
```

- [ ] **Step 6: Detalle**

`src/components/pet/pet-detail.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { changeClass } from "@/lib/pet/actions";
import { CLASS_PRIMARY, PET_ATTRIBUTES, type PetClass } from "@/lib/pet/classes";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { buttonVariants } from "@/components/ui/button";
import { ClassPicker } from "./class-picker";
import { PetSprite } from "./pet-sprite";
import { RenameForm } from "./rename-form";

export function PetDetail({ pet }: { pet: PetSnapshot }) {
  const t = useTranslations("pet");
  const [picking, setPicking] = useState(false);
  const [pendingClass, setPendingClass] = useState<PetClass | null>(null);
  const [, startTransition] = useTransition();
  const primary = CLASS_PRIMARY[pet.petClass];
  const max = Math.max(1, ...PET_ATTRIBUTES.map((a) => pet.attributes[a]));
  const span = Math.max(1, pet.nextLevelXp - pet.levelFloorXp);
  const progress = Math.min(100, Math.round(((pet.xp - pet.levelFloorXp) / span) * 100));

  function confirmClass(cls: PetClass) {
    if (!window.confirm(t("changeClass.confirm", { cls: t(`classes.${cls}`) }))) return;
    startTransition(async () => {
      await changeClass(cls);
      setPicking(false);
    });
  }

  const c = pet.counts;
  const sources: Record<(typeof PET_ATTRIBUTES)[number], string> = {
    FUE: t("sources.FUE", { units: c.sessionUnits, episodes: c.episodes }),
    CON: t("sources.CON", { days: c.activeDays, goalDays: c.dailyGoalDays, milestones: c.streakMilestones }),
    INT: t("sources.INT", { passes: c.finishedPasses, sagas: c.completedSagas, genres: c.distinctGenres }),
    SAB: t("sources.SAB", { notes: c.notes, quotes: c.quotes, reviews: c.reviews, ratings: c.ratings }),
    CAR: t("sources.CAR", { posts: c.posts, votes: c.votes, polls: c.polls, events: c.events, follows: c.follows }),
    DES: t("sources.DES", { works: c.newWorks, authors: c.newAuthors, imports: c.importedRows }),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="pet-detail">
      <section className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
        <PetSprite
          stage={pet.stage}
          petClass={pet.petClass}
          mood={pet.mood}
          scale={3}
          reaction={pet.evolved ? "evolve" : pet.leveledUp ? "joy" : null}
          label={pet.name}
        />
        <h2 className="font-serif text-2xl font-semibold text-foreground" data-testid="pet-name">{pet.name}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`classes.${pet.petClass}`)} · {t(`stages.${pet.stage}`)} · {t(`moods.${pet.mood}`)}
        </p>
        {pet.stage === "acorn" ? <p className="text-sm text-muted-foreground">{t("acornHint")}</p> : null}
        <div className="flex w-full max-w-sm flex-col gap-1">
          <div className="flex justify-between text-[12px] text-muted-foreground">
            <span>{t("level", { level: pet.level })}</span>
            <span>{t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
        <h3 className="font-serif text-lg font-semibold text-foreground">{t("sources.title")}</h3>
        <ul className="flex flex-col gap-3">
          {PET_ATTRIBUTES.map((attr) => (
            <li key={attr} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">
                  {t(`attributes.${attr}`)}
                  {attr === primary ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{t("primary")}</span> : null}
                </span>
                <span className="font-mono text-[12.5px] text-muted-foreground">{pet.attributes[attr]}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className={attr === primary ? "h-full bg-accent" : "h-full bg-muted-foreground"} style={{ width: `${Math.round((pet.attributes[attr] / max) * 100)}%` }} />
              </div>
              <p className="text-[12px] text-muted-foreground">{sources[attr]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
        <RenameForm name={pet.name} />
        {picking ? (
          <ClassPicker value={pendingClass ?? pet.petClass} onChange={(cls) => { setPendingClass(cls); confirmClass(cls); }} stage={pet.stage} name="newClass" />
        ) : (
          <button type="button" onClick={() => setPicking(true)} className={buttonVariants("secondary", "self-start px-4")}>
            {t("changeClass.label")}
          </button>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Página**

`src/app/mascota/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { SHELL_READ } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { deriveAttributes, suggestClass } from "@/lib/pet/derive";
import { getPetCounts } from "@/lib/pet/get-pet-counts";
import { getPetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { HatchForm } from "@/components/pet/hatch-form";
import { PetDetail } from "@/components/pet/pet-detail";

export const metadata: Metadata = { title: "Mascota — Biblioshare" };

// Todo depende de la sesión: nada de `use cache` (#437). La lectura va bajo
// <Suspense> para que el armazón salga sin esperar a Supabase.
export default async function MascotaPage() {
  const t = await getTranslations("pet");
  return (
    <div className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <PageHeader title={t("title")} />
      <Suspense fallback={<div aria-hidden className="h-64 animate-pulse rounded-card bg-surface-muted" />}>
        <PetContent />
      </Suspense>
    </div>
  );
}

async function PetContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/mascota"));
  const profile = await getOwnProfile(user.id);
  if (!profile?.username) redirect("/onboarding");

  const supabase = await createClient();
  const pet = await getPetSnapshot(supabase, user.id);

  if (!pet) {
    // Eclosión: la sugerencia sale del historial (spec §2). Sin historial → null.
    const { counts } = await getPetCounts(supabase, user.id);
    return <HatchForm suggested={suggestClass(deriveAttributes(counts))} />;
  }
  return <PetDetail pet={pet} />;
}
```

- [ ] **Step 8: Verificar en el navegador**

Run: `npm run dev` (un solo `next dev`, puerto 3000). Abrir `http://localhost:3000/mascota` con el usuario de dev:

1. Sin `pet_state`: bellota, campo nombre, seis fichas, una marcada «Sugerida». Enviar → detalle con nombre, barra de nivel, seis atributos con «Qué la sube».
2. Renombrar → cambia el título. Cambiar de clase → confirm → cambia el sprite.
3. En el menú «Tú» (avatar en escritorio / fila del perfil en móvil) aparece «Mascota».

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Esperado: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/app/mascota src/components/pet/hatch-form.tsx src/components/pet/class-picker.tsx src/components/pet/rename-form.tsx src/components/pet/pet-detail.tsx src/components/nav/nav-items.ts src/components/ui/icons.tsx
git commit -m "feat(pet): página /mascota con eclosión, detalle, renombrar y cambio de clase; entrada en «Tú»"
```

---

### Task 9: Compañera flotante en el shell e interruptor en ajustes

**Files:**
- Create: `src/components/pet/pet-companion.tsx`
- Create: `src/components/settings/pet-companion-toggle.tsx`
- Modify: `src/components/nav/app-shell.tsx`
- Modify: `src/app/ajustes/page.tsx`

**Interfaces:**
- Consumes: `getCompanionState`, `CompanionState` (Task 3); `onCelebrationsShown` (Task 6); `setCompanionHidden` (Task 7); `<PetSprite>` (Task 5); `readChromeIdentity` (privada en `app-shell.tsx`, se reutiliza dentro del mismo fichero).

- [ ] **Step 1: Compañera (cliente)**

`src/components/pet/pet-companion.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onCelebrationsShown } from "@/lib/celebrations/preference";
import type { CelebrationPayload } from "@/lib/celebrations/types";
import type { CompanionState } from "@/lib/pet/get-companion-state";
import { PetSprite, type PetReaction } from "./pet-sprite";

const JOY_MS = 900;
const BUBBLE_MS = 2200;

// Compañera flotante (spec §6). Cero ruido: solo reacciona a lo que acabas de
// hacer (una celebración recién encolada) y enseña el humor pasivo. Tap → /mascota.
export function PetCompanion({ state }: { state: CompanionState }) {
  const t = useTranslations("nav");
  const [reaction, setReaction] = useState<PetReaction>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const off = onCelebrationsShown((items: CelebrationPayload[]) => {
      const last = items.at(-1);
      if (!last) return;
      setReaction("joy");
      setBubble(t(`pet.bubble.${last.event}`, { milestone: last.milestone ?? "" }));
      timers.current.push(window.setTimeout(() => setReaction(null), JOY_MS));
      timers.current.push(window.setTimeout(() => setBubble(null), BUBBLE_MS));
    });
    return () => {
      off();
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [t]);

  return (
    <Link
      href="/mascota"
      aria-label={t("pet.companionLabel", { name: state.name })}
      data-testid="pet-companion"
      className="fixed right-3 z-30 flex flex-col items-end gap-1 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-4"
    >
      {bubble ? (
        <span role="status" className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-foreground shadow-card">
          {bubble}
        </span>
      ) : null}
      <PetSprite stage={state.stage} petClass={state.petClass} mood={state.mood} scale={1} reaction={reaction} label={state.name} />
    </Link>
  );
}
```

- [ ] **Step 2: Montar en el shell**

En `src/components/nav/app-shell.tsx`:

Importar `getCompanionState` de `@/lib/pet/get-companion-state` y `PetCompanion` de `@/components/pet/pet-companion`. Tras el `<Suspense>` de `SessionNav` (dentro del `div` raíz) añadir:

```tsx
      {/* Compañera flotante (spec mascota §6). Bajo su propio <Suspense> y dentro
          del gate por lo mismo que las barras: lee sesión y no puede bloquear el
          armazón; no aparece en pantallas a sangre. Fallback null: no reserva
          sitio porque flota. */}
      <Suspense fallback={null}>
        <ChromeGate>
          <SessionCompanion />
        </ChromeGate>
      </Suspense>
```

Y al final del fichero:

```tsx
// Solo con el usuario DENTRO (showNav) y con mascota eclosionada y no oculta.
// La lectura es la ligera (pet_state + última actividad), no la derivación.
async function SessionCompanion() {
  const { user, showNav } = await readChromeIdentity();
  if (!user || !showNav) return null;
  const supabase = await createClient();
  const state = await getCompanionState(supabase, user.id).catch(() => null);
  if (!state || state.hidden) return null;
  return <PetCompanion state={state} />;
}
```

- [ ] **Step 3: Interruptor en ajustes**

`src/components/settings/pet-companion-toggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setCompanionHidden } from "@/lib/pet/actions";

// Mismo interruptor que HideDroppedToggle (optimista, revierte si falla). El
// valor inicial llega por props desde /ajustes. `on` = compañera VISIBLE.
export function PetCompanionToggle({ hidden }: { hidden: boolean }) {
  const t = useTranslations("pet");
  const [on, setOn] = useState(!hidden);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await setCompanionHidden(!next);
      if (result?.error) setOn(!next);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{t("companion.label")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("companion.label")}
          data-testid="pet-companion-toggle"
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-muted"}`}
        >
          <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? "bg-accent-foreground" : "bg-muted-foreground"} ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`} />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("companion.hint")} <Link href="/mascota" className="text-accent underline">{t("companion.cta")}</Link>
      </p>
    </div>
  );
}
```

En `src/app/ajustes/page.tsx`: el namespace `pet` no está en BASE, así que envolver el toggle con `<RouteMessages ns={["pet"]}>` (importar de `@/components/route-messages`). Leer `pet_state` en la página:

```tsx
  const { data: pet } = await supabase
    .from("pet_state")
    .select("companion_hidden")
    .eq("user_id", user.id)
    .maybeSingle();
```

y dentro de `<Section title={t("noticesSection")}>`, tras `<CelebrationPreferenceToggle />`:

```tsx
        {pet ? (
          <RouteMessages ns={["pet"]}>
            <PetCompanionToggle hidden={pet.companion_hidden} />
          </RouteMessages>
        ) : null}
```

- [ ] **Step 4: Verificar en el navegador**

Con `next dev` en 3000 y mascota eclosionada:

1. `/coleccion`: ardilla de 40 px abajo a la derecha, por encima de la barra inferior en móvil (DevTools, 390 px).
2. Registrar una sesión desde la ficha de un libro → la ardilla salta y sale un bocadillo («¡Buenos días!» si es la primera actividad del día).
3. `/partida/activa`: sin ardilla. Sesión cerrada: sin ardilla.
4. `/ajustes` → apagar «Compañera flotante» → `/coleccion` sin ardilla; encender → vuelve.
5. Con `prefers-reduced-motion` (DevTools → Rendering) la ardilla no se balancea; al registrar sesión solo hace un pequeño salto.

- [ ] **Step 5: Build de producción**

Run: `npm run build`
Esperado: sin errores (en particular ningún `next-request-in-use-cache` ni `CLIENT_HOOK_DYNAMIC`). Si `next build` se queja de que `/mascota` no puede prerenderarse por `getCurrentUser` fuera de `<Suspense>`, la página ya lo tiene dentro de `PetContent`; comprobar que no se llamó a `getCurrentUser` en el componente raíz.

- [ ] **Step 6: Commit**

```bash
git add src/components/pet/pet-companion.tsx src/components/settings/pet-companion-toggle.tsx src/components/nav/app-shell.tsx src/app/ajustes/page.tsx
git commit -m "feat(pet): compañera flotante que reacciona a las celebraciones e interruptor en ajustes"
```

---

### Task 10: E2E, calibración, prod y documentación de cierre

**Files:**
- Create: `e2e/mascota.spec.ts`
- Modify: `docs/requirements/data-model.md` (fecha de prod), `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `docs/DRIFT-CHECK.md`

- [ ] **Step 1: Spec e2e**

`e2e/mascota.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// E2E de la mascota (spec 2026-09-02): eclosión, compañera en el shell (y su
// ausencia en pantallas a sangre), reacción al registrar actividad y ocultar
// desde ajustes. Mismo patrón de sesión/limpieza que
// biblioteca-ocultar-abandonados.spec.ts: fetch nativo con service-role y la
// fila devuelta a como estaba.

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

type PetRow = { user_id: string; name: string; class: string; companion_hidden: boolean; last_level: number; last_stage: string };

let userId: string;
let baseline: PetRow | null = null;

test.beforeAll(async () => {
  const perfiles = (await (await api(`profiles?username=eq.${USERNAME}&select=user_id`)).json()) as Array<{ user_id: string }>;
  if (perfiles.length !== 1) throw new Error(`no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  const rows = (await (await api(`pet_state?user_id=eq.${userId}&select=user_id,name,class,companion_hidden,last_level,last_stage`)).json()) as PetRow[];
  baseline = rows[0] ?? null;
  // Arranca SIN mascota para probar la eclosión.
  await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
});

test.afterAll(async () => {
  await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
  if (baseline) await api("pet_state", { method: "POST", body: JSON.stringify(baseline) });
});

test("eclosión: nombre + clase → detalle; compañera en el shell; ausente en pantalla a sangre", async ({ page }) => {
  await login(page);

  await page.goto("/mascota");
  await expect(page.getByTestId("hatch-form")).toBeVisible();
  await page.fill('input[name="name"]', "Nuez");
  await page.locator('input[name="class"][value="wizard"]').check({ force: true });
  await page.getByRole("button", { name: "Eclosionar" }).click();

  await expect(page.getByTestId("pet-detail")).toBeVisible();
  await expect(page.getByTestId("pet-name")).toHaveText("Nuez");

  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toBeVisible();

  await page.goto("/partida/activa");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);
});

test("la compañera se oculta desde ajustes y vuelve", async ({ page }) => {
  await login(page);
  await page.goto("/ajustes");
  const toggle = page.getByTestId("pet-companion-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);

  await page.goto("/ajustes");
  await page.getByTestId("pet-companion-toggle").click();
  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toBeVisible();
});

test("sin sesión no hay compañera", async ({ page }) => {
  await page.goto("/buscar");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);
});
```

- [ ] **Step 2: Correr e2e contra build de producción**

Run (con el `next dev` parado, puerto 3000 libre):

```bash
npm run build && (npm run start &) && sleep 8 && npx playwright test e2e/mascota.spec.ts
```

Esperado: 3 passed. Después parar el `next start` (`Get-Process node | Stop-Process` en PowerShell si hace falta) y comprobar que el puerto 3000 queda libre.

- [ ] **Step 3: Suite unitaria completa y lint**

Run: `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json`
Esperado: todo verde.

- [ ] **Step 4: Calibración contra prod (solo lectura)**

Con el MCP `supabase-prod` → `execute_sql`, contadores por usuario real (solo las fuentes grandes; no escribe nada):

```sql
select p.user_id,
       (select count(*) from progress_sessions s where s.user_id = p.user_id) as sessions,
       (select coalesce(sum(duration_minutes),0) from progress_sessions s where s.user_id = p.user_id) as minutes,
       (select count(*) from passes x where x.user_id = p.user_id and x.status = 'completed') as finished,
       (select count(*) from notes n where n.user_id = p.user_id) as notes,
       (select count(*) from club_posts c where c.author_id = p.user_id) as posts
  from profiles p;
```

Estimar XP con `BALANCE` (minutos/10 + terminados×10 + notas×3 + posts×3 + días activos×2, aproximado) y el nivel con `floor(sqrt(xp/50))+1`. **Criterio de la spec**: el usuario más activo tiene que quedar en adulta (nivel ≥ 10, es decir ≥ 4 050 XP). Si no llega, bajar `BALANCE.level.divisor` (p. ej. a 25) y anotar el porqué en `balance.ts` y en `decisiones.md`. Si ya lo supera holgadamente (nivel > 25), dejar 50.

- [ ] **Step 5: Migración a prod**

MCP `supabase-prod` → `apply_migration` con el mismo SQL de Task 1. Verificar con la consulta de `pg_class`/`pg_policies` de Task 1 Step 2 y la superficie 6. Actualizar en `docs/requirements/data-model.md` §8bis.1 el encabezado a «(dev y **prod**, 2026-09-02)» con la verificación.

- [ ] **Step 6: Documentación de cierre**

- `docs/requirements/backlog.md`: en «Features que no existen (P2-P3, por dominio)» añadir una línea marcada como hecha para «Mascota RPG fase 1 (núcleo)» apuntando a la spec, y una sin marcar por cada fase pendiente (misiones/logros, avisos push, jefes PvE, PvP) con su número de issue del paso siguiente.
- `docs/requirements/decisiones.md` (append al final): entrada «2026-09-02 — Mascota RPG: todo lo derivable se deriva» con los tres porqués de la spec (derivado vs libro mayor; rig por partes vs frames; humor sin castigo) y el resultado de la calibración.
- `docs/DRIFT-CHECK.md` §6: añadir la fila de referencia de `pet_state`.
- Regenerar `docs/architecture/graph.json` según `docs/architecture/README.md` si el procedimiento es automático; si es manual, añadir el nodo `src/lib/pet` con sus dependencias (`stats/get-streaks`, `celebrations/earn`, `celebrations/registry`) y el flujo «eclosionar mascota».

- [ ] **Step 7: Issues de las fases siguientes**

Una por línea de la spec §10, con las tres etiquetas:

```bash
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota fase 2: misiones diarias generadas + logros permanentes" --body "Spec: docs/superpowers/specs/2026-09-02-mascota-rpg-design.md §10. Misiones desde plantillas (2-3/día) con recompensa XP; logros = extender el registro de celebraciones. Depende de la fase 1 (rama feat/mascota-rpg)."
gh issue create --label "area:infra,tipo:feature,P3" --title "Mascota fase 3: avisos push por humor y racha" --body "Spec §10. Reusar push-toggle y el cron de recordatorios de club. Decidir cadencia máxima (nunca más de uno al día) y que respete la preferencia de la compañera."
gh issue create --label "area:play,tipo:feature,P3" --title "Mascota fase 4: jefes PvE sobre challenges con motor de combate stats vs stats" --body "Spec §10. Un jefe = reto con umbral en ventana; se golpea con los atributos. Motor único reutilizable por el PvP."
gh issue create --label "area:social,tipo:feature,P3" --title "Mascota fase 5: PvP asíncrono entre seguidos" --body "Spec §10. Sobre el motor de la fase 4. Con 3 cuentas en prod no es prioritario."
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: cosméticos desbloqueables y economía de bellotas" --body "Spec §10. Capas nuevas en src/lib/pet/manifest.ts; decidir coste de cambio de clase entonces."
gh issue create --label "area:play,tipo:feature,P3" --title "Mascota: BiblioPlay como fuente (DES / Pícaro+SUERTE / objetos de combate)" --body "Spec §2. Tres opciones barajadas el 2026-09-02; ninguna decidida. No implementar sin decidir."
gh issue create --label "area:infra,tipo:feature,P3" --title "Mascota: RPC get_pet_snapshot() para el widget nativo" --body "Spec §10. Port fiel de src/lib/pet/derive.ts como se hizo con get_widget_snapshot (§7 data-model). Solo cuando el widget la necesite."
gh issue create --label "area:ui,tipo:deuda,P2" --title "Mascota: la subida de nivel solo se detecta al abrir /mascota" --body "Spec §8: no hay cron. Consecuencia: la celebración pet_level_up llega tarde si el usuario no visita la página. Opciones: gancho en addSession (get-pet-snapshot es caro) o lectura ligera que compare solo XP aproximada."
gh issue create --label "area:ui,tipo:deuda,P2" --title "Mascota: sustituir el arte procedural por sprites IA curados" --body "Spec §5. Los PNG de public/pet los genera scripts/pet-sprites.mjs. Brief: una petición por pieza base y etapa sobre lienzo 40×40 con pivote marcado; capas de clase sobre la misma base. Mismos nombres; manifest.test.ts vigila que no falte ninguno."
```

- [ ] **Step 8: Commit final y PR**

```bash
git add e2e/mascota.spec.ts docs/requirements/data-model.md docs/requirements/backlog.md docs/requirements/decisiones.md docs/DRIFT-CHECK.md docs/architecture src/lib/pet/balance.ts
git commit -m "test(pet): e2e de eclosión, compañera y ajustes; docs de cierre y calibración"
```

Abrir PR desde `feat/mascota-rpg` a `main` con el resumen de la spec, la respuesta escrita a la pregunta de caché de `AGENTS.md` («ningún `use cache`: todo depende de `auth.uid()`»), la tabla de calibración y la lista de issues creadas. Al mergear: `git worktree list` limpio, puerto 3000 libre.
