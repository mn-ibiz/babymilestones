# Story 5.6: Print + SMS-stub receipt from Reception

Status: ready-for-dev

> Canonical ID: P1-E05-S06 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S06.md

## Story

As Reception,
I want to print or text a receipt to a parent after a transaction,
so that they leave with proof of payment.

## Acceptance Criteria

1. After any payment, a "Print" + "SMS" button pair appears.
2. Print uses browser's default printer (Decision 13).
3. SMS uses stub adapter (P1-E09).
4. Reprint available from the transaction history at any time.

## Tasks / Subtasks

- [ ] Task 1: Receipt contract + data (AC: #1, #2, #4)
  - [ ] Add receipt Zod schema in `packages/contracts` (transaction_id → receipt payload: parent, line items, amount, method, date)
  - [ ] `apps/api/src/routes/reception/receipt.ts` — fetch receipt payload by transaction id; register in `apps/api/src/app.ts` (buildApp)
- [ ] Task 2: SMS receipt via stub (AC: #3)
  - [ ] Send receipt SMS through `@bm/sms` stub adapter (provider-agnostic); endpoint to trigger SMS for a transaction; write `audit_outbox` row
- [ ] Task 3: Receipt UI + print (AC: #1, #2)
  - [ ] `apps/admin` Reception — after any payment show "Print" + "SMS" button pair
  - [ ] Print renders `ReceiptPreview` compound (from `packages/ui`) and uses the browser's default printer (Decision 13)
- [ ] Task 4: Reprint from history (AC: #4)
  - [ ] Surface Print + SMS actions on each transaction-history row so receipts can be reprinted/re-sent anytime
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: receipt payload shaping, SMS stub invoked with correct content (vitest, test-first)
  - [ ] Integration: receipt endpoint by transaction id; SMS stub send audited
  - [ ] E2E: post-payment Print+SMS appear; reprint from history works

## Dev Notes

- Print uses the browser's default printer per Decision 13 — no custom print server; render the `ReceiptPreview` compound from `packages/ui` and invoke browser print.
- SMS goes through the provider-agnostic `@bm/sms` stub adapter at launch (P1-E09); keep it swappable.
- Receipts are reproducible from transaction history at any time, not just immediately after payment.
- Source paths to touch: `apps/api/src/routes/reception/receipt.ts`, `apps/admin` Reception receipt UI, `packages/contracts` (receipt schema), `@bm/sms` (stub), `packages/ui` (`ReceiptPreview`).
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI + print in `apps/admin`; receipt template compound in `packages/ui`; SMS via `packages/sms`.
- Dependencies (from source): P1-E08 (transactions), P1-E09 (SMS stub). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
