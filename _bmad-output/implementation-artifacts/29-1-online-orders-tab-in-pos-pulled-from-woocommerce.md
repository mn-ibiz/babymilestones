# Story 29.1: Online orders tab in POS (pulled from WooCommerce)

Status: backlog

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

- [ ] Task 1: Implement Online orders tab in POS (pulled from WooCommerce) (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Satisfy AC#1: New tab "Online orders" alongside the in-store sale tab.
  - [ ] Satisfy AC#2: Queue shows New orders first with a subtle alert tone (toggle-able).
  - [ ] Satisfy AC#3: Per-order card: items, qty, customer name + phone last 4, delivery method (from Woo shipping method), payment status (from Woo).
  - [ ] Satisfy AC#4: Filter chips: New, Packing, Ready, Dispatched, Fulfilled.
  - [ ] Satisfy AC#5: Order data is read from a local `wc_orders` mirror table populated by the sync job (see S06/S07) — POS does not call Woo directly on render.
  - [ ] Satisfy AC#6: Each card shows the source WooCommerce order ID and last-synced timestamp.
- [ ] Task 2: Tests (AC: all)
  - Unit: rendering with N orders in each status.
  - Integration: a row in `wc_orders` with `local_status = 'new'` appears in the New filter.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
