# Story 12.2: Per-unit pages

Status: ready-for-dev

> Canonical ID: P1-E12-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S02.md

## Story

As a visitor,
I want a page per unit with what it offers and a "Book now" CTA,
so that I can explore a specific unit and start booking.

## Acceptance Criteria

1. Pages: `/play`, `/talent`, `/salon`, `/events`, `/coaching`. The Toy Shop is an **external link** to the standalone WooCommerce site (no `/shop` route in this app).
2. Each: photo, short copy, examples, "Book now" CTA → signup if not logged in.
3. Content sourced from MDX or DB (admin-editable in P5 polish).

## Tasks / Subtasks

- [ ] Task 1: Build per-unit pages in `apps/platform` public route group (AC: #1, #2)
  - [ ] Create routes `apps/platform/app/(public)/play`, `/talent`, `/salon`, `/events`, `/coaching` (server-rendered)
  - [ ] Each page: photo, short copy, examples, "Book now" CTA → routes to signup when not logged in
  - [ ] Do NOT create a `/shop` route — Toy Shop is an external WooCommerce link surfaced in nav/footer
- [ ] Task 2: Content source (AC: #3)
  - [ ] Source unit content from MDX (or DB) — structure so admin-editable DB content can replace it in P5 without route changes
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: all five unit routes render with photo/copy/examples/CTA; "Book now" → signup when unauthenticated; no `/shop` route exists; Toy Shop link is external. Use vitest, test-first.

## Dev Notes

- Marketing surface in `apps/platform` public route group, building on the home page (P1-E12-S01). UI primitives/tokens from `packages/ui` / `packages/config`.
- Content from MDX or DB now; structured for admin-editable DB content in P5. "Book now" routes to the sign-in/sign-up entry (P1-E12-S04) when unauthenticated.
- Toy Shop is the standalone WooCommerce site (separate system per project memory) — external link only; explicitly no `/shop` route.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/platform/app/(public)/{play,talent,salon,events,coaching}/`. Content via MDX/DB. CTA → P1-E12-S04 signup.
- Depends on S01 (home page) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E12.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
