# Story 7.4: VAT / tax flag per service

Status: done

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

- [x] Task 1: Add tax_treatment to services (AC: #1, #3)
  - [x] In `packages/db`, add `tax_treatment` ENUM (`vat_inclusive`, `vat_exclusive`, `vat_exempt`, `zero_rated`) on `services`, default `vat_exempt` (CHECK-constrained text column + `TaxTreatment` type)
  - [x] Add additive-only Drizzle migration (0031, guarded/idempotent)
- [x] Task 2: Expose tax_treatment in catalogue + API (AC: #1)
  - [x] In `packages/catalog`, include `tax_treatment` in service read/write; update `packages/contracts` Zod schemas (`TAX_TREATMENTS`, `DEFAULT_TAX_TREATMENT`, `isTaxTreatment`, create defaults / update strict-optional)
  - [x] Surface field via the service admin route in `apps/api/src/routes/` (serialize + create/update)
  - [x] Audit on change (DoD #4 / `audit_outbox`) — create payload carries `tax_treatment`; update audits `changes`
- [x] Task 3: Receipt-engine line-tax (AC: #2)
  - [x] Expose the field cleanly for the (not-yet-present) receipt engine: `getServiceTaxTreatment` / `serviceTaxTreatment` getters + a pure, float-free `computeLineTax(treatment, amountCents, rateBps?)` helper (`KENYA_VAT_RATE_BPS = 1600`)
- [x] Task 4: Admin UI (AC: #1, #3)
  - [x] In `apps/admin`, add tax-treatment selector to the service form, defaulting to `vat_exempt`
- [x] Task 5: Tests (AC: all)
  - [x] Wrote vitest unit/integration tests (test-first): ENUM values + `vat_exempt` default, persistence, DB CHECK rejection, line-tax computation, API create/read/PATCH + audit, and admin-form validation

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

claude-opus-4-7

### Debug Log References

Full gate green: `pnpm test` (all suites, 294 API tests pass), `pnpm typecheck`, `pnpm lint`, `pnpm build`. One lint fix: dropped an unused `DEFAULT_TAX_TREATMENT` import in `services-form.ts` (it is re-exported via a separate `export { … } from` statement).

### Completion Notes List

- `tax_treatment` modelled as a non-null CHECK-constrained text column on `services` defaulting to `vat_exempt` (AC1/AC3), mirroring the existing `attribution_role_required` pattern (db has no contracts dependency; migration CHECK is the runtime source of truth).
- Migration 0031 is additive + idempotent (guarded `ADD COLUMN` and `ADD CONSTRAINT`); the default backfills existing rows.
- Contracts: create-schema collapses absent/empty to the default `vat_exempt`; update-schema is strict-optional (only changed when present) and validated.
- Receipt-engine readiness (AC2): the receipt engine (P1-E08) is not yet present, so the treatment is exposed cleanly via `getServiceTaxTreatment`/`serviceTaxTreatment` plus a pure, float-free `computeLineTax` helper (exclusive adds VAT, inclusive backs it out, exempt/zero-rated carry no tax; net+tax always reconstitutes gross). `KENYA_VAT_RATE_BPS = 1600`; rate is a parameter so it stays config-driveable when KRA registration lands.
- Single self-review: no BLOCKER/high findings; no deferred findings.

### File List

- packages/db/migrations/0031_service_tax_treatment.sql (new)
- packages/db/src/schema/services.ts
- packages/contracts/src/index.ts
- packages/contracts/src/index.test.ts
- packages/catalog/src/services.ts
- packages/catalog/src/services.test.ts
- packages/catalog/src/index.ts
- apps/api/src/routes/admin/services.ts
- apps/api/src/routes/admin/services.test.ts
- apps/admin/lib/services-form.ts
- apps/admin/lib/services-form.test.ts
- apps/admin/app/services/page.tsx

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented VAT/tax treatment per service: schema + migration 0031, contracts, catalog (+ computeLineTax), admin API, admin UI; test-first; gate green | claude-opus-4-7 |
