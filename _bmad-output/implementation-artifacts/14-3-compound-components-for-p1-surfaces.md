# Story 14.3: Compound components for P1 surfaces

Status: ready-for-dev

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

- [ ] Task 1: Implement compound components in `packages/ui` (AC: #1)
  - [ ] Add components under `packages/ui/src/` (one per pattern): `WalletBalanceCard`, `ChildCard`, `MpesaPushPrompt`, `ReceiptPreview`, `ParentShellLayout`, `StaffShellLayout`; export from the index.
  - [ ] Compose from X7-S02 primitives and X7-S01 tokens (no ad-hoc styling).
- [ ] Task 2: Typed props from contracts (AC: #2)
  - [ ] Each component's props derive from shared Zod-backed types in `packages/contracts` (`@bm/contracts`) — no locally redefined domain shapes.
- [ ] Task 3: Snapshot tests (AC: #3)
  - [ ] vitest snapshot tests covering each component's visual contract.
- [ ] Task 4: Tests wrap-up (AC: all)
  - [ ] Ensure snapshot + prop-type coverage for all six components. Test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
