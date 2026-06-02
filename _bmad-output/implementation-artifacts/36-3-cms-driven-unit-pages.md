# Story 36.3: CMS-driven unit pages

Status: done

> Canonical ID: P5-E06-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S03.md

## Story

As admin (non-developer), I want to edit unit pages without a deploy.

## Acceptance Criteria

1. Admin → Pages → CRUD for unit pages: hero copy, image, CTA, body sections.
2. Preview before publish.
3. Revisions retained.

## Tasks / Subtasks

- [ ] Task 1: Implement CMS-driven unit pages (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Admin → Pages → CRUD for unit pages: hero copy, image, CTA, body sections.
  - [ ] Satisfy AC#2: Preview before publish.
  - [ ] Satisfy AC#3: Revisions retained.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Lightweight CMS in DB; renders on platform public group.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E12 - P1-E10
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
