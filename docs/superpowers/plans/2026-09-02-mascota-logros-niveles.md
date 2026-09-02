# Mascota: logros por familias con escalera abierta e insignias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir los logros planos por familias con niveles incrementales sin tope, una insignia pixel art por familia, y una vitrina que enseña la última insignia conseguida y la siguiente por conseguir.

**Architecture:** `ACHIEVEMENT_FAMILIES` + escaleras en `BALANCE.achievements`; funciones puras (`thresholdFor`, `tierFor`, `familyProgress`, `parseAchievementKey`, `planAchievementEarns`) sin I/O. El rastro sigue siendo la celebración `pet_achievement:<familia>:<tier>` (una fila por nivel); una migración de datos renombra las claves planas ya existentes. Insignias PNG 32×32 por familia con manifiesto y test; componente `<AchievementBadge>` con marco por nivel; galería reescrita a una tarjeta por familia.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), TypeScript, Vitest, Playwright, next-intl, Node (script de PNG sin dependencias).

**Spec:** `docs/superpowers/specs/2026-09-02-mascota-logros-niveles-design.md`. Fase 2 en `2026-09-02-mascota-misiones-logros-design.md`.

## Global Constraints

- **Rama `feat/mascota-rpg`** (PR #1027 abierta). Todo commit va ahí.
- **Números solo en `src/lib/pet/balance.ts`** (`BALANCE.achievements`, escaleras exactas de la spec §1): `finished` [10, 50, 100, 200] +100 · `sessions` [100, 250, 500, 1000] +500 · `episodes` [100, 250, 500, 1000] +500 · `notes` [50, 100, 200, 400] +200 · `reviews` [10, 25, 50, 100] +50 · `genres` [10, 15, 20, 30] +10 · `streak` [30, 100, 200, 365] +365 · `posts` [50, 100, 150, 300] +300 · `sagas` [3, 5, 10, 20] +10 · `missions` [50, 100, 200, 400] +400 · `stage` [10, 40] cerrada (`then: null`).
- **Clave de celebración** `pet_achievement:<familia>:<tier>`; `payload.key` = `<familia>:<tier>`; `payload.title` = «<nombre de familia> · nivel N».
- **Subir varios niveles de golpe**: se ganan todos los intermedios (sellados con `alreadyDisplayed`), se anima solo el más alto de cada familia y solo si no es backfill (backfill = el usuario no tiene ninguna fila `pet_achievement`).
- **Escalera cerrada**: `tierFor` no pasa de `steps.length`; `nextThreshold` = `null` al completarla.
- **Migración de datos** `20260904_pet_achievement_tiers.sql`: **dev primero** (implementador), **prod después** (lo aplica el controlador tras la revisión). Verificación: `select count(*) from user_celebrations where event_type = 'pet_achievement' and event_key not like 'pet_achievement:%:%'` = 0.
- **Insignias**: `public/pet/badges/<familia>.png`, 32×32, una por familia (11), generadas por `scripts/pet-badges.mjs`; `BADGE_MANIFEST` en `src/lib/pet/badges.ts` + test de existencia. Marco por nivel: `(tier − 1) mod 4` → bronce, plata, oro, leyenda; colores en `achievement-badge.module.css`, sin tokens globales nuevos. `<img>` con `image-rendering: pixelated` y `eslint-disable-next-line @next/next/no-img-element` como en `pet-sprite.tsx`.
- **Vitrina**: una tarjeta por familia, huecos «Conseguido» y «Siguiente»; orden nivel desc, luego `value / nextThreshold` desc, completas al final; `data-testid="achievement-<familia>"` con `data-tier="N"`.
- **Nada de `use cache`** (RLS por `auth.uid()`); errores de lectura lanzados; `earnCelebration` nunca lanza.
- **Tests antes del código**; `npx vitest run <ruta>`, `npx tsc --noEmit -p .`, `npx eslint <rutas>`.
- **Commits** en español, tipo convencional, trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`.

---

## File structure

| Fichero | Responsabilidad |
|---|---|
| `src/lib/pet/balance.ts` | `BALANCE.achievements` (escaleras) |
| `src/lib/pet/achievements.ts` (+ test) | familias, `Ladder`, `thresholdFor`, `tierFor`, `familyProgress`, `parseAchievementKey`, `achievementKey`, `planAchievementEarns` |
| `supabase/migrations/20260904_pet_achievement_tiers.sql`, `schema-baseline.sql`, `data-model.md` | renombrado de claves |
| `scripts/lib/png.mjs`, `scripts/pet-sprites.mjs`, `scripts/pet-badges.mjs`, `public/pet/badges/*.png` | codificador PNG compartido y generación de insignias |
| `src/lib/pet/badges.ts` (+ test) | `BADGE_MANIFEST` |
| `src/components/pet/achievement-badge.tsx` + `.module.css` | insignia con marco y número |
| `src/lib/pet/get-pet-snapshot.ts` | `familyProgress` + `planAchievementEarns`, `FamilyView` |
| `src/components/pet/achievement-grid.tsx`, `messages/es.json` | vitrina por familia |
| `e2e/mascota-misiones.spec.ts`, docs (`decisiones.md`, `backlog.md`, `graph.json`), issues | cierre |

---

### Task 1: Familias, escalera y planificación de ganancias (puro)

**Files:**
- Modify: `src/lib/pet/balance.ts`
- Rewrite: `src/lib/pet/achievements.ts`
- Rewrite: `src/lib/pet/achievements.test.ts`

**Interfaces:**
- Consumes: `PetCounts` (`counts.ts`), `BALANCE`.
- Produces: `Ladder`, `AchievementFamily`, `ACHIEVEMENT_FAMILIES: readonly AchievementFamily[]`, `ladderFor(family)`, `thresholdFor(ladder, tier)`, `tierFor(ladder, value)`, `FamilyProgress`, `familyProgress(counts, level)`, `achievementKey(family, tier)`, `parseAchievementKey(eventKey)`, `EarnPlan`, `planAchievementEarns(progress, earnedKeys, backfill)`.

- [ ] **Step 1: Balance**

En `src/lib/pet/balance.ts`, dentro de `BALANCE` tras `missions: { … },`:

```ts
  // Logros por familias con escalera ABIERTA (spec logros-niveles §1): los
  // primeros niveles a mano (`steps`), después último + `then` por nivel.
  // `then: null` = escalera cerrada (no hay nivel más allá de `steps`). Los
  // primeros pasos coinciden con los umbrales planos antiguos para que la
  // migración 20260904 no pierda ninguna fecha.
  achievements: {
    finished: { steps: [10, 50, 100, 200], then: 100 },
    sessions: { steps: [100, 250, 500, 1000], then: 500 },
    episodes: { steps: [100, 250, 500, 1000], then: 500 },
    notes: { steps: [50, 100, 200, 400], then: 200 },
    reviews: { steps: [10, 25, 50, 100], then: 50 },
    genres: { steps: [10, 15, 20, 30], then: 10 },
    streak: { steps: [30, 100, 200, 365], then: 365 },
    posts: { steps: [50, 100, 150, 300], then: 300 },
    sagas: { steps: [3, 5, 10, 20], then: 10 },
    missions: { steps: [50, 100, 200, 400], then: 400 },
    stage: { steps: [10, 40], then: null },
  },
```

- [ ] **Step 2: Test (falla)**

Sustituye `src/lib/pet/achievements.test.ts` entero:

```ts
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_FAMILIES,
  achievementKey,
  familyProgress,
  ladderFor,
  parseAchievementKey,
  planAchievementEarns,
  thresholdFor,
  tierFor,
  type Ladder,
} from "./achievements";
import { BALANCE } from "./balance";
import { EMPTY_COUNTS } from "./counts";

const posts: Ladder = { steps: [50, 100, 150, 300], then: 300 };
const stage: Ladder = { steps: [10, 40], then: null };

describe("thresholdFor", () => {
  it("dentro de steps devuelve el paso; más allá suma `then` por nivel", () => {
    expect(thresholdFor(posts, 1)).toBe(50);
    expect(thresholdFor(posts, 4)).toBe(300);
    expect(thresholdFor(posts, 5)).toBe(600);
    expect(thresholdFor(posts, 7)).toBe(1200);
  });
  it("cerrada: null fuera de steps; tier 0 o negativo o no entero: null", () => {
    expect(thresholdFor(stage, 2)).toBe(40);
    expect(thresholdFor(stage, 3)).toBeNull();
    expect(thresholdFor(posts, 0)).toBeNull();
    expect(thresholdFor(posts, -1)).toBeNull();
    expect(thresholdFor(posts, 1.5)).toBeNull();
  });
});

describe("tierFor", () => {
  it("valor = umbral exacto sube de nivel; entre pasos se queda; más allá de steps sigue", () => {
    expect(tierFor(posts, 0)).toBe(0);
    expect(tierFor(posts, 49)).toBe(0);
    expect(tierFor(posts, 50)).toBe(1);
    expect(tierFor(posts, 160)).toBe(3);
    expect(tierFor(posts, 300)).toBe(4);
    expect(tierFor(posts, 899)).toBe(5);
    expect(tierFor(posts, 900)).toBe(6);
  });
  it("cerrada topa en el último paso", () => {
    expect(tierFor(stage, 9)).toBe(0);
    expect(tierFor(stage, 10)).toBe(1);
    expect(tierFor(stage, 40)).toBe(2);
    expect(tierFor(stage, 10_000)).toBe(2);
  });
});

describe("escaleras del balance", () => {
  it("todas las familias tienen escalera creciente y `then` nulo o positivo", () => {
    for (const f of ACHIEVEMENT_FAMILIES) {
      const l = ladderFor(f);
      expect(l.steps.length, f).toBeGreaterThan(0);
      for (let i = 1; i < l.steps.length; i++) expect(l.steps[i], f).toBeGreaterThan(l.steps[i - 1]);
      if (l.then != null) expect(l.then, f).toBeGreaterThan(0);
    }
    expect(ACHIEVEMENT_FAMILIES).toEqual(Object.keys(BALANCE.achievements));
  });
});

describe("familyProgress", () => {
  it("con cero todo es nivel 0 y el siguiente umbral es el primer paso", () => {
    const p = familyProgress(EMPTY_COUNTS, 1);
    expect(p).toHaveLength(ACHIEVEMENT_FAMILIES.length);
    for (const f of p) {
      expect(f.tier).toBe(0);
      expect(f.threshold).toBeNull();
      expect(f.nextThreshold).toBe(ladderFor(f.family).steps[0]);
    }
  });
  it("posts 160 → nivel 3 (150), siguiente 300; stage a nivel 40 → completa", () => {
    const p = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 40);
    const posts = p.find((f) => f.family === "posts")!;
    expect(posts).toMatchObject({ value: 160, tier: 3, threshold: 150, nextThreshold: 300 });
    const stage = p.find((f) => f.family === "stage")!;
    expect(stage).toMatchObject({ value: 40, tier: 2, threshold: 40, nextThreshold: null });
  });
  it("notas suma notas y citas; streak lee bestStreak", () => {
    const p = familyProgress({ ...EMPTY_COUNTS, notes: 30, quotes: 20, bestStreak: 100 }, 1);
    expect(p.find((f) => f.family === "notes")!.tier).toBe(1);
    expect(p.find((f) => f.family === "streak")!.tier).toBe(2);
  });
});

describe("claves", () => {
  it("achievementKey y parseAchievementKey son inversas; claves viejas o basura → null", () => {
    expect(achievementKey("posts", 3)).toBe("posts:3");
    expect(parseAchievementKey("pet_achievement:posts:3")).toEqual({ family: "posts", tier: 3 });
    expect(parseAchievementKey("pet_achievement:finished_10")).toBeNull();
    expect(parseAchievementKey("pet_achievement:nope:1")).toBeNull();
    expect(parseAchievementKey("pet_achievement:posts:0")).toBeNull();
    expect(parseAchievementKey("pet_achievement:posts:x")).toBeNull();
    expect(parseAchievementKey("streak_milestone:30")).toBeNull();
  });
});

describe("planAchievementEarns", () => {
  it("gana todos los niveles que faltan y anima solo el más alto de cada familia", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160, reviews: 10 }, 1);
    const plan = planAchievementEarns(progress, new Set(["posts:1"]), false);
    expect(plan.map((e) => `${e.key}:${e.animate}`).sort()).toEqual(["posts:2:false", "posts:3:true", "reviews:1:true"].sort());
  });
  it("en backfill no anima nada", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 1);
    const plan = planAchievementEarns(progress, new Set(), true);
    expect(plan).toHaveLength(3);
    expect(plan.every((e) => !e.animate)).toBe(true);
  });
  it("sin novedades no gana nada", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 1);
    expect(planAchievementEarns(progress, new Set(["posts:1", "posts:2", "posts:3"]), false)).toEqual([]);
  });
});
```

- [ ] **Step 3: Comprobar que falla**

Run: `npx vitest run src/lib/pet/achievements.test.ts`
Expected: FAIL (exports inexistentes).

- [ ] **Step 4: Implementación**

Sustituye `src/lib/pet/achievements.ts` entero:

```ts
import { BALANCE } from "./balance";
import type { PetCounts } from "./counts";

// Logros por FAMILIAS con escalera abierta (spec logros-niveles §1). Sin XP,
// sin tabla: nivel = f(valor) y el rastro (con fecha por nivel) es la
// celebración pet_achievement:<familia>:<tier>. Todo puro.

export type Ladder = { steps: readonly number[]; then: number | null };

export type AchievementFamily = keyof typeof BALANCE.achievements;

export const ACHIEVEMENT_FAMILIES = Object.keys(BALANCE.achievements) as AchievementFamily[];

export function isAchievementFamily(s: string): s is AchievementFamily {
  return Object.prototype.hasOwnProperty.call(BALANCE.achievements, s);
}

export function ladderFor(family: AchievementFamily): Ladder {
  return BALANCE.achievements[family];
}

/** Qué mide cada familia. `stage` lee el nivel de la mascota, no PetCounts. */
const VALUE_OF: Record<AchievementFamily, (c: PetCounts, level: number) => number> = {
  finished: (c) => c.finishedPasses,
  sessions: (c) => c.sessionUnits,
  episodes: (c) => c.episodes,
  notes: (c) => c.notes + c.quotes,
  reviews: (c) => c.reviews,
  genres: (c) => c.distinctGenres,
  streak: (c) => c.bestStreak,
  posts: (c) => c.posts,
  sagas: (c) => c.completedSagas,
  missions: (c) => c.missionsCompleted,
  stage: (_c, level) => level,
};

/** Umbral del nivel `tier` (>= 1). Más allá de `steps`: último + then × exceso. Cerrada fuera de rango: null. */
export function thresholdFor(ladder: Ladder, tier: number): number | null {
  if (!Number.isInteger(tier) || tier < 1) return null;
  if (tier <= ladder.steps.length) return ladder.steps[tier - 1];
  if (ladder.then == null) return null;
  return ladder.steps[ladder.steps.length - 1] + ladder.then * (tier - ladder.steps.length);
}

/** Mayor nivel cuyo umbral <= value. 0 = ninguno. Termina porque los umbrales crecen. */
export function tierFor(ladder: Ladder, value: number): number {
  let tier = 0;
  for (;;) {
    const next = thresholdFor(ladder, tier + 1);
    if (next == null || value < next) return tier;
    tier++;
  }
}

export interface FamilyProgress {
  family: AchievementFamily;
  value: number;
  tier: number;
  /** Umbral del nivel actual; null con nivel 0. */
  threshold: number | null;
  /** Umbral del siguiente nivel; null si la escalera está cerrada y completa. */
  nextThreshold: number | null;
}

export function familyProgress(counts: PetCounts, level: number): FamilyProgress[] {
  return ACHIEVEMENT_FAMILIES.map((family) => {
    const ladder = ladderFor(family);
    const value = VALUE_OF[family](counts, level);
    const tier = tierFor(ladder, value);
    return { family, value, tier, threshold: thresholdFor(ladder, tier), nextThreshold: thresholdFor(ladder, tier + 1) };
  });
}

/** `payload.key` de la celebración: "<familia>:<tier>". */
export function achievementKey(family: AchievementFamily, tier: number): string {
  return `${family}:${tier}`;
}

/** Lee `user_celebrations.event_key` ("pet_achievement:<familia>:<tier>"). Cualquier otra forma → null (fail-closed). */
export function parseAchievementKey(eventKey: string): { family: AchievementFamily; tier: number } | null {
  const m = /^pet_achievement:([a-z]+):(\d+)$/.exec(eventKey);
  if (!m) return null;
  const [, family, tierRaw] = m;
  const tier = Number(tierRaw);
  if (!isAchievementFamily(family) || !Number.isInteger(tier) || tier < 1) return null;
  return { family, tier };
}

export interface EarnPlan {
  family: AchievementFamily;
  tier: number;
  /** = achievementKey(family, tier) */
  key: string;
  /** true solo para el nivel más alto nuevo de la familia, y nunca en backfill. */
  animate: boolean;
}

/** Qué niveles ganar en esta lectura: todos los 1..tier que no estén en `earnedKeys`. */
export function planAchievementEarns(
  progress: FamilyProgress[],
  earnedKeys: ReadonlySet<string>,
  backfill: boolean,
): EarnPlan[] {
  const plan: EarnPlan[] = [];
  for (const p of progress) {
    for (let tier = 1; tier <= p.tier; tier++) {
      const key = achievementKey(p.family, tier);
      if (earnedKeys.has(key)) continue;
      plan.push({ family: p.family, tier, key, animate: !backfill && tier === p.tier });
    }
  }
  return plan;
}
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/lib/pet/achievements.test.ts && npx tsc --noEmit -p .`
Expected: el test PASS. `tsc` **fallará** en `get-pet-snapshot.ts` (importa `achievementProgress`/`isAchievementId`, que ya no existen): es esperado y lo arregla la Task 4. Para dejar la rama compilable en este commit, en `src/lib/pet/get-pet-snapshot.ts` cambia SOLO el import y las dos líneas de uso por un puente mínimo: `import { familyProgress, parseAchievementKey, type AchievementFamily } from "./achievements";`, `AchievementView` pasa a `{ id: string; value: number; threshold: number; unlocked: boolean; unlockedAt: string | null }`, la línea `if (isAchievementId(id)) earnedAt.set(id, …)` pasa a `const parsed = parseAchievementKey(r.event_key); if (parsed) earnedAt.set(\`${parsed.family}:${parsed.tier}\`, r.first_triggered_at);`, y `achievementProgress(counts, level)` pasa a `familyProgress(counts, level).map((f) => ({ id: \`${f.family}:${f.tier || 1}\`, value: f.value, threshold: f.threshold ?? f.nextThreshold ?? 0, unlocked: f.tier > 0 }))`. Es un puente: Task 4 lo sustituye entero. Comprueba después que `npx tsc --noEmit -p .` y `npx vitest run src/lib/pet` están limpios.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pet/balance.ts src/lib/pet/achievements.ts src/lib/pet/achievements.test.ts src/lib/pet/get-pet-snapshot.ts
git commit -m "feat(pet): logros por familias con escalera abierta (puro)"
```

---

### Task 2: Migración de datos de claves antiguas (dev) + docs de esquema

**Files:**
- Create: `supabase/migrations/20260904_pet_achievement_tiers.sql`
- Modify: `supabase/schema-baseline.sql` (anexar), `docs/requirements/data-model.md` (§8bis.2, un párrafo)

- [ ] **Step 1: Migración**

```sql
-- Logros por familias (spec 2026-09-02-mascota-logros-niveles §2). Las claves
-- planas de la fase 2 (pet_achievement:finished_10…) pasan a familia:nivel.
-- Los primeros pasos de cada escalera coinciden con los umbrales viejos, así
-- que ninguna fecha se pierde ni nada se vuelve a animar. Aditiva sobre datos:
-- no toca esquema ni grants.
update public.user_celebrations c
set event_key = 'pet_achievement:' || m.new_key,
    payload = c.payload || jsonb_build_object('key', m.new_key)
from (values
  ('finished_10', 'finished:1'),
  ('finished_50', 'finished:2'),
  ('finished_100', 'finished:3'),
  ('sessions_100', 'sessions:1'),
  ('episodes_100', 'episodes:1'),
  ('notes_50', 'notes:1'),
  ('reviews_10', 'reviews:1'),
  ('genres_10', 'genres:1'),
  ('streak_30', 'streak:1'),
  ('streak_100', 'streak:2'),
  ('posts_50', 'posts:1'),
  ('sagas_3', 'sagas:1'),
  ('missions_50', 'missions:1'),
  ('adult', 'stage:1'),
  ('veteran', 'stage:2')
) as m(old_key, new_key)
where c.event_type = 'pet_achievement'
  and c.event_key = 'pet_achievement:' || m.old_key;
```

- [ ] **Step 2: Aplicar SOLO en dev y verificar**

`mcp__supabase-dev__apply_migration` con `name = "20260904_pet_achievement_tiers"`. Luego `mcp__supabase-dev__execute_sql`:

```sql
select
  (select count(*) from user_celebrations where event_type = 'pet_achievement' and event_key not like 'pet_achievement:%:%') as viejas,
  (select count(*) from user_celebrations where event_type = 'pet_achievement') as total;
```

Expected: `viejas = 0`. Anota `total` en el informe. **No** tocar prod: lo aplica el controlador.

- [ ] **Step 3: Baseline y data-model**

Anexa el SQL al final de `supabase/schema-baseline.sql` bajo `-- 20260904_pet_achievement_tiers`. En `docs/requirements/data-model.md`, al final de §8bis.2 (antes de `## 9. Seguridad`), añade:

```markdown
**Logros por familias (2026-09-02).** El rastro de un logro es `user_celebrations` con
`event_type = 'pet_achievement'` y `event_key = 'pet_achievement:<familia>:<tier>'` (una fila por
nivel). La migración de datos `20260904_pet_achievement_tiers.sql` renombró las claves planas de la
fase 2 (`finished_10` → `finished:1`, …); verificación: cero filas `pet_achievement` sin dos `:`.
Aplicada en dev el 2026-09-02; prod: ver `decisiones.md`.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904_pet_achievement_tiers.sql supabase/schema-baseline.sql docs/requirements/data-model.md
git commit -m "feat(pet): migración de datos de claves de logro a familia:nivel (dev)"
```

---

### Task 3: Insignias — codificador PNG compartido, script, manifiesto y componente

**Files:**
- Create: `scripts/lib/png.mjs`
- Modify: `scripts/pet-sprites.mjs` (usar el codificador compartido)
- Create: `scripts/pet-badges.mjs`, `public/pet/badges/<familia>.png` × 11
- Create: `src/lib/pet/badges.ts`, `src/lib/pet/badges.test.ts`
- Create: `src/components/pet/achievement-badge.tsx`, `src/components/pet/achievement-badge.module.css`

**Interfaces:**
- Consumes: `ACHIEVEMENT_FAMILIES`, `AchievementFamily` (Task 1).
- Produces: `BADGE_MANIFEST: Record<AchievementFamily, string>`, `BADGE_SIZE = 32`, `<AchievementBadge family tier state size? label>`.

- [ ] **Step 1: Codificador compartido**

`scripts/lib/png.mjs`:

```js
// Codificador PNG RGBA sin dependencias, compartido por pet-sprites.mjs y
// pet-badges.mjs. `grid[y][x]` es "#rrggbb" o null (transparente).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };

export function encodePng(grid, W, H) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = y * (W * 4 + 1) + 1 + x * 4, c = grid[y][x];
      if (!c) continue;
      raw[i] = parseInt(c.slice(1, 3), 16); raw[i + 1] = parseInt(c.slice(3, 5), 16); raw[i + 2] = parseInt(c.slice(5, 7), 16); raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function writePng(grid, W, H, file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(grid, W, H));
}
```

En `scripts/pet-sprites.mjs`: borra las líneas del codificador (`crcTable`, `crc`, `chunk` y la función `png`) y los imports que solo ellas usaban (`writeFileSync`, `mkdirSync`, `dirname`, `deflateSync` — deja `join`), añade `import { writePng } from "./lib/png.mjs";` y define `const png = (g, file) => writePng(g, W, H, file);` en su lugar. Ejecuta `node scripts/pet-sprites.mjs` y comprueba con `git status --short public/pet` que **ningún PNG cambia** (el codificador es el mismo byte a byte); si cambia alguno, el port del codificador no es fiel: arréglalo antes de seguir.

- [ ] **Step 2: Script de insignias**

`scripts/pet-badges.mjs`:

```js
// Insignias PROVISIONALES de los logros, 32×32, una por familia (spec
// logros-niveles §3). Mismos nombres que src/lib/pet/badges.ts; el arte IA
// curado las sustituye. `node scripts/pet-badges.mjs`
import { join } from "node:path";
import { writePng } from "./lib/png.mjs";

const W = 32, H = 32;
const C = {
  ink: "#2a231d", paper: "#fffdf8", gold: "#d8a83a", goldD: "#a87c22", red: "#a83a3a", redD: "#7a2626",
  blue: "#3f5f8a", blueD: "#2c4463", green: "#4f7a4a", greenD: "#37552f", purple: "#6a4c8a", purpleD: "#4a3360",
  steel: "#8a94a0", steelD: "#5c6670", wood: "#6b4a2b", acorn: "#8a5a2b", acornD: "#5e3d1c", orange: "#d97a4a", cream: "#f3dcc4",
};
const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const px = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
const rect = (g, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(g, x, y, c); };
const circle = (g, cx, cy, r, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c; };
const ellipse = (g, cx, cy, rx, ry, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = c; };
const line = (g, x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) px(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); };
function tri(g, ax, ay, bx, by, cx, cy, c) {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y][x] = c;
  }
}
function outline(g) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = C.ink;
  }
  return out;
}

const BADGES = {
  // libro cerrado
  finished: () => { const g = grid(); rect(g, 7, 6, 18, 22, C.red); rect(g, 7, 6, 4, 22, C.redD); rect(g, 12, 9, 11, 2, C.cream); rect(g, 12, 13, 11, 2, C.cream); return outline(g); },
  // reloj de arena
  sessions: () => { const g = grid(); rect(g, 8, 5, 16, 3, C.wood); rect(g, 8, 24, 16, 3, C.wood); tri(g, 9, 8, 23, 8, 16, 16, C.gold); tri(g, 9, 24, 23, 24, 16, 16, C.goldD); return outline(g); },
  // pantalla
  episodes: () => { const g = grid(); rect(g, 5, 7, 22, 15, C.steelD); rect(g, 7, 9, 18, 11, C.blue); rect(g, 13, 23, 6, 2, C.steel); rect(g, 10, 25, 12, 2, C.steelD); return outline(g); },
  // pluma
  notes: () => { const g = grid(); ellipse(g, 17, 12, 6, 9, C.purple); ellipse(g, 19, 10, 3, 6, C.paper); line(g, 15, 18, 8, 27, C.wood); line(g, 16, 18, 9, 27, C.wood); return outline(g); },
  // estrella
  reviews: () => { const g = grid(); tri(g, 16, 4, 6, 26, 26, 26, C.gold); tri(g, 16, 28, 6, 8, 26, 8, C.gold); circle(g, 16, 16, 3, C.goldD); return outline(g); },
  // brújula
  genres: () => { const g = grid(); circle(g, 16, 16, 12, C.paper); circle(g, 16, 16, 10, C.cream); tri(g, 16, 6, 13, 16, 19, 16, C.red); tri(g, 16, 26, 13, 16, 19, 16, C.steelD); circle(g, 16, 16, 2, C.ink); return outline(g); },
  // llama
  streak: () => { const g = grid(); ellipse(g, 16, 19, 8, 9, C.orange); tri(g, 16, 3, 9, 18, 23, 18, C.orange); ellipse(g, 16, 22, 4, 5, C.gold); return outline(g); },
  // bocadillo
  posts: () => { const g = grid(); ellipse(g, 16, 14, 12, 9, C.blue); tri(g, 9, 20, 15, 20, 8, 27, C.blue); rect(g, 10, 12, 12, 2, C.paper); rect(g, 10, 16, 8, 2, C.paper); return outline(g); },
  // cadena
  sagas: () => { const g = grid(); ellipse(g, 11, 16, 6, 4, C.steel); ellipse(g, 11, 16, 3, 1.5, null); ellipse(g, 21, 16, 6, 4, C.steel); ellipse(g, 21, 16, 3, 1.5, null); return outline(g); },
  // diana
  missions: () => { const g = grid(); circle(g, 16, 16, 12, C.red); circle(g, 16, 16, 9, C.paper); circle(g, 16, 16, 6, C.red); circle(g, 16, 16, 3, C.paper); return outline(g); },
  // bellota
  stage: () => { const g = grid(); ellipse(g, 16, 19, 7, 9, C.acorn); ellipse(g, 16, 11, 9, 4, C.acornD); rect(g, 15, 4, 2, 4, C.wood); return outline(g); },
};

const OUT = join(process.cwd(), "public", "pet", "badges");
for (const [name, draw] of Object.entries(BADGES)) writePng(draw(), W, H, join(OUT, `${name}.png`));
console.log(`public/pet/badges generado (${Object.keys(BADGES).length})`);
```

Ejecuta `node scripts/pet-badges.mjs`. Deben aparecer 11 PNG en `public/pet/badges/`. Abre dos o tres con el visor de imágenes (`Read` sobre el PNG) y comprueba que se distinguen; si una silueta sale ilegible, ajusta coordenadas (no hace falta arte bonito, sí distinguible).

- [ ] **Step 3: Manifiesto + test (falla)**

`src/lib/pet/badges.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_FAMILIES } from "./achievements";
import { BADGE_MANIFEST } from "./badges";

describe("manifiesto de insignias", () => {
  it("cada familia de logros tiene su PNG en public/", () => {
    for (const f of ACHIEVEMENT_FAMILIES) {
      const src = BADGE_MANIFEST[f];
      expect(src, f).toMatch(/^\/pet\/badges\/[a-z]+\.png$/);
      expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    }
  });
});
```

Run: `npx vitest run src/lib/pet/badges.test.ts` → FAIL (`./badges` no existe).

`src/lib/pet/badges.ts`:

```ts
import { ACHIEVEMENT_FAMILIES, type AchievementFamily } from "./achievements";

// Una insignia por familia (spec logros-niveles §3). Los PNG los genera
// scripts/pet-badges.mjs; el arte IA curado los sustituye CON LOS MISMOS
// NOMBRES. badges.test.ts comprueba que cada fichero existe.
export const BADGE_SIZE = 32;

export const BADGE_MANIFEST: Record<AchievementFamily, string> = Object.fromEntries(
  ACHIEVEMENT_FAMILIES.map((f) => [f, `/pet/badges/${f}.png`]),
) as Record<AchievementFamily, string>;
```

Run de nuevo → PASS.

- [ ] **Step 4: Componente**

`src/components/pet/achievement-badge.module.css`:

```css
.badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 3px solid var(--badge-ring, #b9b2a8);
  background: var(--badge-bg, transparent);
  box-sizing: border-box;
}
.img { image-rendering: pixelated; display: block; }
.tier {
  position: absolute;
  right: -4px;
  bottom: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--badge-ring, #b9b2a8);
  color: #fffdf8;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
/* Marco por nivel: (tier − 1) mod 4 → bronce, plata, oro, leyenda. */
.bronze { --badge-ring: #b0542f; }
.silver { --badge-ring: #8a94a0; }
.gold { --badge-ring: #d8a83a; }
.legend { --badge-ring: #6a4c8a; }
.none { --badge-ring: #b9b2a8; }
.next { filter: grayscale(1); opacity: 0.5; }
```

`src/components/pet/achievement-badge.tsx`:

```tsx
import type { AchievementFamily } from "@/lib/pet/achievements";
import { BADGE_MANIFEST, BADGE_SIZE } from "@/lib/pet/badges";
import styles from "./achievement-badge.module.css";

const RANKS = ["bronze", "silver", "gold", "legend"] as const;

export type BadgeState = "earned" | "next";

/** Rango visual del marco por nivel: 1 bronce, 2 plata, 3 oro, 4 leyenda, 5 bronce… */
export function rankFor(tier: number): (typeof RANKS)[number] | null {
  return tier >= 1 ? RANKS[(tier - 1) % RANKS.length] : null;
}

export function AchievementBadge({
  family,
  tier,
  state,
  size = 48,
  label,
}: {
  family: AchievementFamily;
  tier: number;
  state: BadgeState;
  size?: number;
  label: string;
}) {
  const rank = rankFor(tier);
  const img = Math.max(BADGE_SIZE, size - 12);
  return (
    <span
      className={[styles.badge, rank ? styles[rank] : styles.none, state === "next" ? styles.next : ""].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-rank={rank ?? "none"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art 32×32: next/image reescalaría con filtro bilineal */}
      <img src={BADGE_MANIFEST[family]} alt="" width={img} height={img} className={styles.img} />
      {tier >= 1 ? <span className={styles.tier} aria-hidden="true">{tier}</span> : null}
    </span>
  );
}
```

- [ ] **Step 5: Verificar y commit**

Run: `npx vitest run src/lib/pet && npx tsc --noEmit -p . && npx eslint scripts src/components/pet src/lib/pet`
Expected: PASS, limpio.

```bash
git add scripts/lib/png.mjs scripts/pet-sprites.mjs scripts/pet-badges.mjs public/pet/badges src/lib/pet/badges.ts src/lib/pet/badges.test.ts src/components/pet/achievement-badge.tsx src/components/pet/achievement-badge.module.css
git commit -m "feat(pet): insignias por familia de logro (PNG provisional, manifiesto y componente)"
```

---

### Task 4: Snapshot con familias

**Files:**
- Modify: `src/lib/pet/get-pet-snapshot.ts`

**Interfaces:**
- Consumes: `familyProgress`, `parseAchievementKey`, `planAchievementEarns`, `achievementKey`, `FamilyProgress`, `AchievementFamily` (Task 1); `earnCelebration(…, { alreadyDisplayed })`.
- Produces: `FamilyView = FamilyProgress & { unlockedAt: string | null }`; `PetSnapshot.achievements: FamilyView[]`; `achievementsUnlockedNow` = alguna ganancia con `animate`.

- [ ] **Step 1: Sustituir el bloque de logros**

Imports: `import { achievementKey, familyProgress, parseAchievementKey, planAchievementEarns, type FamilyProgress } from "./achievements";` (quita el puente de Task 1). Tipo exportado:

```ts
export interface FamilyView extends FamilyProgress {
  /** ISO de first_triggered_at del nivel ACTUAL; null con nivel 0. */
  unlockedAt: string | null;
}
```

`PetSnapshot.achievements: FamilyView[]`. El bloque «Logros» (desde `const earnedRows = …` hasta `const achievements: AchievementView[] = …`) pasa a:

```ts
  // Logros por familias: una fila por nivel; solo se gana lo NUEVO.
  const earnedRows = earned.data ?? [];
  const earnedAt = new Map<string, string>(); // "familia:tier" → first_triggered_at
  for (const r of earnedRows) {
    const parsed = parseAchievementKey(r.event_key);
    if (parsed) earnedAt.set(achievementKey(parsed.family, parsed.tier), r.first_triggered_at);
  }
  // Volcado inicial: ver el comentario de la fase 2 — el primer lote se gana ya
  // mostrado. Además, subir varios niveles de golpe anima solo el más alto de
  // cada familia; los intermedios se ganan sellados (quedan con fecha).
  const backfill = earnedRows.length === 0;
  const progress = familyProgress(counts, level);
  const plan = planAchievementEarns(progress, new Set(earnedAt.keys()), backfill);
  if (plan.length > 0) {
    const now = new Date().toISOString();
    await Promise.all(
      plan.map((e) =>
        earnCelebration(
          supabase,
          userId,
          {
            event: "pet_achievement",
            key: e.key,
            title: `${t(`achievements.${e.family}`)} · ${t("achievements.tier", { tier: e.tier })}`,
            metadata: { family: e.family, tier: e.tier },
          },
          { alreadyDisplayed: !e.animate },
        ),
      ),
    );
    for (const e of plan) earnedAt.set(e.key, now);
  }
  const achievementsUnlockedNow = plan.some((e) => e.animate);
  const achievements: FamilyView[] = progress.map((f) => ({
    ...f,
    unlockedAt: f.tier > 0 ? (earnedAt.get(achievementKey(f.family, f.tier)) ?? null) : null,
  }));
```

`t` es el traductor del servidor: añade al principio del fichero `import { getTranslations } from "next-intl/server";` y dentro de `getPetSnapshot`, antes del bloque, `const t = await getTranslations("pet");`. Comprueba que el proyecto ya usa `getTranslations` en algún server module (`grep -rn "getTranslations" src/lib | head`); si el patrón del repo es distinto, síguelo y dilo en el informe. Si `getTranslations` no puede usarse fuera de un request (tests unitarios no lo llaman: `getPetSnapshot` no tiene test), está bien.

- [ ] **Step 2: Verificar y commit**

Run: `npx tsc --noEmit -p . && npx vitest run src/lib/pet src/lib/celebrations && npx eslint src/lib/pet`
Expected: `tsc` fallará solo en `achievement-grid.tsx` (usa `AchievementView`), que reescribe Task 5. Para dejar el commit compilable, en `achievement-grid.tsx` cambia únicamente el import a `import type { FamilyView } from "@/lib/pet/get-pet-snapshot";` y el prop a `achievements: FamilyView[]`, y sustituye el cuerpo del `map` por un placeholder mínimo `<li key={a.family} data-testid={\`achievement-${a.family}\`} data-tier={a.tier}>{t(\`achievements.${a.family}\`)}</li>` (los textos por familia los añade Task 5; hasta entonces `t()` devolverá la clave, aceptable en un commit intermedio). Luego `tsc` limpio.

```bash
git add src/lib/pet/get-pet-snapshot.ts src/components/pet/achievement-grid.tsx
git commit -m "feat(pet): el snapshot gana logros por familia y nivel, animando solo el más alto"
```

---

### Task 5: Vitrina por familia y textos

**Files:**
- Rewrite: `src/components/pet/achievement-grid.tsx`
- Modify: `messages/es.json` (bloque `pet.achievements`)

**Interfaces:**
- Consumes: `FamilyView` (Task 4), `<AchievementBadge>` (Task 3), `ACHIEVEMENT_FAMILIES`.

- [ ] **Step 1: Mensajes**

Sustituye el bloque `"achievements"` de `pet` en `messages/es.json` por:

```json
    "achievements": {
      "title": "Logros",
      "tier": "Nivel {tier}",
      "earned": "Conseguido",
      "next": "Siguiente",
      "none": "Sin nivel aún",
      "complete": "Completa",
      "earnedOn": "{date}",
      "threshold": "{value} / {threshold}",
      "badge": "{family}, nivel {tier}",
      "badgeNext": "{family}, siguiente nivel {tier}",
      "finished": "Obras terminadas",
      "sessions": "Sesiones",
      "episodes": "Episodios",
      "notes": "Notas y citas",
      "reviews": "Reseñas",
      "genres": "Géneros",
      "streak": "Racha",
      "posts": "Clubes",
      "sagas": "Sagas",
      "missions": "Misiones",
      "stage": "Etapa"
    },
```

Valida: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`.

- [ ] **Step 2: Vitrina**

`src/components/pet/achievement-grid.tsx`:

```tsx
"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { FamilyView } from "@/lib/pet/get-pet-snapshot";
import { AchievementBadge } from "./achievement-badge";

/** Nivel más alto primero; empate, por cercanía al siguiente; completas al final. */
export function sortFamilies(list: FamilyView[]): FamilyView[] {
  return [...list].sort((a, b) => {
    const aDone = a.nextThreshold == null, bDone = b.nextThreshold == null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.tier !== b.tier) return b.tier - a.tier;
    const ar = a.nextThreshold ? a.value / a.nextThreshold : 0;
    const br = b.nextThreshold ? b.value / b.nextThreshold : 0;
    return br - ar;
  });
}

export function AchievementGrid({ achievements }: { achievements: FamilyView[] }) {
  const t = useTranslations("pet");
  const format = useFormatter();
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card" data-testid="achievement-grid">
      <h3 className="font-serif text-lg font-semibold text-foreground">{t("achievements.title")}</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sortFamilies(achievements).map((f) => {
          const name = t(`achievements.${f.family}`);
          const next = f.nextThreshold;
          const pct = next ? Math.max(0, Math.min(100, Math.round((f.value / next) * 100))) : 100;
          return (
            <li
              key={f.family}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              data-testid={`achievement-${f.family}`}
              data-tier={f.tier}
            >
              <span className="text-sm font-medium text-foreground">{name}</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <AchievementBadge family={f.family} tier={f.tier} state={f.tier > 0 ? "earned" : "next"} label={f.tier > 0 ? t("achievements.badge", { family: name, tier: f.tier }) : t("achievements.none")} />
                  <div className="flex flex-col text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">{t("achievements.earned")}</span>
                    {f.tier > 0 ? (
                      <>
                        <span>{t("achievements.tier", { tier: f.tier })} · {f.threshold}</span>
                        {f.unlockedAt ? <span>{format.dateTime(new Date(f.unlockedAt), { day: "numeric", month: "short", year: "numeric" })}</span> : null}
                      </>
                    ) : (
                      <span>{t("achievements.none")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {next ? (
                    <>
                      <AchievementBadge family={f.family} tier={f.tier + 1} state="next" label={t("achievements.badgeNext", { family: name, tier: f.tier + 1 })} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground">{t("achievements.next")}</span>
                        <span>{t("achievements.tier", { tier: f.tier + 1 })} · {t("achievements.threshold", { value: Math.min(f.value, next), threshold: next })}</span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`${name} ${t("achievements.next")}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full bg-muted-foreground" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">{t("achievements.complete")}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Test del orden**

`src/components/pet/achievement-grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sortFamilies } from "./achievement-grid";
import type { FamilyView } from "@/lib/pet/get-pet-snapshot";

const f = (family: FamilyView["family"], tier: number, value: number, nextThreshold: number | null): FamilyView =>
  ({ family, tier, value, threshold: tier > 0 ? 1 : null, nextThreshold, unlockedAt: null }) as FamilyView;

describe("sortFamilies", () => {
  it("nivel alto primero; empate por cercanía; completas al final", () => {
    const out = sortFamilies([
      f("stage", 2, 40, null),
      f("posts", 1, 60, 100),
      f("notes", 1, 90, 100),
      f("finished", 3, 120, 200),
    ]).map((x) => x.family);
    expect(out).toEqual(["finished", "notes", "posts", "stage"]);
  });
});
```

Comprueba que `vitest.config` incluye tests bajo `src/components` (ya existe `pet-sprite.test.tsx`, así que sí).

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit -p . && npx vitest run src/components/pet src/lib/pet && npx eslint src/components/pet`
Expected: PASS, limpio.

```bash
git add src/components/pet/achievement-grid.tsx src/components/pet/achievement-grid.test.ts messages/es.json
git commit -m "feat(pet): vitrina de logros por familia con insignia conseguida y siguiente"
```

---

### Task 6: E2E, docs de cierre e issues

**Files:**
- Modify: `e2e/mascota-misiones.spec.ts` (aserciones de la galería)
- Modify: `docs/requirements/decisiones.md` (append), `docs/requirements/backlog.md`, `docs/architecture/graph.json` (+ `map.html` si se regenera)
- GitHub: issues

- [ ] **Step 1: E2E**

En `e2e/mascota-misiones.spec.ts`, sustituye la aserción `await expect(page.getByTestId("achievement-finished_100")).toHaveAttribute("data-unlocked", "false");` por:

```ts
  // Una tarjeta por familia, con su nivel y el siguiente umbral visible.
  const cards = page.getByTestId("achievement-grid").locator("li[data-testid^='achievement-']");
  await expect(cards).toHaveCount(11);
  await expect(page.getByTestId("achievement-posts")).toHaveAttribute("data-tier", /^\d+$/);
  await expect(page.getByTestId("achievement-posts").getByText("Siguiente")).toBeVisible();
  // Tras la migración 20260904 no queda ninguna clave plana.
  const flat = (await (await api(`user_celebrations?user_id=eq.${userId}&event_type=eq.pet_achievement&event_key=not.like.pet_achievement:*:*&select=event_key`)).json()) as unknown[];
  expect(flat).toHaveLength(0);
```

Ejecuta contra build de producción como en la fase 2 (puerto 3000 libre → `npx next build` → `npx next start -p 3000` en segundo plano → `npx playwright test e2e/mascota-misiones.spec.ts e2e/mascota.spec.ts` → mata tu servidor → 3000 libre). Expected: 5 passed.

- [ ] **Step 2: Docs**

`docs/requirements/decisiones.md`, al final:

```markdown
## 2026-09-02 — Mascota: logros por familias con escalera abierta e insignias

Spec `docs/superpowers/specs/2026-09-02-mascota-logros-niveles-design.md`. Los logros planos de la
fase 2 pasan a **familias** (`ACHIEVEMENT_FAMILIES`) con una **escalera** en `BALANCE.achievements`:
primeros niveles a mano y después `+then` por nivel, sin tope (`stage` es la única cerrada). Nivel =
función pura del valor; el rastro sigue siendo `pet_achievement:<familia>:<tier>`, una fila por nivel.
La vitrina enseña, por familia, la última insignia conseguida y la siguiente por conseguir.

**Insignias**: una PNG 32×32 por familia (`public/pet/badges/`, `scripts/pet-badges.mjs`, manifiesto
con test), el nivel se pinta con número y marco que cicla bronce/plata/oro/leyenda. Se descartó a
propósito arte por nivel: N familias de arte IA, no N × niveles. El codificador PNG pasa a
`scripts/lib/png.mjs`, compartido con los sprites.

**Subir varios niveles de golpe** gana todos los intermedios sellados (con fecha) y anima solo el más
alto de la familia. **Migración de datos** `20260904_pet_achievement_tiers.sql` renombra las claves
planas; los primeros pasos de cada escalera se eligieron para que casen con los umbrales viejos y no
se pierda ninguna fecha. Aplicada en dev el 2026-09-02; prod: la aplica el controlador tras la
revisión y lo anota aquí.
```

`docs/requirements/backlog.md`: en la línea de la fase 2 de la mascota, añade al final «; logros por familias con escalera abierta e insignias (spec 2026-09-02-mascota-logros-niveles)». `docs/architecture/graph.json`: actualiza el resumen del nodo de `src/lib/pet` (menciona familias/escalera/`badges.ts`) y añade `src/lib/pet/badges.ts`, `src/components/pet/achievement-badge.tsx`, `scripts/pet-badges.mjs`, `scripts/lib/png.mjs` donde estén listados los ficheros hermanos; regenera `map.html` si `docs/architecture/README.md` da el comando.

- [ ] **Step 3: Issues**

```sh
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: pintar la insignia del logro en el overlay de celebración" --body "Spec logros-niveles §7. El overlay de pet_achievement enseña el glifo genérico 🏆 y el título «<familia> · nivel N». Falta usar BADGE_MANIFEST[metadata.family] con el marco del nivel (AchievementBadge) dentro del overlay."
gh issue comment 1021 --body "Logros por familias (spec 2026-09-02-mascota-logros-niveles §3): las 11 insignias de public/pet/badges/<familia>.png también son arte provisional (scripts/pet-badges.mjs) y entran en el mismo lote de arte IA curado, con los mismos nombres."
```

- [ ] **Step 4: Verificación completa y commit**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src e2e scripts`
Expected: verde (errores de lint preexistentes fuera de tus ficheros: lístalos, no los arregles).

```bash
git add e2e/mascota-misiones.spec.ts docs/requirements/decisiones.md docs/requirements/backlog.md docs/architecture/graph.json docs/architecture/map.html
git commit -m "test(pet): e2e de la vitrina por familias; docs de cierre de logros por niveles"
```

---

## Self-review

**Spec coverage.** §1 familias/escalera/claves/subida múltiple/backfill/cerrada/título → Task 1 (puro) + Task 4 (snapshot); §2 migración de datos → Task 2 (dev) + controlador (prod); §3 insignias, manifiesto, componente, marco, `next` → Task 3; §4 vitrina, orden, textos, test ids → Task 5; §5 snapshot → Task 4; §6 tests → Tasks 1, 3, 5, 6; §7 fuera de alcance → Task 6 issues.

**Placeholders.** Ninguno. Los puentes de compilación (Task 1 Step 5, Task 4 Step 2) están escritos en código y los sustituye la tarea siguiente.

**Type consistency.** `Ladder`, `AchievementFamily`, `FamilyProgress`, `EarnPlan`, `achievementKey`, `parseAchievementKey`, `planAchievementEarns` (Task 1) → Task 4; `BADGE_MANIFEST`, `BADGE_SIZE`, `AchievementBadge { family, tier, state, size?, label }` (Task 3) → Task 5; `FamilyView` (Task 4) → Task 5 y su test; `data-testid="achievement-<familia>"` + `data-tier` (Task 5) → Task 6.
