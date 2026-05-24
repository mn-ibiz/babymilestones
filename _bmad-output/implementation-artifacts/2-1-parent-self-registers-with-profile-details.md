# Story 2.1: Parent self-registers with profile details

Status: done

> Canonical ID: P1-E02-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S01.md

## Story

As a parent,
I want to add my name, language preference, and emergency contact during signup,
so that the system knows me.

## Acceptance Criteria

1. After PIN setup, an inline profile form captures: first name, last name, optional email, residential area (free text).
2. Required fields validated; email regex permissive (RFC 5322 light).
3. Skip allowed; profile completion banner shown until done.
4. Profile edit available from dashboard at any time.

## Tasks / Subtasks

- [x] Task 1: Add `parents` table to shared schema (AC: #1)
  - [x] In `packages/db`, add `parents` table with FK to `users` (one parent per user; no joint accounts for v1): first_name, last_name, email (nullable), residential_area (nullable free text)
  - [x] Add additive-only Drizzle migration in `packages/db` (`0006_parents.sql`)
- [x] Task 2: Profile create/update API (AC: #1, #2, #4)
  - [x] Add route under `apps/api/src/routes/parents/` for create/get/update (upsert) of the authed parent profile (`GET`/`PUT /parents/me`)
  - [x] Define Zod schemas in `packages/contracts` (RFC 5322-light permissive email regex; required first/last name)
  - [x] On any create/update, write to `audit_outbox` (`parent.profile.create` / `parent.profile.update`)
- [x] Task 3: Inline profile form post-PIN-setup (AC: #1, #3)
  - [x] In `apps/platform/app/welcome/profile/`, render the inline profile form (`ProfileForm`)
  - [x] Allow skip; show profile-completion banner until profile is complete (`CompletionBanner` + `shouldShowCompletionBanner`)
- [x] Task 4: Dashboard profile edit (AC: #4)
  - [x] In `apps/platform/app/profile/`, add profile edit screen seeded from the current profile, reachable at any time
- [x] Task 5: Tests (AC: all)
  - [x] vitest tests (test-first): schema/migration (`parents.test.ts`), validation + permissive email + completion (`contracts/index.test.ts`), API create/edit + auth + CSRF + audit (`profile.test.ts`), client validation + skip/banner + edit-seed (`platform/lib/profile.test.ts`)
  - [~] React render-level tests for the UI components deferred — platform has no jsdom/RTL harness yet (see review-findings); behaviour covered via pure helpers + API integration tests

## Dev Notes

- `parents` table FKs to `users`; exactly one parent per user (no joint accounts in v1).
- Email validation is permissive (RFC 5322 light) — keep it forgiving, not strict.
- Audited actions must write to `audit_outbox` (DoD #4).
- Paths to touch: `packages/db` (schema + additive migration), `apps/api/src/routes/`, `packages/contracts` (Zod), `apps/platform/app/` (inline form + dashboard edit).
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first (red/green/refactor). Cover each AC with unit/integration/E2E as appropriate (DoD #2); no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `packages/db`, `apps/api/src/routes/`, `apps/platform`.
- Depends on P1-E01-S01 (user/PIN setup must exist before the inline profile form fires).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E02].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` (14/14 tasks each).
- Build fix: Next/webpack does not resolve `.js` extensions in `.tsx`/`.ts` app sources — switched platform app/component/lib imports to extensionless (matches existing `app/page.tsx`).

### Completion Notes List

- `parents` table is one-per-user (UNIQUE FK to `users`); profile is an idempotent upsert via `PUT /parents/me`. The user id always comes from the validated session, never the request body (no IDOR).
- Email validation is permissive (RFC 5322 light: `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`); blank optionals collapse to `null`.
- AC3 banner logic is a pure shared helper (`isProfileComplete` in contracts; `shouldShowCompletionBanner` in platform) so both API and UI agree.
- Create/update both write `audit_outbox` rows (`parent.profile.create` / `parent.profile.update`) with no sensitive payload.
- One low-severity follow-up deferred (UI render tests) — see review-findings file.

### File List

- packages/contracts/src/index.ts (M) — `parentProfileSchema`, `emailLightRegex`, `ParentProfile`, `isProfileComplete`
- packages/contracts/src/index.test.ts (M)
- packages/db/src/schema/parents.ts (A)
- packages/db/src/schema/parents.test.ts (A)
- packages/db/src/schema/index.ts (M) — export `parents`
- packages/db/migrations/0006_parents.sql (A)
- apps/api/src/app.ts (M) — register parent routes
- apps/api/src/routes/parents/index.ts (A)
- apps/api/src/routes/parents/profile.ts (A)
- apps/api/src/routes/parents/profile.test.ts (A)
- apps/platform/package.json (M) — add `@bm/contracts`
- apps/platform/lib/profile.ts (A)
- apps/platform/lib/profile.test.ts (A)
- apps/platform/lib/profile-api.ts (A)
- apps/platform/app/components/ProfileForm.tsx (A)
- apps/platform/app/components/CompletionBanner.tsx (A)
- apps/platform/app/profile/page.tsx (A)
- apps/platform/app/welcome/profile/page.tsx (A)
- _bmad-output/implementation-artifacts/2-1-parent-self-registers-with-profile-details-review-findings.md (A)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented parent profile: `parents` table + migration, `GET`/`PUT /parents/me` (validated + audited upsert), permissive email + completion contract helpers, inline post-PIN form with skip + completion banner, dashboard edit. Full gate green. | claude-opus-4-7 |
