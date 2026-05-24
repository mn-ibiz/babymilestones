# Story 10.4: Settings sub-app

Status: ready-for-dev

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

- [ ] Task 1: Settings API in `apps/api` (AC: #1, #2, #3)
  - [ ] Add routes `apps/api/src/routes/admin/settings.ts` (registered via `apps/api/src/app.ts`), one resource per section: SMS config, float accounts, loyalty rates, branding, receipt branding
  - [ ] Apply `@bm/auth` role guards: `admin`/`super_admin` for general sections; require `treasury` for float-account sub-sections
  - [ ] Validate payloads with `@bm/contracts` Zod schemas; write every change to `audit_outbox`
- [ ] Task 2: Settings UI in `apps/admin` (AC: #1, #2)
  - [ ] Settings shell + section navigation under `apps/admin/app/(console)/settings/`
  - [ ] Sub-pages: SMS, float accounts, loyalty rates, branding (logo/colours), receipt branding
  - [ ] Hide/disable treasury-gated sub-sections for non-treasury users
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: each section reads/writes; role matrix enforced (admin/super_admin vs treasury-only sub-sections); every save writes `audit_outbox`. Use vitest, test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
