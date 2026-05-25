# Story 29.5: Stock push: POS catalogue stock changes propagate to WooCommerce

Status: backlog

> Canonical ID: P4-E04-S05 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S05.md

## Story

As shop ops, I want every change to physical-shop stock to flow to WooCommerce automatically, so we never sell a toy online that's already gone from the shelf.

## Acceptance Criteria

1. Any stock-mutating event in the custom system enqueues a Woo stock push:
  - In-store POS sale (P2-E04 cart checkout)
  - Goods-received-note / restock
  - Stock-take adjustment
  - Online order fulfilment (already deducted in Woo; reconciled, not re-pushed)
  - Manual admin adjustment
2. Push is keyed by **SKU**. The local `products` table stores `woo_product_id` (nullable) for the mapping; missing mapping means the product is "in-store only" and the push is a no-op.
3. Push updates Woo product `stock_quantity` (REST `PUT /wp-json/wc/v3/products/{id}`). On stock = 0, also sets `stock_status = outofstock`; on stock > 0, sets `instock`.
4. Pushes are debounced per SKU (configurable, default 5s) so a burst of mutations collapses to one API call with the final value.
5. SKU mapping admin: a screen under the catalogue lists each local product with its `woo_product_id` field for manual entry; bulk CSV import supported.
6. A reconciliation report flags SKUs where local stock and Woo stock have drifted (read both, compare, list deltas) — runs nightly, surfaced in admin.

## Tasks / Subtasks

- [ ] Task 1: Implement Stock push: POS catalogue stock changes propagate to WooCommerce (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Satisfy AC#1: Any stock-mutating event in the custom system enqueues a Woo stock push:
  - [ ] Satisfy AC#2: Push is keyed by **SKU**. The local `products` table stores `woo_product_id` (nullable) for the mapping; missing mapping means the product is "in-store only" and the push is a no-op.
  - [ ] Satisfy AC#3: Push updates Woo product `stock_quantity` (REST `PUT /wp-json/wc/v3/products/{id}`). On stock = 0, also sets `stock_status = outofstock`; on stock > 0, sets `instock`.
  - [ ] Satisfy AC#4: Pushes are debounced per SKU (configurable, default 5s) so a burst of mutations collapses to one API call with the final value.
  - [ ] Satisfy AC#5: SKU mapping admin: a screen under the catalogue lists each local product with its `woo_product_id` field for manual entry; bulk CSV import supported.
  - [ ] Satisfy AC#6: A reconciliation report flags SKUs where local stock and Woo stock have drifted (read both, compare, list deltas) — runs nightly, surfaced in admin.
- [ ] Task 2: Tests (AC: all)
  - Unit: debounce collapses N rapid mutations to one final-value push.
  - Integration: in-store sale of 1 unit decrements local stock and enqueues a Woo push with the new value.
  - Reconciliation: synthetic drift is reported correctly.

## Dev Notes

- POS is the source of truth. Never read stock from Woo into the local system; only push.
- Online orders that arrive in `wc_orders` for an out-of-stock SKU are flagged in S01 for manual handling — do **not** auto-deduct from local stock until packing starts.
- Failed pushes go to the same dead-letter as S07.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E04 (in-store POS sale path) - S06 (REST client) - S07 (scheduler + dead-letter) - `packages/catalog` (local stock model — carried forward from P1-E07; the original P4-E01 catalogue work is out of scope, but a minimal local `products` + stock model is needed and is part of this story if not already present)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
