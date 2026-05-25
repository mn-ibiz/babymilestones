# Story 14.3: Compound components for P1 surfaces

Status: done

> Canonical ID: X7-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X7-S03.md

## Story

As a developer,
I want load-bearing UI patterns standardised,
so that the P1 parent and staff surfaces are assembled from typed, tested compound components.

## Acceptance Criteria

1. `WalletBalanceCard`, `ChildCard`, `MpesaPushPrompt`, `ReceiptPreview`, `ParentShellLayout`, `StaffShellLayout`.
2. Each consumes typed props from `packages/contracts`.
3. Snapshot tests cover the visual contract.

## Tasks / Subtasks

- [x] Task 1: Implement compound components in `packages/ui` (AC: #1)
  - [x] Add components under `packages/ui/src/` (one per pattern): `WalletBalanceCard`, `ChildCard`, `MpesaPushPrompt`, `ReceiptPreview`, `ParentShellLayout`, `StaffShellLayout`; export from the index.
  - [x] Compose from X7-S02 primitives and X7-S01 tokens (no ad-hoc styling).
- [x] Task 2: Typed props from contracts (AC: #2)
  - [x] Each component's props derive from shared types in `@bm/contracts` (`WalletOverview`, `Child`, `MpesaStkState`) and the canonical `ReceiptDocument` model — no locally redefined domain shapes. `StaffShellLayout` takes a small UI-only `StaffNavItem` nav descriptor (no domain contract exists for staff nav).
- [x] Task 3: Snapshot tests (AC: #3)
  - [x] vitest snapshot tests covering each component's visual contract (6 snapshots in `compound.test.tsx`).
- [x] Task 4: Tests wrap-up (AC: all)
  - [x] Snapshot + prop/behaviour coverage for all six components (14 tests). Test-first (red → green).

## Dev Notes

- Anchor: `packages/ui` (import `@bm/ui`); props from `packages/contracts` (`@bm/contracts`). Built on primitives (X7-S02) and the preset (X7-S01).
- These are the load-bearing P1 patterns: wallet balance, child card, M-Pesa push prompt, receipt preview, and parent/staff shell layouts consumed by the Next apps.
- TS strict, vitest test-first; snapshot tests are the named verification per the source Tests/AC.

### Project Structure Notes
- New component files in `packages/ui/src/`, exported from the index; types imported from `packages/contracts`.
- Dependencies: X7-S02 (primitives). Transitively X7-S01 (tokens) and `packages/contracts` types.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X7-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X7]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` — 15/15 packages pass (incl. `@bm/ui` compound.test.tsx, 14 tests, 6 snapshots).
- `pnpm typecheck && pnpm lint && pnpm build` — all green.

### Completion Notes List

- Six compound components added to `@bm/ui`, all composed from X7-S01 tokens via the shared `cn`/style fragments (no ad-hoc hex).
- Typed props sourced from `@bm/contracts`: `WalletOverview` (+ `isOutstanding` rule), `Child`, `MpesaStkState`. `ReceiptPreview` consumes the canonical `ReceiptDocument` model (already in `@bm/ui`); the on-screen card renders only the masked phone (full number never surfaced — asserted in tests).
- `ParentShellLayout` reuses the pure `PARENT_NAV_ITEMS` + `isNavItemActive` model from `parent-shell.ts` (single source for the active-tab rule) and supports a `renderLink` override for Next `<Link>`.
- `StaffShellLayout` takes a small UI-only `StaffNavItem` descriptor (no domain contract exists for staff nav) plus `isStaffNavActive`.
- React card lives in `receipt-preview-card.tsx` to avoid clashing with the existing pure `receipt-preview.ts` (SMS/print helpers).

### File List

- packages/ui/src/wallet-balance-card.tsx (new)
- packages/ui/src/child-card.tsx (new)
- packages/ui/src/mpesa-push-prompt.tsx (new)
- packages/ui/src/receipt-preview-card.tsx (new)
- packages/ui/src/parent-shell-layout.tsx (new)
- packages/ui/src/staff-shell-layout.tsx (new)
- packages/ui/src/compound.test.tsx (new)
- packages/ui/src/__snapshots__/compound.test.tsx.snap (new)
- packages/ui/src/index.ts (exports)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented six P1 compound components + snapshot tests; full gate green | claude-opus-4-7 |
