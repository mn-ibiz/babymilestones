# Story 33.4: Template editor (admin)

Status: done

> Canonical ID: P5-E03-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S04.md

## Story

As admin, I want to edit SMS bodies without code changes.

## Acceptance Criteria

1. Settings → SMS Templates → list + edit.
2. Placeholder validation: missing `{name}` etc. flagged.
3. New version on save; old versions retained.

## Tasks / Subtasks

- [x] Task 1: Implement Template editor (admin) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Settings → SMS Templates → list + edit (GET list/versions + PUT save in `apps/api/src/routes/admin/sms-templates.ts`).
  - [x] Satisfy AC#2: Placeholder validation: missing `{name}` etc. flagged (`validateTemplateBody` in `packages/sms/src/template-editor.ts`).
  - [x] Satisfy AC#3: New version on save; old versions retained (`saveTemplateVersion` — inserts `version+1`, deactivates prior active, keeps history).
- [x] Task 2: Tests (AC: all)
  - [x] Unit (`packages/sms/src/template-editor.test.ts`) + integration (`apps/api/src/routes/admin/sms-templates.test.ts`) cover each AC.

## Dev Agent Record

### Completion Notes
- WRITE side added in `packages/sms/src/template-editor.ts`: `extractPlaceholders`, `validateTemplateBody`, `saveTemplateVersion` (+ types `TemplateValidation`, `SaveTemplateVersionInput`), re-exported from the package index.
- Admin CRUD route extended with `PUT /admin/sms-templates/:key` (requires `manage config`, audited `sms.template.saved`).
- Pre-existing blockers fixed: added `getSetting`/`setSetting` to `@bm/db` (`packages/db/src/settings.ts`) used by switch/limiter/sms-live; added the missing `apps/api/src/testing/staff-auth.ts` helper; corrected two stale committed test assertions (33-1/33-3) that failed on the baseline.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E09-S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
