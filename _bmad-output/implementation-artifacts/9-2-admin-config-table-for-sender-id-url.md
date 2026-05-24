# Story 9.2: Admin config table for sender ID + URL + key

Status: ready-for-dev

> Canonical ID: P1-E09-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S02.md

## Story

As an admin,
I want to store the SMS provider config once a sender ID is registered,
so that the provider can be activated without code changes and without exposing secrets.

## Acceptance Criteria

1. `sms_config` table: sender_id, api_url, api_key_ref (env var name, not the literal key), is_active.
2. Admin CRUD; the secret value is never returned in API responses.
3. Validation: `api_url` must be HTTPS and must not point to RFC1918 / localhost / cloud metadata IPs.
4. Only one row may have `is_active = true`.

## Tasks / Subtasks

- [ ] Task 1: Add `sms_config` table (AC: #1)
  - [ ] Add to `packages/db`: sender_id, api_url, api_key_ref (env var name only), is_active + additive migration
- [ ] Task 2: Enforce single active row (AC: #4)
  - [ ] Add a partial unique index on `is_active` where `is_active = true` (or equivalent constraint) so only one row is active
- [ ] Task 3: SSRF-safe URL validation (AC: #3)
  - [ ] Validate `api_url` is HTTPS and resolves/parses to a public host; reject RFC1918, loopback/localhost, link-local, and cloud metadata IPs (e.g. 169.254.169.254)
  - [ ] Place the allowlist/validator in shared code (e.g. `packages/contracts` Zod refinement or a `packages/sms` util)
- [ ] Task 4: Admin CRUD API with secret hygiene (AC: #1, #2)
  - [ ] Add admin-only Fastify routes under `apps/api/src/routes/` for sms_config CRUD (role guard via `packages/auth`)
  - [ ] Store only `api_key_ref` (env var name); never return any secret/literal key in responses
- [ ] Task 5: Admin config UI (AC: #1, #2, #4)
  - [ ] Add an SMS config screen in `apps/admin` to manage the row(s) and toggle active; never display secret values
  - [ ] Audit changes to `audit_outbox`
- [ ] Task 6: Tests (AC: all)
  - [ ] vitest, test-first: single-active-row enforced; URL validation rejects RFC1918/localhost/metadata and non-HTTPS; API responses never include the secret; CRUD audited

## Dev Notes

- SSRF allowlist is a confirmed security requirement (Winston's review) — block private, loopback, link-local, and metadata addresses; require HTTPS.
- Secrets are referenced by env var name (`api_key_ref`), never stored or echoed literally.
- Concrete paths to touch:
  - `packages/db` — `sms_config` table + partial unique index + additive migration.
  - `apps/api/src/routes/` — admin-only CRUD routes.
  - `apps/admin` — SMS config UI.
  - `packages/contracts` or `packages/sms` — URL/SSRF validator.
- Testing standards: vitest, test-first; migrations additive-only; audited actions write to `audit_outbox` per DoD.

### Project Structure Notes
- Spans `packages/db`, `apps/api`, `apps/admin`, and shared validation in `packages/contracts`/`packages/sms`.
- Depends on P1-E10 (admin/RBAC console + role guards).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E09].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
