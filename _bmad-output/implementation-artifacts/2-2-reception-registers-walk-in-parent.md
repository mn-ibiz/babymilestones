# Story 2.2: Reception registers walk-in parent

Status: ready-for-dev

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

- [ ] Task 1: Reception parent-create API (AC: #1, #3, #4)
  - [ ] Add/extend route under `apps/api/src/routes/` to create a parent on behalf of a walk-in (phone required; first/last name; optional email; area)
  - [ ] Allow no PIN at creation; record that the parent must verify-via-OTP on first self-login (no password set initially)
  - [ ] Write `parent.created_by_reception` to `audit_outbox`, including the acting staff user ID
  - [ ] Define request/response Zod schemas in `packages/contracts`
- [ ] Task 2: Phone-collision lookup (AC: #2)
  - [ ] Add an endpoint to check phone uniqueness against `users`/`parents`
  - [ ] Return existing parent reference when a collision is found, to drive "Open existing" or "Merge intent" choices
- [ ] Task 3: Reception one-screen form (AC: #1, #2, #3)
  - [ ] In `apps/admin` (Reception console), build the single-screen create form
  - [ ] Live debounced (300ms) phone-collision check; on duplicate, offer "Open existing" or set a "Merge intent" flag
  - [ ] Make PIN field optional
- [ ] Task 4: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): create-without-PIN path, OTP-on-first-login flag, debounced collision detection + duplicate handling, and audit_outbox write capturing staff user ID

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
