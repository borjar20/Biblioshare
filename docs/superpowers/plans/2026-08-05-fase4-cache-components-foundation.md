# Fase 4 (Cache Components) — Rebanada de Cimientos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the repo's first `use cache` in production — cache the three world-readable catalog reads (`getItemCredits`, `getItemSagas`, `getRatingSummary`) with `cacheLife`/`cacheTag`, and wire one `updateTag` so a viewer's own rating stays read-your-own-writes.

**Architecture:** Enable `experimental.cacheComponents`. Add `"use cache"` + `cacheLife` + `cacheTag` to three functions that already run on `createPublicClient()` (sessionless, anon role — safe per #437). Invalidate the `ratings:` tag from the single rating-write chokepoint `revalidateReadingLog`. `getEditions` is deliberately left uncached (sync-during-render entanglement).

**Tech Stack:** Next.js 16.3.0 (App Router, Cache Components), Supabase, Vitest, Playwright.

## Global Constraints

- **#437 (innegociable):** only cache data identical for everyone. Cached functions use `createPublicClient()` + scalar args only; never the session client, never `cookies()`/`headers()`/`searchParams`. Answer #437's two questions in writing in the PR body.
- **`updateTag`, not `revalidateTag`** — read-your-own-writes is the required semantics (#443).
- **Verify against a production build** (`next build` + `next start`), not only `next dev`: a cached fn that touches request APIs passes `build` and fails `start`.
- **Worktree has no `node_modules`** — `npm install` before any build/test.
- **i18n mono-idioma:** no user-facing copy added here; if any, only `messages/es.json`.
- Do NOT touch `getEditions`, and do NOT migrate the other 60 `revalidatePath` sites (that's #443).

---

### Task 1: Bootstrap worktree + enable Cache Components (baseline)

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `experimental.cacheComponents: true` enabled; build known-green with the flag before any `use cache` is added.

- [ ] **Step 1: Install deps in the worktree**

Run: `npm install`
Expected: completes; `node_modules/next` present.

- [ ] **Step 2: Capture the pre-change build baseline**

Run: `npm run build`
Expected: exit 0. Note the route table — today **46 `ƒ Dynamic`, 0 static/ISR** (from #448). This is the "before" number.

- [ ] **Step 3: Enable cacheComponents**

In `next.config.ts`, add to the existing `experimental` block (keep `serverActions.bodySizeLimit`):

```ts
  experimental: {
    cacheComponents: true,
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
```

- [ ] **Step 4: Build with the flag on, fix only blockers**

Run: `npm run build`
Expected: exit 0. If a route now **errors** (not just an insight/warning), fix it minimally so the build passes — the most common cause is a request API (`cookies()`/`searchParams`) used above a `<Suspense>` boundary; the minimal fix is to wrap or push it below the boundary. If a fix would be larger than a few lines, STOP and report it rather than expanding scope — it becomes a follow-up. Non-blocking insights/warnings: do NOT chase; they are Task 5's follow-up issue.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts
git commit -m "feat(cache): enable cacheComponents (Fase 4, #448)"
```

---

### Task 2: Cache the two viewer-immutable reads (`getItemCredits`, `getItemSagas`)

**Files:**
- Modify: `src/lib/people/get-item-credits.ts`
- Modify: `src/lib/sagas/get-item-sagas.ts`

**Interfaces:**
- Consumes: `cacheComponents: true` (Task 1); `createPublicClient()` already used by both.
- Produces: `getItemCredits`/`getItemSagas` cached under tags `credits:${type}:${id}` / `saga-membership:${type}:${id}`, `cacheLife("days")`. Signatures unchanged (`(itemType, itemId) => Promise<...>`).

- [ ] **Step 1: Cache `getItemCredits`**

In `src/lib/people/get-item-credits.ts`, add the import and the three directive lines as the first statements of the function body:

```ts
import { cacheLife, cacheTag } from "next/cache";
// …
export async function getItemCredits(
  itemType: ItemType,
  itemId: string
): Promise<ItemCredits> {
  "use cache";
  cacheLife("days");
  cacheTag(`credits:${itemType}:${itemId}`);
  const supabase = createPublicClient();
  // …rest unchanged…
```

- [ ] **Step 2: Cache `getItemSagas`**

In `src/lib/sagas/get-item-sagas.ts`, identically:

```ts
import { cacheLife, cacheTag } from "next/cache";
// …
export async function getItemSagas(
  itemType: ItemType,
  itemId: string,
): Promise<SagaMembership[]> {
  "use cache";
  cacheLife("days");
  cacheTag(`saga-membership:${itemType}:${itemId}`);
  const supabase = createPublicClient();
  // …rest unchanged…
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If `cacheLife`/`cacheTag` are not exported from `next/cache` in 16.3, check `node_modules/next/dist/docs/` for the exact names/import path and adjust — the API existed as `unstable_cacheLife`/`unstable_cacheTag` in earlier versions.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0. `/libro/[id]`, `/pelicula/[id]`, `/serie/[id]` should move toward static/ISR or at least show partial prerender — record the delta from Task 1's baseline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/get-item-credits.ts src/lib/sagas/get-item-sagas.ts
git commit -m "feat(cache): use cache en creditos y sagas de item (Fase 4, #448)"
```

---

### Task 3: Cache `getRatingSummary` + invalidate on rating writes (TDD)

**Files:**
- Modify: `src/lib/community/get-community.ts` (function `getRatingSummary`)
- Modify: `src/lib/reactivity/revalidate.ts` (function `revalidateReadingLog`)
- Test: `src/lib/reactivity/revalidate.test.ts`

**Interfaces:**
- Consumes: `cacheComponents: true`; `revalidateReadingLog(itemType, id)` is called by every rating-write path (`passes/actions.ts`, `sessions/actions.ts`, `series/episode-actions.ts`, `library/manage-actions.ts`).
- Produces: `getRatingSummary` cached under `ratings:${type}:${id}`, `cacheLife("hours")`; `revalidateReadingLog` now also calls `updateTag(`ratings:${itemType}:${id}`)`.

- [ ] **Step 1: Write the failing test**

In `src/lib/reactivity/revalidate.test.ts`, extend the `next/cache` mock to capture `updateTag`, and assert `revalidateReadingLog` invalidates the ratings tag. Replace the mock block (lines 6-8) and add a test:

```ts
// Mock de next/cache: capturamos revalidatePath y updateTag.
const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
}));
```

Add `beforeEach(() => updateTag.mockClear());` alongside the existing `mockClear`, and add:

```ts
  it("revalidateReadingLog invalida la etiqueta de nota (read-your-own-writes)", () => {
    revalidateReadingLog("movie", "xyz");
    expect(updateTag).toHaveBeenCalledWith("ratings:movie:xyz");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/reactivity/revalidate.test.ts`
Expected: FAIL — `updateTag` not called (revalidateReadingLog doesn't call it yet).

- [ ] **Step 3: Wire `updateTag` in `revalidateReadingLog`**

In `src/lib/reactivity/revalidate.ts`, change the import and the function:

```ts
import { revalidatePath, updateTag } from "next/cache";
// …
/** Registro de lectura (pase, sesión, episodio visto): ficha + perfiles + feed.
 *  Fase 4: además refresca la media de la comunidad cacheada (getRatingSummary)
 *  para el que acaba de puntuar — updateTag hace que la SIGUIENTE petición
 *  espere al dato fresco (read-your-own-writes, #443/#437). */
export function revalidateReadingLog(itemType: ItemType, id: string): void {
  updateTag(`ratings:${itemType}:${id}`);
  revalidateItemPage(itemType, id);
  revalidateProfilePages();
  revalidateFeed();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/reactivity/revalidate.test.ts`
Expected: PASS (both the new test and the existing `revalidateReadingLog toca ficha + perfiles + feed`, which is unaffected — `updateTag` is captured separately from `revalidatePath`).

- [ ] **Step 5: Cache `getRatingSummary`**

In `src/lib/community/get-community.ts`, add the import (top of file) and the directive lines in `getRatingSummary`:

```ts
import { cacheLife, cacheTag } from "next/cache";
// …
export async function getRatingSummary(
  itemType: ItemType,
  itemId: string
): Promise<RatingSummary> {
  "use cache";
  cacheLife("hours");
  cacheTag(`ratings:${itemType}:${itemId}`);
  const supabase = createPublicClient();
  // …rest unchanged…
```

Leave `getReviews` and `getCommunity` untouched (they take the session client — NOT cacheable).

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/community/get-community.ts src/lib/reactivity/revalidate.ts src/lib/reactivity/revalidate.test.ts
git commit -m "feat(cache): use cache en getRatingSummary + updateTag de nota (Fase 4, #448)"
```

---

### Task 4: Verify against a production build (no leak, read-your-own-writes)

**Files:** none (verification only).

**Interfaces:**
- Consumes: Tasks 1-3 merged locally.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all pass (1237+ baseline). Fix any regression before continuing.

- [ ] **Step 2: Production build + start**

Run: `npm run build` then `npm start` (serves the prod build on :3000; kill any stray `next dev` first — `Get-NetTCPConnection -LocalPort 3000`).
Expected: build exit 0, server boots. This is the run that catches a cached fn touching request APIs (`start` fails where `dev` didn't).

- [ ] **Step 3: e2e reactivity against the prod build**

Run: `npm run test:e2e -- club-reactivity` (Playwright reuses the running server on :3000).
Expected: pass. These specs are the natural net for invalidation changes.

- [ ] **Step 4: 2-account leak check (manual, in browser)**

Per the repo rule (one account → cache always hits → leak invisible), with the prod build running:
- As account A, open a ficha where A has a **private** pass with a rating.
- As account B (or logged out), open the same ficha.
- Confirm both see the **same** community average = the public subset (NOT A's private-inflated value). If they differ by A's private pass, `getRatingSummary` is leaking session data — STOP, the cache is unsafe.
- Then, as A, close a pass with a rating on that item and reload the ficha: A must see their vote counted immediately (updateTag). B too on next load.

- [ ] **Step 5: Record evidence**

Capture the prod-build route table (static/ISR delta vs the 46-dynamic baseline) and the 2-account result for the PR body. No commit.

---

### Task 5: Docs + follow-up issues + PR

**Files:**
- Modify: `docs/requirements/decisiones.md` (append-only)
- Modify: `docs/requirements/backlog.md`

**Interfaces:**
- Consumes: everything verified in Task 4.

- [ ] **Step 1: Append a decision**

Add to the END of `docs/requirements/decisiones.md` (do not rewrite prior entries): an entry dated 2026-08-05 recording the repo's first `use cache` (credits/sagas/ratings on `createPublicClient`), the `cacheLife` choices (`days` catalog / `hours` ratings), and the choice of `updateTag` (not `revalidateTag`) for the `ratings:` tag — read-your-own-writes. Note `getEditions` deferred.

- [ ] **Step 2: Tick the backlog**

In `docs/requirements/backlog.md`, mark the Fase 4 `use cache` sub-item done (leave getEditions/ISR/#443/insights unticked — they are follow-ups).

- [ ] **Step 3: Open the four follow-up issues** (each with its three labels)

```sh
gh issue create --repo borjar20/Biblioshare --label "area:infra,tipo:deuda,P2" \
  --title "Cachear getEditions con seguridad (desenredar freshRead/sync-en-render)" \
  --body "Fase 4 dejó getEditions SIN use cache a propósito: su lectura freshRead=true viene tras un sync que escribe en render (loadBookEditions), y un use cache reintroduce el bug «la tira se queda en el placeholder» (ver comentario en get-editions.ts). Su escritor no es Server Action → no puede updateTag. Requiere separar la lectura pura del sync antes de cachear. Contexto: #448, spec 2026-08-05-fase4-cache-components-foundation."
gh issue create --repo borjar20/Biblioshare --label "area:infra,tipo:deuda,P2" \
  --title "Barrido de insights de cacheComponents ruta a ruta (46 rutas)" \
  --body "Con cacheComponents activo (Fase 4), recorrer las 46 rutas recogiendo insights no bloqueantes y decidir cuáles merecen shell estático. La rebanada de cimientos solo dejó el build en verde; no persiguió insights. Contexto: #448."
gh issue create --repo borjar20/Biblioshare --label "area:catalogo,tipo:feature,P3" \
  --title "generateStaticParams/ISR en las fichas más visitadas" \
  --body "Con getRatingSummary/creditos/sagas cacheados, las fichas pueden prerenderizarse por id para las obras más vistas. Requiere métricas de campo para elegir el conjunto. Contexto: #448 Fase 4."
```
Then comment on #443 correcting the count: the tree has **61** `revalidatePath` sites, not ~20; the `ratings:` tag was already migrated to `updateTag` in the Fase 4 foundation slice.

- [ ] **Step 4: Commit docs**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs: registrar primer use cache (Fase 4, #448)"
```

- [ ] **Step 5: Open the PR**

Push the branch and open a PR against `main` whose body answers #437's two questions in writing (see Global Constraints), includes the Task 4 evidence (route-table delta + 2-account result), and links #448. Note the four follow-ups.

---

## Self-Review

**Spec coverage:** §1 cacheComponents → Task 1. §2 cache table (credits/sagas/ratings, getEditions deferred) → Tasks 2-3. §2 #437 written answer → Task 5 PR body + Global Constraints. §3 updateTag in revalidateReadingLog → Task 3. §4 follow-ups → Task 5. Verification §→ Task 4. Definición de hecho → Task 5. All covered.

**Placeholder scan:** No TBD/TODO; every code step has concrete code; the follow-up issue bodies are written out.

**Type consistency:** `getItemCredits(itemType, itemId)`, `getItemSagas(itemType, itemId)`, `getRatingSummary(itemType, itemId)`, `revalidateReadingLog(itemType, id)` — signatures unchanged from source. Tags: `credits:` / `saga-membership:` / `ratings:` used consistently across spec, Task 2, Task 3. `cacheLife` values (`days`/`days`/`hours`) match the spec table.
