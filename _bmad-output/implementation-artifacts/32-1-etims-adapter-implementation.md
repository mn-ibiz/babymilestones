# Story 32.1: eTIMS adapter implementation

Status: backlog

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

- [ ] Task 1: Implement eTIMS adapter implementation (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: New writer `EtimsReceiptWriter` implements the same interface from P1-E08-S02.
  - [ ] Satisfy AC#2: Calls eTIMS endpoints with: PIN, business details, invoice items + tax, idempotency key.
  - [ ] Satisfy AC#3: Populates the previously-nullable KRA fields on the receipt (control_unit_number, cu_invoice_number, qr_data).
  - [ ] Satisfy AC#4: Connection details + PIN stored as encrypted secrets (env-refs, not literal).
  - [ ] Satisfy AC#5: Decision refs: 1, 30.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
