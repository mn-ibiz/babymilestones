# Story 26.3: Admin manual loyalty adjustment

Status: backlog

> Canonical ID: P3-E04-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S03.md

## Story

As admin, I want to credit or debit a parent's points balance for goodwill or correction.

## Acceptance Criteria

1. Admin Reception → parent → loyalty → "Adjust" → amount + reason text.
2. Writes a `loyalty_ledger` row with `kind='adjustment'`, `posted_by=admin_user`.
3. Audit logged.
4. Permission: `admin`, `super_admin`.

## Tasks / Subtasks

- [ ] Task 1: Implement Admin manual loyalty adjustment (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Admin Reception → parent → loyalty → "Adjust" → amount + reason text.
  - [ ] Satisfy AC#2: Writes a `loyalty_ledger` row with `kind='adjustment'`, `posted_by=admin_user`.
  - [ ] Satisfy AC#3: Audit logged.
  - [ ] Satisfy AC#4: Permission: `admin`, `super_admin`.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
