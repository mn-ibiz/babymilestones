# Story 33.1: Live SMS adapter (provider-agnostic)

Status: backlog

> Canonical ID: P5-E03-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S01.md

## Story

As the system, I want to actually send SMS instead of logging stubs.

## Acceptance Criteria

1. New implementation `LiveSmsAdapter` reads provider config from `sms_config`.
2. Posts to the configured URL with auth as per provider.
3. Records send result + provider message ID in `sms_outbox`.
4. SSRF guard (P1-E09-S02) re-validated.
5. Decision refs: 19.

## Tasks / Subtasks

- [ ] Task 1: Implement Live SMS adapter (provider-agnostic) (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: New implementation `LiveSmsAdapter` reads provider config from `sms_config`.
  - [ ] Satisfy AC#2: Posts to the configured URL with auth as per provider.
  - [ ] Satisfy AC#3: Records send result + provider message ID in `sms_outbox`.
  - [ ] Satisfy AC#4: SSRF guard (P1-E09-S02) re-validated.
  - [ ] Satisfy AC#5: Decision refs: 19.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Provider-agnostic shape — works with Africa's Talking, Twilio, or others per Decision 19.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E09.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
