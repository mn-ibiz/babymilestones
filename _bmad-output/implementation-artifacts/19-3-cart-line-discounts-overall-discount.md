# Story 19.3: Cart + line discounts + overall discount

Status: backlog

> Canonical ID: P2-E04-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S03.md

## Story

As cashier,
I want to manage the active sale: adjust quantities, apply discounts, see totals,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cart shows lines with qty +/-, remove, line discount %.
2. Overall discount % or KES.
3. Totals recompute live; tax shown per line per `services.tax_treatment` semantics.
4. Stock check at "Pay" step; insufficient stock → block + clear error.

## Tasks / Subtasks

- [ ] Task 1: Implement Cart + line discounts + overall discount (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Cart shows lines with qty +/-, remove, line discount %.
  - [ ] Satisfy AC#2: Overall discount % or KES.
  - [ ] Satisfy AC#3: Totals recompute live; tax shown per line per `services.tax_treatment` semantics.
  - [ ] Satisfy AC#4: Stock check at "Pay" step; insufficient stock → block + clear error.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
