# Story 16.4: Reception books on behalf of a walk-in

Status: backlog

> Canonical ID: P2-E01-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S04.md

## Story

As Reception, I want to book a slot for a walk-in parent at the counter.

## Acceptance Criteria

1. From parent profile → "New booking" → service picker → slot picker → child picker → confirm.
2. Same atomicity guarantees as parent self-book.
3. Attribution captured if service requires it.

## Tasks / Subtasks

- [ ] Task 1: Implement Reception books on behalf of a walk-in (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: From parent profile → "New booking" → service picker → slot picker → child picker → confirm.
  - [ ] Satisfy AC#2: Same atomicity guarantees as parent self-book.
  - [ ] Satisfy AC#3: Attribution captured if service requires it.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Reuses S03 server flow; Reception UI shells it.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S03 - P1-E05
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
