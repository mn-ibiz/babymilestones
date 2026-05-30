# Story 30.2: Public event listing + detail page

Status: done

> Canonical ID: P4-E05-S02 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S02.md

## Story

As parent or guest,
I want to browse upcoming events,
so that the capability described above is delivered.

## Acceptance Criteria

1. Public list on `apps/platform` (public group).
2. Each event detail page shows tiers, remaining capacity per tier, "Buy ticket" CTAs.
3. SEO-friendly URLs.

## Tasks / Subtasks

- [x] Task 1: Implement Public event listing + detail page (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Public (unauthenticated) API group `GET /public/events` lists published, non-deleted, upcoming events; the platform public group consumes it.
  - [x] Satisfy AC#2: `GET /public/events/:slug` returns each tier with `remaining` capacity, `soldOut`, and `isFree` flags so the detail page can render tiers + "Buy ticket" CTAs.
  - [x] Satisfy AC#3: SEO-friendly slug URLs (detail resolves by slug or id).
- [x] Task 2: Tests (AC: all)
  - [x] vitest integration (PGlite) covering only-published/upcoming listing, no-auth, include_past, per-tier remaining/sold-out/free flags, slug+id detail, and 404 rules. 6/6 green.

### File List
- apps/api/src/routes/public/events.ts (public listing + detail)
- apps/api/src/routes/public/index.ts (public route group)
- apps/api/src/routes/public/events.test.ts
- apps/api/src/app.ts (registerPublicRoutes wired)
- packages/contracts/src/index.ts (PublicEventDto / PublicEventTierDto)

### Completion Notes
- New unauthenticated `/public/*` Fastify route group. Listing is published +
  non-deleted + upcoming by default; `?include_past=1` includes past published
  events. Per-tier `remaining = allotment - sold`; `sold` is 0 until ticketing
  lands in 30-3, at which point the public route will count issued/checked-in
  tickets. Detail 404s for draft/cancelled(deleted)/unknown. `tsc --noEmit`
  clean (contracts, api); events.test.ts 6/6.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S02.md]
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
