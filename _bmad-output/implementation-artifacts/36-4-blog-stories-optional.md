# Story 36.4: Blog / stories (optional)

Status: backlog

> Canonical ID: P5-E06-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S04.md

## Story

As marketing, I want to publish parenting articles for SEO and parent engagement.

## Acceptance Criteria

1. Article model with title, slug, body (MDX), cover image, tags, author.
2. Admin CRUD.
3. Public list + detail pages; share buttons.
4. This is flagged optional — cut if P5 is tight.

## Tasks / Subtasks

- [ ] Task 1: Implement Blog / stories (optional) (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Article model with title, slug, body (MDX), cover image, tags, author.
  - [ ] Satisfy AC#2: Admin CRUD.
  - [ ] Satisfy AC#3: Public list + detail pages; share buttons.
  - [ ] Satisfy AC#4: This is flagged optional — cut if P5 is tight.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S04.md]
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
