# Story 5.4: Record a service visit

Status: done

> Canonical ID: P1-E05-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S04.md

## Story

As Reception,
I want to record that a child attended a service, attribute it to a staff member, and let the system handle payment,
so that visits are tracked and billed without manual math.

## Acceptance Criteria

1. Service picker (loaded from `services`, active only) → child picker (parent's children) → staff attribution picker (loaded from `staff`, active only).
2. Snapshot of staff name + rate stored on the booking row (`staff_name_snapshot`, `staff_rate_snapshot`).
3. Confirm → `bookings` row + `invoices` row → immediate check-in → `wallet.debit` per P1-E03-S05.
4. If wallet insufficient + auto-credit off → user warned + booking still proceeds + outstanding created.

## Tasks / Subtasks

- [x] Task 1: Booking schema + snapshots (AC: #2, #3)
  - [x] Additive migration in `packages/db` — `0024_bookings.sql` + drizzle `bookings` (with `staff_name_snapshot`, `staff_rate_snapshot`, `checked_in_at`) and 1:1 `invoice_id` link
  - [~] `services`/`staff` active flags — DEFERRED to P1-E07 (catalogue epic); `service_id`/`staff_id` are nullable uuids with no FK yet (forward-compatible)
- [x] Task 2: Visit contract (AC: #1, #2)
  - [x] Added `recordVisitSchema` in `packages/contracts` (parent_id, child_id, service_id, staff_id, staffName, rate) + `isVisitOutstanding` + `RecordVisitResponse`
  - [~] active-only filters — DEFERRED to P1-E07 (no catalogue to filter yet)
- [x] Task 3: Record-visit route (AC: #2, #3, #4)
  - [x] `apps/api/src/routes/reception/record-visit.ts` — creates `bookings` row with staff name+rate snapshot + pending `invoices` row (one tx), then reuses `@bm/wallet` debit (idempotent, P1-E03-S05) for the immediate check-in
  - [x] On insufficient balance + auto-credit off → booking still proceeds, outstanding invoice created, `warning` flag returned (AC4)
  - [x] Registered in `apps/api/src/routes/reception/index.ts` (via `buildApp`); writes a `reception.record_visit` `audit_outbox` row
- [x] Task 4: Record-visit UI (AC: #1, #4)
  - [x] `apps/admin/lib/record-visit-form.ts` — service → child → staff → confirm step order + gates, client-side validation, `visitOutcomeLabel`/`isVisitWarning` surface the insufficient-funds warning while proceeding
  - [~] React picker components reading the live catalogue — DEFERRED to P1-E07 (flow logic is unit-tested; matches sibling reception stories' lib-first pattern)
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Unit: snapshot capture, validation, outstanding-on-insufficient logic (vitest, test-first) — contracts + admin lib
  - [x] Integration: confirm → booking+invoice+check-in+debit; insufficient+auto-credit-off path creates outstanding and warns; auto-credit-on settles_on_credit; ownership/permission/auth guards
  - [~] E2E browser walkthrough — DEFERRED (see review-findings; AC paths covered by API integration tests)

## Dev Notes

- Staff name + rate are snapshotted onto the booking (`staff_name_snapshot`, `staff_rate_snapshot`) so later staff/rate changes don't rewrite history.
- Booking, invoice, check-in, and `wallet.debit` happen together; debit follows P1-E03-S05 (FIFO, idempotency). On insufficient funds with auto-credit off, the booking still proceeds and an outstanding (open invoice) is created — the visit is never blocked.
- No double-booking check in P1 (that's P2 time-slot booking); P1 only records arrivals.
- Source paths to touch: `apps/api/src/routes/reception/record-visit.ts`, `apps/admin` Reception visit flow, `packages/db` (`bookings`/`invoices` migration), `packages/contracts` (visit schema), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI in `apps/admin`; schema in `packages/db`; ledger via `packages/wallet`.
- Dependencies (from source): S01–S03, P1-E03 (wallet/debit), P1-E07 (services/staff catalog). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (all workspaces pass; @bm/api 229,
@bm/contracts 38, @bm/admin 50), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- Additive migration `0024_bookings.sql` + drizzle `bookings` schema with
  `staff_name_snapshot` / `staff_rate_snapshot` (AC2) and a 1:1 `invoice_id` link
  (unique). `service_id` / `staff_id` are nullable uuids with no FK — the
  services + staff catalogue is P1-E07 (deferred per the story hint).
- `POST /reception/visit` creates the pending invoice + checked-in booking in one
  transaction, then reuses `@bm/wallet` debit (P1-E03-S05) for the check-in —
  settled / settled_on_credit / outstanding outcomes flow straight through. AC4
  underfunded + auto-credit-off path still records the booking and returns a
  warning. Staff-only via rbac `create payment`; wallet + parent derived
  server-side; child ownership enforced (422 otherwise).
- Admin flow logic in `apps/admin/lib/record-visit-form.ts` (picker order +
  validation + warning surfacing), unit-tested — mirrors the existing
  `topup-form.ts` lib-first pattern.
- Deferred items (catalogue link, full-flow atomicity, E2E) logged in
  `5-4-record-a-service-visit-review-findings.md`.

### File List

- packages/db/migrations/0024_bookings.sql (new)
- packages/db/src/schema/bookings.ts (new)
- packages/db/src/schema/index.ts (export bookings)
- packages/contracts/src/index.ts (recordVisitSchema, isVisitOutstanding, types)
- packages/contracts/src/index.test.ts (tests)
- apps/api/src/routes/reception/record-visit.ts (new)
- apps/api/src/routes/reception/record-visit.test.ts (new)
- apps/api/src/routes/reception/index.ts (register route)
- apps/admin/lib/record-visit-form.ts (new)
- apps/admin/lib/record-visit-form.test.ts (new)
- _bmad-output/implementation-artifacts/5-4-record-a-service-visit-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented record-a-service-visit: bookings schema + snapshots, /reception/visit route reusing wallet debit, admin flow logic, tests; gate green | claude-opus-4-7 |
