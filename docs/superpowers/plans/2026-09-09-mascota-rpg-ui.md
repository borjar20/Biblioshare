# Mascota RPG UI — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Tasks have
> separate ownership; no worker commits or overwrites changes outside its files.

**Goal:** Implement the six approved woodland RPG screens, connected to real data.
**Architecture:** Session data stays in the server page under Suspense. A client game
shell owns URL navigation, shared adventure state, and stable combat instances.
Existing simulation and server authority remain intact. Local CSS tokens provide
the same forest theme in light and dark app modes.
**Tech Stack:** Next.js 16.3, React 19.2, next-intl, CSS modules, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-09-mascota-rpg-ui-design.md`

## Global constraints

- No shared cache of session data, no schema changes or new dependencies.
- Existing sprite sheets and combat releases stay unchanged.
- All user-visible strings use translations; main thread owns message files.
- Keep stable combat component identities through tab changes and refresh.
- Tests use Node 22, one worker, production browser verification in small batches.
- No push, merge or deploy is part of this implementation.

## Task 1 — Shell and navigation (main thread)

Files: create `src/components/pet/game/pet-game.tsx`, `pet-game.module.css`,
`src/lib/pet/game-navigation.ts` and its test; modify `src/app/mascota/page.tsx`,
`src/components/nav/fullscreen-routes.ts`, app-shell navigation tracking.

- [x] Test safe return destinations and section parsing before implementation:

```ts
expect(petSection('invented')).toBe('camp');
expect(safePetReturn('//example.com')).toBe('/');
expect(safePetReturn('/mascota?view=bag')).toBe('/');
expect(safePetReturn('/coleccion?tipo=book')).toBe('/coleccion?tipo=book');
```

- [x] Run targeted Vitest test and observe failure.
- [x] Add validated section enum `camp | character | bag | diary | burrow | adventure | training`.
  Use native history changes to update URL without remounting combat. Persist origin
  and last section per user; explicit URL wins.
- [x] Add forest shell with always-visible return link, five bottom destinations,
  responsive desktop layout, local tokens, main landmark reuse, scoped fullscreen gate.
- [x] Read snapshot/adventure once in server content and pass burrow as server slot.
- [x] Rerun tests and inspect all main-thread diffs.

## Task 2 — Character, diary and social surfaces (main thread)

Files: `pet-detail.tsx`, `hatch-form.tsx`, `class-picker.tsx`, `rename-form.tsx`,
`mission-board.tsx`, `achievement-grid.tsx`, `burrow.tsx`; new character presentation
and game CSS. Main owns `messages/*.json`.

- [x] Separate reusable character HUD and celebration lifecycle from page composition.
- [x] Camp shows scene + adventure CTA + training + real mission summary.
- [x] Character shows attributes with expandable provenance and existing edit actions.
- [x] Diary has mission/logro views, preserving complete existing collections.
- [x] Burrow adds opt-in game scene, leaving profile/club embeddings unchanged.
- [x] Verify rename/class flows, data summaries, selection consistency and empty states.

## Task 3 — Equipment (worker; independent of shell)

Own files: `src/components/pet/loot/equipment-panel.tsx`, new
`equipment-panel.module.css`, existing equipment tests.

Interface: retain `EquipmentPanel` public props and data-testid contracts.
New wrapper needs no new prop; local CSS uses game fallback colors. Main lifts its
rendering out of AdventurePanel and supplies shared `AdventureState`.

- [x] Add meaningful coverage that two copies remain selectable and selection does not equip.
- [x] Convert expandable lists to selectable icon grid, equipped slots, comparison panel.
- [x] Preserve server writes, pending/errors, unequip, suggested copy, quality and dates.
- [x] Run equipment tests and report translation additions without editing messages.

## Task 4 — Combat presentation and recovery (worker)

Own files: `src/components/pet/training/*` and focused recovery tests. No battle
engine/ruleset edits. Retain all current TrainingPanel props, add optional `userId`
and `active` (default true). Hidden panel must stop simulation. Implement an explicit
exit preparation event `pet:before-leave` (cancelable): listeners pause/save and
preventDefault if save fails; main shell offers leave-anyway confirmation.

- [x] Write session tests for checkpointing, restored training intent, blocked storage,
  paused re-entry and account isolation; run to observe failure.
- [x] Extend storage options with account-scoped training pointer. Obtain authoritative
  battle via existing start action for same intent. Restore tick/inputs paused.
- [x] `active=false` pauses/cancels unconfirmed ulti; neither ticks nor starts automatically.
- [x] Restyle arena with background `/pet/scenes/battle.webp`, health HUD and thumb controls.
- [x] Preserve event feedback, ulti puzzle, interlude, result, replay and version dispatch.
- [x] Run training tests; report interface and translation additions to main thread.

## Task 5 — Scene assets (artist worker)

Own files: `.superpowers/brainstorm/2026-09-09/` candidates and `public/pet/scenes/`.
Read pet-artist instructions. Generate background-only camp and battle forest art
using PixelLab, matching approved mood without copying UI or characters. Reuse camp
for character/burrow if composition permits. Output `camp.webp`, `battle.webp` and
provenance metadata with actual tools/IDs; keep download sources and inspect outputs.

- [x] Generate and inspect landscape compositions with usable flat foreground.
- [x] Optimize with installed tooling; no character sheet mutations.
- [x] Report dimensions, sizes and available filenames to main thread.

## Task 6 — Integration, verification and documentation

- [x] Integrate worker results, check props and shared data consistency.
- [x] Review translation keys across all message locales using i18n-keeper.
- [x] Run `npm test -- src/components/pet src/lib/pet --maxWorkers=1 --no-file-parallelism`.
- [x] Run targeted lint/typecheck, production build with Node 22.
- [x] Verify real browser at mobile/desktop in both app themes, navigation return,
  bag interactions, diary/burrow and paused recovery. Extend e2e selectors for new tabs.
- [x] Run QA review, fix findings and perform final code review.
- [x] Update canonical design/UI/reference/architecture docs and decisions; log evidence
  in #1165. Any unresolved work gets tracked, not hidden in a final summary.
- [x] Stop created servers; commit only related files, preserve pre-existing staged edits.

## Resultado

Implementación local verificada el 2026-09-09: 491 unitarios, 12 e2e seleccionados, build de producción y QA móvil/escritorio. Evidencia en `docs/testing/2026-09-09-mascota-rpg-ui.md`. Issue #1165 actualizada; publicación pendiente.
