# Story 29.5: Stock push: POS catalogue stock changes propagate to WooCommerce

Status: done

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

- [x] Task 1: Implement Stock push: POS catalogue stock changes propagate to WooCommerce (AC: #1, #2, #3, #4, #5, #6)
  - [x] Satisfy AC#1: Any stock-mutating event in the custom system enqueues a Woo stock push: POS sale (settle path), goods-received/restock + stock-take + manual adjustment (`adjustStock` in `@bm/catalog`). Online-order fulfilment is NOT auto-deducted/re-pushed — it is reconciled (AC6).
  - [x] Satisfy AC#2: Push is keyed by SKU via `products.woo_product_id` (nullable, migration 0095); an unmapped product is "in-store only" and the push is a no-op.
  - [x] Satisfy AC#3: Push request carries `stock_quantity` + derived `stock_status` (`stockStatusFor`): 0 → `outofstock`, >0 → `instock`; the 29.7 drain dispatches `client.updateProductStock` (REST PUT product).
  - [x] Satisfy AC#4: Per-SKU coalesce — the outbox row is keyed by product (`wc-stock:{productId}`); a burst re-arms ONE pending row to `now + debounce` (default 5s) carrying the FINAL value.
  - [x] Satisfy AC#5: SKU-mapping admin under the catalogue: list + manual-entry edit + bulk CSV import (`/admin/woocommerce-stock/*` + `app/woocommerce-stock` page).
  - [x] Satisfy AC#6: Nightly reconciliation job (`wc-stock-reconcile`) reads local + Woo stock, lists drift deltas, persists a snapshot, surfaced in admin. Woo is read for comparison only — never written back to local.
- [x] Task 2: Tests (AC: all)
  - [x] Unit: debounce collapses N rapid mutations to one final-value push (`stock-push.test.ts`).
  - [x] Integration: in-store sale of 1 unit decrements local stock and enqueues a Woo push with the new value (`pos/sales.test.ts`).
  - [x] Reconciliation: synthetic drift is reported correctly (`reconciliation.test.ts`, `wc-stock-reconcile.test.ts`).

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

claude-opus-4-8

### Debug Log References

### Completion Notes List

- **Debounce/coalesce (AC4):** the stock-push outbox row is keyed by the LOCAL PRODUCT id (`wc-stock:{productId}`), not a fresh per-event key. `enqueueStockPush` does an upsert: INSERT a fresh pending row, or on CONFLICT OVERWRITE the request with the latest `{ wooProductId, stockQuantity, stockStatus }` and re-arm `next_attempt_at = now + debounce` (default 5s, configurable). N rapid mutations therefore collapse to ONE pending row carrying the FINAL value; the 29.7 drain only claims it once it is due (after the burst quiets). Each enqueue re-reads CURRENT local stock so the final value always wins even without overwrite.
- **stock_status rule (AC3):** `stockStatusFor(qty)` → `qty <= 0 ? "outofstock" : "instock"`. `onbackorder` is never produced from a push (POS blocks a sale at zero). The 29.7 drain already PUTs `stock_quantity` + `stock_status` via `client.updateProductStock`; no drain change needed.
- **Reconciliation drift logic (AC6):** `reconcileStock` reads every MAPPED product's local stock + Woo `stock_quantity` (via the injected client `getProduct`), computes `delta = localStock - (wooStock ?? 0)`, omits in-sync (delta 0) SKUs, skips unmapped products, sorts worst-first by |delta|, and PERSISTS a `wc_stock_reconciliations` snapshot. Reading Woo is comparison-only — local stock is never written back. The nightly `wc-stock-reconcile` job (cron `0 0 * * *`) runs it and writes ONE summary audit row.
- **Mutation points (AC1):** POS sale wired into `settleSale` (enqueue per line after the guarded decrement); the non-POS paths (goods-received, stock-take, manual admin adjustment) flow through a new `adjustStock` helper in `@bm/catalog` that updates local stock (clamped ≥0), audits `stock.adjusted`, and enqueues the coalesced push. Online orders are NOT auto-deducted (per Dev Notes).
- **Audit actions registered:** `woocommerce.stock.push_enqueued`, `woocommerce.sku_mapping.updated`, `woocommerce.stock.reconciled` (under the `woocommerce` category) + `stock.adjusted` (new `stock` category). `@bm/auth` parity test green.
- **Migration 0095** adds `products.woo_product_id` (nullable bigint, partial index) + the `wc_stock_reconciliations` snapshot table. Additive-only; confirmed unique (next after 0094).
- Admin SKU-mapping + reconciliation surface gated by `manage config` (admin/super_admin), mirroring the 29.7 sync surface — no RBAC matrix/snapshot change.

### File List

**Created**
- `packages/db/migrations/0095_products_woo_mapping.sql`
- `packages/woocommerce/src/stock-push.ts` (+ `.test.ts`)
- `packages/woocommerce/src/sku-mapping.ts` (+ `.test.ts`)
- `packages/woocommerce/src/reconciliation.ts` (+ `.test.ts`)
- `packages/catalog/src/stock-adjustments.ts` (+ `.test.ts`)
- `apps/jobs/src/jobs/wc-stock-reconcile.ts` (+ `.test.ts`)
- `apps/api/src/routes/admin/woocommerce-stock.ts` (+ `.test.ts`)
- `apps/admin/app/woocommerce-stock/page.tsx`
- `apps/admin/lib/sku-mapping.ts` (+ `.test.ts`)

**Modified**
- `packages/db/src/schema/products.ts` (+ `woo_product_id`)
- `packages/db/src/schema/wc-sync.ts` (+ `wcStockReconciliations` table + `StockDriftEntry`)
- `packages/contracts/src/woocommerce.ts` (+ `stockStatusFor`, `stockPushOutboxKey`, `STOCK_PUSH_DEBOUNCE_MS`, SKU-mapping + CSV-import + reconciliation contracts) (+ `.test.ts`)
- `packages/woocommerce/src/index.ts` (exports)
- `packages/catalog/src/index.ts` (exports), `packages/catalog/package.json` (+ `@bm/woocommerce` dep)
- `packages/auth/src/audit-actions.ts` (new actions)
- `apps/api/src/routes/pos/sales.ts` (enqueue push after stock decrement)
- `apps/api/src/routes/pos/sales.test.ts` (AC1/AC2 integration tests)
- `apps/api/src/routes/admin/index.ts` (register stock surface)
- `apps/jobs/src/index.ts` (register + export reconcile job)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Stock push + SKU mapping + reconciliation implemented (TDD); status → review | Amelia (dev-story) |
