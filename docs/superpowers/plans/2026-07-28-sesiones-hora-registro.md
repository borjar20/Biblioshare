# Sesiones: tiempo relativo con created_at Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "hace X horas" showing wrong for a freshly-logged session, without breaking backdated sessions, using `progress_sessions.created_at` (already exists, no migration).

**Architecture:** One new pure function, `sessionRelativeBasis(sessionDate, createdAt, today?)`, decides per-session which timestamp is the true basis for relative-time display: `created_at` when the session is dated today (not backdated), `session_date` otherwise. Three read paths (`get-sessions.ts` → `session-list.tsx`, `feed.ts`, `shared-activity.ts`) select `created_at` alongside `session_date` and route through this one function, so all three surfaces apply the identical rule.

**Tech Stack:** Next.js 16 / TypeScript, Supabase (Postgres), Vitest for unit tests, next-intl (`useFormatter().relativeTime`, `timeAgo` in `src/lib/relative-time.ts`).

## Global Constraints

- **No schema migration.** `progress_sessions.created_at` (`timestamptz not null default now()`) already exists in dev and prod since the table's original creation migration — confirmed in `database.types.ts:1336` and `supabase/schema-baseline.sql:397`.
- **Do not change `.order("session_date", ...)` or `.lte("session_date", dateUpperBound(...))` in `src/lib/social/feed.ts`'s `"progressed"` query.** Those govern which page of sessions is fetched and preserve backdated sessions' chronological position in the feed. Only the per-row `eventDate` value changes.
- **`session_date` stays untouched everywhere else** (calendar/streaks/pace grouping in `src/lib/stats/*`) — out of scope, those are already correct.
- Full spec: `docs/superpowers/specs/2026-07-28-sesiones-hora-registro-design.md`.

---

### Task 1: `sessionRelativeBasis` pure function

**Files:**
- Create: `src/lib/sessions/session-relative-basis.ts`
- Test: `src/lib/sessions/session-relative-basis.test.ts`

**Interfaces:**
- Consumes: `todayISO` from `src/lib/stats/dates.ts` (existing, signature `(): string`, returns local-calendar "YYYY-MM-DD").
- Produces: `sessionRelativeBasis(sessionDate: string, createdAt: string, today?: string): string` — used by Task 3 (`session-list.tsx`), Task 4 (`feed.ts`), Task 5 (`shared-activity.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/sessions/session-relative-basis.test.ts
import { describe, it, expect } from "vitest";
import { todayISO } from "@/lib/stats/dates";
import { sessionRelativeBasis } from "./session-relative-basis";

describe("sessionRelativeBasis", () => {
  it("usa created_at cuando la sesión es de hoy", () => {
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-28T20:15:00.000Z", "2026-07-28"),
    ).toBe("2026-07-28T20:15:00.000Z");
  });

  it("usa session_date cuando la sesión está backdateada", () => {
    expect(
      sessionRelativeBasis("2026-07-27", "2026-07-28T09:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-27");
  });

  it("usa todayISO() por defecto cuando no se pasa 'today'", () => {
    expect(sessionRelativeBasis(todayISO(), "created-at-value")).toBe(
      "created-at-value",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sessions/session-relative-basis.test.ts`
Expected: FAIL — `Cannot find module './session-relative-basis'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/sessions/session-relative-basis.ts
import { todayISO } from "@/lib/stats/dates";

// Sesiones backdateadas (session_date pasado — el formulario de registro lo
// permite a propósito, "se me olvidó registrar lo de anoche") no tienen una
// hora real que mostrar: se quedan en el nivel de precisión que sí es real,
// el día. Solo una sesión de HOY usa created_at, que es preciso porque nunca
// se edita a mano (a diferencia de session_date).
export function sessionRelativeBasis(
  sessionDate: string,
  createdAt: string,
  today: string = todayISO(),
): string {
  return sessionDate === today ? createdAt : sessionDate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sessions/session-relative-basis.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/session-relative-basis.ts src/lib/sessions/session-relative-basis.test.ts
git commit -m "feat(sessions): add sessionRelativeBasis, the backdate-aware relative-time rule"
```

---

### Task 2: Expose `created_at` from `getSessions`

**Files:**
- Modify: `src/lib/sessions/types.ts`
- Modify: `src/lib/sessions/get-sessions.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProgressSession.createdAt: string` — consumed by Task 3 (`session-list.tsx`).

- [ ] **Step 1: Add `createdAt` to the `ProgressSession` type**

In `src/lib/sessions/types.ts`, the type currently reads:

```typescript
export type ProgressSession = {
  id: string;
  sessionDate: string;
  durationMinutes: number | null;
  // Position REACHED in this session: {page} for books, {season, episode}
  // for series. Movies don't have sessions (see §7.14 scope decision).
  position: Position;
};
```

Change to:

```typescript
export type ProgressSession = {
  id: string;
  sessionDate: string;
  /** Cuándo se guardó la fila — timestamptz, nunca editado por el usuario
   *  (a diferencia de sessionDate, que sí se puede backdatear). Ver
   *  sessionRelativeBasis en session-relative-basis.ts. */
  createdAt: string;
  durationMinutes: number | null;
  // Position REACHED in this session: {page} for books, {season, episode}
  // for series. Movies don't have sessions (see §7.14 scope decision).
  position: Position;
};
```

- [ ] **Step 2: Select and map `created_at` in `getSessions`**

In `src/lib/sessions/get-sessions.ts`, this block:

```typescript
  const { data, error } = await supabase
    .from("progress_sessions")
    // `note` NO se pide: el texto vive en la tabla `notes` y lo pinta «Mis notas
    // y citas». Leerlo también aquí era la duplicación de la issue #109.
    .select("id, session_date, duration_minutes, position")
    .eq("pass_id", passId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    durationMinutes: row.duration_minutes,
    position: parsePosition(itemType, row.position),
  }));
```

Becomes:

```typescript
  const { data, error } = await supabase
    .from("progress_sessions")
    // `note` NO se pide: el texto vive en la tabla `notes` y lo pinta «Mis notas
    // y citas». Leerlo también aquí era la duplicación de la issue #109.
    .select("id, session_date, duration_minutes, position, created_at")
    .eq("pass_id", passId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    createdAt: row.created_at,
    durationMinutes: row.duration_minutes,
    position: parsePosition(itemType, row.position),
  }));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (No test file exists for `get-sessions.ts` — it has no unit tests today, consistent with the rest of the Supabase-query layer in this codebase; Task 6 covers manual verification of the read path.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/sessions/types.ts src/lib/sessions/get-sessions.ts
git commit -m "feat(sessions): select created_at in getSessions"
```

---

### Task 3: Use `sessionRelativeBasis` in the session list (item detail page)

**Files:**
- Modify: `src/components/session-list.tsx`

**Interfaces:**
- Consumes: `sessionRelativeBasis` (Task 1), `ProgressSession.createdAt` (Task 2).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `sessionRelativeBasis`**

In `src/components/session-list.tsx`, add to the imports (after the `ProgressSession` import):

```typescript
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
```

- [ ] **Step 2: Compute the basis once per session and use it for both the `dateTime` attribute and the displayed text**

This block (inside the `sessions.map((session, i) => { ... })` callback):

```typescript
            const meta = [
              range,
              session.durationMinutes != null
                ? t("duration", { count: session.durationMinutes })
                : null,
            ].filter(Boolean);

            return (
```

Becomes:

```typescript
            const meta = [
              range,
              session.durationMinutes != null
                ? t("duration", { count: session.durationMinutes })
                : null,
            ].filter(Boolean);
            const relativeBasis = sessionRelativeBasis(
              session.sessionDate,
              session.createdAt,
            );

            return (
```

And this block:

```typescript
                  <time
                    dateTime={session.sessionDate}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground lg:text-[11px]"
                  >
                    {format.relativeTime(new Date(session.sessionDate))}
                  </time>
```

Becomes:

```typescript
                  <time
                    dateTime={relativeBasis}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground lg:text-[11px]"
                  >
                    {format.relativeTime(new Date(relativeBasis))}
                  </time>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/session-list.tsx
git commit -m "fix(sessions): use created_at for today's session relative time in session list"
```

---

### Task 4: Apply the same rule in the personal feed ("progressed" event)

**Files:**
- Modify: `src/lib/social/feed.ts`

**Interfaces:**
- Consumes: `sessionRelativeBasis` (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `sessionRelativeBasis`**

At the top of `src/lib/social/feed.ts`, add:

```typescript
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
```

- [ ] **Step 2: Select `created_at` in the "progressed" query — leave `.order`/`.lte` on `session_date` untouched**

This block:

```typescript
    includeProgressed
      ? (() => {
          let q = supabase
            .from("progress_sessions")
            .select(
              // `note` NO se pide: es texto privado del autor (ver el comentario
              // del campo `progress` en FeedEvent).
              "id, user_id, pass_id, session_date, duration_minutes, passes!inner(item_type, item_id)"
            )
            .in("user_id", followedIds)
            .order("session_date", { ascending: false })
            .limit(pageSize);
          if (itemTypes) q = q.in("passes.item_type", itemTypes);
          if (cursor) q = q.lte("session_date", dateUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
```

Becomes (only the `.select(...)` string changes — `.order`/`.lte` stay on `session_date`, per the Global Constraints: this is what keeps a backdated session in its correct chronological slot in the feed):

```typescript
    includeProgressed
      ? (() => {
          let q = supabase
            .from("progress_sessions")
            .select(
              // `note` NO se pide: es texto privado del autor (ver el comentario
              // del campo `progress` en FeedEvent).
              "id, user_id, pass_id, session_date, duration_minutes, created_at, passes!inner(item_type, item_id)"
            )
            .in("user_id", followedIds)
            .order("session_date", { ascending: false })
            .limit(pageSize);
          if (itemTypes) q = q.in("passes.item_type", itemTypes);
          if (cursor) q = q.lte("session_date", dateUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
```

- [ ] **Step 3: Compute `eventDate` via `sessionRelativeBasis`**

This block (inside `for (const r of progressedRows) { ... }`):

```typescript
      entryStatus: null,
      eventDate: r.session_date,
      rating: null,
```

Becomes:

```typescript
      entryStatus: null,
      eventDate: sessionRelativeBasis(r.session_date, r.created_at),
      rating: null,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `r.created_at` must resolve — Supabase infers it from the widened `.select(...)` string, same pattern as `r.session_date` right above it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts
git commit -m "fix(feed): use created_at for today's progressed-event relative time"
```

---

### Task 5: Apply the same rule in shared activity (club post resolving a shared session)

**Files:**
- Modify: `src/lib/social/shared-activity.ts`

**Interfaces:**
- Consumes: `sessionRelativeBasis` (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `sessionRelativeBasis`**

At the top of `src/lib/social/shared-activity.ts`, add:

```typescript
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
```

- [ ] **Step 2: Select `created_at` in the `progress_sessions` branch**

This block:

```typescript
    const { data: row } = await supabase
      .from("progress_sessions")
      // `note` NO se pide: texto privado del autor (ver `progress` en FeedEvent).
      .select("id, user_id, pass_id, session_date, duration_minutes")
      .eq("id", ref.rowId)
      .maybeSingle();
```

Becomes:

```typescript
    const { data: row } = await supabase
      .from("progress_sessions")
      // `note` NO se pide: texto privado del autor (ver `progress` en FeedEvent).
      .select("id, user_id, pass_id, session_date, duration_minutes, created_at")
      .eq("id", ref.rowId)
      .maybeSingle();
```

- [ ] **Step 3: Compute `eventDate` via `sessionRelativeBasis`**

This block:

```typescript
      entryStatus: null,
      eventDate: row.session_date,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: row.duration_minutes },
```

Becomes:

```typescript
      entryStatus: null,
      eventDate: sessionRelativeBasis(row.session_date, row.created_at),
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: row.duration_minutes },
```

(This is the `progress_sessions` branch specifically — `shared-activity.ts` has three other branches with their own `eventDate: row.finished_on` / `row.watched_on` lines; those are untouched.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/shared-activity.ts
git commit -m "fix(social): use created_at for today's shared-session relative time"
```

---

### Task 6: Full verification + docs sync

**Files:**
- Modify: `docs/requirements/decisiones.md` (append one row)
- No code files (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing (terminal task).

- [ ] **Step 1: Run the full unit test suite**

Run: `npm run test`
Expected: all tests pass, including the 3 new ones from Task 1.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification in the browser (dev server on port 3000 — check nothing else already owns it, per `AGENTS.md`)**

Start the dev server if one isn't already running on 3000:

```bash
npm run dev
```

Then, logged in as a user with at least one book/series `in_progress`:

1. Go to the item's page, "Sesiones" tab. Log a new session (no date change — today, default). Confirm the new row shows "hace unos segundos"/"justo ahora", not "hace N horas".
2. Log a second session but change the date field to yesterday (backdating). Confirm it shows "hace 1 día", not "hace unos segundos".
3. Open `/` (home feed) or a followed user's activity — if you have a session logged today showing there as a "progressed" event, confirm it also shows accurate relative time (minutes/hours, not the pre-fix artifact).
4. If you have access to a club with a shared session post, open it and confirm the same.

Note in your final report which of these you were able to check live vs. verified only by reading the code path (e.g., club-shared-post may not have fixture data available).

- [ ] **Step 4: Append the decision to `decisiones.md`**

In `docs/requirements/decisiones.md`, the "Log de decisiones" table ends with a row dated `2026-07-09` for Bookmory import (do not edit any existing row — this file is append-only). Add a new row after the last one:

```markdown
| 2026-07-28 | Tiempo relativo de una sesión usa `created_at` cuando `session_date` es hoy, y `session_date` cuando está backdateada (nunca `created_at` sin condición) | `session_date` es editable a propósito (backdateo: "se me olvidó registrar lo de anoche"); usar siempre `created_at` habría arreglado el bug de "hace X horas" en sesiones recién registradas pero roto el backdateo. Ver `docs/superpowers/specs/2026-07-28-sesiones-hora-registro-design.md` |
```

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): registra la regla de tiempo relativo backdate-aware de sesiones"
```

---

## Self-Review Notes

- **Spec coverage:** §0 (bug) → Task 3/4/5. §1 (why not swap outright) → Task 1's `sessionRelativeBasis` logic. §2 (`started_at` untouched) → no task touches `started_at`; issue #252 tracks it separately. §3 D1-D4 → Task 1 (D1/D2), Tasks 3-5 (D3, same rule in three places), Global Constraints (D4, `session_date` grouping consumers untouched). §4 (issue) → already filed as #252 before this plan was written. §5 (file list) → matches Tasks 2-5 exactly.
- **Placeholder scan:** none — every step has literal before/after code or an exact command with expected output.
- **Type consistency:** `sessionRelativeBasis(sessionDate: string, createdAt: string, today?: string): string` is the same signature used in Task 3 (`session.sessionDate, session.createdAt`), Task 4 (`r.session_date, r.created_at`), Task 5 (`row.session_date, row.created_at`) — no renaming across tasks. `ProgressSession.createdAt` (Task 2) matches the field name used in Task 3.
