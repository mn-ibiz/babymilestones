# Story 19.2: Product catalogue read for POS

Status: done

> Canonical ID: P2-E04-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S02.md

## Story

As cashier,
I want to search or scan a product and add it to a sale,
so that the capability described above is delivered.

## Acceptance Criteria

1. Barcode scanner input auto-focused; on enter → matches `products.sku` or `products.barcode`.
2. Search by name with debounce; results show price, stock.
3. Out-of-stock products greyed out (sale blocked at checkout).

## Tasks / Subtasks

- [x] Task 1: Implement Product catalogue read for POS (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Barcode scanner input auto-focused; on enter → matches `products.sku` or `products.barcode`.
  - [x] Satisfy AC#2: Search by name with debounce; results show price, stock.
  - [x] Satisfy AC#3: Out-of-stock products greyed out (sale blocked at checkout).
  - [x] Touch / create: `packages/catalog`
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Findings

Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-05-29.
Acceptance Auditor: all 3 ACs PASS (AC3 hard checkout-block correctly deferred to S03/S04). No High AC violations.

Patches (applied this session):
- [x] [Review][Patch] Search out-of-order race — debounced effect now ignores stale in-flight responses via a `cancelled` flag [apps/pos/app/components/ProductSearch.tsx]
- [x] [Review][Patch] Deterministic code lookup — `findProductByCode` prefers an exact barcode match, then SKU (a SKU could equal another product's barcode) [packages/catalog/src/products.ts]
- [x] [Review][Patch] Bounded query inputs — `.max(100)` on the lookup/search query schemas (no unbounded ILIKE) [packages/contracts/src/index.ts]
- [x] [Review][Patch] Resilient API client + scan guard — `products-api` swallows fetch rejection (→ null/[]); `onScan` guards against concurrent in-flight scans [apps/pos/lib/products-api.ts, apps/pos/app/components/ProductSearch.tsx]
- [x] [Review][Patch] Honest name index — dropped the dead `lower(name)` btree (can't serve a `%term%` ILIKE); documented the P4 pg_trgm GIN index [packages/db/migrations/0055_products.sql]
- [x] [Review][Patch] Flash clears on input — stale "Added X" / "no match" message is cleared as the operator types [apps/pos/app/components/ProductSearch.tsx]

Deferred:
- [x] [Review][Defer] `CHECK (stock_qty >= 0)` + stock decrement semantics — deferred to S04 (stock decrement on sale)
- [x] [Review][Defer] Quantity merge / dedupe of repeated adds + hard checkout block — deferred to S03 (cart) / S04 (pay)

Dismissed (rationale): `bigint {mode:"number"}` money pipeline (codebase-wide convention; KES prices ≪ 2^53; all tests use PGlite); stub seed shipped via migration (explicitly required by Dev Notes; mirrors the roles/permissions seed); `select *` in `makeResolveUser` (identical to every existing route); `field: path[0]` error shape (mirrors `parents-search`); `taxTreatment ?? "vat_exempt"` (harmless dead default on a NOT NULL column); `formatKes` defensive guards (inputs are DB-sourced non-negative integers); 1-char query returns `[]` not 400 (acceptable; UI gates at 2); repeated `?q=` → generic 400 (acceptable); Pay button no-op (S04).

## Dev Notes

Uses `packages/catalog`. Catalogue itself created in P4-E01 — for P2 ship a minimal stub seed product set.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `pnpm test` → 17/17 packages green (520 API tests incl. 8 new POS; 106 catalog incl. 14 new product; 50 POS app)
- `pnpm typecheck` → 17/17 clean · `pnpm lint` → 17/17 clean
- `pnpm --filter @bm/pos build` → ok

### Completion Notes List

- **Data layer** — new `products` table (`packages/db/src/schema/products.ts`, migration `0055_products.sql`):
  sku (unique), nullable barcode (unique when present), name, `price_cents` (bigint), `stock_qty`,
  `tax_treatment` (CHECK-constrained, mirrors services), `is_active` soft-delete. Migration ships a
  minimal stub seed set (5 baby-care goods incl. one out-of-stock) per the Dev Notes ("ship a minimal
  stub seed product set" for P2; full catalogue is P4-E01).
- **RBAC** — added a `product` resource to the matrix (`packages/auth/src/rbac.ts`) and granted
  `read product` to reception/cashier/packer (cashier previously held no catalogue read). Mirrored in
  migration `0056_product_permissions.sql`; both drift gates updated (auth snapshot + `@bm/db`
  `permissions.test.ts`).
- **Catalog** (`@bm/catalog/products.ts`) — `createProduct`, `findProductByCode` (SKU OR barcode,
  active-only — AC1), `searchProductsByName` (case-insensitive substring, active-only, out-of-stock
  INCLUDED so the UI can grey them, ILIKE-wildcard-escaped, capped at 20 — AC2/AC3).
- **Contracts** — `PosProduct` DTO (+ derived `inStock`), lookup/search query schemas + responses.
- **API** (`apps/api/src/routes/pos/`) — `GET /pos/products/lookup?code=` and `GET /pos/products/search?q=`,
  guarded by `read product`; registered in `app.ts`. Read-only (no audit/CSRF).
- **POS UI** — `ProductSearch` component: auto-focused scan field (Enter → lookup, AC1), debounced
  name search showing price + stock (AC2), out-of-stock rows greyed + Add disabled (AC3). Pure helpers
  (`lib/products.ts`: `formatKes`, `isOutOfStock`, `stockLabel`, `shouldSearch`) unit-tested; API client
  in `lib/products-api.ts`. `SaleScreen` now collects added products into a simple order list (the full
  cart with quantities/discounts/totals is S03).
- TDD throughout; only pure logic + DB-backed/route behaviour is tested (components stay thin renders,
  per the established convention).

### File List

**Added**
- `packages/db/src/schema/products.ts`
- `packages/db/migrations/0055_products.sql`
- `packages/db/migrations/0056_product_permissions.sql`
- `packages/catalog/src/products.ts`
- `packages/catalog/src/products.test.ts`
- `apps/api/src/routes/pos/index.ts`
- `apps/api/src/routes/pos/products.ts`
- `apps/api/src/routes/pos/products.test.ts`
- `apps/pos/lib/products.ts`
- `apps/pos/lib/products.test.ts`
- `apps/pos/lib/products-api.ts`
- `apps/pos/app/components/ProductSearch.tsx`

**Modified**
- `packages/db/src/schema/index.ts` (export products)
- `packages/auth/src/rbac.ts` (+`product` resource, grants)
- `packages/auth/src/__snapshots__/rbac.test.ts.snap` (drift gate)
- `packages/db/src/permissions.test.ts` (drift gate)
- `packages/catalog/src/index.ts` (export products module)
- `packages/contracts/src/index.ts` (POS product contracts)
- `apps/api/src/app.ts` (register POS routes)
- `apps/pos/app/components/SaleScreen.tsx` (wire ProductSearch + order list)
- `apps/pos/package.json` (+`@bm/contracts`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented products table + seed, RBAC product resource, catalog read fns, POS lookup/search API, ProductSearch UI (TDD) | Amelia (dev-story) |
| 2026-05-29 | 1.1 | Adversarial code review: 6 patches (search race, deterministic lookup, query length caps, fetch resilience + scan guard, honest name index, flash clear), 2 deferred. Full suite green → done | bmad-code-review |
