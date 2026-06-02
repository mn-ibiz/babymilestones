# Story 29.3: Print packing slip

Status: done

> Canonical ID: P4-E04-S03 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S03.md

## Story

As packer,
I want to print a packing slip per WooCommerce order,
so that I can pack and dispatch it.

## Acceptance Criteria

1. "Print packing slip" button on order card.
2. Slip lists: Woo order number, customer name + phone, shipping address (from Woo), delivery method, line items + qty, customer note / special instructions.
3. Uses system default printer (Decision 13).
4. Slip is rendered from the local `wc_orders` mirror — no live Woo call required at print time.

## Tasks / Subtasks

- [x] Task 1: Implement Print packing slip (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: "Print packing slip" button on order card.
  - [x] Satisfy AC#2: Slip lists: Woo order number, customer name + phone, shipping address (from Woo), delivery method, line items + qty, customer note / special instructions.
  - [x] Satisfy AC#3: Uses system default printer (Decision 13).
  - [x] Satisfy AC#4: Slip is rendered from the local `wc_orders` mirror — no live Woo call required at print time.
- [x] Task 2: Tests (AC: all)
  - Unit: template renders with required fields; missing address falls back to "Pickup in store" note.

## Dev Notes

- Reuses the receipt rendering pipeline from P1-E08 where possible; packing slip is a distinct template (no price totals required, but qty is mandatory).

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E08 (receipt engine / PDF render)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Built the packing slip as a pure view-model `toPackingSlip(row)` in `@bm/contracts`
  (`packing-slip.ts`). It is UNARY by design — it takes only a `wc_orders` mirror row
  and has no Woo client in its signature, so a print-time render can never make a live
  Woo call (AC4). Every field is extracted from the stored `payload`, validated through
  the existing `wooOrderSchema` (which `.passthrough()`es shipping / customer_note), so a
  malformed payload degrades gracefully. It carries the FULL customer phone (the packer
  needs to reach the customer — unlike the on-screen card, which masks the phone) and NO
  price totals (AC2: qty mandatory, no totals).
- Pickup-in-store fallback (test hint): an order with no real shipping street address
  yields an empty `shippingAddress`, `pickupInStore: true`, and a `deliveryMethod` of
  "Pickup in store". A shipping block carrying only a country is treated as a pickup.
- Reused the P1-E08 receipt render pipeline: `renderPackingSlipHtml` in `@bm/ui`
  (`packing-slip-document.ts`) is modelled on `renderReceiptA4` — same self-contained,
  dependency-light printable A4 HTML approach, brand tokens from `@bm/config`, inline SVG
  logo, and the same HTML-escaping of all interpolated text — but it is a DISTINCT
  template with a Qty/Item table and NO price totals.
- AC3 / Decision 13 (system default printer): `printPackingSlip(slip, win?)` in
  `apps/pos/lib/packing-slip-print.ts` mirrors the reception-receipt print path — it
  writes the rendered self-contained HTML into a fresh print window and calls
  `print()`, which targets the browser/OS default printer. SSR-safe and popup-blocker
  safe (returns false). It renders from the `PackingSlip` the card already holds.
- The `OnlineOrderCard` now carries a `packingSlip` field built from the SAME mirror row
  by `toOnlineOrderCard`, so the POS prints with no second fetch and never a live Woo
  call at print time (AC4). The order card in `OnlineOrders.tsx` renders a "Print packing
  slip" button (AC1) wired to `printPackingSlip(order.packingSlip)`.
- Tests follow the existing conventions: contracts/ui templates are tested as pure string
  functions; the POS print path is tested against a mocked window (no real dialog); the
  POS components are tested via `renderToStaticMarkup` (the repo's no-jsdom convention).
- No migration (renders from the existing `wc_orders` mirror). No audit action added —
  printing a slip is read-derived and the AC does not require a forensic trail.

### File List

- packages/contracts/src/packing-slip.ts (new)
- packages/contracts/src/packing-slip.test.ts (new)
- packages/contracts/src/woocommerce-orders.ts (modified — `packingSlip` on the card)
- packages/contracts/src/index.ts (modified — export `packing-slip.js`)
- packages/ui/src/packing-slip-document.ts (new)
- packages/ui/src/packing-slip-document.test.ts (new)
- packages/ui/src/index.ts (modified — export the packing-slip render)
- apps/pos/lib/packing-slip-print.ts (new)
- apps/pos/lib/packing-slip-print.test.ts (new)
- apps/pos/lib/online-orders.test.ts (modified — card factory carries `packingSlip`)
- apps/pos/app/components/OnlineOrders.tsx (modified — Print packing slip button)
- apps/pos/app/components/OnlineOrders.test.tsx (modified — button + card `packingSlip`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | v1.0 | Print packing slip implemented (TDD) — mirror-only view-model, distinct A4 template, default-printer path, POS button | Amelia (dev-story) |
