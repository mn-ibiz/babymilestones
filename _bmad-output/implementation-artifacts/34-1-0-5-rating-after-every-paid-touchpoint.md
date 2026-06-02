# Story 34.1: 0–5 rating after every paid touchpoint

Status: done

> Canonical ID: P5-E04-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S01.md

## Story

As parent,
I want to rate every interaction in one tap,
so that the business improves.

## Acceptance Criteria

1. Triggered when a `bookings.status='completed'` event fires (salon checkout, play pickup, talent class end, doula session end, order fulfilled).
2. SMS-stub link OR in-app prompt; one-tap 0–5 stars + optional 200-char comment.
3. Single submission per touchpoint; idempotent.
4. Decision refs: Spec Module 7.

## Tasks / Subtasks

- [ ] Task 1: Implement 0–5 rating after every paid touchpoint (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Triggered when a `bookings.status='completed'` event fires (salon checkout, play pickup, talent class end, doula session end, order fulfilled).
  - [ ] Satisfy AC#2: SMS-stub link OR in-app prompt; one-tap 0–5 stars + optional 200-char comment.
  - [ ] Satisfy AC#3: Single submission per touchpoint; idempotent.
  - [ ] Satisfy AC#4: Decision refs: Spec Module 7.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`feedback` table: source_type, source_id, parent_id, attributed_staff_id, rating, comment, submitted_at.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E03 - P3-E03 - P4-E02
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
