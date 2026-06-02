# Story 22.3: Auto-credit toggle visibility for parent (read-only)

Status: done

> Canonical ID: P2-E07-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S03.md

## Story

As parent,
I want to see whether I'm allowed to go negative — not control it, but know,
so that the capability described above is delivered.

## Acceptance Criteria

1. Wallet page shows: "Auto-credit: Enabled by admin" or "Auto-credit: Not enabled".
2. If disabled, helper copy explains: "Top up before booking to avoid an outstanding balance".
3. No edit affordance for parent.

## Tasks / Subtasks

- [x] Task 1: Implement Auto-credit toggle visibility for parent (read-only) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Wallet page shows: "Auto-credit: Enabled by admin" or "Auto-credit: Not enabled".
  - [x] Satisfy AC#2: If disabled, helper copy explains: "Top up before booking to avoid an outstanding balance".
  - [x] Satisfy AC#3: No edit affordance for parent.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E03-S07. --- *End of P2 stories.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Added a new read-only shared UI compound `AutoCreditStatus` (`packages/ui/src/auto-credit-status.tsx`), following the 22-1 `OutstandingBalanceBanner` pattern (forwardRef, brand tokens only, no ad-hoc hex). It renders the exact AC#1 status line — "Auto-credit: Enabled by admin" when enabled, "Auto-credit: Not enabled" when disabled — and, only when disabled, the exact AC#2 helper copy "Top up before booking to avoid an outstanding balance". The disabled-state copy is single-sourced as the exported `AUTO_CREDIT_DISABLED_HELP` constant.
- AC#3 (no edit affordance): the component renders only plain `<p>` text — no button/link/input/checkbox/switch. Asserted by a DOM test that queries for all of those roles in both enabled and disabled states and confirms none exist.
- Added a pure, dependency-light gating helper `autoCreditStatusViewModel` (`apps/platform/lib/auto-credit.ts`) mapping the read-only `WalletOverview.autoCreditEnabled` flag (admin-owned, set in P1-E03-S07 / stored as `wallets.auto_credit_enabled`) onto the exact status + helper copy. A missing wallet reads as not-enabled (safe default — never imply the parent may overdraw).
- Wired `AutoCreditStatus` into the parent wallet page (`apps/platform/app/(app)/wallet/page.tsx`) just below the existing `WalletBalanceCard`, driven by `wallet.autoCreditEnabled`. Display-only; the flag remains admin-owned and is flipped elsewhere.
- Tests (test-first; confirmed failing → green): UI DOM tests in `packages/ui/src/compound.test.tsx` (enabled copy + no helper, disabled copy, exact helper text, absence of any edit control in both states, snapshot) and pure helper tests in `apps/platform/lib/auto-credit.test.ts` (enabled, disabled+helper, missing-wallet default).
- Test results: `@bm/ui` 105 passed (11 files); `@bm/platform` 165 passed (24 files); full suite `pnpm test` 17/17 packages successful (e.g. `@bm/api` 662 passed); `pnpm typecheck` 17/17 successful; lint clean for `@bm/ui` + `@bm/platform`.

### File List

- packages/ui/src/auto-credit-status.tsx (new)
- packages/ui/src/index.ts (modified — export `AutoCreditStatus`, `AUTO_CREDIT_DISABLED_HELP`, `AutoCreditStatusProps`)
- packages/ui/src/compound.test.tsx (modified — new `AutoCreditStatus` DOM tests)
- packages/ui/src/__snapshots__/compound.test.tsx.snap (modified — new disabled-state snapshot)
- apps/platform/lib/auto-credit.ts (new)
- apps/platform/lib/auto-credit.test.ts (new)
- apps/platform/app/(app)/wallet/page.tsx (modified — render `AutoCreditStatus`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented read-only auto-credit visibility on the parent wallet page: new `AutoCreditStatus` UI compound + pure `autoCreditStatusViewModel` helper, wired into the wallet page; DOM + unit tests cover all 3 ACs. Status → review. | Amelia (dev-story) |
