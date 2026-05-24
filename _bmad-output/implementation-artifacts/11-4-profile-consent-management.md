# Story 11.4: Profile & consent management

Status: ready-for-dev

> Canonical ID: P1-E11-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S04.md

## Story

As a parent,
I want to update my details and consent preferences,
so that my profile, marketing consent, and PIN stay under my control.

## Acceptance Criteria

1. Profile edit: name, email, area.
2. Consents toggle: SMS marketing opt-in.
3. PIN change flow (current PIN required).
4. "Export my data" link (P1-E02-S05).

## Tasks / Subtasks

- [ ] Task 1: Profile/consent API in `apps/api` (AC: #1, #2, #3, #4)
  - [ ] Add routes `apps/api/src/routes/profile.ts` (registered via `apps/api/src/app.ts`): update profile (name, email, area), toggle SMS marketing consent
  - [ ] PIN change endpoint via `@bm/auth` requiring current PIN verification
  - [ ] Wire "Export my data" to the P1-E02-S05 export endpoint
  - [ ] Guard with `@bm/auth` (parent session); validate with `@bm/contracts`
- [ ] Task 2: Profile UI in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [ ] Page `apps/platform/app/(app)/profile/page.tsx`: profile edit form (name, email, area)
  - [ ] SMS marketing opt-in toggle
  - [ ] PIN change flow (requires current PIN)
  - [ ] "Export my data" link to the data-export flow
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: profile fields persist; consent toggle persists; PIN change rejects wrong current PIN and succeeds with correct; export link routes to P1-E02-S05. Use vitest, test-first.

## Dev Notes

- API in `apps/api` (`apps/api/src/routes/profile.ts`); UI in `apps/platform` authed route group, mobile-first, using `packages/ui`. PIN change goes through `@bm/auth` (phone+PIN) and must require the current PIN (AC3).
- "Export my data" reuses the P1-E02-S05 export flow — link, do not reimplement.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/profile.ts`, `apps/platform/app/(app)/profile/`. PIN via `@bm/auth`; export via P1-E02-S05.
- Depends on P1-E02 and P1-E01 per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
