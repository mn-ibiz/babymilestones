# Story 18.3: Pickup handoff with free-text observations

Status: backlog

> Canonical ID: P2-E03-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S03.md

## Story

As the attendant, I want to record what happened today in 9 seconds and SMS the parent.

## Acceptance Criteria

1. Child card → "Hand over" → screen with: mood picker (5 emojis, default 😊), activity chips (configurable list), single optional free-text line.
2. Confirm → records `attendance.checked_out_at`, observation row, sends SMS-stub summary to parent.
3. Voice-to-text button available on tablet.
4. Receipt automatically generated for the visit.

## Tasks / Subtasks

- [ ] Task 1: Implement Pickup handoff with free-text observations (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Child card → "Hand over" → screen with: mood picker (5 emojis, default 😊), activity chips (configurable list), single optional free-text line.
  - [ ] Satisfy AC#2: Confirm → records `attendance.checked_out_at`, observation row, sends SMS-stub summary to parent.
  - [ ] Satisfy AC#3: Voice-to-text button available on tablet.
  - [ ] Satisfy AC#4: Receipt automatically generated for the visit.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Compound: `PickupHandoffScreen`. Designed for ≤9 seconds typical hand-off.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P1-E08 - P1-E09
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S03.md]
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
