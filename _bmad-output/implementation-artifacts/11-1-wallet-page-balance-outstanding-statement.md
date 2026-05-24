# Story 11.1: Wallet page (balance + outstanding + statement)

Status: ready-for-dev

> Canonical ID: P1-E11-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S01.md

## Story

As a parent,
I want to see what's in my wallet and what I owe at a glance,
so that I always know my balance, outstanding, and recent activity.

## Acceptance Criteria

1. Hero: large wallet balance, smaller outstanding indicator (if > 0), auto-credit status indicator (read-only here — admin sets).
2. "Top up" CTA opens method picker (M-Pesa STK / Paystack card / Bank transfer).
3. Last 10 transactions visible; "View full statement" → CSV download.
4. Loyalty points balance shown read-only (earn-only in P1).

## Tasks / Subtasks

- [ ] Task 1: Wallet read API in `apps/api` (AC: #1, #3, #4)
  - [ ] Add route `apps/api/src/routes/wallet.ts` (registered via `apps/api/src/app.ts`) returning balance, outstanding, auto-credit status, loyalty points, last 10 transactions — backed by `@bm/wallet` ledger primitives
  - [ ] Add full-statement CSV export endpoint
  - [ ] Guard with `@bm/auth` (parent session)
- [ ] Task 2: WalletBalanceCard compound in `packages/ui` (AC: #1)
  - [ ] Build `WalletBalanceCard` compound component (large balance, outstanding indicator when > 0, read-only auto-credit status) — identical render to the admin Reception header
- [ ] Task 3: Wallet page in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [ ] Page under `apps/platform/app/(app)/wallet/page.tsx` using `WalletBalanceCard`
  - [ ] "Top up" CTA opening method picker (M-Pesa STK / Paystack card / Bank transfer) — hands off to the top-up flow (P1-E11-S03)
  - [ ] Last-10 transactions list; "View full statement" triggering CSV download
  - [ ] Loyalty points balance shown read-only
- [ ] Task 4: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: balance/outstanding/auto-credit render; outstanding hidden when 0; method picker opens; last-10 list + CSV statement; loyalty read-only. Use vitest, test-first.

## Dev Notes

- Parent dashboard surface lives in `apps/platform` authed route group (`apps/platform/app/(app)/wallet/`), mobile-first. Wallet data comes from `apps/api` calling `@bm/wallet` (ledger: balance/holds/FIFO). Shared `WalletBalanceCard` lives in `packages/ui` (primitives arrive in X7) and must render identically to the admin Reception header (per source Technical Notes).
- Auto-credit status is **read-only** here (admin sets it elsewhere). Loyalty is earn-only in P1 — display only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/wallet.ts`, `packages/ui` (`WalletBalanceCard`), `apps/platform/app/(app)/wallet/`.
- Depends on P1-E03, P1-E04, and X7 (`packages/ui` primitives) per source Dependencies. Top-up handoff aligns with P1-E11-S03.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
