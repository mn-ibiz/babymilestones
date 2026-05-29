# Story 32.3: Switch flag with rollback

Status: backlog

> Canonical ID: P5-E02-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S03.md

## Story

As admin, I want to enable/disable eTIMS without code deploy.

## Acceptance Criteria

1. Settings flag `receipts.etims_enabled`.
2. Off → `LocalReceiptWriter` (P1); On → `EtimsReceiptWriter`.
3. Audit on flag change.
4. New receipts only — historical ones not retroactively re-issued.

## Tasks / Subtasks

- [x] Task 1: Implement Switch flag with rollback (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Settings flag in the generic `settings` table under the `etims` section (`{ enabled: boolean }`, contracts `etimsSettingsSchema`), surfaced in the admin Settings index + read/write via `/admin/settings/etims`. Default OFF.
  - [x] Satisfy AC#2: `resolveReceiptWriter(db, { etims })` — OFF → `LocalReceiptWriter`; ON (with eTIMS wired) → `EtimsReceiptWriter`; ON-but-unwired → local (fail-safe). No receipt CALL-SITE shape changes; the resolver is the documented swap point.
  - [x] Satisfy AC#3: Flag change audited twice — the generic `settings.update` plus a dedicated `etims.flag.changed` row carrying the on/off value.
  - [x] Satisfy AC#4: The flag selects the writer only for NEW receipts; nothing reads/rewrites historical receipts, so flipping back to OFF is a clean rollback with no data loss.
- [x] Task 2: Tests (AC: all)
  - [x] 6 writer-selector tests (default-off, read flag, off→local, on→etims, on-unwired→local fail-safe, flip-back rollback) + 4 admin-settings tests (index lists etims, default disabled, enable persists + audits, rollback off).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E10-S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- payments writer-selector 6 tests + api settings 4 eTIMS tests passed; auth catalogue green; tsc clean (contracts, payments, api).

### Completion Notes List

- The story spec named the flag `receipts.etims_enabled`; implemented as the `etims` section in the existing generic `settings` store (`{ enabled }`), consistent with how every other admin-managed flag lives (loyalty/branding). No new table/migration needed.
- `resolveReceiptWriter` is the runtime swap point: it reads the flag and returns the local or eTIMS writer. ON-but-unwired falls back to local (fail-safe) so a misconfiguration never breaks every receipt.
- Default OFF means production is unaffected until an admin enables it; flipping back is a clean rollback (NEW receipts only — no historical re-issue).
- Flag change audited via both `settings.update` and a dedicated `etims.flag.changed` action.

### File List

- packages/contracts/src/index.ts (etimsSettingsSchema + SETTING_KEYS/SCHEMAS/DEFAULTS entry)
- packages/payments/src/receipts/writer-selector.ts (new)
- packages/payments/src/receipts/writer-selector.test.ts (new)
- packages/payments/src/receipts/index.ts + packages/payments/src/index.ts (selector exports)
- apps/api/src/routes/admin/settings.ts (etims section + etims.flag.changed audit)
- apps/api/src/routes/admin/settings.test.ts (eTIMS flag tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | eTIMS enable flag + runtime writer selector + clean rollback; default OFF | claude-opus-4-8 |
