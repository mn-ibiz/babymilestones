# Story 11.4: Profile & consent management

Status: done

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

- [x] Task 1: Profile/consent API in `apps/api` (AC: #1, #2, #3, #4)
  - [x] Profile update (name, email, area) + SMS consent toggle — reused existing `apps/api/src/routes/parents/profile.ts` (`PUT /parents/me`, `PUT /parents/me/consent/sms` from 2-1/2-4)
  - [x] PIN change endpoint `PUT /parents/me/pin` via `@bm/auth` (`verifyPin`/`hashPin`/`isWeakPin`) requiring current-PIN verification; rotates hash, invalidates all sessions, audits `parent.pin.change` (no raw PIN in payload)
  - [x] "Export my data" wired to the P1-E02-S05 export endpoint (`POST /parents/me/exports`, reused)
  - [x] Guard with `@bm/auth` (parent session + CSRF on mutations); validate with `@bm/contracts` `pinChangeSchema`
- [x] Task 2: Profile UI in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [x] Page `apps/platform/app/(app)/profile/page.tsx`: profile edit form (name, email, area) (removed the duplicate `app/profile/page.tsx` it supersedes)
  - [x] SMS marketing opt-in toggle (standalone, never bundled into the profile upsert)
  - [x] PIN change flow (requires current PIN) — `PinChangeForm` component
  - [x] "Export my data" link to the data-export flow
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: pure `validatePinChange` unit tests (`lib/pin-change.test.ts`); `changePin` client wiring (`lib/profile-api.test.ts`); API route tests (`routes/parents/pin.test.ts`) covering wrong-PIN rejection, weak/malformed/duplicate new PIN, CSRF/auth gates, hash rotation, session invalidation, audit. Profile/consent/export persistence already covered by existing 2-1/2-4/2-5 tests.

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

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Fixed: `users.pinHash` is `string | null` — verify against `DUMMY_PIN_HASH` when null (constant-time, mirrors login); narrowed in test.
- Fixed: Next route collision — `(app)/profile/page.tsx` and the legacy `app/profile/page.tsx` resolve to the same `/profile` URL; removed the legacy page (the new one is a superset that adds the PIN flow).

### Completion Notes List

- AC1/AC2/AC4 reuse the existing 2-1/2-4/2-5 endpoints + UI (ProfileForm, consent toggle, ExportDataButton) — no reimplementation.
- AC3 is the net-new work: `pinChangeSchema` (contracts), pure `validatePinChange` (platform lib, unit-tested), `changePin` client, `PUT /parents/me/pin` API route, and `PinChangeForm` UI. Current PIN is required and verified server-side; new PIN must be valid, non-weak, and distinct; success rotates the argon2 hash, invalidates all sessions, and audits without logging the raw PIN.
- CSRF enforced on every mutation via the double-submit token + shared session guard (route test confirms 403 without it).
- Single review pass: no BLOCKER/high findings; no deferred findings.

### File List

- `packages/contracts/src/index.ts` (added `pinChangeSchema` + `PinChangeInput`)
- `apps/api/src/routes/parents/profile.ts` (added `PUT /parents/me/pin`)
- `apps/api/src/routes/parents/pin.test.ts` (new)
- `apps/platform/lib/pin-change.ts` (new, pure validator)
- `apps/platform/lib/pin-change.test.ts` (new)
- `apps/platform/lib/profile-api.ts` (added `changePin`)
- `apps/platform/lib/profile-api.test.ts` (added `changePin` cases)
- `apps/platform/app/components/PinChangeForm.tsx` (new)
- `apps/platform/app/(app)/profile/page.tsx` (new — supersedes the removed `app/profile/page.tsx`)
- `apps/platform/app/profile/page.tsx` (removed — duplicate route)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented PIN change (AC3) end-to-end; wired profile/consent/export UI in the `(app)/profile` route group; full gate green | claude-opus-4-7 |
