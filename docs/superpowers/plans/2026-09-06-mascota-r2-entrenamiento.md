# Mascota R2: entrenamiento Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review each task. Base: `ee1c270f`, after #1088 and #1094.

**Goal:** Complete the approved R2 training loop and close the validation gaps of #1085.
**Architecture:** Keep the frozen r2.2 engine intact. Harden current input/record boundaries; authenticated server actions own snapshots, seeds and conditional persistence. A client training panel simulates ticks and submits only intent plus inputs; replay comes from server re-simulation.
**Tech Stack:** Next.js 16.3, React 19, Supabase, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md` §§3–10, 13–14; roadmap Part II R2.

## Global constraints

- Training is free, repeatable and grants no rewards. Six classes share one kit and one enemy with two opposing telegraphs.
- No new art, ulti, equipment, economy or class-specific mechanics.
- No session-dependent server cache. Authentication comes from the request; all privileged queries also filter user_id.
- Existing r2.2 implementation and normative replay remain immutable.
- Pause/visibility suspension and speed changes never advance simulation ticks themselves.
- Preserve unrelated staged changes in the main checkout.

## Task 1: Validate current battle boundaries (#1085)

Files: `src/lib/pet/battle/inputs.ts`, `record.ts`, corresponding tests; optional snapshot guard with test.

- [x] Replace acceptance of nonempty skill payload with tests expecting `{ ok: false, code: "NONEMPTY_PAYLOAD", index: 0 }`; include the reported 300 × 5000 payload.
- [x] Test malformed snapshot values (null, missing attributes, unknown class/stage, unsafe/fractional/negative stats) return `INVALID_SNAPSHOT`, never throw.
- [x] Run failing tests, implement guards in current API without changing frozen modules, rerun all battle tests including normative and historic replay.

Interface: `validateInputs(raw, ruleset)` preserves the discriminated union and adds `NONEMPTY_PAYLOAD`; `resimulate(record, content)` adds `INVALID_SNAPSHOT`; expose `isBattleSnapshot(unknown)` if shared by the persistence boundary.

## Task 2: Authoritative training service and actions

Files: `src/lib/pet/training/{types,service,repository}.ts`, service tests, `src/lib/pet/training/actions.ts`.

- [x] Add behavioral tests using an in-memory repository: retry start preserves seed/snapshot; two starts insert one row; two resolutions retain first result; rejected log never writes; absent/foreign intent fails; persisted replay verifies digest.
- [x] Implement service around repository compare-and-set: `update(...).eq("user_id", userId).eq("intent_id", intentId).eq("status", "open").select().maybeSingle()`; if no row, reread winner.
- [x] Actions authenticate independently, validate UUID intents, derive snapshot with `getPetSnapshot` then `buildSnapshot`, use secure nonzero 128-bit seed; queries use service role only within server boundary.
- [x] Run service and engine tests, typecheck and lint.

Interface: `startBattle(intentId: string)`, `resolveBattle(intentId: string, inputs: unknown)`, `replayTrainingBattle(intentId: string)` from `@/lib/pet/training/actions`. All return `{ok:false,code:string}` or `{ok:true,battle:TrainingBattle,events?:BattleEvent[]}`. `TrainingBattle` has `intentId`, `status: "open"|"resolved"`, `seed`, `snapshot:BattleSnapshot`, `rulesetVersion`, `contentHash`, `enemyId`, `inputs:BattleInput[]`, `result:BattleResult|null`, `digest:string|null`.

## Task 3: Playable training panel

Files: `src/components/pet/training/*`, `/mascota/page.tsx`, relevant message files and component tests.

- [x] Test start, ability queued once at current tick, cooldown, pause, speed, resolve retry with same log, restart with new intent, and server replay without resubmitting a battle.
- [x] Implement local engine with explicit refs for tick/log so rapid clicks cannot duplicate a tick input. Render HP, enemy phase, cooldown, pause/speed, accessible telegraph text, existing pet sprite and CSS movement, and authoritative result causes with folded event detail.
- [x] Keep intent on uncertain start and inputs on uncertain resolve. Suspend hidden tabs; do not perform catch-up ticks. Replay events come from server, checked against saved digest.
- [x] Integrate below PetDetail; sync translations; run component tests and browser verification against production build.

## Task 4: Verify and document

- [x] Verify authorization with two disposable accounts, concurrent calls, manipulated inputs, unchanged snapshot, one immutable resolved row and deterministic replay; clean test rows/accounts.
- [x] Verify the UI in browser: full battle, pause/speed, skill, result, replay, repeat. Run relevant build/typecheck/lint/test checks.
- [x] Synchronize canonical backlog, architecture and decisions. Human enjoyment after twenty battles remains an explicit acceptance gate tracked by issue, never claimed by automated tests.
- [x] Review diff, preserve work on feature branch and remove session-created worktree/server after integration or durable commit.

## Execution ledger

- Baseline: 16 battle test files / 80 tests pass before edits. Worktree created at `codex-mascota-r2`; root staged files untouched.
- Ruling: boundary validation is tightened outside frozen r2.2. Valid inputs simulate identically; historic replay retains its original executable implementation.

- Final evidence: 136 tests in 20 files, lint, TypeScript and default Turbopack build (70/70 pages) pass. Production Playwright verifies two-account authorization, concurrent starts/resolutions, invalid payload/snapshot, immutable replay, pause/speed, mobile and repeat. Existing human acceptance remains #1082.
- Verification setup: temporary turbopack.root allowed the worktree node_modules junction; removed from the final diff. No schema or dependency changes. Alternate webpack route-export issue #1096 and non-blocking Auth prerender investigation #1098 remain separate.
- Cleanup: disposable accounts are removed through Auth; the test cleans fixed fixture identities before each run to recover interrupted attempts. Work is retained on codex/mascota-r2 before removing the session worktree.
