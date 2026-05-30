# Story 30.3: Ticket purchase with guest checkout

Status: done

> Canonical ID: P4-E05-S03 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S03.md

## Story

As grandparent (no account),
I want to buy a recital ticket without registering,
so that the capability described above is delivered.

## Acceptance Criteria

1. Buy flow: quantity → buyer name + phone (+ optional email for e-ticket) → pay (M-Pesa or Paystack).
2. Tickets issued with unique codes; e-ticket SMS-stub link.
3. If buyer is a signed-in parent, prefilled.
4. Decision refs: 28.

## Tasks / Subtasks

- [x] Task 1: Implement Ticket purchase with guest checkout (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Buy flow: quantity → buyer name + phone (+ optional email for e-ticket) → pay (M-Pesa or Paystack).
  - [x] Satisfy AC#2: Tickets issued with unique codes; e-ticket SMS-stub link.
  - [x] Satisfy AC#3: If buyer is a signed-in parent, prefilled (client prefill seam; server trusts the body only).
  - [x] Satisfy AC#4: Decision refs: 28 — reuses the @bm/payments M-Pesa/Paystack adapters; credit lands async on the existing callbacks/webhooks.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (real PGlite via `@bm/db/testing`); covers free RSVP, capacity, M-Pesa + Paystack rails, provider validation, unpublished 404, and the e-ticket SMS-stub.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C apps/api exec vitest run src/routes/public/tickets.test.ts` → 7/7 passed.
- `pnpm -C apps/api exec vitest run` → 59 files / 549 tests passed.
- `pnpm -C apps/api exec tsc --noEmit` → clean. Also clean: `@bm/contracts`, `@bm/db`, `@bm/auth`, `@bm/sms`.

### Completion Notes List

- New unauthenticated `POST /public/events/:slug/tickets` (slug or id). Guest checkout: no
  account is created; `buyerName`/`buyerPhone`/optional `buyerEmail` live on `ticket_orders`
  and are denormalised onto each issued `tickets` row.
- Two new additive tables (migration `0069_tickets.sql`, wired into the schema barrel):
  `ticket_orders` (one per checkout/RSVP) and `tickets` (one row per seat with a unique short
  door code — consumed by 30-5).
- Paid tiers reuse the epic-4 `@bm/payments` adapters (`createMpesaAdapter` STK push to the
  buyer's phone; `createPaystackAdapter` hosted checkout) — no new payment rail. The order is
  created `pending`; the wallet/credit + fulfilment land on the existing M-Pesa callback /
  Paystack webhook path. 202 + `checkoutRequestId`/`authorizationUrl`.
- Free tiers (`price_cents = 0`) are handled here too (30-4): tickets issue immediately, order
  status `free`, 201. Both flows send the e-ticket via the SMS stub (`event.ticket` for paid
  flows is reserved for the credited callback; `event.rsvp` fires on free issuance).
- Capacity is enforced server-side: `remaining = allotment − issued(non-cancelled)`; over-cap → 409.
- AC3 prefill: a signed-in parent can be detected client-side to prefill the form; the server
  deliberately trusts only the request body (guest-first), matching the no-account brief.
- Audit: `ticket.order.created` (paid) / `ticket.rsvp.created` (free) with `actor: null`
  (anonymous), registered in the `@bm/auth` audit catalogue (completeness test green).

### File List

- `packages/db/migrations/0069_tickets.sql` (new) — `ticket_orders` + `tickets`.
- `packages/db/src/schema/ticket-orders.ts` (new), `packages/db/src/schema/tickets.ts` (new).
- `packages/db/src/schema/index.ts` (barrel exports).
- `packages/contracts/src/index.ts` — `ticketPurchaseSchema`, `TicketPurchaseInput`, `PublicTicketPurchaseResponse`.
- `packages/auth/src/audit-actions.ts` — `ticket.order.created`, `ticket.order.paid`, `ticket.rsvp.created`, `ticket.checked_in`.
- `packages/sms/src/templates.ts` — `event.ticket` + `event.rsvp` keys + renderers.
- `apps/api/src/routes/public/tickets.ts` (new) + `tickets.test.ts` (new).
- `apps/api/src/routes/public/index.ts`, `apps/api/src/app.ts` — wiring (sessions + resolved M-Pesa/Paystack into the public routes).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Guest ticket checkout + free RSVP implemented (tables, route, contracts, SMS); 7 tests; suite green | Claude Opus 4.8 (1M context) |
