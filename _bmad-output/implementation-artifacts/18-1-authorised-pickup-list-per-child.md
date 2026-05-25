# Story 18.1: Authorised pickup list per child

Status: backlog

> Canonical ID: P2-E03-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S01.md

## Story

As parent,
I want to nominate who can collect my child,
so that the attendant knows it's safe.

## Acceptance Criteria

1. Per-child list of authorised pickups: name, phone, optional photo URL, relationship.
2. Parent CRUDs from dashboard.
3. Audit on every change.

## Tasks / Subtasks

- [ ] Task 1: Implement Authorised pickup list per child (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Per-child list of authorised pickups: name, phone, optional photo URL, relationship.
  - [ ] Satisfy AC#2: Parent CRUDs from dashboard.
  - [ ] Satisfy AC#3: Audit on every change.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`child_pickup_authorisations` table.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
