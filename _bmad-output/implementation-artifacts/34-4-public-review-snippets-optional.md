# Story 34.4: Public review snippets (optional)

Status: backlog

> Canonical ID: P5-E04-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S04.md

## Story

As marketing, I want top-rated comments visible on the public site as social proof.

## Acceptance Criteria

1. Admin curates which 5-star comments to publish; anonymisation enforced ("Parent of two, Nairobi").
2. Public site shows curated quotes on home page.
3. Audit on publication.

## Tasks / Subtasks

- [ ] Task 1: Implement Public review snippets (optional) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Admin curates which 5-star comments to publish; anonymisation enforced ("Parent of two, Nairobi").
  - [ ] Satisfy AC#2: Public site shows curated quotes on home page.
  - [ ] Satisfy AC#3: Audit on publication.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P5-E06. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S04.md]
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
