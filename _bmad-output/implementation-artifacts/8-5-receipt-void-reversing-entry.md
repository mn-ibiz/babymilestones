# Story 8.5: Receipt void (reversing entry)

Status: ready-for-dev

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

- [ ] Task 1: Schema additions (AC: #1)
  - [ ] Add `kind` (e.g. enum `normal` | `void`, default `normal`) and nullable `reverses_receipt_id` FK to `receipts` in `packages/db`
  - [ ] Generate an additive-only migration
- [ ] Task 2: Void operation as a reversing entry (AC: #1, #2)
  - [ ] Implement void in `packages/payments/src/receipts/` that inserts a new `receipt` row with `kind='void'`, `reverses_receipt_id` set, and negated totals/lines so original + void nets to 0
  - [ ] Never mutate or delete the original (append-only, mirroring the wallet reversing-entry pattern in `packages/wallet`)
- [ ] Task 3: Guard against double-void (AC: #3)
  - [ ] Reject voiding a receipt that already has a void referencing it (and reject voiding a void row); enforce with a check/lookup before insert
- [ ] Task 4: Route + audit (AC: #1, #2)
  - [ ] Add a Fastify route under `apps/api/src/routes/` (admin-only via role guard) to void a receipt
  - [ ] Write a `receipt.voided` event to `audit_outbox`; ensure both original and void are visible in audit
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest, test-first: void creates a `kind='void'` row with `reverses_receipt_id`; original + void totals sum to 0; voiding an already-voided receipt is rejected; audit rows written

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
