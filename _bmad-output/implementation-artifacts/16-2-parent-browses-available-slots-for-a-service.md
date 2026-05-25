# Story 16.2: Parent browses available slots for a service

Status: ready-for-dev

> Canonical ID: P2-E01-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S02.md

## Story

As parent,
I want to see this week's available Play / Talent slots,
so that I can book what fits.

## Acceptance Criteria

1. Service detail page shows a 7-day grid with available slots + remaining capacity.
2. Slots filtered to those the child's age fits (uses `services.age_min` / `age_max`).
3. Past slots greyed out; today's earlier slots disabled.
4. Loads ≤500ms p95.

## Tasks / Subtasks

- [ ] Task 1: Implement Parent browses available slots for a service (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Service detail page shows a 7-day grid with available slots + remaining capacity.
  - [ ] Satisfy AC#2: Slots filtered to those the child's age fits (uses `services.age_min` / `age_max`).
  - [ ] Satisfy AC#3: Past slots greyed out; today's earlier slots disabled.
  - [ ] Satisfy AC#4: Loads ≤500ms p95.
  - [ ] Touch / create: `apps/platform/app/(app)/book/[service]/page.tsx`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Indexed query on `session_slots`. `apps/platform/app/(app)/book/[service]/page.tsx`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E11
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S02.md]
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
