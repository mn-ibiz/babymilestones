# Story 30.4: Free events (RSVP only)

Status: done

> Canonical ID: P4-E05-S04 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S04.md

## Story

As admin, I want some events to be free RSVP for capacity tracking only.

## Acceptance Criteria

1. Tier with `price_cents=0` → no payment, just RSVP.
2. RSVP collects same info as ticket purchase minus payment.
3. SMS-stub confirmation sent.

## Tasks / Subtasks

- [x] Task 1: Implement Free events (RSVP only) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Tier with `price_cents=0` → no payment, just RSVP (issued immediately, order status `free`).
  - [x] Satisfy AC#2: RSVP collects the same info as ticket purchase minus payment (name/phone/optional email; no provider).
  - [x] Satisfy AC#3: SMS-stub confirmation sent (`event.rsvp` template with the ticket code(s)).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (real PGlite): free-RSVP immediate issuance + codes, capacity 409, and the RSVP SMS-stub row.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C apps/api exec vitest run src/routes/public/tickets.test.ts` → 7/7 passed (free-RSVP + SMS cases included).
- `pnpm -C apps/api exec vitest run` → 549/549 passed; `tsc --noEmit` clean across api/contracts/db/auth/sms.

### Completion Notes List

- Free RSVP shares the 30-3 guest-checkout endpoint `POST /public/events/:slug/tickets`. A tier
  with `price_cents = 0` skips all payment: tickets issue immediately, the `ticket_orders` row is
  created with status `free`, and 201 is returned with the issued codes.
- Same buyer info as a paid purchase minus payment — `buyerName` + `buyerPhone` required,
  `buyerEmail` optional, no `provider`. Capacity is enforced identically (over-cap → 409).
- SMS-stub confirmation uses the new `event.rsvp` template (event name, quantity, code(s)).
  Audited as `ticket.rsvp.created` (anonymous actor).
- No new schema or migration beyond 30-3 (the `ticket_orders.status = 'free'` enum value and the
  `tickets` table already cover RSVP). This story is the RSVP-only slice of the shared route.

### File List

(Delivered with 30-3 — same shared route + tables.)
- `apps/api/src/routes/public/tickets.ts` — free-tier branch (immediate issuance, `event.rsvp` SMS).
- `apps/api/src/routes/public/tickets.test.ts` — free-RSVP + SMS-stub coverage.
- `packages/sms/src/templates.ts` — `event.rsvp` renderer.
- `packages/db/migrations/0069_tickets.sql` — `ticket_orders.status` includes `free`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Free RSVP-only path verified (shared 30-3 route; price_cents=0 → immediate issuance + event.rsvp SMS) | Claude Opus 4.8 (1M context) |
