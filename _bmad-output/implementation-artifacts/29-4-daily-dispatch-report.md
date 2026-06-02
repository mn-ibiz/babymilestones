# Story 29.4: Daily dispatch report

Status: done

> Canonical ID: P4-E04-S04 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S04.md

## Story

As shop ops, I want an end-of-day summary of online orders dispatched and still pending.

## Acceptance Criteria

1. Report covers WooCommerce-originated orders only (in-store POS sales have their own end-of-day in P2-E04-S05).
2. Counts by `local_status`, total value (KES), average pack time (new → ready), average dispatch time (ready → dispatched).
3. CSV export.
4. Date filter; defaults to today.
5. Includes a "Sync health" row: orders with stuck/failed Woo writebacks in the dead-letter (link to S07 view).

## Tasks / Subtasks

- [x] Task 1: Implement Daily dispatch report (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: Report covers WooCommerce-originated orders only (in-store POS sales have their own end-of-day in P2-E04-S05). Reads ONLY the `wc_orders` set + `order_events` + `wc_outbox_dead`; no POS tables, no live Woo call.
  - [x] Satisfy AC#2: Counts by `local_status` (zero-filled), total value (KES, parsed from Woo decimal `total`), average pack time (new → ready), average dispatch time (ready → dispatched) computed from `order_events` timestamps.
  - [x] Satisfy AC#3: CSV export at `/admin/daily-dispatch/export` (audited via `report.dispatch.export`).
  - [x] Satisfy AC#4: Date filter; defaults to today (resolved server-side when `date` is absent).
  - [x] Satisfy AC#5: "Sync health" row — count of un-actioned dead-letter writebacks (`wc_outbox_dead` status='dead'), linking to the 29.7 dead-letter admin view (`/woocommerce-sync`).
- [x] Task 2: Tests (AC: all)
  - [x] Unit: pack-time and dispatch-time calculations across edge cases (cancelled mid-flight, manually-reversed transitions, missing-timestamp orders, zero-data day).

## Dev Notes

- Reads from `wc_orders` + `order_events`. No live Woo call.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Reused the 27.x reporting pattern end-to-end: a pure aggregation reducer + a thin DB loader in `@bm/catalog`, a query schema / CSV serialiser / view-model in `@bm/contracts`, an admin-gated read + audited CSV-export route pair in `@bm/api`, and a client lib + page in `@bm/admin`.
- **Pack/dispatch-time rule (documented in `daily-dispatch.ts` header):** each milestone uses the EARLIEST forward-transition timestamp:
  - pack time = `firstReached('ready') − firstForwardOut('new')`
  - dispatch time = `firstReached('dispatched') − firstReached('ready')`
  - A later manual REVERSAL (e.g. ready→packing→ready) never moves a milestone — the first forward time stands. Negative/zero intervals (clock skew) are discarded. An order missing either endpoint of an average is excluded from THAT average only (still counted in status counts + total value). A cancelled mid-flight order keeps its count + value but, lacking the ready/dispatched milestones, is naturally excluded from the averages. A zero-data day yields zero counts/value and `null` averages.
- **Day boundary:** UTC `[date, date+1)` keyed on `wc_orders.created_at`; `order_events` are loaded for those orders regardless of when each event occurred, so a next-morning milestone is still attributed.
- **Total value:** Woo's decimal `total` string (KES) is parsed to integer cents via `wooTotalToCents`.
- **New audit action:** `report.dispatch.export` registered in `@bm/auth` `audit-actions.ts` under the `export` category; emitted by the export route and verified by `@bm/auth`'s single-source-of-truth completeness test.
- **RBAC:** read + export gated to admin / super_admin / treasury (same posture as 27.x); accountant/reception → 403, unauth → 401.
- **Sync-health link:** the 29.7 dead-letter admin view lives at `/woocommerce-sync` in the admin app; the sync-health row links there.
- No migrations (reads from existing `wc_orders` + `order_events` + `wc_outbox_dead`).

### File List

Created:
- `packages/catalog/src/daily-dispatch.ts`
- `packages/catalog/src/daily-dispatch.test.ts`
- `packages/catalog/src/daily-dispatch-db.ts`
- `packages/catalog/src/daily-dispatch-db.test.ts`
- `apps/api/src/routes/admin/daily-dispatch.ts`
- `apps/api/src/routes/admin/daily-dispatch.test.ts`
- `apps/admin/lib/daily-dispatch.ts`
- `apps/admin/lib/daily-dispatch.test.ts`
- `apps/admin/app/operations/dispatch-report/page.tsx`
- `apps/admin/app/operations/dispatch-report/page.test.tsx`
- `packages/contracts/src/daily-dispatch.test.ts`

Modified:
- `packages/catalog/src/index.ts` (export the aggregation + loader)
- `packages/contracts/src/index.ts` (query schema, CSV serialiser, view-model, export URL/filename, dead-letter link)
- `packages/auth/src/audit-actions.ts` (register `report.dispatch.export`)
- `apps/api/src/routes/admin/index.ts` (register the route)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Daily dispatch report implemented (aggregation + DB loader + contracts + audited API + admin page); `report.dispatch.export` audit action added | Amelia (dev-story) |
