# Story 2.2: Reception registers walk-in parent

Status: done

> Canonical ID: P1-E02-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S02.md

## Story

As Reception,
I want to create a parent record for a walk-in in under 60 seconds,
so that walk-in families are onboarded quickly without friction.

## Acceptance Criteria

1. One-screen form: phone (required), first name, last name, optional email, area.
2. Phone-collision check live (debounced 300ms); if duplicate, offer "Open existing" or "Merge intent" flag.
3. PIN field optional at Reception creation — system can SMS a setup link later.
4. Action logged: `parent.created_by_reception`, with the staff user ID.

## Tasks / Subtasks

- [x] Task 1: Reception parent-create API (AC: #1, #3, #4)
  - [x] Add/extend route under `apps/api/src/routes/` to create a parent on behalf of a walk-in (phone required; first/last name; optional email; area) — `POST /parents/walk-in`
  - [x] Allow no PIN at creation; record that the parent must verify-via-OTP on first self-login (no password set initially) — `pin_hash` nullable + `pin_set_at` NULL
  - [x] Write `parent.created_by_reception` to `audit_outbox`, including the acting staff user ID
  - [x] Define request/response Zod schemas in `packages/contracts` (`receptionWalkInSchema`, `PhoneCheckResult`)
- [x] Task 2: Phone-collision lookup (AC: #2)
  - [x] Add an endpoint to check phone uniqueness against `users`/`parents` — `GET /parents/phone-check`
  - [x] Return existing parent reference when a collision is found, to drive "Open existing" or "Merge intent" choices (also 409 from the create path)
- [x] Task 3: Reception one-screen form (AC: #1, #2, #3)
  - [x] In `apps/admin` (Reception console), build the single-screen create form (`app/reception/walk-in/page.tsx`)
  - [x] Live debounced (300ms) phone-collision check; on duplicate, offer "Open existing" or set a "Merge intent" flag (logic in `lib/walkin-form.ts`)
  - [x] Make PIN field optional (form has NO PIN field — credential is set later via OTP)
- [x] Task 4: Tests (AC: all)
  - [x] Write vitest unit/integration tests (test-first): create-without-PIN path, OTP-on-first-login flag, debounced collision detection + duplicate handling, and audit_outbox write capturing staff user ID

## Dev Notes

- No password is set initially → parent must verify-via-OTP on first self-login.
- Reuse the `parents` table from Story 2.1; this story adds a Reception-side creation path.
- Phone-collision check must be debounced at 300ms on the client.
- Audit event name is exactly `parent.created_by_reception` and must carry the staff user ID (DoD #4 / `audit_outbox`).
- Paths to touch: `apps/api/src/routes/`, `packages/contracts`, `apps/admin` (Reception form), `packages/db` if any column additions are needed (additive-only).
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `apps/api/src/routes/`, `apps/admin`, `packages/db`.
- Depends on P1-E02-S01 (parents table/profile) and P1-E01-S03 (staff/auth context for the acting staff user ID).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E02].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Initial test failures: staff-login returned 401 because `staffUserSeed` stores the phone verbatim while the login flow normalises input → seeds must use `+254…`. Fixed seed phones in the integration test.
- Typecheck: removed an explicit `JSX.Element` return type (no global JSX namespace under the Next/React 19 config).

### Completion Notes List

- New API surface in `apps/api`: `POST /parents/walk-in` (create) and `GET /parents/phone-check` (live collision lookup). Both require an authenticated staff session with the `create:user` permission (`reception`, plus `admin`/`super_admin` via `manage`); the POST also requires the CSRF double-submit token.
- Reused existing foundations: `requirePermission`/`validateSession` (rbac guard), `audit(...)`, wallet auto-provision (parity with self-signup), the parent profile table from 2.1, and `normalizePhone`. No parent-creation logic duplicated beyond the staff-side path.
- AC3: walk-in accounts are credential-less — `users.pin_hash` is now nullable and `pin_set_at` is NULL until the parent sets a PIN (verify-via-OTP on first self-login). Both login paths already fail safely against a null hash via `DUMMY_PIN_HASH`.
- AC2: duplicate phone returns 409 with the existing reference; client debounces the collision check at 300ms (`PHONE_CHECK_DEBOUNCE_MS`).
- AC4: audit event `parent.created_by_reception` carries `staff_user_id` (the acting Reception operator) and never any credential.
- RBAC matrix gained `reception → create:user`, mirrored in migration 0007, the rbac snapshot, and the db drift-gate test.
- Review (one pass): fixed 2 BLOCKER findings inline — the Reception form fetched `/api/parents/*` (wrong base; the established convention is `/parents/*`) and omitted the `x-csrf-token` header on the create POST (server requires it on mutating verbs). No lower-severity findings deferred.

### File List

- packages/db/migrations/0007_reception_walkin.sql (new)
- packages/db/src/schema/users.ts (pin_hash nullable; pin_set_at added)
- packages/db/src/permissions.test.ts (drift gate: reception create:user)
- packages/auth/src/rbac.ts (reception create:user)
- packages/auth/src/__snapshots__/rbac.test.ts.snap (matrix snapshot)
- packages/contracts/src/index.ts (receptionWalkInSchema, PhoneCheckResult)
- apps/api/src/routes/parents/walkin.ts (new — routes)
- apps/api/src/routes/parents/walkin.test.ts (new — integration tests)
- apps/api/src/routes/parents/index.ts (register walk-in routes)
- apps/admin/app/reception/walk-in/page.tsx (new — one-screen form)
- apps/admin/lib/walkin-form.ts (new — validation/debounce/collision logic)
- apps/admin/lib/walkin-form.test.ts (new — unit tests)
- apps/admin/package.json (+@bm/contracts)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented Reception walk-in registration (API + form + tests); status done | claude-opus-4-7 |
