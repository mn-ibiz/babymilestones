# Story 16.4: Reception books on behalf of a walk-in

Status: done

> Canonical ID: P2-E01-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S04.md

## Story

As Reception, I want to book a slot for a walk-in parent at the counter.

## Acceptance Criteria

1. From parent profile → "New booking" → service picker → slot picker → child picker → confirm.
2. Same atomicity guarantees as parent self-book.
3. Attribution captured if service requires it.

## Tasks / Subtasks

- [x] Task 1: Implement Reception books on behalf of a walk-in (AC: #1, #2, #3)
  - [x] Satisfy AC#1: reception read endpoints (bookable-services, parent's children, availability) + standalone `/reception/booking?parentId=` page (service → child → slot → confirm).
  - [x] Satisfy AC#2: same `bookSlot` engine (slot lock, capacity, snapshotted pending invoice, atomic audit) as the parent self-book.
  - [x] Satisfy AC#3: attribution validated via `checkBookingAttribution` (required-role → matching active staff; name snapshotted); retired staff rejected.
- [x] Task 2: Tests (AC: all)
  - [x] catalog `bookSlot` attribution path; API reception integration (10 — attribution matrix, RBAC, read endpoints, PII guard). Both apps build; full suite green.

## Dev Notes

Reuses S03 server flow; Reception UI shells it.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S03 - P1-E05
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `bookSlot` gained additive `staffId`/`staffNameSnapshot` (default null/"") — self-book unaffected.
- `POST /reception/bookings` (rbac `create payment`): ownership, archived-child, active-service, past-slot, age checks, then attribution via `checkBookingAttribution` (required-role → active matching staff; name snapshot), then `bookSlot`. SMS + atomic audit as in S03.
- Reception read endpoints (`/reception/bookable-services`, `/reception/parents/:id/children`, `…/services/:sid/availability`) gated to booking-capable staff (so a parent can't enumerate others' children).
- Admin `/reception/booking?parentId=` page (Suspense-wrapped) + pure `booking-flow.ts` lib.

### File List

- `packages/catalog/src/schedules.ts` (`bookSlot` staffId/attribution)
- `packages/contracts/src/index.ts` (`receptionBookingCreateSchema`)
- `apps/api/src/routes/reception/booking.ts` (new) + `index.ts`
- `apps/admin/lib/booking-flow.ts` + test (new); `apps/admin/app/reception/booking/page.tsx` (new)
- Tests: `reception/booking.test.ts`, `catalog/schedules.test.ts`, `admin/lib/booking-flow.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(High, security/IDOR) reception read endpoints used bare `validateSession`** — a parent session could enumerate any parent's children/availability; now gated to `create payment` staff (rejects parents). **(Low) staff attribution to a retired member** for non-attribution services — now 422. **(Low) post-confirm refetch could clobber the success flash** — refetch errors swallowed.

Dismissed: admin edge middleware gates on session presence only (role enforced at the API; consistent with the existing reception surface — reception reaches the page, API enforces `create payment`); availability serialization duplicated (currently identical; documented); UTC vs EAT (codebase convention). The named-staff picker UI is a follow-on (attribution-required services surface a clear API error in the meantime).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC3 + code-review (3 fixes incl. an IDOR security fix). Full suite green; both apps build. Status → done. | bmad-dev-story + code-review |
