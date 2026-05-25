# Story 8.1: Receipt schema with nullable eTIMS fields

Status: done

> Canonical ID: P1-E08-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S01.md

## Story

As a developer,
I want the receipt model to be KRA-shaped today,
so that adopting eTIMS is a writer swap, not a schema migration.

## Acceptance Criteria

1. `receipts` table has: id, sequence_number, parent_id, total, tax_total, payment_method, posted_by, created_at, **and** KRA fields: pin (nullable), control_unit_number (nullable), cu_invoice_number (nullable), qr_data (nullable), etims_status (nullable enum).
2. `receipt_lines` table has: receipt_id, service_id or product_id, quantity, unit_price, line_tax, line_total.
3. `sequence_number` is unique per receipt series (humans see a series like `BM-2026-000123`).

## Tasks / Subtasks

- [x] Task 1: Add `receipts` table to the Drizzle schema (AC: #1)
  - [x] Define core columns (id, parent_id FK, total, tax_total, payment_method, posted_by, created_at) in `packages/db/src/schema/receipts.ts`
  - [x] Add nullable KRA columns: pin, control_unit_number, cu_invoice_number, qr_data
  - [x] Add nullable `etims_status` (text + CHECK in migration, mirroring contract enum `pending` | `sent` | `accepted` | `rejected`; matches the repo convention of CHECK-as-source-of-truth rather than pgEnum)
  - [x] Export from `packages/db` schema barrel
- [x] Task 2: Add `receipt_lines` table (AC: #2)
  - [x] Define columns: receipt_id FK, service_id (nullable, FK to services), product_id (nullable), quantity, unit_price, line_tax, line_total
  - [x] Add a CHECK ensuring exactly one of service_id / product_id is set
- [x] Task 3: Enforce per-series sequence uniqueness (AC: #3)
  - [x] Add `series` column and a unique constraint on (series, sequence_number)
  - [x] Document the human-facing display format `BM-<year>-<zero-padded-seq>` (in schema + migration comments; rendered by the writer, not stored)
- [x] Task 4: Generate an additive-only migration (AC: #1, #2, #3)
  - [x] Hand-authored additive migration `0032_receipts.sql` (CREATE TABLE IF NOT EXISTS only; no destructive statements), matching the repo's hand-authored migration convention
- [x] Task 5: Tests (AC: all)
  - [x] Wrote 10 integration tests (vitest, test-first) verifying columns/nullability, KRA fields null + populated, etims_status CHECK, bigint money columns, the one-of-id CHECK on lines, FK integrity, and the per-series unique constraint

## Dev Notes

- Migration only — no rendering, writer, or routes in this story.
- KRA fields are nullable now so the existing `LocalReceiptWriter` (Story 8.2) leaves them empty and a future `EtimsReceiptWriter` fills them without a migration.
- Single shared Postgres schema (Drizzle); domain tables are unprefixed.
- Concrete paths to touch:
  - `packages/db/src/schema/receipts.ts` (new) — `receipts`, `receipt_lines`, `etims_status` enum.
  - `packages/db` schema barrel — export new tables.
  - `packages/db/migrations/` — new additive migration.
- Testing standards: vitest, test-first (red/green/refactor); `pnpm test` in `packages/db`. Per DoD, migrations must be additive-only.

### Project Structure Notes
- Lives entirely in `packages/db`. No app or other package changes.
- Depends on P1-E03 (parent account → `parent_id`) and P1-E07 (wallet / payment posting → `posted_by`, `payment_method`).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E08].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` (packages/db): 39 passed (10 new). Full-root `pnpm test`: 3 flaky `@bm/api` hook timeouts on first run; clean 294/294 on re-run (pre-existing flakiness, unrelated to this story).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: all green.

### Completion Notes List

- KRA/eTIMS fields (`pin`, `control_unit_number`, `cu_invoice_number`, `qr_data`, `etims_status`) are all nullable; `etims_status` is CHECK-constrained to `pending|sent|accepted|rejected` (CHECK-as-source-of-truth, matching the repo convention used by `services.tax_treatment`).
- Money columns (`total`, `tax_total`, `unit_price`, `line_tax`, `line_total`) are `bigint` integer cents with `>= 0` CHECKs; `quantity` is `> 0`.
- Per-series uniqueness via `UNIQUE (series, sequence_number)`; display format `BM-<year>-<zero-padded-seq>` documented in comments, rendered by the writer (P1-E08-S02), not stored.
- `receipts.parent_id` is a self-FK (credit-note/reversal pointer per AC1); a separate nullable `parent_account_id` FK to `parents` carries the parent-account dependency (P1-E03).
- `receipt_lines` enforces exactly-one-of service_id/product_id via `CHECK ((service_id IS NOT NULL) <> (product_id IS NOT NULL))`; `service_id` FKs to `services`, `product_id` has no FK (no products table yet).
- Migration only — no writer, rendering, or routes (out of scope; P1-E08-S02+).

### File List

- `packages/db/src/schema/receipts.ts` (new)
- `packages/db/src/schema/receipts.test.ts` (new)
- `packages/db/migrations/0032_receipts.sql` (new)
- `packages/db/src/schema/index.ts` (modified — barrel export)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented receipts + receipt_lines schema, migration 0032, 10 tests; gate green | claude-opus-4-7 |
