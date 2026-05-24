# Story 7.4: VAT / tax flag per service

Status: ready-for-dev

> Canonical ID: P1-E07-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S04.md

## Story

As an accountant,
I want each service to declare its tax treatment,
so that receipts and reports show VAT correctly.

## Acceptance Criteria

1. `services.tax_treatment` ENUM (`vat_inclusive`, `vat_exclusive`, `vat_exempt`, `zero_rated`).
2. Receipt engine (P1-E08) shows line-tax accordingly.
3. Default `vat_exempt` (KRA registration deferred).

## Tasks / Subtasks

- [ ] Task 1: Add tax_treatment to services (AC: #1, #3)
  - [ ] In `packages/db`, add `tax_treatment` ENUM (`vat_inclusive`, `vat_exclusive`, `vat_exempt`, `zero_rated`) on `services`, default `vat_exempt`
  - [ ] Add additive-only Drizzle migration
- [ ] Task 2: Expose tax_treatment in catalogue + API (AC: #1)
  - [ ] In `packages/catalog`, include `tax_treatment` in service read/write; update `packages/contracts` Zod schemas
  - [ ] Surface field via the service admin route in `apps/api/src/routes/`
  - [ ] Audit on change (DoD #4 / `audit_outbox`)
- [ ] Task 3: Receipt-engine line-tax (AC: #2)
  - [ ] Provide `tax_treatment` to the receipt engine (P1-E08) so it computes/displays line-tax per treatment; if the receipt engine is not yet present, expose the field cleanly for it to consume
- [ ] Task 4: Admin UI (AC: #1, #3)
  - [ ] In `apps/admin`, add tax-treatment selector to the service form, defaulting to `vat_exempt`
- [ ] Task 5: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): ENUM values + `vat_exempt` default, persistence, and that the field is exposed for the receipt engine

## Dev Notes

- `tax_treatment` is a non-null ENUM on `services` defaulting to `vat_exempt` (KRA registration deferred).
- Line-tax display is owned by the receipt engine (P1-E08); this story's job is to model and expose the treatment correctly.
- Audit on change (DoD #4 / `audit_outbox`).
- Paths to touch: `packages/db` (column + additive migration), `packages/catalog`, `packages/contracts`, `apps/api/src/routes/`, `apps/admin`.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Catalogue story → anchors to `packages/catalog`, `packages/db`, `apps/admin`.
- Depends on P1-E07-S01 (services table). Consumed downstream by P1-E08 receipt engine.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E07].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
