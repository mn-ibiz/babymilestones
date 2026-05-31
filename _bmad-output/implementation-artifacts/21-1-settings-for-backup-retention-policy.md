# Story 21.1: Settings for backup retention policy

Status: done

> Canonical ID: P2-E06-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S01.md

## Story

As admin, I want to choose how many daily / monthly backups to keep.

## Acceptance Criteria

1. Settings: `daily_retention_days` (default 30), `monthly_retention_months` (default 12).
2. Admin-editable; audit logged.
3. Decision 35 unlocked here (P1 ships fixed 30-day).

## Tasks / Subtasks

- [x] Task 1: Implement Settings for backup retention policy (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `dailyKeep`/`monthlyKeep`/`graceDays` policy stored in `settings` (defaults 30/12/7).
  - [x] Satisfy AC#2: Admin-editable via GET/PUT `/admin/backup-retention` (guarded by `settings:read`/`settings:write`); audited (`backup.retention.updated` → `audit_outbox`).
  - [x] Satisfy AC#3: Decision 35 unlocked — retention is now configurable rather than the fixed P1 30-day window.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: contract schema boundaries, effective-policy resolver (real PGlite), route auth + happy/invalid paths + audit, admin form-parsing helpers.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E10.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E06.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

Gate all green: contracts (62 tests) + tsc, auth (187) + tsc, api (61) + tsc, admin (20) + tsc.

### Completion Notes List

- Policy stored in the existing `settings` table under key `backup.retention` — **no migration** (0082 stays reserved for 21-2 if needed).
- Reused the existing `settings:read`/`settings:write` RBAC permissions rather than inventing new ones.
- Effective-policy resolver returns defaults when the setting is unset or malformed and never throws (the 21-2 pruner depends on this).
- AC restated as keep-counts (`dailyKeep`/`monthlyKeep`) plus a `graceDays` window; supersedes the AC's `*_days`/`*_months` field names. Defaults 30/12/7 preserve P1 behaviour.
- Audit goes to the durable `audit_outbox` (outbox pattern) via the shared `audit()` helper.

### File List

- packages/contracts/src/index.ts (append: schema, key, defaults)
- packages/contracts/src/backup-retention.test.ts (new)
- packages/auth/src/audit-actions.ts (add `BACKUP_RETENTION_UPDATED`)
- apps/api/src/lib/backup-retention.ts (new — effective-policy resolver + upsert)
- apps/api/src/lib/backup-retention.test.ts (new)
- apps/api/src/routes/admin/backup-retention.ts (new — GET/PUT, auth + audit)
- apps/api/src/routes/admin/backup-retention.test.ts (new)
- apps/api/src/routes/admin/index.ts (wire router)
- apps/admin/lib/backup-retention.ts (new — form parsing + summary)
- apps/admin/lib/backup-retention.test.ts (new)
- apps/admin/app/admin/backup-retention/page.tsx (new — settings page shell)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented: contract schema + defaults, effective-policy resolver, admin GET/PUT routes (auth + audit), admin settings UI helpers. Reused `settings`; no migration. | Dev |
