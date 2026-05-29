# Story 16.7: Bookings list on parent dashboard

Status: done

> Canonical ID: P2-E01-S07 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S07.md

## Story

As parent,
I want to see what I've booked, what's coming up, and what's done,
so that the capability described above is delivered.

## Acceptance Criteria

1. Upcoming, today, past tabs; per-row: service, child, date, status, attendance.
2. Tap → detail with reschedule/cancel CTAs subject to AC of S05/S06.

## Tasks / Subtasks

- [x] Task 1: Implement Bookings list on parent dashboard (AC: #1, #2)
  - [x] Satisfy AC#1: `GET /parents/me/bookings` + `categorizeBookings` → Upcoming/Today/Past tabs; per-row service, child, date, status, attendance label.
  - [x] Satisfy AC#2: per-row reschedule + cancel CTAs gated on server-computed `canModify` (S05/S06 cut-off); inline reschedule slot-picker + cancel both call the S05/S06 endpoints.
- [x] Task 2: Tests (AC: all)
  - [x] platform lib (categorize + label + past order — 3); API list endpoint (status/isPast/canModify, 401). Full suite green; platform `next build` verified.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S07.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `GET /parents/me/bookings` joins bookings↔session_slots↔children↔services (slot bookings only), computes `isPast` + `canModify` (cut-off) server-side.
- Platform `categorizeBookings` (Upcoming/Today/Past, past most-recent-first) + `attendanceLabel`; `/bookings` page with tabs, rows, inline Cancel + inline Reschedule slot-picker (reuses availability + S05/S06 endpoints). Home link added.
- Completes Epic 16 (Booking Engine), 7/7.

### File List

- `packages/contracts/src/index.ts` (`ParentBooking`)
- `apps/api/src/routes/parents/booking.ts` (`GET /parents/me/bookings`)
- `apps/platform/lib/bookings-list.ts` + test; `lib/book-slots-api.ts` (`fetchParentBookings`/`cancelBookingRequest`/`rescheduleBookingRequest`)
- `apps/platform/app/(app)/bookings/page.tsx` (new); `app/(app)/home/page.tsx` (link); `apps/platform/middleware.ts` (deep-link public-path fix)
- Tests: `parents/booking.test.ts`, `platform/lib/bookings-list.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(Med) `/bookings` mis-classified public** — the `/book` `startsWith` public-path prefix also matched `/bookings` (and the authed `/book` pages); replaced with a precise deep-link regex `^/book/[^/]+$` so only `/book/<unit>` is public. **(Med) faked "Attended" label** — relabelled to "Past" (no real check-in signal until epic 18). **(Low) Past tab order** — now most-recent-first. **(Low) reload error trap** — `reload` resets the error so a transient refetch failure can't strand the user.

Verified: list scoped to the session parent (401 unauth); cancelled bookings remain listed; `canModify` can't drift from the cut-off endpoints (shared helper); single 3-join query (no N+1).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC2 (tabs + CTAs) + code-review (4 fixes incl. a public-path misclassification). Epic 16 complete (7/7). Status → done. | bmad-dev-story + code-review |
