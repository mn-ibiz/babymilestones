# Story 5.2: Parent profile header with wallet + outstanding + auto-credit toggle

Status: ready-for-dev

> Canonical ID: P1-E05-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S02.md

## Story

As Reception,
I want all the financial facts about a parent visible without scrolling,
so that I can serve them without digging through screens.

## Acceptance Criteria

1. Header shows: name, phone (full), wallet balance (KES), outstanding amount (red if > 0), auto-credit toggle (admin-only).
2. Numbers refresh on every page action; no stale state.
3. Outstanding amount click → modal listing open invoices.

## Tasks / Subtasks

- [ ] Task 1: Parent profile contract (AC: #1, #3)
  - [ ] Add parent-profile Zod schema in `packages/contracts` (name, phone full, wallet_balance, outstanding, auto_credit_enabled) and open-invoices list shape
- [ ] Task 2: Profile + invoices endpoints (AC: #1, #2, #3)
  - [ ] `apps/api/src/routes/reception/parent-profile.ts` — return header facts; wallet balance via `@bm/wallet`, outstanding from `invoices`
  - [ ] `apps/api/src/routes/reception/parent-open-invoices.ts` — list open invoices for the modal
  - [ ] Register routes in `apps/api/src/app.ts` (buildApp)
- [ ] Task 3: Auto-credit toggle endpoint (AC: #1)
  - [ ] Endpoint to set `parents.auto_credit_enabled`; guarded admin-only via `@bm/auth` role guard; write `audit_outbox` row
- [ ] Task 4: ParentHeader compound (AC: #1, #2, #3)
  - [ ] `apps/admin` — `<ParentHeader parent={parent}/>` compound: name, full phone, balance (KES), outstanding (red when > 0), admin-only auto-credit toggle
  - [ ] Refetch/invalidate on every page action so numbers are never stale
  - [ ] Outstanding click → modal of open invoices
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: outstanding red-when->0 rule, admin-only toggle gating (vitest, test-first)
  - [ ] Integration: profile + open-invoices endpoints; toggle writes audit and is rejected for non-admins
  - [ ] E2E: header renders facts, no-stale after an action, outstanding-click opens modal

## Dev Notes

- Implemented as a compound `<ParentHeader parent={parent}/>` in `apps/admin`.
- Auto-credit toggle is admin-only — enforce with `@bm/auth` role guard server-side, not just UI hiding; audit the change.
- "No stale state": invalidate/refetch profile data after every page action (top-up, visit, etc.).
- Source paths to touch: `apps/api/src/routes/reception/{parent-profile.ts,parent-open-invoices.ts}`, `apps/admin` ParentHeader, `packages/contracts` (profile schema), `packages/auth` (role guard), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- UI compound in `apps/admin`; profile/invoice routes in `apps/api/src/routes/reception/`.
- Dependencies (from source): S01 (search → profile), P1-E03 (wallet/ledger). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
