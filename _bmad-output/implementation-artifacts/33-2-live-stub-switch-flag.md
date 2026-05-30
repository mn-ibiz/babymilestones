# Story 33.2: Live/stub switch flag

Status: done

> Canonical ID: P5-E03-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S02.md

## Story

As admin, I want to flip the stub off when the sender ID is registered.

## Acceptance Criteria

1. Settings flag `sms.live_enabled`.
2. Off → `StubAdapter`; On → `LiveSmsAdapter`.
3. Audit on flag change.

## Tasks / Subtasks

- [x] Task 1: Implement Live/stub switch flag (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Settings flag `sms.live_enabled` (`SMS_LIVE_ENABLED_KEY` in `@bm/sms`; default OFF).
  - [x] Satisfy AC#2: Off → `StubSmsSender`; On (+ wired transport/key) → `LiveSmsAdapter`, via `resolveSmsSender`.
  - [x] Satisfy AC#3: Audit `sms.live.toggled` with before/after on every flip.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first: `packages/sms/src/switch.test.ts` (5), `apps/api/src/routes/admin/sms-live.test.ts` (4), `apps/admin/lib/sms-live.test.ts` (2)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E10-S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `packages/sms` suite → 61 passed (incl 5 switch tests; run from repo root for the drizzle dedupe config)
- `apps/api` full suite → 716 passed (incl 5 sms-live route tests)
- `apps/admin` full suite → 329 passed (incl 2 sms-live lib tests)
- typecheck clean: packages/sms, packages/auth, packages/db, apps/api, apps/admin

### Completion Notes List

- Switch lives in the existing generic `settings` k/v store under `sms.live_enabled` — no migration needed. DEFAULT is OFF; ANY non-`true` value resolves to stub (fail-safe — no accidental real sends).
- `resolveSmsSender(db, live)` is the seam: returns `LiveSmsAdapter` only when the flag is true AND transport + key are wired; otherwise the stub. Live-without-credentials degrades to the stub rather than half-sending.
- Admin route `PUT/GET /api/admin/sms-live` guarded by `sms.config.manage`; flips audited as `sms.live.toggled` with before/after (AC3).
- Admin UI surface added at `apps/admin/app/settings/sms-live` with a confirm before going live.
- No SMS call-site changed; the toggle is read at the composition seam.

### File List

- packages/auth/src/audit-actions.ts (modified — `sms.live.toggled` etc.)
- packages/sms/src/switch.ts (new — flag key + resolveSmsSender)
- packages/sms/src/switch.test.ts (new — 5 tests)
- packages/sms/src/index.ts (modified — export switch helpers)
- apps/api/src/routes/admin/sms-live.ts (new — Fastify toggle route `registerAdminSmsLive`, `manage config` guard)
- apps/api/src/routes/admin/sms-live.test.ts (new — 5 tests, real Fastify `buildApp` + staff-auth)
- apps/api/src/routes/admin/index.ts (modified — register sms-live route)
- apps/admin/lib/sms-live.ts (new) + apps/admin/lib/sms-live.test.ts (new — 2 tests)
- apps/admin/app/settings/sms-live/page.tsx + SmsLiveClient.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Live/stub switch flag (default OFF), audited toggle route + admin surface | Claude Opus 4.8 |
