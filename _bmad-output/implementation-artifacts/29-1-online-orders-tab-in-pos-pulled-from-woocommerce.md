# Story 29.1: Online orders tab in POS (pulled from WooCommerce)

Status: done

> Canonical ID: P4-E04-S01 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S01.md

## Story

As shop staff, I want to see online orders from the same screen I sell from, pulled in from our standalone WooCommerce site.

## Acceptance Criteria

1. New tab "Online orders" alongside the in-store sale tab.
2. Queue shows New orders first with a subtle alert tone (toggle-able).
3. Per-order card: items, qty, customer name + phone last 4, delivery method (from Woo shipping method), payment status (from Woo).
4. Filter chips: New, Packing, Ready, Dispatched, Fulfilled.
5. Order data is read from a local `wc_orders` mirror table populated by the sync job (see S06/S07) — POS does not call Woo directly on render.
6. Each card shows the source WooCommerce order ID and last-synced timestamp.

## Tasks / Subtasks

- [x] Task 1: Implement Online orders tab in POS (pulled from WooCommerce) (AC: #1, #2, #3, #4, #5, #6)
  - [x] Satisfy AC#1: New tab "Online orders" alongside the in-store sale tab.
  - [x] Satisfy AC#2: Queue shows New orders first with a subtle alert tone (toggle-able).
  - [x] Satisfy AC#3: Per-order card: items, qty, customer name + phone last 4, delivery method (from Woo shipping method), payment status (from Woo).
  - [x] Satisfy AC#4: Filter chips: New, Packing, Ready, Dispatched, Fulfilled.
  - [x] Satisfy AC#5: Order data is read from a local `wc_orders` mirror table populated by the sync job (see S06/S07) — POS does not call Woo directly on render.
  - [x] Satisfy AC#6: Each card shows the source WooCommerce order ID and last-synced timestamp.
- [x] Task 2: Schema reconciliation — add the POS workflow column to the mirror.
  - [x] Migration `0093` adds `local_status` to `wc_orders` (NOT NULL DEFAULT 'new', CHECK over the workflow vocabulary) + drizzle schema update.
  - [x] Pull-job upsert sets `local_status='new'` on INSERT and never overwrites it on UPDATE (the POS owns the column); test proves it survives a re-pull.
  - [x] Display fields (name, phone, shipping, payment, line items, total) extracted from `payload` at read time via the contracts Woo order schema — table NOT widened.
- [x] Task 3: Tests (AC: all)
  - [x] Unit: pure view-model maps mirror rows → cards (items/qty, name, phone-last-4, shipping, payment, woo id, last-synced; New-first; chip filter).
  - [x] Unit: rendering with N orders across statuses (POS component render-contract tests).
  - [x] Integration: a `wc_orders` row with `local_status='new'` appears in the New filter via the read query + the POS-gated API endpoint (mirror-only, never Woo).

## Dev Notes

- Local `wc_orders` table mirrors a subset of Woo order fields: woo_order_id (unique), woo_status, customer_name, customer_phone, shipping_method, payment_method, payment_status, total_cents, line_items (jsonb), local_status, last_synced_at.
- Local `local_status` enum: `new | packing | ready | dispatched | fulfilled | cancelled`. Drives the POS workflow; mapped to Woo statuses on writeback (S02).
- Customer data is stored as-received from Woo; no link to Baby-Milestones parent accounts (per locked decision: no SSO with Woo).

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E04 (POS scaffold) - P4-E04-S06 (WooCommerce REST client + credentials) - P4-E04-S07 (sync scheduler populating `wc_orders`)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Schema reconciliation: migration `0093_wc_orders_local_status.sql` adds `local_status text NOT NULL DEFAULT 'new'` to `wc_orders` with a CHECK over `new | packing | ready | dispatched | fulfilled | cancelled` and an index for the per-chip read. Drizzle `wcOrders` updated (`localStatus`, `WcOrderLocalStatus`). Only `local_status` is a new column — every display field is read from `payload`.
- Pull-job ownership: `upsertWcOrder` (`@bm/woocommerce`) sets `local_status='new'` via the DB default on INSERT and deliberately OMITS it from the `onConflictDoUpdate` set, so a re-pull refreshes Woo-sourced fields but never clobbers the POS workflow state. Proven at both the helper level (`sync.test.ts`) and the full job level (`wc-sync-pull.test.ts`).
- Shared view-model: `packages/contracts/src/woocommerce-orders.ts` — `toOnlineOrderCard` extracts items/qty, customer name, phone-LAST-4 masking, shipping-line delivery method, paid/unpaid (from `date_paid`), woo id + last-synced; `sortOnlineOrdersNewFirst` (AC2) and `filterOnlineOrdersByStatus` (AC4). Payload validated through `wooOrderSchema`; degrades gracefully on a malformed payload.
- Read path (AC5): `listOnlineOrders` (`@bm/woocommerce`) reads ONLY the local mirror — no Woo client by construction. API endpoint `GET /pos/online-orders` is gated by `read product` (till roles) and returns cards New-first. The POS client (`fetchOnlineOrders`) hits this endpoint only.
- POS UI: new `/online-orders` route + `OnlineOrders` client island (chips, New-first ordering, toggle-able subtle Web-Audio alert tone on a genuinely-new arrival, per-card fields, woo id + last-synced) and a `PosTabs` nav placing "Online orders" alongside "Sale" (AC1). POS `.tsx` tests follow the repo's `renderToStaticMarkup` (no-jsdom) convention.
- Audit: read-only tab — no new audit action emitted (the only audit row is the pre-existing pull summary).
- Tests (isolated): `@bm/contracts` 212 passed; `@bm/woocommerce` 78 passed; `@bm/db` 43 passed; `@bm/jobs` 127 passed; `@bm/api` 776 passed; `@bm/pos` 96 passed. Typecheck clean in isolation for every touched package (db, contracts, woocommerce, pos, jobs, api). Lint clean for every touched package. The repo-wide `pnpm typecheck` surfaces only PRE-EXISTING errors in untracked `apps/admin/lib/*.test.ts` files (unrelated to this story).

### File List

- packages/db/migrations/0093_wc_orders_local_status.sql (new)
- packages/db/src/schema/wc-sync.ts (modified — `localStatus` column + `WcOrderLocalStatus` type + index)
- packages/woocommerce/src/sync.ts (modified — `upsertWcOrder` local_status ownership)
- packages/woocommerce/src/sync.test.ts (modified — local_status insert/preserve tests)
- packages/woocommerce/src/online-orders.ts (new — `listOnlineOrders` mirror-only read)
- packages/woocommerce/src/online-orders.test.ts (new)
- packages/woocommerce/src/index.ts (modified — export `listOnlineOrders`)
- packages/contracts/src/woocommerce-orders.ts (new — view-model + DTOs)
- packages/contracts/src/woocommerce-orders.test.ts (new)
- packages/contracts/src/index.ts (modified — re-export woocommerce-orders)
- apps/jobs/src/jobs/wc-sync-pull.test.ts (modified — local_status survives a re-pull)
- apps/api/src/routes/pos/online-orders.ts (new — `GET /pos/online-orders`)
- apps/api/src/routes/pos/online-orders.test.ts (new)
- apps/api/src/routes/pos/index.ts (modified — register the route)
- apps/pos/lib/online-orders.ts (new — pure display helpers)
- apps/pos/lib/online-orders.test.ts (new)
- apps/pos/lib/online-orders-api.ts (new — fetch wrapper)
- apps/pos/app/components/OnlineOrders.tsx (new — queue island)
- apps/pos/app/components/OnlineOrders.test.tsx (new)
- apps/pos/app/components/PosTabs.tsx (new — Sale / Online orders tab nav)
- apps/pos/app/components/PosTabs.test.tsx (new)
- apps/pos/app/(pos)/online-orders/page.tsx (new — POS-gated route)
- apps/pos/app/(pos)/layout.tsx (modified — mount `PosTabs`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented Online-orders POS tab: migration 0093 `local_status` + pull-job ownership, shared view-model, mirror-only read query + POS-gated API, POS tab UI (chips, New-first, alert tone, woo id + last-synced). All affected suites + typecheck + lint green. Status → review. | Amelia (dev-story) |
