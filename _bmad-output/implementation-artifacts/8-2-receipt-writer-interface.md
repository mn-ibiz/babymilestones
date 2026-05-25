# Story 8.2: Receipt writer (interface)

Status: done

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

- [x] Task 1: Define the writer contract (AC: #1, #3)
  - [x] Add `ReceiptWriter` interface and `writeReceipt(payload): Receipt` in `packages/payments/src/receipts/index.ts`
  - [~] Define `WriteReceiptPayload` and `Receipt` types — defined locally in the receipts module. `packages/contracts` has no KRA-shaped receipt schema (its `ReceiptPayload` is the legacy P1-E05 reception receipt, explicitly "NOT the eTIMS/KRA receipt"); reusing it would be wrong, so new types own this seam.
- [x] Task 2: Implement `LocalReceiptWriter` (AC: #2)
  - [x] Persist a `receipts` row + `receipt_lines` via `packages/db`, allocating the per-series `sequence_number`
  - [x] Leave KRA fields (pin, control_unit_number, cu_invoice_number, qr_data, etims_status) null/empty
  - [x] Make it the default export/binding behind `writeReceipt`
- [x] Task 3: Scaffold `EtimsReceiptWriter` placeholder (AC: #3)
  - [x] Stub a class implementing the same interface (throws `EtimsNotImplementedError`) to lock the contract shape
- [x] Task 4: Tests (AC: all)
  - [x] Unit/integration tests (vitest, test-first): `LocalReceiptWriter` writes receipt + lines with null KRA fields and a monotonic per-series sequence; interface conformance test that `EtimsReceiptWriter` satisfies the same type

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

claude-opus-4-7

### Debug Log References

- `pnpm --filter @bm/payments test` → 45 passed (9 new receipt-writer tests).
- Full gate from repo root: `pnpm test` (15 ok), `pnpm typecheck` (15 ok), `pnpm lint` (15 ok), `pnpm build` (5 ok) — all green.

### Completion Notes List

- `writeReceipt(db, payload)` is the single KRA/eTIMS seam, bound to `defaultReceiptWriter` (a `LocalReceiptWriter`). Swapping to eTIMS at P5 is one assignment.
- `LocalReceiptWriter` persists the `receipts` header + `receipt_lines` (8.1 schema), derives `total`/`taxTotal` from the lines, allocates the per-series `sequence_number` (MAX+1 within `series`), and leaves all KRA fields null.
- `EtimsReceiptWriter` implements the same `ReceiptWriter` interface as a no-op stub (`throws EtimsNotImplementedError`) to lock the contract; real impl is P5-E02.
- Types defined locally (not from `@bm/contracts`) — see Task 1 note; the contracts `ReceiptPayload` is the unrelated legacy reception receipt.
- Sequence allocation is read-then-insert; the `(series, sequence_number)` UNIQUE constraint is the backstop. Concurrency hardening deferred (see review-findings).

### File List

- `packages/payments/src/receipts/index.ts` (new) — interface, types, `writeReceipt`, `defaultReceiptWriter`, `formatReceiptNumber`.
- `packages/payments/src/receipts/local-receipt-writer.ts` (new) — `LocalReceiptWriter`, `ReceiptValidationError`.
- `packages/payments/src/receipts/etims-receipt-writer.ts` (new) — `EtimsReceiptWriter` stub, `EtimsNotImplementedError`.
- `packages/payments/src/receipts/index.test.ts` (new) — vitest suite (PGlite).
- `packages/payments/src/index.ts` (edit) — re-export the receipts module.
- `_bmad-output/implementation-artifacts/8-2-receipt-writer-interface-review-findings.md` (new) — deferred findings.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Receipt writer interface implemented: `writeReceipt` + `LocalReceiptWriter` (default) + `EtimsReceiptWriter` stub; test-first; gate green | claude-opus-4-7 |
