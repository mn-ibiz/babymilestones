# Story 8.2: Receipt writer (interface)

Status: ready-for-dev

> Canonical ID: P1-E08-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S02.md

## Story

As a developer,
I want one function to write a receipt,
so that swapping to eTIMS is a one-place change.

## Acceptance Criteria

1. `packages/payments/receipts/index.ts` exports a `writeReceipt(payload): Receipt` interface.
2. The default implementation is `LocalReceiptWriter` (KRA fields left empty).
3. A future `EtimsReceiptWriter` implements the same interface and fills KRA fields.

## Tasks / Subtasks

- [ ] Task 1: Define the writer contract (AC: #1, #3)
  - [ ] Add `ReceiptWriter` interface and `writeReceipt(payload): Receipt` in `packages/payments/src/receipts/index.ts`
  - [ ] Define `WriteReceiptPayload` and `Receipt` types; prefer reusing Zod schemas/types from `packages/contracts`
- [ ] Task 2: Implement `LocalReceiptWriter` (AC: #2)
  - [ ] Persist a `receipts` row + `receipt_lines` via `packages/db`, allocating the per-series `sequence_number`
  - [ ] Leave KRA fields (pin, control_unit_number, cu_invoice_number, qr_data, etims_status) null/empty
  - [ ] Make it the default export/binding behind `writeReceipt`
- [ ] Task 3: Scaffold `EtimsReceiptWriter` placeholder (AC: #3)
  - [ ] Stub a class implementing the same interface (throws "not implemented") to lock the contract shape
- [ ] Task 4: Tests (AC: all)
  - [ ] Unit/integration tests (vitest, test-first): `LocalReceiptWriter` writes receipt + lines with null KRA fields and a monotonic per-series sequence; interface conformance test that `EtimsReceiptWriter` satisfies the same type

## Dev Notes

- This is the single seam for KRA/eTIMS adoption — all callers go through `writeReceipt`, never construct receipt rows directly.
- Builds directly on Story 8.1's schema; KRA columns are nullable so `LocalReceiptWriter` leaves them empty.
- Concrete paths to touch:
  - `packages/payments/src/receipts/index.ts` (new) — interface + `writeReceipt`.
  - `packages/payments/src/receipts/local-receipt-writer.ts` (new).
  - `packages/payments/src/receipts/etims-receipt-writer.ts` (new, stub).
  - `packages/db` — receipts tables from Story 8.1; `packages/contracts` for shared types.
- Package import name is `@bm/payments`.
- Testing standards: vitest, test-first; `pnpm test` in `packages/payments`.

### Project Structure Notes
- New `receipts/` module inside `packages/payments` alongside existing `mpesa`/`paystack`/`cash` adapters.
- Depends on Story 8.1 (receipt schema).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E08-S02.md]
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
