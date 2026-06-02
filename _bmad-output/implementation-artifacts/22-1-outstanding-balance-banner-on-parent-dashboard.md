# Story 22.1: Outstanding-balance banner on parent dashboard

Status: done

> Canonical ID: P2-E07-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S01.md

## Story

As parent with an outstanding balance,
I want it surfaced clearly,
so that I don't forget.

## Acceptance Criteria

1. If `outstanding_amount > 0`, banner shows on every page: "You owe KES X. Top up to settle."
2. Banner CTA opens top-up flow.
3. After settlement, banner disappears automatically.

## Tasks / Subtasks

- [x] Task 1: Implement Outstanding-balance banner on parent dashboard (AC: #1, #2, #3)
  - [x] Satisfy AC#1: If `outstanding_amount > 0`, banner shows on every page: "You owe KES X. Top up to settle."
  - [x] Satisfy AC#2: Banner CTA opens top-up flow.
  - [x] Satisfy AC#3: After settlement, banner disappears automatically.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Banner uses `OutstandingBalanceBanner` compound.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E11 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (BMAD Dev Story workflow)

### Debug Log References

- Full repo test suite: `pnpm test` → 17/17 packages green (660 api / 162 platform / 100 ui / 94 jobs / 65 sms …).
- `pnpm typecheck` → 17/17 green. `pnpm --filter @bm/ui --filter @bm/platform lint` → clean.
- Pre-existing flaky test (NOT introduced here): `@bm/sms` `src/config.test.ts > sms_config CRUD … lists newest-first` intermittently fails on a `created_at` timestamp-tie ordering; passes on re-run (65/65). Unrelated to this story (frontend-only change).
- Pre-existing lint error (NOT introduced here, out of scope): `packages/wallet/src/loyalty-clawback.test.ts:4` unused `walletLedger` import (Epic 26). `packages/wallet` is untouched by this story.

### Completion Notes List

Implemented the outstanding-balance nudge as the `OutstandingBalanceBanner` compound the Dev Note mandates, rendered once in the parent shell so it shows on every dashboard page.

- **AC#1** — Banner renders only while `outstandingCents > 0` (shared `isOutstanding` rule from `@bm/contracts`) with the exact copy "You owe KES X. Top up to settle." (`X` via `@bm/ui` `formatKes`). Mounted in `ParentShellLayout`'s `<main>`, above page content, so it appears on every `(app)` route. Styled with brand tokens only (`bg-warn` / `text-neutral-900`), `role="status"` + `aria-live="polite"`.
- **AC#2** — CTA is an `<a href="/top-up">` (default, overridable via `topUpHref`) handing off to the existing top-up flow (`apps/platform/app/top-up`).
- **AC#3** — Visibility is derived purely from the data: the compound returns `null` when not owing, and the client island re-fetches the wallet overview on navigation and on window focus, so the banner clears itself once a top-up settles the balance. A failed wallet read fails quiet (banner stays hidden, never blocks a page).

TDD: red→green→refactor. DOM behaviour (AC#1 copy, AC#2 CTA, AC#3 hidden-when-settled) is tested in `@bm/ui` (jsdom + Testing Library, where the harness lives); app-side gating is tested as a pure function in `@bm/platform` `lib` (matching the repo's pure-logic-in-lib / thin-component split — the platform app has no in-app DOM test harness, so no new test deps were added).

### File List

New:
- `packages/ui/src/outstanding-balance-banner.tsx` — the `OutstandingBalanceBanner` compound (AC#1/#2/#3).
- `apps/platform/lib/outstanding-banner.ts` — pure `bannerOutstandingCents` gating helper.
- `apps/platform/lib/outstanding-banner.test.ts` — unit tests for the gating helper.
- `apps/platform/app/components/OutstandingBalanceBannerIsland.tsx` — client island: fetch + refetch-on-nav/focus, renders the compound.

Modified:
- `packages/ui/src/index.ts` — export `OutstandingBalanceBanner` + props type.
- `packages/ui/src/compound.test.tsx` — added the `OutstandingBalanceBanner` describe block (6 tests).
- `packages/ui/src/__snapshots__/compound.test.tsx.snap` — new banner snapshot.
- `apps/platform/app/components/ParentShellLayout.tsx` — render `<OutstandingBalanceBannerIsland />` in `<main>` (banner on every page).
- `apps/platform/tsconfig.tsbuildinfo` — generated incremental-build cache (auto-updated by typecheck; not a source change).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented `OutstandingBalanceBanner` compound + parent-shell banner island; TDD across `@bm/ui` (DOM) and `@bm/platform` (pure); all 3 ACs satisfied; full suite + typecheck green | Amelia (Dev) |
