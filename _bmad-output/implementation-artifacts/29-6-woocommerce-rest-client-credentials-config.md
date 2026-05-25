# Story 29.6: WooCommerce REST client + credentials config

Status: backlog

> Canonical ID: P4-E04-S06 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S06.md

## Story

As developer (and admin),
I want a single typed client for the WooCommerce REST API with credentials managed in admin,
so that all sync work uses one configured surface.

## Acceptance Criteria

1. New package `packages/woocommerce` exporting a typed client with methods:
  - `listOrders({ since, status[], page })`
  - `getOrder(id)`
  - `updateOrderStatus(id, status, note?)`
  - `addOrderNote(id, note)`
  - `getProduct(id)`
  - `updateProductStock(id, stock_quantity, stock_status)`
  - `listProducts({ since, page })` (for reconciliation use only)
2. Auth: WooCommerce REST API consumer key + consumer secret (HTTP Basic over HTTPS). HTTPS enforced.
3. Admin Settings sub-app gains a "WooCommerce" panel: site URL, consumer key, consumer secret, "Test connection" button. Secrets stored encrypted at rest; never returned to the client after save (write-only field).
4. Test-connection calls `GET /wp-json/wc/v3/system_status` and reports OK / failure with status code + first error.
5. Client surfaces typed errors: `WooNotFound`, `WooRateLimited`, `WooAuthFailed`, `WooServerError`, `WooNetworkError`. Retries handled by the caller (S07), not the client.
6. All requests are logged (URL, method, status, duration; redact secrets) to the existing structured logger (X8-S01).

## Tasks / Subtasks

- [ ] Task 1: Implement WooCommerce REST client + credentials config (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Satisfy AC#1: New package `packages/woocommerce` exporting a typed client with methods:
  - [ ] Satisfy AC#2: Auth: WooCommerce REST API consumer key + consumer secret (HTTP Basic over HTTPS). HTTPS enforced.
  - [ ] Satisfy AC#3: Admin Settings sub-app gains a "WooCommerce" panel: site URL, consumer key, consumer secret, "Test connection" button. Secrets stored encrypted at rest; never returned to the client after save (write-only field).
  - [ ] Satisfy AC#4: Test-connection calls `GET /wp-json/wc/v3/system_status` and reports OK / failure with status code + first error.
  - [ ] Satisfy AC#5: Client surfaces typed errors: `WooNotFound`, `WooRateLimited`, `WooAuthFailed`, `WooServerError`, `WooNetworkError`. Retries handled by the caller (S07), not the client.
  - [ ] Satisfy AC#6: All requests are logged (URL, method, status, duration; redact secrets) to the existing structured logger (X8-S01).
  - [ ] Touch / create: `packages/contracts`
- [ ] Task 2: Tests (AC: all)
  - Unit: each method serialises correct query params; error mapping for 401 / 404 / 429 / 5xx.
  - Integration (mocked Woo): test-connection happy path + auth failure.

## Dev Notes

- Use Zod schemas in `packages/contracts` to validate Woo responses; reject silently-changed payload shapes.
- The client is dumb: no retry, no queue, no scheduling. Those belong in S07.
- Settings panel is admin-only (Settings sub-app from P1-E10-S04).

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E10-S04 (Settings sub-app shell) - X8-S01 (structured logging)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S06.md]
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
