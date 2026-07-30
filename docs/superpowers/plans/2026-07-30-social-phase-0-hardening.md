# Social Phase 0 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Biblioshare's existing follows, comments, reactions, mentions, and notifications safe to expose to more users by enforcing semantic integrity, adding blocking/reporting/moderation, preventing orphaned interactions, and surfacing failed optimistic actions.

**Architecture:** Keep the current polymorphic interaction model for this phase, but put all target ownership and moderation decisions behind narrow database helpers. Direct clients remain able to create their own comments/reactions under RLS, with database constraints enforcing the complete semantic contract; notification creation moves behind trusted server code. Blocking becomes a bidirectional visibility/interactivity cut and reporting preserves a moderation snapshot even if the source content is later removed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, next-intl, Supabase Postgres 17/RLS, Vitest, Playwright.

## Global Constraints

- The live user state remains in `passes`; never restore reads from frozen `library_entries`.
- Generate every migration with `supabase migration new <name>`; apply and verify in `biblioshare-dev` before production.
- Any `SECURITY DEFINER` helper must set `search_path = public, pg_temp`, validate `auth.uid()` where applicable, and have unnecessary `EXECUTE` grants revoked.
- Keep the current single reaction kind (`like`); Phase 0 must not introduce emoji palettes or threaded replies.
- A block cuts follows, profile/feed visibility, interactions, suggestions, mention delivery, and notifications in both directions for authenticated users.
- Reports are immutable user submissions; source deletion must not delete the report snapshot.
- Do not modify or stage the user's existing changes in `AGENTS.md`, `CLAUDE.md`, or `.claude/skills/`.

---

### Task 1: Database integrity and trusted notification writes

**Files:**
- Create: migration emitted by `supabase migration new social_phase0_integrity`
- Modify: `supabase/schema-baseline.sql`
- Modify: `src/lib/social/notifications.ts`
- Test: `src/lib/social/notifications.test.ts`

**Interfaces:**
- Produces: database constraints `reactions_kind_like` and `comments_body_nonempty`.
- Produces: `notify()` and `notifyMany()` that insert through `createServiceRoleClient()` while retaining the caller-scoped client for target resolution and push payloads.
- Produces: authenticated/anon roles without direct `INSERT` privilege on `notifications`.

- [ ] **Step 1: Write failing notification-writer tests**

  Extend `notifications.test.ts` with a real module-level service-writer fake and assert the consumer-visible effect: notification rows are written through the trusted writer, while href/push resolution still uses the caller client. Include `notify()` and `notifyMany()`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npm test -- src/lib/social/notifications.test.ts`.
  Expected: FAIL because `notify()`/`notifyMany()` still insert with the caller-scoped client.

- [ ] **Step 3: Impact-check and implement the trusted writer**

  Run GitNexus upstream impact for `notify` and `notifyMany`. If risk is HIGH/CRITICAL, stop and report it before editing. Use the server-only service-role client only for the notification insert; do not use it for authorization, target lookup, or user identity.

- [ ] **Step 4: Verify GREEN**

  Run `npm test -- src/lib/social/notifications.test.ts` and confirm all notification routing/push tests pass.

- [ ] **Step 5: Generate and write the integrity migration**

  Discover the CLI syntax with `supabase migration new --help`, generate `social_phase0_integrity`, and add:

  ```sql
  alter table public.reactions
    add constraint reactions_kind_like check (kind = 'like');

  alter table public.comments
    add constraint comments_body_nonempty
    check (char_length(btrim(body)) between 1 and 2000);

  revoke insert on public.notifications from anon, authenticated;
  ```

  Drop the older length-only constraint in the same migration after checking its exact live name. Preserve `SELECT/UPDATE/DELETE` needed by the recipient.

- [ ] **Step 6: Prove constraints and grants in dev**

  Apply to `biblioshare-dev`. In a rollback-only test transaction, prove: `kind='clap'` fails, blank comments fail, a valid `like` and non-empty comment pass, authenticated direct notification insert fails, and the application writer still creates a notification.

---

### Task 2: Blocking as a cross-cutting social boundary

**Files:**
- Create: migration emitted by `supabase migration new social_user_blocks`
- Create: `src/lib/social/block-actions.ts`
- Create: `src/lib/social/block-state.ts`
- Test: `src/lib/social/block-state.test.ts`
- Modify: `src/lib/social/notify-mentions.ts`
- Modify: `src/lib/social/mention-search.ts`
- Modify: `src/lib/social/get-who-to-follow.ts`
- Modify: `src/lib/social/actions.ts`

**Interfaces:**
- Produces: `user_blocks(blocker_id, blocked_id, created_at)` and `public.users_are_blocked(other_user_id uuid) returns boolean`.
- Produces: `getBlockState(supabase, viewerId, targetId): Promise<'none' | 'blocked' | 'blocked_by'>`.
- Produces: server actions `blockUser(targetUserId)` and `unblockUser(targetUserId)`.

- [ ] **Step 1: Write failing pure/data-boundary tests**

  Add fixtures proving candidate lists and mention recipients exclude a relationship when either direction is blocked. Add `block-state.test.ts` cases for self/none/blocked/blocked_by using the same complete Supabase row shape as production.

- [ ] **Step 2: Run focused tests and verify RED**

  Run `npm test -- src/lib/social/block-state.test.ts src/lib/social/notify-mentions.test.ts src/lib/social/mention-search.test.ts`.
  Expected: FAIL because no block table/state/filter exists.

- [ ] **Step 3: Generate the block migration after impact analysis**

  Run GitNexus upstream impact for `can_view_profile`, `can_view_target`, and `followUser`. Warn before edits on HIGH/CRITICAL risk. Generate `social_user_blocks`; create the table, indexes, RLS, and a narrow helper that detects either block direction for the current user.

- [ ] **Step 4: Make database visibility and writes respect blocks**

  Recreate affected helpers/policies from their live definitions, not an old baseline. A logged-in blocked pair must not see each other's profile-owned targets, follow each other, create reactions/comments on each other's content, or see each other's comments. Anonymous public visibility remains unchanged.

- [ ] **Step 5: Implement atomic block/unblock actions**

  `blockUser` must authenticate, reject self-block, insert idempotently, remove follows in both directions, and revalidate feed/profile pages. `unblockUser` removes only the caller's block and does not recreate follows.

- [ ] **Step 6: Filter application-side fan-outs and discovery**

  Update mention delivery, mention candidates, follow suggestions, and follow actions so a block cannot be bypassed through app-layer notification or discovery code.

- [ ] **Step 7: Verify GREEN and impersonation matrix**

  Run the focused Vitest files. In dev, impersonate A, B, and C and prove both directions of block behavior for profiles, follows, comments, reactions, mentions, and an unrelated C.

---

### Task 3: Immutable reports and comment moderation

**Files:**
- Create: migration emitted by `supabase migration new social_reports_and_comment_moderation`
- Create: `src/lib/social/moderation-actions.ts`
- Create: `src/lib/social/moderation.ts`
- Test: `src/lib/social/moderation.test.ts`
- Modify: `src/lib/social/interaction-actions.ts`
- Modify: `src/lib/social/interactions.ts`

**Interfaces:**
- Produces: `content_reports` with reporter, reported user, target type/id, reason, optional details, immutable JSON snapshot, status, and timestamps.
- Produces: `public.can_moderate_interaction_target(target_type, target_id) returns boolean`.
- Produces: `reportComment(commentId, reason, details)` and moderator-aware `deleteComment(commentId)`.
- Extends: `InteractionComment` with `authorUsername`, `authorAvatarUrl`, and `canDelete`.

- [ ] **Step 1: Write failing moderation tests**

  Add tests proving: the comment author can delete; the profile-content owner can delete; a club moderator can delete club comments; an unrelated user cannot; reporting captures the body/author/parent target snapshot; duplicate open reports from one reporter are idempotent.

- [ ] **Step 2: Run focused tests and verify RED**

  Run `npm test -- src/lib/social/moderation.test.ts`.
  Expected: FAIL because the moderation interfaces do not exist and `deleteComment` is author-only.

- [ ] **Step 3: Impact-check targets and generate the migration**

  Run upstream impact for `deleteComment`, `getInteractionSummary`, and `can_view_target`. Generate the migration. Create constrained report enums/table/RLS and the target-moderation helper covering every current `TargetType` branch.

- [ ] **Step 4: Implement server actions and enriched comment DTOs**

  Remove the application-side author-only predicate from `deleteComment`; rely on the tested RLS/helper. Resolve comment usernames/avatars in the existing batched identity query and compute `canDelete` from author/owner/moderator context without one query per comment.

- [ ] **Step 5: Verify GREEN and dev RLS cases**

  Run focused tests, then execute rollback-only dev cases for each allowed/denied role. Confirm reporters can read their own reports but cannot update/delete them, and ordinary users cannot enumerate other reports.

---

### Task 4: Prevent and clean orphaned interactions

**Files:**
- Create: migration emitted by `supabase migration new social_interaction_cleanup`
- Modify: `supabase/schema-baseline.sql`
- Test: dev SQL verification recorded in the plan execution notes

**Interfaces:**
- Produces: one private trigger function receiving the target-kind argument and deleting dependent `comments`, `reactions`, and target-linked notifications.
- Produces: delete triggers on `passes`, `progress_sessions`, `episode_watches`, `club_posts`, `club_activities`, `club_activity_checkpoints`, and `comments`.

- [ ] **Step 1: Write a failing dev SQL regression transaction**

  Seed one target with a comment, a target reaction, a comment reaction, and target notifications; delete the target; assert all dependent interaction rows are gone. Run before creating triggers and confirm the assertion fails.

- [ ] **Step 2: Generate migration and implement minimal cleanup triggers**

  Handle both `diary_entry` and `pass` when deleting a row from `passes`. Deleting a comment must remove reactions targeting that comment. Reports are excluded deliberately because their snapshot is the audit record.

- [ ] **Step 3: Clean existing orphans explicitly**

  In dev first, delete only rows proven orphaned by a target-kind-aware `NOT EXISTS` query. Record before/after aggregate counts. Repeat in production only after code and migration verification.

- [ ] **Step 4: Re-run the SQL regression and verify GREEN**

  Confirm the seeded cascade transaction passes and the post-migration orphan query returns zero rows.

---

### Task 5: Safety controls and visible optimistic errors in the UI

**Files:**
- Create: `src/components/social/profile-safety-actions.tsx`
- Create: `src/components/social/comment-actions.tsx`
- Modify: `src/components/profile-header.tsx`
- Modify: `src/components/social/review-interactions.tsx`
- Modify: `src/components/social/follow-button.tsx`
- Modify: `messages/es.json`
- Test: `e2e/social-safety.spec.ts`

**Interfaces:**
- Consumes: `blockUser`, `unblockUser`, `reportComment`, enriched `InteractionComment.canDelete`.
- Produces: visible `role="alert"` feedback for failed follow/reaction/comment/delete/report actions.
- Produces: profile block/unblock control and per-comment delete/report controls.

- [ ] **Step 1: Write failing UI/E2E assertions**

  Add an E2E using two disposable users that proves block removes the follow/content relationship, prevents refollow, and unblock does not restore it. Add a comment report/delete scenario and a forced action failure that must render an alert instead of silently rolling back. Clean all seeded data before and after via REST/service role.

- [ ] **Step 2: Verify E2E RED**

  Run `npm run test:e2e -- e2e/social-safety.spec.ts` against the single port-3000 dev server.
  Expected: FAIL on missing controls/alerts.

- [ ] **Step 3: Impact-check and implement UI controls**

  Run upstream impact for `ProfileHeader`, `ReviewInteractions`, and `FollowButton`. Add accessible confirmation/actions, reuse the existing optimistic hook's `failed` state, use a multiline comment editor with `maxLength=2000`, and add a visible counter near the limit.

- [ ] **Step 4: Synchronize Spanish copy**

  Add only the required keys for block/unblock, report reasons/status, moderation delete, generic retry feedback, and the length counter. Keep all copy under existing `social`/`notifications` namespaces where possible.

- [ ] **Step 5: Verify E2E GREEN**

  Re-run the focused E2E and check browser console/network failures. Confirm cleanup restores both users and no block/follow/report residue remains.

---

### Task 6: Canonical documentation, regression suite, and drift checks

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Append: `docs/requirements/decisiones.md`
- Modify: `supabase/schema-baseline.sql`

**Interfaces:**
- Produces: canonical documentation matching deployed schema and a replayable baseline in actual application order.

- [ ] **Step 1: Update canonical documentation**

  Document block semantics, reports, trusted notification writes, comment moderation, integrity constraints, cleanup triggers, and verification dates. Append the architectural decision; do not rewrite older decisions.

- [ ] **Step 2: Run schema advisors and drift checks**

  Run security/performance advisors in dev, resolve new findings caused by this phase, and execute `docs/DRIFT-CHECK.md`. Verify actual functions/classes/policies, not only migration ledger entries.

- [ ] **Step 3: Run full verification**

  Run `npm test`, `npm run lint`, `npm run build`, and the focused social E2E. Then run GitNexus `detect_changes({scope: "compare", base_ref: "main"})` and confirm only expected social/schema/documentation flows changed.

- [ ] **Step 4: Production rollout**

  Apply migrations to production only after dev verification and deploy-safe ordering. Re-run constraints, policies, trigger, orphan-count, advisors, and smoke queries in production. Do not infer deployment from `list_migrations` alone.
