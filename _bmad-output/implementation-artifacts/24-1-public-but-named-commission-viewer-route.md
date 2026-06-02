# Story 24.1: Public-but-named commission viewer route

Status: done

> Canonical ID: P3-E02-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S01.md

## Story

As stylist,
I want to see this month's earnings from the reception PC without logging in,
so that the capability described above is delivered.

## Acceptance Criteria

1. Route `admin.babymilestones.co.ke/staff-earnings` accessible without login.
2. Dropdown of active stylists (display names only).
3. Pick name → confirm display: month-to-date earnings, last month's earnings, last payout amount + date.
4. No PII beyond display name; no parent or booking details.
5. Rate limit on the endpoint (anti-scrape).
6. Decision refs: 14.

## Tasks / Subtasks

- [x] Task 1: Implement Public-but-named commission viewer route (AC: #1, #2, #3, #4, #5, #6)
  - [x] Satisfy AC#1: Route `admin.babymilestones.co.ke/staff-earnings` accessible without login. (exempted in `apps/admin/middleware.ts` `PUBLIC_PATHS`/`isPublicPath`; page reads only the public API.)
  - [x] Satisfy AC#2: Dropdown of active stylists (display names only). (`GET /public/staff-earnings` returns active staff `{id, displayName}` only.)
  - [x] Satisfy AC#3: Pick name → confirm display: month-to-date earnings, last month's earnings, last payout amount + date. (`GET /public/staff-earnings/:staffId` via pure `computeStaffEarnings`.)
  - [x] Satisfy AC#4: No PII beyond display name; no parent or booking details. (DTO exposes display name + 3 numbers only; route test asserts forbidden fields/strings absent.)
  - [x] Satisfy AC#5: Rate limit on the endpoint (anti-scrape). (`StaffEarningsRateLimiter`, per-IP fixed-window, mirrors `@bm/auth` `LoginRateLimiter`; 429 + Retry-After.)
  - [x] Satisfy AC#6: Decision refs: 14. (Public reception-PC viewer per decision 14; 60s cache window per Dev Notes.)
  - [x] Touch / create: `apps/admin/app/staff-earnings/page.tsx`
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Caching: 60s. `apps/admin/app/staff-earnings/page.tsx`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P3-E01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `pnpm --filter @bm/catalog test` → 11 files / 137 tests pass (incl. new `staff-earnings.test.ts`, 7).
- `pnpm --filter @bm/api test` → 74 files / 673 tests pass (incl. new `public/staff-earnings.test.ts`, 11).
- `pnpm --filter @bm/admin test` → 37 files / 218 tests pass (incl. new `lib/staff-earnings.test.ts` 7 + `middleware.test.ts` 3).
- `pnpm --filter @bm/contracts test` → 6 files / 128 tests pass.
- `pnpm typecheck` → 17/17 packages pass.
- Lint clean on `@bm/api`, `@bm/admin`, `@bm/catalog`.
- Full `pnpm test`: one pre-existing failure in `@bm/auth` audit-actions completeness (caused by the UNTRACKED `apps/jobs/src/jobs/outstanding-reminders.ts` from in-progress story 22-1 — reproduced on a clean stash of this story's changes; unrelated to this read-only story, which emits NO audit actions).

### Completion Notes List

- Read-only over existing P3-E01 commission data; no migrations.
- Reused the commission ledger + paid-out commission-run lines as the single source of truth — no ledger logic duplicated. Earnings math extracted to a pure, exhaustively-tested view-model (`computeStaffEarnings`) in `@bm/catalog`.
- New public, unauthenticated API surface `GET /public/staff-earnings` (active-staff dropdown) and `GET /public/staff-earnings/:staffId` (figures), registered under the established `routes/public` family. Exposes ONLY display name + month-to-date / last-month / last-payout (amount + ISO date) — no phone/role/parent/booking PII (AC4, asserted by test).
- Anti-scrape rate limit (AC5): per-IP fixed-window `StaffEarningsRateLimiter` mirroring `@bm/auth`'s `LoginRateLimiter` bucket pattern; 429 + Retry-After once the budget is spent. Injectable on `buildApp` for deterministic tests.
- Caching (Dev Notes): both endpoints set `Cache-Control: public, max-age=60`.
- The admin page is kept OUTSIDE the SSO/role gate (AC1) by adding `/staff-earnings` to `PUBLIC_PATHS` in `apps/admin/middleware.ts`; the gate predicate was extracted as the pure, unit-tested `isPublicPath`.

### File List

- packages/catalog/src/staff-earnings.ts (new)
- packages/catalog/src/staff-earnings.test.ts (new)
- packages/catalog/src/index.ts (modified — export view-model)
- packages/contracts/src/index.ts (modified — `PublicStaffOptionDto`, `PublicStaffEarningsDto`)
- apps/api/src/routes/public/staff-earnings.ts (new)
- apps/api/src/routes/public/staff-earnings.test.ts (new)
- apps/api/src/routes/public/index.ts (modified — register route + limiter dep)
- apps/api/src/app.ts (modified — `staffEarningsRateLimiter` dep wiring)
- apps/admin/app/staff-earnings/page.tsx (new)
- apps/admin/lib/staff-earnings.ts (new)
- apps/admin/lib/staff-earnings.test.ts (new)
- apps/admin/middleware.ts (modified — public-path exemption + `isPublicPath`)
- apps/admin/middleware.test.ts (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented public `/staff-earnings` viewer: pure earnings view-model (@bm/catalog), public rate-limited + 60s-cached API (apps/api), middleware-exempted admin page (apps/admin). TDD; affected suites + typecheck green. | Amelia (dev-story) |
