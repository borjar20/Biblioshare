# Estado vacío de la columna de estadísticas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la columna de estadísticas del Inicio (`StatsRail`) no muestre ceros ni gráficos vacíos: una tarjeta de bienvenida cuando está fría y revelado progresivo de cada bloque cuando cruza su umbral.

**Architecture:** `StatsRail` (servidor) deriva flags con un helper puro y renderiza condicionalmente: bienvenida si frío, si no cada bloque (semana/año) cuando tiene datos, con sub-guards dentro de "Tu 2026" para que nunca lidere con un cero. Reutiliza los componentes de tarjeta existentes; añade `StatsWelcome`.

**Tech Stack:** Next.js (App Router, RSC), next-intl (locale `es`), Tailwind, Supabase, Vitest (units puros), Playwright (e2e).

## Global Constraints

- **Este NO es el Next.js estándar** — leer `node_modules/next/dist/docs/` antes de usar APIs dudosas (AGENTS.md).
- **Estado vivo del usuario vive en `passes`**; los minutos de lectura en `progress_sessions` (columna actual `pass_id`, NO `library_entry_id`).
- **Locale único `es`**: claves i18n solo en `messages/es.json`, bajo `statsRail`.
- **No rediseñar** `WeeklyStrip`/`BookGoalCard`/`GoalRows`/`StreakCard`: solo envolverlos en su guardia de visibilidad. Tema oscuro, `rounded-card`, `buttonVariants`, densidad actual.
- **Umbrales (revelado progresivo, sin 0s):** `showWeek = weekMinutes > 0`; `showYear = annual.total > 0 || anyGoalSet || streaks.current > 0`; `cold = !showWeek && !showYear`. Racha VIVA (`current`), no `best`.
- **Sub-guards de "Tu 2026":** `BookGoalCard` si `annualGoals.book != null || annual.byType.book > 0`; `GoalRows` si `anyGoalSet || annual.total > 0`; `StreakCard` si `streaks.current > 0 || streaks.best > 0`.
- **"A quién seguir" se mantiene** (ya se degrada a null). **CTA meta** → `/u/${username}?tab=rincon`; **CTA explorar** → `/coleccion`.
- **Entorno tests**: Node 22 activo (Vitest OK). `npm run test:e2e` reutiliza el dev server de :3000; no levantar otro; no dejar servidores colgados (AGENTS.md).
- **Antes de editar `StatsRail`**: `impact({target: "StatsRail", direction: "upstream"})` y reportar; `detect_changes({scope:"compare", base_ref:"main"})` antes de commitear el wiring.

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `messages/es.json` (modificar) | Claves `statsRail.welcome*`. |
| `src/lib/stats/derive-rail-state.ts` (crear) | `deriveRailState(...)` puro (flags showWeek/showYear/cold). |
| `src/lib/stats/derive-rail-state.test.ts` (crear) | Unit de la tabla de casos. |
| `src/components/stats/stats-welcome.tsx` (crear) | Tarjeta de bienvenida (normal + compacta). |
| `src/components/stats/stats-rail.tsx` (modificar) | Deriva flags y renderiza condicionalmente en los dos breakpoints. |
| `e2e/stats-rail-estado-vacio.spec.ts` (crear) | frío / año (peli completada) / semana (sesión). |

---

### Task 1: Claves i18n

**Files:**
- Modify: `messages/es.json` (objeto `"statsRail"`)

**Interfaces:**
- Produces: `statsRail.welcomeTitle`, `welcomeBody`, `welcomeGoalCta`, `welcomeExploreCta`.

- [ ] **Step 1: Añadir las claves**

En `messages/es.json`, dentro del objeto `"statsRail"` (que ya tiene `year2026`, `summaryWeek`, …), añadir estas cuatro entradas (cuidando las comas — deben quedar como claves válidas dentro del objeto):

```json
    "welcomeTitle": "Aquí verás cómo vas",
    "welcomeBody": "Tu semana de lectura, tu año y tu racha aparecerán a medida que registres lo que disfrutas.",
    "welcomeGoalCta": "Fijar una meta 2026",
    "welcomeExploreCta": "Explorar la colección"
```

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n(statsRail): claves de la bienvenida de estadísticas"
```

---

### Task 2: `deriveRailState` (helper puro, TDD)

**Files:**
- Create: `src/lib/stats/derive-rail-state.ts`
- Create: `src/lib/stats/derive-rail-state.test.ts`

**Interfaces:**
- Produces: `deriveRailState(input: { weekMinutes: number; annualTotal: number; anyGoalSet: boolean; streakCurrent: number }): { showWeek: boolean; showYear: boolean; cold: boolean }`.

- [ ] **Step 1: Escribir el test (falla primero)**

`src/lib/stats/derive-rail-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveRailState } from "./derive-rail-state";

const base = { weekMinutes: 0, annualTotal: 0, anyGoalSet: false, streakCurrent: 0 };

describe("deriveRailState", () => {
  it("frío: sin nada, cold=true y ambos bloques ocultos", () => {
    expect(deriveRailState(base)).toEqual({ showWeek: false, showYear: false, cold: true });
  });
  it("solo minutos de semana: showWeek, no cold", () => {
    expect(deriveRailState({ ...base, weekMinutes: 30 })).toEqual({
      showWeek: true,
      showYear: false,
      cold: false,
    });
  });
  it("solo completados del año: showYear, no cold", () => {
    expect(deriveRailState({ ...base, annualTotal: 1 })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("solo meta fijada: showYear, no cold", () => {
    expect(deriveRailState({ ...base, anyGoalSet: true })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("solo racha viva: showYear, no cold", () => {
    expect(deriveRailState({ ...base, streakCurrent: 3 })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("todo: ambos bloques, no cold", () => {
    expect(
      deriveRailState({ weekMinutes: 45, annualTotal: 5, anyGoalSet: true, streakCurrent: 2 }),
    ).toEqual({ showWeek: true, showYear: true, cold: false });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npm run test -- derive-rail-state`
Expected: FAIL — `Cannot find module './derive-rail-state'`.

- [ ] **Step 3: Implementar el helper**

`src/lib/stats/derive-rail-state.ts`:

```ts
// Flags de visibilidad de la columna de estadísticas del Inicio. Puro para
// poder testear la tabla de casos sin base de datos. Regla: un bloque sin datos
// se OCULTA (no pinta 0s); la bienvenida solo mientras NINGUNO tiene datos.
// La racha es la VIVA (current), no la mejor histórica: con `best` un usuario
// que terminó algo el año pasado pero nada este año encendería el bloque de año
// y pintaría "0 completados".
export function deriveRailState(input: {
  weekMinutes: number;
  annualTotal: number;
  anyGoalSet: boolean;
  streakCurrent: number;
}): { showWeek: boolean; showYear: boolean; cold: boolean } {
  const showWeek = input.weekMinutes > 0;
  const showYear = input.annualTotal > 0 || input.anyGoalSet || input.streakCurrent > 0;
  return { showWeek, showYear, cold: !showWeek && !showYear };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npm run test -- derive-rail-state`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/derive-rail-state.ts src/lib/stats/derive-rail-state.test.ts
git commit -m "feat(stats): deriveRailState (flags del estado vacío del rail)"
```

---

### Task 3: `StatsWelcome` (tarjeta de bienvenida)

**Files:**
- Create: `src/components/stats/stats-welcome.tsx`

**Interfaces:**
- Consumes: Task 1 (`statsRail.welcomeTitle/welcomeBody/welcomeGoalCta/welcomeExploreCta`), `buttonVariants` (`@/components/ui/button`).
- Produces: `StatsWelcome({ username: string; compact?: boolean })` (async server component).

- [ ] **Step 1: Crear el componente**

`src/components/stats/stats-welcome.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

// Bienvenida de la columna de estadísticas cuando está fría (sin actividad ni
// meta): en vez de ceros y barras vacías, una tarjeta editorial con salida a
// generar el primer dato. `compact` = variante de <1100 (una línea + CTA
// primario, sin encabezado, igual criterio que el resumen de tres cifras que
// sustituye). El CTA de meta lleva al Rincón del perfil, donde viven retos y
// meta diaria; fijar una meta enciende el bloque de año al instante.
export async function StatsWelcome({
  username,
  compact = false,
}: {
  username: string;
  compact?: boolean;
}) {
  const t = await getTranslations("statsRail");
  return (
    <div className="rounded-card border border-border bg-surface shadow-card p-4">
      {!compact && (
        <p className="font-serif text-[15px] font-semibold text-foreground">
          {t("welcomeTitle")}
        </p>
      )}
      <p className={`text-[13px] leading-relaxed text-muted-foreground ${compact ? "" : "mt-1.5"}`}>
        {t("welcomeBody")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/u/${username}?tab=rincon`} className={buttonVariants("primary")}>
          {t("welcomeGoalCta")}
        </Link>
        {!compact && (
          <Link href="/coleccion" className={buttonVariants("secondary")}>
            {t("welcomeExploreCta")}
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/stats/stats-welcome.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/stats-welcome.tsx
git commit -m "feat(stats): tarjeta de bienvenida del rail (StatsWelcome)"
```

---

### Task 4: Cablear `StatsRail`

**Files:**
- Modify: `src/components/stats/stats-rail.tsx` (el `return` y añadir flags; el resto del fichero — imports de datos, `SummaryRow` — se conserva)

**Interfaces:**
- Consumes: Task 2 (`deriveRailState`), Task 3 (`StatsWelcome`), y los componentes ya existentes (`WeeklyStrip`, `BookGoalCard`, `GoalRows`, `StreakCard`, `WhoToFollowCard`).

- [ ] **Step 0: Impact analysis (obligatorio)**

Run: `impact({target: "StatsRail", direction: "upstream"})`
Expected: reportar callers (solo `Home`) y riesgo. Si HIGH/CRITICAL, avisar antes de seguir.

- [ ] **Step 1: Añadir imports**

En `src/components/stats/stats-rail.tsx`, junto a los demás imports de componentes/datos:

```tsx
import { deriveRailState } from "@/lib/stats/derive-rail-state";
import { StatsWelcome } from "./stats-welcome";
```

- [ ] **Step 2: Derivar flags tras el cálculo de `weekLabel`**

Justo después de la línea `const weekLabel = …;` (antes del `return`), añadir:

```tsx
  const username = profile?.username ?? "";
  const weekMinutes = weekly.reduce((sum, d) => sum + d.minutes, 0);
  const anyGoalSet =
    annualGoals.book != null || annualGoals.movie != null || annualGoals.series != null;
  const { showWeek, showYear, cold } = deriveRailState({
    weekMinutes,
    annualTotal: annual.total,
    anyGoalSet,
    streakCurrent: streaks.current,
  });
  // Sub-guards del bloque "Tu 2026": ninguna sub-parte lidera con un cero.
  const showBookGoal = annualGoals.book != null || annual.byType.book > 0;
  const showGoalRows = anyGoalSet || annual.total > 0;
  const showStreak = streaks.current > 0 || streaks.best > 0;
```

Nota: `weekMinutes` ya se calcula hoy dentro del `weekLabel` como `weekly.reduce(...)`. Reutilizar la constante `weekMinutes` para el `weekLabel` en vez de duplicar el `reduce`: sustituir en la definición de `weekLabel` el `weekly.reduce((sum, d) => sum + d.minutes, 0)` por `weekMinutes`, moviendo la constante `weekMinutes` por ENCIMA de `weekLabel`.

- [ ] **Step 3: Sustituir el `return` por la versión con estados**

Reemplazar TODO el `return ( … );` de `StatsRail` por:

```tsx
  return (
    <div className="grid gap-4">
      {/* Resumen compacto: móvil y tablet (<1100). En frío, la bienvenida
          compacta sustituye las tres cifras (que serían tres ceros). */}
      <div className="min-[1100px]:hidden">
        {cold ? (
          <StatsWelcome username={username} compact />
        ) : (
          <div className="rounded-card border border-border bg-surface shadow-card p-3.5">
            <div className="flex flex-col gap-2.5">
              <SummaryRow label={tRail("summaryWeek")} value={weekLabel} />
              <SummaryRow
                label={tRail("summaryYear")}
                value={`${annual.byType.book} ${tRail("summaryBooks", { count: annual.byType.book })}`}
              />
              <SummaryRow
                label={tRail("summaryStreak")}
                value={`${streaks.current} ${tRail("summaryDays", { count: streaks.current })}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Detalle: de 1100 para arriba. En frío, una sola bienvenida; si no,
          cada bloque aparece cuando tiene datos (nunca un cero). "A quién
          seguir" va SIEMPRE debajo (ya se degrada a null si no hay a quién). */}
      <div className="hidden gap-4 min-[1100px]:grid">
        {cold ? (
          <StatsWelcome username={username} />
        ) : (
          <>
            {showWeek && (
              <div className="rounded-card border border-border bg-surface shadow-card p-4">
                <WeeklyStrip
                  days={weekly}
                  dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
                  showDailyGoal={false}
                />
              </div>
            )}

            {showYear && (
              <div className="rounded-card border border-border bg-surface shadow-card p-4">
                <p className="mb-3 font-serif text-[15px] font-semibold">{tRail("year2026")}</p>
                <div className="flex flex-col gap-3">
                  {showBookGoal && (
                    <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
                  )}
                  {showGoalRows && <GoalRows annual={annual} annualGoals={annualGoals} />}
                  {showStreak && (
                    <div className={showBookGoal || showGoalRows ? "border-t border-border pt-3" : ""}>
                      <StreakCard streaks={streaks} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <WhoToFollowCard suggestions={whoToFollow} />
      </div>
    </div>
  );
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/stats/stats-rail.tsx`
Expected: sin errores.

- [ ] **Step 5: `detect_changes` (obligatorio antes de commit)**

Run: `detect_changes({scope: "compare", base_ref: "main"})`
Expected: símbolos afectados = `StatsRail` (+ los nuevos). Nada inesperado.

- [ ] **Step 6: Commit**

```bash
git add src/components/stats/stats-rail.tsx
git commit -m "feat(stats): estados vacío/progresivo de la columna de estadísticas"
```

---

### Task 5: e2e de los estados

Usuario DESECHABLE por test (aísla los datos). Convención `docs/TESTING.md`: siembra REST con service key, limpia antes (dentro del try/`beforeEach`) y después (`afterEach`), prefijo de username barrible; usuario onboardeado (`onboarded_at`) para no caer en el asistente. Viewport ≥1100 para el detalle del rail. Book/movie IDs por-run (UUID válido) para no colisionar con filas huérfanas.

**Files:**
- Create: `e2e/stats-rail-estado-vacio.spec.ts`

- [ ] **Step 1: Escribir el spec**

`e2e/stats-rail-estado-vacio.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// Estados de la columna de estadísticas del Inicio (StatsRail): frío → bienvenida
// (sin 0s); con datos → cada bloque aparece a su umbral. Cada test crea un usuario
// DESECHABLE onboardeado, siembra por REST, entra como él y comprueba el aside.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2ws";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

async function sweepDisposableUsers() {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

async function createOnboardedUser(username: string): Promise<{ id: string; email: string }> {
  const email = `${username}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username,
      display_name: username,
      is_public: false,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id: user.id, email };
}

// UUID v4 válido con sufijo aleatorio: sin colisiones entre reruns.
function uuid(prefix4: string): string {
  const hex = "0123456789abcdef";
  let tail = "";
  // 12 hex del último bloque, variando por reloj para no colisionar.
  const seed = `${prefix4}${Math.floor(performance.now())}`;
  for (let i = 0; i < 12; i++) tail += hex[(seed.charCodeAt(i % seed.length) + i) % 16];
  return `${prefix4.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${tail}`;
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("Inicio · estados de la columna de estadísticas", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await sweepDisposableUsers();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  test.afterEach(async () => {
    await sweepDisposableUsers();
  });

  test("frío: usuario sin datos ve la bienvenida y NO ceros", async ({ page }) => {
    const { email } = await createOnboardedUser(`${USER_PREFIX}f${Date.now()}`.slice(0, 20));
    await loginAs(page, email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByText(/aquí verás cómo vas/i)).toBeVisible();
    await expect(aside.getByRole("link", { name: /fijar una meta 2026/i })).toBeVisible();
    // Sin gráficos vacíos: ni "esta semana" ni "Tu 2026" en frío.
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toHaveCount(0);
    await expect(aside.getByText(/^tu 2026$/i)).toHaveCount(0);
  });

  test("año: una peli completada este año enciende 'Tu 2026' (semana sigue oculta)", async ({
    page,
  }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}y${Date.now()}`.slice(0, 20));
    const movieId = uuid("e2ec");
    await rest("movies", {
      method: "POST",
      body: JSON.stringify({ id: movieId, title: `[E2E] peli ${movieId.slice(0, 8)}`, cover_url: COVER_URL }),
    });
    const today = new Date().toISOString().slice(0, 10);
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: movieId,
        user_id: user.id,
        item_type: "movie",
        item_id: movieId,
        status: "completed",
        is_active: true,
        position: {},
        started_on: today,
        finished_on: today,
      }),
    });
    await loginAs(page, user.email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByText(/^tu 2026$/i)).toBeVisible();
    // Sin sesión de lectura, la semana no aparece; y ya no hay bienvenida.
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toHaveCount(0);
    await expect(aside.getByText(/aquí verás cómo vas/i)).toHaveCount(0);
  });

  test("semana: una sesión de lectura hoy enciende 'Lectura esta semana'", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}w${Date.now()}`.slice(0, 20));
    const bookId = uuid("e2eb");
    await rest("books", {
      method: "POST",
      body: JSON.stringify({ id: bookId, title: `[E2E] libro ${bookId.slice(0, 8)}`, author: "[E2E]", cover_url: COVER_URL }),
    });
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: bookId,
        user_id: user.id,
        item_type: "book",
        item_id: bookId,
        status: "in_progress",
        is_active: true,
        position: {},
        started_on: new Date().toISOString().slice(0, 10),
      }),
    });
    await rest("progress_sessions", {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        pass_id: bookId,
        session_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 30,
        position: {},
      }),
    });
    await loginAs(page, user.email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toBeVisible();
    await expect(aside.getByText(/aquí verás cómo vas/i)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npm run test:e2e -- stats-rail-estado-vacio`
Expected: 3 tests PASS.

Si un test flakea por timing, subir el timeout del `expect`; NO debilitar aserciones. Si el usuario cae en `/onboarding`, revisar `onboarded_at` y la cookie `bs_onb`.

- [ ] **Step 3: Commit**

```bash
git add e2e/stats-rail-estado-vacio.spec.ts
git commit -m "test(stats): e2e de los estados de la columna de estadísticas"
```

---

### Task 6: Verificación en navegador + docs

**Files:**
- Modify: `docs/requirements/decisiones.md` (append-only)

- [ ] **Step 1: qa (navegador real)**

La verificación automatizada por defecto es e2e (`docs/TESTING.md`); con los 3 tests en verde queda cubierta. Opcional: `qa-verifier` para confirmar el responsive (móvil <1100: bienvenida compacta con CTA a ancho cómodo; ≥1100: bienvenida / bloques; "A quién seguir" debajo).

- [ ] **Step 2: Registrar la decisión**

Añadir al FINAL de `docs/requirements/decisiones.md` (append-only) una entrada con: `StatsRail` con bienvenida en frío + revelado progresivo por bloque (`showWeek`/`showYear`/`cold`), racha VIVA (`current`) no `best`, sub-guards de "Tu 2026", CTA a `/u/${username}?tab=rincon`. Sin cambio de esquema. Spec: `docs/superpowers/specs/2026-08-11-columna-estadisticas-estado-vacio-design.md`.

- [ ] **Step 3: Issues de lo pendiente**

Abrir issue(s) para lo que quede fuera de alcance y merezca recordarse: (a) el resumen compacto <1100 no hace revelado por-fila (solo frío↔cifras); (b) el `uuid()` del e2e y el sweep no barren `books`/`movies` (huérfanas si un run manual se interrumpe). Regla AGENTS.md.

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(stats): registra decisiones del estado vacío del rail"
```

---

## Self-Review

**Spec coverage:**
- Bienvenida en frío → Tasks 3 + 4 (`cold`).
- Revelado progresivo `showWeek`/`showYear` → Task 2 (helper) + Task 4 (wiring).
- Racha VIVA (`current`) no `best` → Task 2 (fórmula) + Global Constraints.
- Sub-guards de "Tu 2026" (BookGoalCard/GoalRows/StreakCard) → Task 4.
- "A quién seguir" siempre debajo → Task 4 (fuera del condicional).
- Responsive <1100 adapta (bienvenida compacta) → Task 4 (bloque `min-[1100px]:hidden`).
- CTAs (`/u/${username}?tab=rincon`, `/coleccion`) → Task 3.
- i18n → Task 1.
- Tests → Task 2 (unit) + Task 5 (e2e) + Task 6 (qa/docs).

**Placeholder scan:** sin TBD/TODO; cada paso trae código o comando concreto.

**Type consistency:** `deriveRailState` firma idéntica en Task 2 y su uso en Task 4 (`{ weekMinutes, annualTotal, anyGoalSet, streakCurrent }` → `{ showWeek, showYear, cold }`). `StatsWelcome({ username, compact? })` estable entre Tasks 3 y 4. `WhoToFollowCard suggestions={whoToFollow}`, `BookGoalCard completed/goal`, `GoalRows annual/annualGoals`, `StreakCard streaks` coinciden con las firmas actuales de esos componentes.

## Notas de ejecución

- Ningún cambio de esquema: `docs/requirements/data-model.md` NO cambia. Solo lecturas ya existentes.
- No dejar `next dev` ni watchers colgados (AGENTS.md). Un solo dev server en :3000.
