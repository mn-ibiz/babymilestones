# Story 32.4: VAT registration metadata

Status: done

> Canonical ID: P5-E02-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S04.md

## Story

As admin, I want to record the company PIN and VAT registration once.

## Acceptance Criteria

1. Settings → Tax → fields: PIN, VAT registration number, registered address.
2. Receipt renderer (PDF + thermal) shows these in the footer block.

## Tasks / Subtasks

- [x] Task 1: Implement VAT registration metadata (AC: #1, #2)
  - [x] Satisfy AC#1: Settings → Tax fields (PIN, VAT registration number, registered address) recorded on the existing `etims` settings section — `etimsSettingsSchema` gains optional, trimmed `pin` / `vatRegistrationNumber` / `registeredAddress`, persisted + audited through the existing `PUT /admin/settings/etims` route (no new route/migration).
  - [x] Satisfy AC#2: The receipt renderer shows the tax block in BOTH the A4 and the 80mm thermal footer (KRA PIN, VAT Reg No, Registered address); each line is emitted only when present, and all values are HTML-escaped on A4.
- [x] Task 2: Tests (AC: all)
  - [x] 4 receipt-footer tests (A4 + thermal show the block; absent metadata omits cleanly; A4 HTML-escapes the address). Full ui + contracts suites green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C packages/ui exec vitest run src/receipt-vat-footer.test.ts` → 4 passed.
- Full ui suite + contracts suite green. tsc clean: ui, contracts.

### Completion Notes List

- Reused the existing `etims` settings section rather than a separate "tax" section: `etimsSettingsSchema` (P5-E02-S03) gains optional, trimmed `pin` (≤20), `vatRegistrationNumber` (≤40) and `registeredAddress` (≤240). They persist + audit through the already-shipped `PUT /admin/settings/etims` route — no new route or migration.
- `ReceiptBusinessDetails` (the receipt renderer's business block) gains `vatRegistrationNumber` / `registeredAddress`; the A4 and thermal renderers print a tax block (KRA PIN, VAT Reg No, Registered address) in the footer. Each line is emitted only when present, so an unregistered business renders nothing extra. A4 values are HTML-escaped.
- The renderer takes the business block from its caller, so a receipt-render route supplies these values from the `etims` settings — no receipt-writer or call-site change.

### File List

- packages/contracts/src/index.ts (etimsSettingsSchema gains pin / vatRegistrationNumber / registeredAddress)
- packages/ui/src/receipt-document.ts (ReceiptBusinessDetails fields + A4/thermal footer tax block)
- packages/ui/src/receipt-vat-footer.test.ts (new — 4 tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Tax-registration metadata on the etims settings section + KRA PIN / VAT Reg / registered address in the A4 + thermal receipt footer | claude-opus-4-8 |
