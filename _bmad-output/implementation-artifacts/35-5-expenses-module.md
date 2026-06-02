# Story 35.5: Expenses module

Status: review

> Canonical ID: P5-E05-S05 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S05.md

## Story

As accountant, I want to record expenses against business units and shared overhead.

## Acceptance Criteria

1. `expenses` table: date, category, business_unit_id (nullable), amount, payment_method, reference, receipt_attachment_url, recurring_template_id (nullable).
2. Admin/accountant CRUD.
3. Recurring expenses auto-create on the configured day.
4. Expenses subtract from unit revenue in P&L.

## Tasks / Subtasks

- [ ] Task 1: Implement Expenses module (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: `expenses` table: date, category, business_unit_id (nullable), amount, payment_method, reference, receipt_attachment_url, recurring_template_id (nullable).
  - [ ] Satisfy AC#2: Admin/accountant CRUD.
  - [ ] Satisfy AC#3: Recurring expenses auto-create on the configured day.
  - [ ] Satisfy AC#4: Expenses subtract from unit revenue in P&L.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
