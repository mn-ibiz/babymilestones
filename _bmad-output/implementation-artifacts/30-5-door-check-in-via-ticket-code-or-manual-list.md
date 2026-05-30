# Story 30.5: Door check-in via ticket code or manual list

Status: done

> Canonical ID: P4-E05-S05 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S05.md

## Story

As event staff, I want to admit ticket holders quickly.

## Acceptance Criteria

1. Check-in screen lists all sold tickets; search by name/phone/code.
2. Mark "checked in"; double-scan blocked.
3. Capacity-against-checkedin counter visible.
4. Code scanner support (browser camera) deferred to P5 polish.

## Tasks / Subtasks

- [ ] Task 1: Implement Door check-in via ticket code or manual list (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Check-in screen lists all sold tickets; search by name/phone/code.
  - [ ] Satisfy AC#2: Mark "checked in"; double-scan blocked.
  - [ ] Satisfy AC#3: Capacity-against-checkedin counter visible.
  - [ ] Satisfy AC#4: Code scanner support (browser camera) deferred to P5 polish.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03. --- *End of P4 stories.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
