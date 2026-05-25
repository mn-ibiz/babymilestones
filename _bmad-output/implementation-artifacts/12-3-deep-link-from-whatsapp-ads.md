# Story 12.3: Deep-link from WhatsApp ads

Status: done

> Canonical ID: P1-E12-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S03.md

## Story

As a marketing manager,
I want to link from a WhatsApp ad straight to the right booking flow,
so that ad traffic lands on the correct unit and we can attribute signups.

## Acceptance Criteria

1. URL pattern `/book/[unit]?utm_*` captures UTM and pre-selects the unit.
2. UTM persisted to parent on signup for attribution.

## Tasks / Subtasks

- [x] Task 1: Deep-link route in `apps/platform` public route group (AC: #1)
  - [x] Add dynamic route `apps/platform/app/(public)/book/[unit]/page.tsx` that pre-selects the unit and captures `utm_*` query params
  - [x] Carry captured UTM through to the signup flow (cookie `bm_acq` + `/signup?unit=` redirect) so it survives to account creation
- [x] Task 2: Persist UTM on signup in `apps/api` (AC: #2)
  - [x] On parent signup, write captured `utm_*` to `parents.acquisition_source` — persisted at parent-record creation (`PUT /parents/me`), set-once; additive `acquisition_source jsonb` column in `packages/db` (migration 0039)
  - [x] Validate/normalize UTM payload via `@bm/contracts` (`acquisitionSourceSchema`, `parseUtmParams`)
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: UTM parse/normalise + cookie round-trip (contracts), deep-link routing (`resolveDeepLink`, platform), jsonb column (db), and UTM persisted to `parents.acquisition_source` on profile creation incl. set-once + organic + malformed paths (api)

## Dev Notes

- Deep-link route in `apps/platform` public route group (`apps/platform/app/(public)/book/[unit]/`). Signup persistence handled in `apps/api`, writing to `parents.acquisition_source` (per source Technical Notes).
- Builds on per-unit pages (S02) and parent signup (P1-E02). Any `parents` column work in `packages/db` must be additive-only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/platform/app/(public)/book/[unit]/`, signup persistence in `apps/api`, `parents.acquisition_source` in `packages/db`.
- Depends on S02 (per-unit pages) and P1-E02 (parent signup) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E12.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (api 393, platform 111, contracts 90, db incl. new jsonb test), `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass. The first `pnpm test` run hit flaky PGlite `beforeEach` hook timeouts (10s) across unrelated api suites under turbo's parallel load; a re-run of `@bm/api` passed 393/393 (timeout flake, not assertion failures).

### Completion Notes List

- AC1: `(public)/book/[unit]/page.tsx` resolves the deep-link via the pure `lib/book-deep-link.ts` (`resolveDeepLink`): unknown unit → 404 (never `/shop`), known unit → captures `utm_*` into the `bm_acq` cookie and redirects to `/signup?unit=<unit>` so the post-signup funnel resumes on the pre-selected unit. Added `/book` to the middleware public allow-list.
- AC2: additive `acquisition_source jsonb` column on `parents` (migration 0039 + schema). `PUT /parents/me` accepts an `acquisitionSource` body field, validates/normalises it via `@bm/contracts` `acquisitionSourceSchema`, and stamps it at profile creation only (set-once — never overwritten on a later edit). Malformed/empty payloads are ignored (attribution never blocks save). `ParentProfile` now surfaces `acquisitionSource`.
- Contracts: new `utm.ts` — `UTM_PARAM_KEYS`, `parseUtmParams` (first-of-array, trim, clamp to 200, drop empties, null when no signal), `acquisitionSourceSchema` (strip unknowns, ≥1 field), serialize/deserialize helpers for the cookie round-trip.
- The cookie→signup-form glue is owned by S04 (no `/signup` page exists yet); both ends are unit-tested and the seam is in place. See review-findings.

### File List

- packages/db/migrations/0039_parents_acquisition_source.sql (new)
- packages/db/src/schema/parents.ts
- packages/db/src/schema/parents.test.ts
- packages/contracts/src/utm.ts (new)
- packages/contracts/src/utm.test.ts (new)
- packages/contracts/src/index.ts
- packages/contracts/src/index.test.ts
- apps/api/src/routes/parents/profile.ts
- apps/api/src/routes/parents/profile.test.ts
- apps/platform/lib/book-deep-link.ts (new)
- apps/platform/lib/book-deep-link.test.ts (new)
- apps/platform/lib/profile.test.ts
- apps/platform/app/(public)/book/[unit]/page.tsx (new)
- apps/platform/middleware.ts
- _bmad-output/implementation-artifacts/12-3-deep-link-from-whatsapp-ads-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented WhatsApp deep-link landing + UTM acquisition attribution; full gate green | claude-opus-4-7 |
