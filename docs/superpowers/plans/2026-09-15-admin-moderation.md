# Admin Moderation Implementation Plan

> Use superpowers:subagent-driven-development for the database task and review; continue UI and integration in this session.

**Goal:** Deliver approved moderation #1183 with removal, restoration, permanent deletion and audit.
**Architecture:** Session-authorized administrative RPCs plus restrictive visibility rules; server-rendered admin lists and explicit action forms. No shared caching of user data.
**Tech Stack:** Next.js 16.3, React 19, Supabase Postgres, next-intl, Vitest, Playwright.
**Spec:** ../specs/2026-09-15-admin-moderation-design.md

## Constraints

- Preserve existing user changes. Work on `codex/moderation-admin`.
- Never delete passes when moderating posts. Preserve report/audit evidence.
- Hidden content is absent for every role outside authorized admin RPCs.
- Dev migration and actual permission tests precede any production application.

## Tasks

- [x] Database: inspect current policies/functions and grants, add SQL regression covering approved transitions and role matrix, implement migration and admin RPCs, apply to dev and run regression. Own migration, bootstrap manifest, generated types and SQL tests.
- [x] Actions: `src/lib/moderation/contracts.ts`, `src/app/admin/moderation-actions.ts`; write/run failing Vitest tests for authorization, reason and confirmation, then implement typed RPC calls and revalidation.
- [x] UI: admin navigation, paginated/filterable reports/content/clubs/history and shared confirmation form. Reuse Button, ActionMenu and EmptyState with Spanish messages.
- [x] Integration: inspect privileged reads, audio delivery and dependent content for removal leaks; check type safety and targeted lint/unit tests.
- [x] QA: browser against dev with disposable content; verify removal/restoration/deletion and non-admin denial. Review implementation and correct findings.
- [x] Documentation: update canonical model with exact verified environment, backlog, decisions and architecture. Keep #1183 open until required deployment/verification is complete.

## Execution ledger

- 2026-09-15: scope approved including permanent deletion. DB task delegated under subagent-driven-development; main agent owns actions, UI and integration. Existing unrelated staged/unstaged changes retained.
