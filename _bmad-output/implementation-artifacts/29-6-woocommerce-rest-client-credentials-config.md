# Story 29.6: WooCommerce REST client + credentials config

Status: done

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

- [x] Task 1: Implement WooCommerce REST client + credentials config (AC: #1, #2, #3, #4, #5, #6)
  - [x] Satisfy AC#1: New package `packages/woocommerce` exporting a typed client with methods:
  - [x] Satisfy AC#2: Auth: WooCommerce REST API consumer key + consumer secret (HTTP Basic over HTTPS). HTTPS enforced.
  - [x] Satisfy AC#3: Admin Settings sub-app gains a "WooCommerce" panel: site URL, consumer key, consumer secret, "Test connection" button. Secrets stored encrypted at rest; never returned to the client after save (write-only field).
  - [x] Satisfy AC#4: Test-connection calls `GET /wp-json/wc/v3/system_status` and reports OK / failure with status code + first error.
  - [x] Satisfy AC#5: Client surfaces typed errors: `WooNotFound`, `WooRateLimited`, `WooAuthFailed`, `WooServerError`, `WooNetworkError`. Retries handled by the caller (S07), not the client.
  - [x] Satisfy AC#6: All requests are logged (URL, method, status, duration; redact secrets) to the existing structured logger (X8-S01).
  - [x] Touch / create: `packages/contracts`
- [x] Task 2: Tests (AC: all)
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

claude-opus-4-8

### Debug Log References

- `cd packages/woocommerce && pnpm vitest run` → 40 passed (3 files)
- `cd packages/contracts && pnpm vitest run` → 193 passed (10 files)
- `cd packages/db && pnpm vitest run` → 43 passed (9 files)
- `cd packages/auth && pnpm vitest run` → 82 passed (10 files) — audit catalogue completeness accepts the new actions
- `cd apps/api && pnpm vitest run` → 760 passed (83 files)
- `cd apps/admin && pnpm vitest run` → 307 passed (55 files)
- `pnpm typecheck` (root) → 18/18 packages clean (incl. `@bm/woocommerce`)

### Completion Notes List

- New leaf package `@bm/woocommerce` (`packages/woocommerce`): a DUMB typed REST
  client — one attempt per call, NO retry/queue (those are S07/29-7). Transport
  is injected (tests never touch a real Woo server). Methods: `listOrders`,
  `getOrder`, `updateOrderStatus` (status PUT + separate note POST when a note is
  given), `addOrderNote`, `getProduct`, `updateProductStock` (sets
  `manage_stock:true`), `listProducts`, plus `testConnection`.
- AC2: HTTPS enforced at construction — a non-https (or malformed) `siteUrl`
  throws `WooConfigError`. Auth is HTTP Basic (`ck:cs` base64) on every request.
- AC5: error mapping 401/403→`WooAuthFailed`, 404→`WooNotFound`,
  429→`WooRateLimited`, 5xx (and contract-invalid bodies)→`WooServerError`, a
  transport throw→`WooNetworkError`. Each carries the Woo `status` + first
  `message`. Tests assert exactly one attempt on failure (no retry).
- AC1: every response is parsed through `@bm/contracts` Zod schemas
  (`woocommerce.ts`); a silently-changed payload fails loudly as `WooServerError`.
- AC6: each request emits one structured log entry (url, method, status,
  durationMs, error) via an injected `log` sink; the Authorization header and the
  raw secret are NEVER logged. The API route pipes this into the existing
  `@bm/observability` pino logger (X8-S01), which also redacts.
- Encryption mechanism: the repo had NO existing encryption-at-rest helper (SMS /
  payment secrets live in env vars; only a *ref* is persisted). Introduced
  `@bm/woocommerce` `encryptSecret`/`decryptSecret` — AES-256-GCM with a
  per-record scrypt-derived key + random salt/IV, self-describing `v1:salt:iv:tag:ct`
  base64url envelope. The master key comes from `WOO_SECRET_KEY` (env) in
  production; injected in tests.
- AC3: `woo_config` is a single-row table (migration 0091) storing the consumer
  key/secret ENCRYPTED. The secret is WRITE-ONLY: the public projection
  (`getWooConfigPublic`) returns the site URL + `hasConsumerKey`/`hasConsumerSecret`
  booleans only — never a value. Omitting a secret on save keeps the stored one.
- API: `GET/PUT /admin/woocommerce-config` + `POST .../test-connection`, all
  gated by `manage config` (admin/super_admin), CSRF-checked. AUDIT RULE: two new
  actions registered under `settings` in `packages/auth/src/audit-actions.ts` —
  `woocommerce.config.update` and `woocommerce.test_connection`; the secret never
  enters an audit payload.
- Admin UI: `/woocommerce-config` panel (site URL + write-only key/secret +
  "Test connection"), linked from the Settings index (`woocommerce` section).
  Pure form logic in `apps/admin/lib/woocommerce-config-form.ts`.

### File List

- packages/woocommerce/package.json (new)
- packages/woocommerce/tsconfig.json (new)
- packages/woocommerce/src/index.ts (new)
- packages/woocommerce/src/client.ts (new)
- packages/woocommerce/src/client.test.ts (new)
- packages/woocommerce/src/errors.ts (new)
- packages/woocommerce/src/crypto.ts (new)
- packages/woocommerce/src/crypto.test.ts (new)
- packages/woocommerce/src/config.ts (new)
- packages/woocommerce/src/config.test.ts (new)
- packages/contracts/src/woocommerce.ts (new)
- packages/contracts/src/woocommerce.test.ts (new)
- packages/contracts/src/index.ts (modified — re-export woocommerce)
- packages/db/src/schema/woo-config.ts (new)
- packages/db/src/schema/index.ts (modified — export woo-config)
- packages/db/migrations/0091_woo_config.sql (new)
- packages/auth/src/audit-actions.ts (modified — woocommerce.config.update, woocommerce.test_connection)
- apps/api/src/routes/admin/woocommerce-config.ts (new)
- apps/api/src/routes/admin/woocommerce-config.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — register route + AdminDeps.woocommerce)
- apps/api/src/routes/admin/settings.ts (modified — WooCommerce section in index)
- apps/api/src/routes/admin/settings.test.ts (modified — assert WooCommerce section)
- apps/api/src/app.ts (modified — AppDeps.woocommerce + woocommerceConfigFromEnv + wiring)
- apps/api/package.json (modified — add @bm/woocommerce dep)
- apps/admin/app/woocommerce-config/page.tsx (new)
- apps/admin/lib/woocommerce-config-form.ts (new)
- apps/admin/lib/woocommerce-config-form.test.ts (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented @bm/woocommerce typed REST client (no retry), AES-256-GCM secret-at-rest config (migration 0091), admin WooCommerce Settings panel + API (save/read-without-secret/test-connection), audit actions, Zod contracts. Status → review. | Amelia (dev-story) |
