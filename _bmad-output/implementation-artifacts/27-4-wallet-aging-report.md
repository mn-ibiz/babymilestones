# Story 27.4: Wallet aging report

Status: backlog

> Canonical ID: P3-E05-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S04.md

## Story

As accountant, I want to see how long outstanding balances have been open.

## Acceptance Criteria

1. Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days.
2. Per-parent rows under each bucket; clickable to parent profile.
3. CSV export.

## Tasks / Subtasks

- [ ] Task 1: Implement Wallet aging report (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days.
  - [ ] Satisfy AC#2: Per-parent rows under each bucket; clickable to parent profile.
  - [ ] Satisfy AC#3: CSV export.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
