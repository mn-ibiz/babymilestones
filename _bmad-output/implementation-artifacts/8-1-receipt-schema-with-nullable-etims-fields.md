# Story 8.1: Receipt schema with nullable eTIMS fields

Status: ready-for-dev

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

- [ ] Task 1: Add `receipts` table to the Drizzle schema (AC: #1)
  - [ ] Define core columns (id, parent_id FK, total, tax_total, payment_method, posted_by, created_at) in `packages/db/src/schema/receipts.ts`
  - [ ] Add nullable KRA columns: pin, control_unit_number, cu_invoice_number, qr_data
  - [ ] Add nullable `etims_status` as a pgEnum (e.g. `pending` | `sent` | `accepted` | `rejected`)
  - [ ] Export from `packages/db` schema barrel
- [ ] Task 2: Add `receipt_lines` table (AC: #2)
  - [ ] Define columns: receipt_id FK, service_id (nullable), product_id (nullable), quantity, unit_price, line_tax, line_total
  - [ ] Add a CHECK ensuring exactly one of service_id / product_id is set
- [ ] Task 3: Enforce per-series sequence uniqueness (AC: #3)
  - [ ] Add `series` (or equivalent) column and a unique constraint on (series, sequence_number)
  - [ ] Document the human-facing display format `BM-<year>-<zero-padded-seq>`
- [ ] Task 4: Generate an additive-only migration (AC: #1, #2, #3)
  - [ ] Run Drizzle migration generation; verify no destructive statements
- [ ] Task 5: Tests (AC: all)
  - [ ] Write integration tests (vitest, test-first) verifying columns/nullability, the one-of-id CHECK on lines, and the per-series unique constraint

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
