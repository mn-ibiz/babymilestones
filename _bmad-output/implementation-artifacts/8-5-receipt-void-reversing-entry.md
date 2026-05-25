# Story 8.5: Receipt void (reversing entry)

Status: done

> Canonical ID: P1-E08-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S05.md

## Story

As an admin,
I want to void a wrong receipt without deleting it,
so that the record stays auditable and totals reconcile to zero.

## Acceptance Criteria

1. Void creates a new receipt row with `kind='void'` and a `reverses_receipt_id` FK.
2. Net total of the original + void = 0; both are visible in the audit trail.
3. An already-voided receipt cannot be voided again.

## Tasks / Subtasks

- [x] Task 1: Schema additions (AC: #1)
  - [x] Add `kind` (enum `normal` | `void`, default `normal`) and nullable `reverses_receipt_id` FK to `receipts` in `packages/db`
  - [x] Generate an additive-only migration (`0033_receipt_void_reversing_entry.sql`); also relaxes the non-negative money CHECKs so void rows can carry negated amounts, and adds a partial unique index `receipts_reverses_receipt_id_unique`
- [x] Task 2: Void operation as a reversing entry (AC: #1, #2)
  - [x] Implemented `voidReceipt` in `packages/payments/src/receipts/void.ts` — inserts a new `kind='void'` receipt with `reverses_receipt_id` set and negated totals/lines so original + void nets to 0
  - [x] Original is never mutated or deleted (append-only, mirroring the wallet reversing-entry pattern)
- [x] Task 3: Guard against double-void (AC: #3)
  - [x] Rejects voiding a receipt already referenced by a void (`AlreadyVoidedError`) and voiding a void row (`VoidTargetIsVoidError`); app check inside the tx + partial unique index as DB backstop
- [x] Task 4: Route + audit (AC: #1, #2)
  - [x] `POST /receipts/:id/void` in `apps/api/src/routes/receipts/void.ts`, admin-only via `requirePermission("manage","receipt")` + CSRF
  - [x] Writes a `receipt.voided` audit_outbox row in the same tx referencing both original and void
- [x] Task 5: Tests (AC: all)
  - [x] vitest, test-first: unit tests (`packages/payments/src/receipts/void.test.ts`) + route integration tests (`apps/api/src/routes/receipts/void.test.ts`) covering void creation, net-zero, double-void rejection, void-of-void, 404, audit, admin-only guard, auth/CSRF

## Dev Notes

- Void is a reversing entry, not a delete — directly mirrors the `packages/wallet` ledger pattern (append a reversing row, never edit history).
- Net-zero invariant: the void row's totals/lines negate the original.
- Concrete paths to touch:
  - `packages/db` — `kind` + `reverses_receipt_id` columns + additive migration.
  - `packages/payments/src/receipts/` — void logic.
  - `apps/api/src/routes/` — admin-only void route (role guard from `packages/auth`).
  - `audit_outbox` via `packages/db`.
- Testing standards: vitest, test-first; migrations additive-only; audited actions write to `audit_outbox` per DoD.

### Project Structure Notes
- Spans `packages/db`, `packages/payments`, and `apps/api`; references the `packages/wallet` reversing-entry pattern.
- Depends on Story 8.1 (receipt schema).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E08].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` green. The
  `@bm/api` suite flaked once on a `beforeEach` hook timeout under full parallel
  load (a known env flake); a clean re-run passed all 318 tests.

### Completion Notes List

- Void is a reversing entry, never a delete: `voidReceipt` appends a new
  `kind='void'` receipt with `reverses_receipt_id` set and negated totals/lines,
  so original + void nets to exactly 0 (header total/tax_total and every line).
- Double-void guarded two ways: an in-transaction lookup raising
  `AlreadyVoidedError`, plus a partial unique index
  (`receipts_reverses_receipt_id_unique`) as the DB backstop for concurrency.
  Voiding a void row is separately rejected (`VoidTargetIsVoidError`).
- Migration 0033 drops the non-negative money CHECKs from 0032 so void rows can
  store negative amounts; the receipt writer still validates non-negative input
  for normal receipts, and void is the only producer of negative rows.
- Route is admin-only (`manage receipt` — admin/super_admin), CSRF-guarded, and
  audits `receipt.voided` (actor + both receipt ids) in the same transaction.

### File List

- packages/db/migrations/0033_receipt_void_reversing_entry.sql (new)
- packages/db/src/schema/receipts.ts (kind, reversesReceiptId, indexes, ReceiptKind)
- packages/payments/src/receipts/void.ts (new)
- packages/payments/src/receipts/void.test.ts (new)
- packages/payments/src/receipts/index.ts (exports)
- packages/payments/src/index.ts (public exports)
- apps/api/src/routes/receipts/void.ts (new)
- apps/api/src/routes/receipts/void.test.ts (new)
- apps/api/src/routes/receipts/index.ts (wire route)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Receipt void implemented as a reversing entry (schema + migration, payments void op, admin route + audit, tests); status done | claude-opus-4-7 |
