# Story 10.4: Settings sub-app

Status: done

> Canonical ID: P1-E10-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S04.md

## Story

As an admin,
I want a single Settings area for system-wide configuration,
so that I can manage SMS, float, loyalty, and branding from one place.

## Acceptance Criteria

1. Settings sections: SMS config, float accounts, loyalty rates, branding (logo/colours), receipt branding.
2. Read/write by `admin`, `super_admin`; some sub-sections need `treasury`.
3. Settings changes audited.

## Tasks / Subtasks

- [x] Task 1: Settings API in `apps/api` (AC: #1, #2, #3)
  - [x] Add routes `apps/api/src/routes/admin/settings.ts` (registered via `apps/api/src/routes/admin/index.ts`): a section index plus GET/PUT for the general key/value sections (loyalty, branding, receipt branding). SMS config + float accounts are aggregated as links to their existing dedicated CRUD surfaces.
  - [x] Apply `@bm/auth` role guards: base `manage config` (`admin`/`super_admin`); float-account sub-section additionally gated on `manage float` (treasury/super_admin) and surfaced as accessible/disabled in the index.
  - [x] Validate payloads with `@bm/contracts` Zod schemas (`SETTING_SCHEMAS`/`parseSettingValue`); write every change to `audit_outbox` (`settings.update`).
- [x] Task 2: Settings UI in `apps/admin` (AC: #1, #2)
  - [x] Settings shell + section navigation under `apps/admin/app/(console)/settings/` + nav item gated on `manage config`.
  - [x] Sub-pages: loyalty rates, branding (logo/colours), receipt branding; SMS + float accounts link out to their existing screens.
  - [x] Disable treasury-gated float sub-section for non-treasury users (shown disabled, not linked).
- [x] Task 3: Tests (AC: all)
  - [x] Integration tests (`apps/api/src/routes/admin/settings.test.ts`): section index + treasury gate (AC1/AC2), general section read/write incl. defaults + validation (AC1), permission enforcement (AC2), audit on save (AC3). Pure form/view-logic unit tests (`apps/admin/lib/settings-view.test.ts`). Test-first, vitest.
  - [~] DOM/e2e tests for the rendered React sub-pages deferred — logic covered by the pure view lib + API integration tests; see review-findings.md.

## Dev Notes

- API in `apps/api` (`apps/api/src/routes/admin/settings.ts`); UI in `apps/admin` (`apps/admin/app/(console)/settings/`). Role gating via `@bm/auth`.
- Role matrix (AC2): `admin` + `super_admin` read/write generally; float-account sub-sections additionally require the `treasury` role.
- All settings mutations audited to `audit_outbox` (AC3 + DoD #4).
- Settings persistence in `packages/db` (settings table/rows) — migrations additive-only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/api/src/routes/admin/settings.ts`, `apps/admin/app/(console)/settings/`, schema in `packages/db`.
- Depends on S01 (nav shell + role-gated routes) and X5 (audit projection) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E10.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (api 374 passing in isolation), `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass. Full-suite `pnpm test` first run showed 9 `Hook timed out in 10000ms` flakes in `@bm/api` under parallel load (PGlite migration apply contention, now 38 migrations); re-running `@bm/api` in isolation passed 374/374 — confirmed timeout flake, not a logic failure.

### Completion Notes List

- Added a generic `settings` key/value table (migration `0038_settings.sql` + `packages/db/src/schema/settings.ts`) backing the general sections (loyalty, branding, receipt branding). SMS config + float accounts keep their existing dedicated tables; the Settings area aggregates them as links.
- `@bm/contracts`: `SETTING_KEYS`, per-section Zod schemas (`loyalty`/`branding`/`receipt_branding`), `SETTING_DEFAULTS`, `parseSettingValue`, `isSettingKey`.
- API `apps/api/src/routes/admin/settings.ts`: section index (AC1, tagged accessible per role — float needs `manage float`, AC2), GET/PUT general sections (upsert, default-when-unset), `manage config` base guard, `settings.update` audit on every save (AC3).
- Admin UI under `apps/admin/app/(console)/settings/`: index + loyalty/branding/receipt-branding editors; nav item gated on `manage config`; pure form/view logic in `apps/admin/lib/settings-view.ts`.

### File List

- packages/db/migrations/0038_settings.sql (new)
- packages/db/src/schema/settings.ts (new)
- packages/db/src/schema/index.ts (edited — export settings)
- packages/contracts/src/index.ts (edited — settings schemas/helpers)
- apps/api/src/routes/admin/settings.ts (new)
- apps/api/src/routes/admin/settings.test.ts (new)
- apps/api/src/routes/admin/index.ts (edited — register settings routes)
- apps/admin/lib/settings-view.ts (new)
- apps/admin/lib/settings-view.test.ts (new)
- apps/admin/lib/nav.ts (edited — Settings nav item)
- apps/admin/lib/nav.test.ts (edited — Settings nav assertions)
- apps/admin/app/(console)/settings/page.tsx (new)
- apps/admin/app/(console)/settings/loyalty/page.tsx (new)
- apps/admin/app/(console)/settings/branding/page.tsx (new)
- apps/admin/app/(console)/settings/receipt-branding/page.tsx (new)
- _bmad-output/implementation-artifacts/10-4-settings-sub-app-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented settings sub-app: generic settings table, API + admin UI, audited writes, role gating; tests green | claude-opus-4-7 |
