# Story 32.1: eTIMS adapter implementation

Status: done

> Canonical ID: P5-E02-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S01.md

## Story

As the system, I want to call KRA eTIMS APIs to record taxable receipts.

## Acceptance Criteria

1. New writer `EtimsReceiptWriter` implements the same interface from P1-E08-S02.
2. Calls eTIMS endpoints with: PIN, business details, invoice items + tax, idempotency key.
3. Populates the previously-nullable KRA fields on the receipt (control_unit_number, cu_invoice_number, qr_data).
4. Connection details + PIN stored as encrypted secrets (env-refs, not literal).
5. Decision refs: 1, 30.

## Tasks / Subtasks

- [x] Task 1: Implement eTIMS adapter implementation (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: New writer satisfies the same `ReceiptWriter` interface (P1-E08-S02) via `createEtimsReceiptWriter`; no receipt call-site changes.
  - [x] Satisfy AC#2: `buildEtimsInvoice` maps PIN/branch/business + items+tax; the `<series>-<seq>` invoice number is the idempotency key sent in the body + `Idempotency-Key` header.
  - [x] Satisfy AC#3: Fills `control_unit_number`, `cu_invoice_number`, `qr_data` (+ `pin`, `etims_status="accepted"`) on the persisted receipt.
  - [x] Satisfy AC#4: Config (PIN/apiKey/baseUrl) is env-sourced; factory throws `EtimsConfigError` on missing secrets; transport injected — no real network from defaults.
  - [x] Satisfy AC#5: Decision refs 1, 30 — one writer seam, transport injected like M-Pesa/Paystack.
- [x] Task 2: Tests (AC: all)
  - [x] 8 pure payload tests + 7 PGlite/transport adapter tests; the original P1-E08 seam test stays green.

## Dev Notes

Hosted KRA test env for staging; production switch via admin setting + env var.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E08.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C packages/payments exec vitest run` → 91 passed (12 files): 8 payload + 7 adapter, the retained P1-E08 seam test (zero-arg stub still throws `EtimsNotImplementedError`) green, plus the existing receipt suites.
- tsc clean: packages/payments (and packages/db).

### Completion Notes List

- The P1-E08 stub `EtimsReceiptWriter` (zero-arg, throws `EtimsNotImplementedError`) is retained so the original seam contract test passes unchanged; real callers use the new `createEtimsReceiptWriter(config, { db, transport })` factory.
- Adapter mirrors the M-Pesa/Paystack injection idiom: injectable `EtimsTransport`; `defaultFetchTransport` (globalThis.fetch) is only constructed/used at call time, never at module load or writer construction; tests pass a fake — no real network from defaults.
- eTIMS registration happens BEFORE persistence: on transport throw OR an explicit `ok:false` rejection the writer throws `EtimsTransportError` and writes no receipt — a clean slate for the 32-2 retry queue (verified: zero rows after a 503 and after an explicit rejection).
- Idempotency key = `"<series>:<sequence>"` (series `KRA`) sent in the body and the `Idempotency-Key` header so a retried submission cannot double-register a KRA invoice.
- Fills the previously-nullable receipt KRA fields (`pin`, `control_unit_number`, `cu_invoice_number`, `qr_data`) plus a new `etims_status='accepted'` column (migration 0071, additive).
- Config (PIN/businessName/apiKey/baseUrl) is supplied by the caller (env-sourced secrets, not literals); the factory throws `EtimsConfigError` if any is missing.

### File List

- packages/payments/src/receipts/etims-payload.ts (new — pure `buildEtimsInvoice` + `computeLineVat`; VAT-inclusive, integer cents)
- packages/payments/src/receipts/etims-payload.test.ts (new — 8 tests)
- packages/payments/src/receipts/etims-receipt-writer.ts (rewritten: retained zero-arg stub + live `createEtimsReceiptWriter` adapter behind the SAME `writeReceipt(db, payload)` contract)
- packages/payments/src/receipts/etims-receipt-writer.test.ts (new — 7 tests)
- packages/payments/src/receipts/index.ts (export the adapter, payload + VAT, and the writer-selector re-exports)
- packages/payments/src/index.ts (re-export the eTIMS adapter / selector / payload API at the package root)
- packages/db/migrations/0071_etims_receipts.sql (new — additive `ADD COLUMN IF NOT EXISTS etims_status`; the `receipts` schema already declared the column at P1-E08)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Live eTIMS adapter behind the P1-E08 ReceiptWriter seam; injectable transport; idempotent; KRA fields filled | claude-opus-4-8 |
