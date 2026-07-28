# Sesiones: hora de inicio opcional en registro manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #252 — let the manual session-logging form optionally capture a real start time, so `progress_sessions.started_at` gets populated outside the (0%-used) stopwatch flow, without ever defaulting to "now".

**Architecture:** A new pure function `combineStartedAt(sessionDate, time)` combines the form's date field with a new optional `<input type="time">` into the same ISO-string shape the stopwatch already sends as `startedAt`. The date field in `session-sheet.tsx` becomes controlled (was `defaultValue`-only) so its live value can be passed down as a prop to `BookProgressField`, which renders the new time input and, when filled, a hidden `startedAt` input — mutually exclusive with the stopwatch's own hidden `startedAt` input, exactly like `durationMinutes` already is.

**Tech Stack:** Next.js 16 / TypeScript, React (client components), Vitest, next-intl.

## Global Constraints

- **Zero server changes.** `src/lib/sessions/actions.ts` already parses `formData.get("startedAt")` (lines 96-104) — do not touch it.
- **Zero schema changes.** `progress_sessions.started_at` already exists.
- **The time input must never have a default value.** Empty by default; only produces a value if the user actively fills it in. This is the exact thing issue #252 ruled out ("no inventar una hora").
- **Books only.** No new UI in the series session form (`SeriesEpisodeGrid` / its surrounding form) — series keeps no duration/stopwatch section (decision D9, `docs/superpowers/specs/2026-07-20-registrar-sesion-v2-design.md`).
- **The new hidden `startedAt` input must only render in `durationMode === "manual"`.** In `"timer"` mode, `SessionTimer` already renders its own `startedAt` hidden input; two inputs sharing `name="startedAt"` in the DOM at once would make `FormData` silently pick the first one.
- Full spec: `docs/superpowers/specs/2026-07-28-sesiones-hora-inicio-manual-design.md`.

---

### Task 1: `combineStartedAt` pure function

**Files:**
- Create: `src/lib/sessions/combine-started-at.ts`
- Test: `src/lib/sessions/combine-started-at.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `combineStartedAt(sessionDate: string, time: string): string | null` — consumed by Task 3 (`book-progress-field.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/sessions/combine-started-at.test.ts
import { describe, it, expect } from "vitest";
import { combineStartedAt } from "./combine-started-at";

describe("combineStartedAt", () => {
  it("devuelve null si no hay hora (el caso por defecto)", () => {
    expect(combineStartedAt("2026-07-27", "")).toBeNull();
  });

  it("combina fecha y hora en un ISO cuyos componentes LOCALES coinciden con lo introducido", () => {
    const result = combineStartedAt("2026-07-27", "20:15");
    expect(result).not.toBeNull();
    const asDate = new Date(result as string);
    expect(asDate.getFullYear()).toBe(2026);
    expect(asDate.getMonth()).toBe(6); // julio, 0-indexado
    expect(asDate.getDate()).toBe(27);
    expect(asDate.getHours()).toBe(20);
    expect(asDate.getMinutes()).toBe(15);
  });

  it("devuelve null si la fecha está vacía", () => {
    expect(combineStartedAt("", "20:15")).toBeNull();
  });
});
```

(The second test asserts local getters, not a hardcoded UTC offset — construction and inspection both run in the same process/timezone, so this is not flaky across machines/CI, unlike asserting a literal `"...Z"` string would be.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sessions/combine-started-at.test.ts`
Expected: FAIL — `Cannot find module './combine-started-at'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/sessions/combine-started-at.ts

// Combina el input de fecha (sessionDate, "YYYY-MM-DD") con el nuevo input de
// hora opcional del registro manual ("HH:MM") en el mismo formato ISO que ya
// manda SessionTimer como startedAt (session-timer.tsx:134-140) — calculado
// aquí, en el cliente, nunca en el servidor: un string "YYYY-MM-DDTHH:MM" sin
// offset se interpreta como hora LOCAL, y el servidor podría estar en otro
// huso que el del usuario.
//
// time vacío (el caso por defecto: el usuario no ha tocado el campo) => null,
// nunca "ahora" — issue #252 prohíbe explícitamente inventar una hora.
export function combineStartedAt(sessionDate: string, time: string): string | null {
  if (!time || !sessionDate) return null;
  const parsed = new Date(`${sessionDate}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sessions/combine-started-at.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/combine-started-at.ts src/lib/sessions/combine-started-at.test.ts
git commit -m "feat(sessions): add combineStartedAt for the optional manual start-time field"
```

---

### Task 2: Make the Fecha field controlled and pass it down

**Files:**
- Modify: `src/components/session/session-sheet.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `sessionDate` prop passed to `BookProgressField`, consumed by Task 3.

- [ ] **Step 1: Add controlled state for the date field**

In `src/components/session/session-sheet.tsx`, this line (inside the component body, near the other `useState` calls — right after `const [closingPass, setClosingPass] = useState(false);` and its sibling `prevState` line, i.e. after line 84):

```typescript
  const [closingPass, setClosingPass] = useState(false);
  const [prevState, setPrevState] = useState(state);
```

Gets a new state declaration added right after (before the `if (state !== prevState) {` block, so it doesn't interleave with that logic):

```typescript
  const [closingPass, setClosingPass] = useState(false);
  const [prevState, setPrevState] = useState(state);
  // Controlado (antes defaultValue-only) porque BookProgressField necesita el
  // valor EN VIVO para combinarlo con la hora opcional en combineStartedAt —
  // ver book-progress-field.tsx.
  const [sessionDate, setSessionDate] = useState(todayISO());
```

- [ ] **Step 2: Switch the Fecha `<Input>` from `defaultValue` to `value`/`onChange`**

This block:

```typescript
          <Field label={t("date")} htmlFor="session-date">
            <Input
              id="session-date"
              name="sessionDate"
              type="date"
              required
              defaultValue={todayISO()}
            />
          </Field>
```

Becomes:

```typescript
          <Field label={t("date")} htmlFor="session-date">
            <Input
              id="session-date"
              name="sessionDate"
              type="date"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </Field>
```

- [ ] **Step 3: Pass `sessionDate` down to `BookProgressField`**

This block:

```typescript
          {itemType === "book" ? (
            <BookProgressField
              passId={passId}
              fromPage={currentPage}
              total={total}
              initialMinutes={initialMinutes}
              onPageChange={setLivePage}
            />
          ) : (
```

Becomes:

```typescript
          {itemType === "book" ? (
            <BookProgressField
              passId={passId}
              fromPage={currentPage}
              total={total}
              initialMinutes={initialMinutes}
              onPageChange={setLivePage}
              sessionDate={sessionDate}
            />
          ) : (
```

- [ ] **Step 4: Typecheck (expect ONE error — the new required prop doesn't exist on `BookProgressField` yet, that's Task 3)**

Run: `npx tsc --noEmit`
Expected: exactly one error, `Property 'sessionDate' does not exist on type ...` (or similar) pointing at `book-progress-field.tsx`'s prop type — confirms Task 2's wiring is correct and Task 3 is what closes the gap. Do not try to make this fully green yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/session/session-sheet.tsx
git commit -m "feat(sessions): make the Fecha field controlled and pass it to BookProgressField"
```

---

### Task 3: Optional start-time input in the manual duration mode

**Files:**
- Modify: `src/components/session/book-progress-field.tsx`

**Interfaces:**
- Consumes: `combineStartedAt` (Task 1), `sessionDate` prop (Task 2).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Import `combineStartedAt` and accept the new `sessionDate` prop**

This block:

```typescript
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { clampPage, readProgress } from "@/lib/sessions/page-stepper";
import { SessionTimer } from "./session-timer";
```

Becomes:

```typescript
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { clampPage, readProgress } from "@/lib/sessions/page-stepper";
import { combineStartedAt } from "@/lib/sessions/combine-started-at";
import { SessionTimer } from "./session-timer";
```

And this block:

```typescript
export function BookProgressField({
  passId,
  fromPage,
  total,
  initialMinutes,
  onPageChange,
}: {
  passId: string;
  fromPage: number | null;
  total: number | null;
  initialMinutes?: number | null;
  /** La página que el usuario está marcando AHORA, para que el anclaje del
   *  compositor la siga. No se usa para enviar nada: el input `name="page"`
   *  sigue siendo la única fuente de la posición de la sesión. */
  onPageChange?: (page: number | null) => void;
}) {
```

Becomes:

```typescript
export function BookProgressField({
  passId,
  fromPage,
  total,
  initialMinutes,
  onPageChange,
  sessionDate,
}: {
  passId: string;
  fromPage: number | null;
  total: number | null;
  initialMinutes?: number | null;
  /** La página que el usuario está marcando AHORA, para que el anclaje del
   *  compositor la siga. No se usa para enviar nada: el input `name="page"`
   *  sigue siendo la única fuente de la posición de la sesión. */
  onPageChange?: (page: number | null) => void;
  /** Valor EN VIVO del campo Fecha del padre (session-sheet.tsx) — se
   *  combina con la hora opcional de abajo en combineStartedAt. */
  sessionDate: string;
}) {
```

- [ ] **Step 2: Add state for the new time field**

This block:

```typescript
  const [durationMode, setDurationMode] = useState<"manual" | "timer">("manual");
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );
  const minutesRef = useRef<HTMLInputElement>(null);
```

Becomes:

```typescript
  const [durationMode, setDurationMode] = useState<"manual" | "timer">("manual");
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );
  const minutesRef = useRef<HTMLInputElement>(null);
  // Vacío por defecto a propósito (issue #252): nunca se rellena con "ahora".
  const [startedAtTime, setStartedAtTime] = useState("");
  const startedAt = combineStartedAt(sessionDate, startedAtTime);
```

- [ ] **Step 3: Render the time input + hidden `startedAt` input, only in manual mode**

This block (the manual branch of the duration mode):

```typescript
        {durationMode === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={manualMinutes === String(n)}
                  onClick={() => pickDuration(n)}
                  className={`rounded-full border px-2.5 py-1.5 font-mono text-[11px] ${
                    manualMinutes === String(n)
                      ? "border-accent bg-accent/7 text-accent"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {n === 60 ? t("durationHour") : t("durationMinutes", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickDuration(null)}
                className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
              >
                {t("durationOther")}
              </button>
            </div>
            <Input
              ref={minutesRef}
              id="session-duration"
              name="durationMinutes"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              aria-label={t("duration")}
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </div>
        ) : (
          <SessionTimer
            passId={passId}
            onMinutes={(m) => {
              setManualMinutes(String(m));
              setDurationMode("manual");
            }}
          />
        )}
```

Becomes:

```typescript
        {durationMode === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={manualMinutes === String(n)}
                  onClick={() => pickDuration(n)}
                  className={`rounded-full border px-2.5 py-1.5 font-mono text-[11px] ${
                    manualMinutes === String(n)
                      ? "border-accent bg-accent/7 text-accent"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {n === 60 ? t("durationHour") : t("durationMinutes", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickDuration(null)}
                className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
              >
                {t("durationOther")}
              </button>
            </div>
            <Input
              ref={minutesRef}
              id="session-duration"
              name="durationMinutes"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              aria-label={t("duration")}
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="session-started-at-time"
                className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground"
              >
                {t("startedAtTime")}
              </label>
              <Input
                id="session-started-at-time"
                type="time"
                aria-label={t("startedAtTime")}
                value={startedAtTime}
                onChange={(e) => setStartedAtTime(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">{t("startedAtTimeHint")}</p>
            </div>
            {startedAt && <input type="hidden" name="startedAt" value={startedAt} />}
          </div>
        ) : (
          <SessionTimer
            passId={passId}
            onMinutes={(m) => {
              setManualMinutes(String(m));
              setDurationMode("manual");
            }}
          />
        )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the Task 2 error from the missing prop is now resolved).

- [ ] **Step 5: Commit**

```bash
git add src/components/session/book-progress-field.tsx
git commit -m "feat(sessions): optional start-time input in manual duration mode"
```

---

### Task 4: Translations, verification, docs sync

**Files:**
- Modify: `messages/es.json`
- Modify: `docs/requirements/decisiones.md` (append one row)
- No other code files (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing (terminal task).

- [ ] **Step 1: Add the two new translation keys**

In `messages/es.json`, inside the `"session"` object, the existing `"durationHour": "1 h",` line is followed by `"stepDown": "Una página menos",`. Insert the two new keys between them (grouping with the other `startedAt`-adjacent lines isn't necessary — this namespace is flat and alphabetical order isn't enforced elsewhere in the file, so placing them near `duration*` keys, where they're used, keeps them discoverable):

```json
  "durationHour": "1 h",
  "startedAtTime": "¿A qué hora empezaste?",
  "startedAtTimeHint": "Opcional. Ayuda a saber cuándo sueles leer.",
  "stepDown": "Una página menos",
```

- [ ] **Step 2: Run the full unit test suite**

Run: `npm run test`
Expected: all tests pass, including the 3 new ones from Task 1.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint`
Expected: no new errors (the pre-existing baseline issues in unrelated files — e.g. `signup-form.tsx` — are not this task's concern; confirm none of the 4 files touched in Tasks 1-3 appear in the output).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification in the browser**

Start the dev server if one isn't already running on port 3000 (check first — `AGENTS.md` requires a single instance on 3000):

```bash
npm run dev
```

Logged in as a user with a book `in_progress` (e.g. the `TEST_USER_*` account in `.env.local` — copy it into the worktree first if missing, same as any other manual QA session in this repo):

1. Open "Registrar sesión" for that book. Confirm the new "¿A qué hora empezaste?" field appears under Duración, in "A mano" mode, empty by default.
2. Save a session WITHOUT touching the new time field. Confirm the session saves normally (no regression — this is the majority path).
3. Open "Registrar sesión" again, fill in a time (e.g. 20:15), save. Then check in Supabase (`biblioshare-dev` project, or via a quick `select started_at from progress_sessions order by created_at desc limit 1`) that `started_at` was written and its LOCAL time matches what you typed.
4. Switch to "Cronómetro" mode, run it briefly, save. Confirm this still works exactly as before (the new field must not appear/interfere in timer mode).
5. Clean up any test sessions/data you created, same as prior QA sessions in this repo.

Note in your final report which of these you verified live.

- [ ] **Step 5: Append the decision to `decisiones.md`**

In `docs/requirements/decisiones.md`, the "Log de decisiones" table — **do not edit any existing row**, this file is append-only. Add a new row after the last one:

```markdown
| 2026-07-28 | Hora de inicio opcional en el registro manual de sesión, sin default a "ahora"; combinada en CLIENTE con la fecha (nunca en servidor) usando el mismo formato `startedAt` que ya manda el cronómetro | Issue #252: la cobertura de `started_at` era 0 % en prod (18/18 filas) porque solo el cronómetro la rellenaba y nadie lo usa. Rellenarla con la hora de envío habría sido la misma falsa precisión del bug de `docs/superpowers/specs/2026-07-28-sesiones-hora-registro-design.md`; combinar en servidor habría arriesgado un desajuste de huso horario entre usuario y servidor |
```

- [ ] **Step 6: Commit**

```bash
git add messages/es.json docs/requirements/decisiones.md
git commit -m "feat(sessions): translations for the optional start-time field + decision log"
```

---

## Self-Review Notes

- **Spec coverage:** §0/§1 (problem, existing pipeline) → Task 1 (`combineStartedAt`) reuses the exact `startedAt` shape documented in §1. D1 (no default) → Task 3 Step 2 (`useState("")`, never pre-filled). D2 (combine client-side) → Task 1's `combineStartedAt`, called from the client component in Task 3. D3 (controlled Fecha + prop) → Task 2. D4 (mutually exclusive with timer) → Task 3 Step 3, the hidden input is inside the `durationMode === "manual"` branch only, `SessionTimer`'s own branch untouched. D5 (books only) → no changes anywhere in the series session path (`SeriesEpisodeGrid` not touched). D6 (short label, no long hint) → Task 4 Step 1, one short hint line matching existing `noteHint`/`durationHint` style. §3 (out of scope: the stat itself) → not built here, correctly. §4 (file list) → matches Tasks 2-4 exactly.
- **Placeholder scan:** none — every step has literal before/after code, exact commands, or a concrete manual-QA checklist.
- **Type consistency:** `combineStartedAt(sessionDate: string, time: string): string | null` — same signature used in Task 3 Step 2 (`combineStartedAt(sessionDate, startedAtTime)`). `BookProgressField`'s new `sessionDate: string` prop (Task 3 Step 1) matches the `sessionDate={sessionDate}` passed in Task 2 Step 3. No renames across tasks.
