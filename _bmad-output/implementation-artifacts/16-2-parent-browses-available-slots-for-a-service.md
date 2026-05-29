# Story 16.2: Parent browses available slots for a service

Status: done

> Canonical ID: P2-E01-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S02.md

## Story

As parent,
I want to see this week's available Play / Talent slots,
so that I can book what fits.

## Acceptance Criteria

1. Service detail page shows a 7-day grid with available slots + remaining capacity.
2. Slots filtered to those the child's age fits (uses `services.age_min` / `age_max`).
3. Past slots greyed out; today's earlier slots disabled.
4. Loads ≤500ms p95.

## Tasks / Subtasks

- [x] Task 1: Implement Parent browses available slots for a service (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: 7-day grid + remaining capacity (`browseServiceSlots`, `AVAILABILITY_WINDOW_DAYS`, `buildWeekGrid`; page renders `lg:grid-cols-7`).
  - [x] Satisfy AC#2: age filter via new `services.age_min_months`/`age_max_months` + `slotFitsAge` + `ageInMonths`; eligible:false → empty + notice.
  - [x] Satisfy AC#3: `isSlotPast` (earlier date / ended today) → `slotState` greys past + disables full; `aria-disabled`.
  - [x] Satisfy AC#4: index-backed query (`session_slots (service_id, slot_date)`), two bounded queries, no N+1. (Structural; not load-measured.)
  - [x] Touch / create: parent API `GET /parents/me/services/:id/availability` + `/bookable-services`; page at `/book/service/[serviceId]` (+ `/book` list, Home link) — `[service]` would collide with the `/book/[unit]` deep-link, so a static `service/` segment disambiguates.
- [x] Task 2: Tests (AC: all)
  - [x] catalog browse logic (4), API integration (10), platform lib (3). Full suite green; platform `next build` verified (no route collision).

## Dev Notes

Indexed query on `session_slots`. `apps/platform/app/(app)/book/[service]/page.tsx`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E11
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- **AC1** 7-day grid: `browseServiceSlots` (catalog) over `[today, today+6]` with remaining capacity; `buildWeekGrid` (platform lib) renders a column per day; page grid `lg:grid-cols-7`.
- **AC2** age filter: new `services.age_min_months`/`age_max_months` (migration 0043, guarded CHECK); `slotFitsAge` rule; route computes `ageInMonths(child.dob)` and returns `eligible:false` + empty when out of range. Admin service create/update accept + persist the range.
- **AC3** `isSlotPast` (earlier date OR ended today) + `slotState` (past greyed/strikethrough, full disabled). `windowStart` returned so the client grid never drifts from the server window.
- **AC4** index-backed (`session_slots (service_id, slot_date)`); two bounded queries, no N+1. Structural — not load-measured (noted).
- Reachability: parent `GET /parents/me/bookable-services`, `/book` listing page, Home "Book a session" link.

### File List

- `packages/db/migrations/0043_service_age_range.sql` (new), `packages/db/src/schema/services.ts` (age cols)
- `packages/contracts/src/index.ts` (age fields on service schemas, `slotFitsAge`, `AvailableSlot`/`ServiceAvailability`/`BookableService`)
- `packages/catalog/src/schedules.ts` (`browseServiceSlots`, `isSlotPast`, `BrowseSlot`), `services.ts` (age fields), `index.ts`
- `apps/api/src/routes/parents/availability.ts` (new) + `index.ts`; `apps/api/src/routes/admin/services.ts` (age serialize + merged-range validation)
- `apps/platform/lib/book-slots.ts`, `book-slots-api.ts` (new); `app/(app)/book/service/[serviceId]/page.tsx`, `app/(app)/book/page.tsx` (new); `app/(app)/home/page.tsx` (link)
- Tests: `schedules.test.ts`, `availability.test.ts`, `services.test.ts`, `book-slots.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewers:** Blind+Edge Hunter, Acceptance Auditor.

Resolved: **(Critical) route collision** — `(app)/book/[service]` clashed with the `(public)/book/[unit]` deep-link (Next forbids differing slug names at one path → build break); relocated to `/book/service/[serviceId]`, verified with a real `next build`. **(High) non-idempotent migration** — guarded `ADD CONSTRAINT` in a `DO`-block (migrate.ts re-runs all files). **(High) orphan page** — added `/bookable-services` API, `/book` listing, Home link. **(Med) one-sided age PATCH → 500** — merge-validate against the stored row → 400. **(Low) UTC-midnight grid drift** — return `windowStart`. **(Low) stale grid on child switch** — reset + inline error. **(Low) archived child accepted** — now 404.

Dismissed: "earlier today" uses slot END (a running session is still joinable — intentional); AC4 p95 unmeasured (index-backed, can't unit-test); cancellation capacity (deferred to 16-6).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC4 + code-review (8 fixes incl. critical route collision). Full suite green; platform build verified. Status → done. | bmad-dev-story + code-review |
