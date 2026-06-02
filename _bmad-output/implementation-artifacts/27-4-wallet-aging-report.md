# Story 27.4: Wallet aging report

Status: done

> Canonical ID: P3-E05-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S04.md

## Story

As accountant, I want to see how long outstanding balances have been open.

## Acceptance Criteria

1. Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days.
2. Per-parent rows under each bucket; clickable to parent profile.
3. CSV export.

## Tasks / Subtasks

- [x] Task 1: Implement Wallet aging report (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days.
  - [x] Satisfy AC#2: Per-parent rows under each bucket; clickable to parent profile.
  - [x] Satisfy AC#3: CSV export.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Built on P1-E03 invoices + 27.1/27.2 reporting patterns. Reused the established
  OUTSTANDING definition (invoice `status NOT IN ('settled','void')` AND positive
  `amount_due`) and the 27.2 CSV/export/audit machinery (`csvField`, `centsToKes`,
  `text/csv` + Content-Disposition + audit emission). No migration (read-only over
  existing invoices/parents/users).
- **Age basis:** the invoice's `created_at`. This is the only age-bearing field on
  an invoice (FIFO settlement clears the oldest `created_at` first; there is no
  separate due-date column), so `created_at` IS the established convention. Age =
  floored whole days from `created_at` to the report `asOf` instant.
- **Bucketing rule: PER-INVOICE.** Each outstanding invoice's amount is aged
  independently and placed in its own bucket; a parent's invoices that land in the
  SAME bucket are summed into one per-parent row. A parent with invoices spanning
  two age ranges therefore appears under two buckets — the correct AR-aging
  semantics (each slice aged on its own), not a single per-parent oldest bucket.
  Boundaries are inclusive: day 7→0–7, 8→8–30, 30→8–30, 31→31–60, 60→31–60,
  61→61–90, 90→61–90, 91→90+ (all covered by tests). Zero/negative `amount_due`
  excluded.
- **Parent-profile link (AC2):** each row clicks through to
  `/parents/:userId/statement` (the existing reception `fullStatementHref` target),
  keyed on `users.id` — the DB read joins invoices→parents→users for the link key +
  display name.
- **RBAC allow-list:** `accountant`, `admin`, `super_admin`, `treasury`. Justification:
  the story is literally "as accountant, I want to see how long outstanding balances
  have been open" — this is the accountant's accounts-receivable aging report, so
  unlike the 27.1/27.2/27.3 owner/treasury trio (which deliberately EXCLUDED
  accountant) this report INCLUDES accountant, alongside the financial-reporting
  roles that own the books. reception/parents 403; unauth 401.
- **New export audit action:** `report.wallet_aging.export` (registered under the
  `export` category in `@bm/auth`; the export endpoint emits it with
  `{ as_of, total_cents, ip }`).
- TDD throughout: pure aggregation → DB read → contracts (DTO/CSV/view-model) →
  API route → admin lib → admin page, each red-before-green.

### File List

- packages/catalog/src/wallet-aging.ts (new)
- packages/catalog/src/wallet-aging.test.ts (new)
- packages/catalog/src/wallet-aging-db.ts (new)
- packages/catalog/src/wallet-aging-db.test.ts (new)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — query schema, DTO, CSV, view-model, href, export-url, filename)
- packages/contracts/src/wallet-aging.test.ts (new)
- packages/auth/src/audit-actions.ts (modified — registered `report.wallet_aging.export`)
- apps/api/src/routes/admin/wallet-aging.ts (new)
- apps/api/src/routes/admin/wallet-aging.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — register route)
- apps/admin/lib/wallet-aging.ts (new)
- apps/admin/lib/wallet-aging.test.ts (new)
- apps/admin/app/operations/wallet-aging/page.tsx (new)
- apps/admin/app/operations/wallet-aging/page.test.tsx (new)
- apps/admin/app/operations/page.tsx (modified — nav link)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 0.2 | Implemented wallet aging report — per-invoice aging buckets (0–7/8–30/31–60/61–90/90+) with per-parent clickable rows + CSV export; accountant-gated API + admin page; registered `report.wallet_aging.export` | Amelia (dev-story) |
