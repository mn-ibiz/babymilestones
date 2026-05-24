# Story 9.3: Templates registered + versioned

Status: ready-for-dev

> Canonical ID: P1-E09-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S03.md

## Story

As an admin,
I want to see (and later edit) every SMS template in one place,
so that messaging is centralized, versioned, and never hard-coded.

## Acceptance Criteria

1. `sms_templates` table: key (e.g. `topup.success`), body (with `{placeholders}`), language (`en`), version, is_active.
2. Code references templates by key, never by inline string.
3. Admin view (read-only in P1; editable in P2).

## Tasks / Subtasks

- [ ] Task 1: Add `sms_templates` table (AC: #1)
  - [ ] Add to `packages/db`: key, body (with `{placeholders}`), language (`en`), version, is_active + additive migration
  - [ ] Unique active template per (key, language); support multiple versions with one active
- [ ] Task 2: Key-based template lookup (AC: #2)
  - [ ] Add a resolver in `packages/sms` that fetches the active template by key + renders `{placeholders}` from `data`
  - [ ] Wire `send(...)` (Story 9.1) to resolve templates by key; no inline template strings in product code
- [ ] Task 3: Seed initial templates (AC: #1, #2)
  - [ ] Seed the launch template set (e.g. `topup.success`) as registered, versioned rows
- [ ] Task 4: Admin read-only view (AC: #3)
  - [ ] Add a read-only SMS templates list in `apps/admin` (editing deferred to P2)
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest, test-first: resolver returns the active template by key and renders placeholders; lookup of a missing/inactive key fails clearly; admin view lists templates read-only

## Dev Notes

- Templates are versioned and addressed by key — this is what lets `send({template})` stay provider- and copy-agnostic.
- Read-only in P1; the schema (version, is_active) is built now so P2 can add editing without migration.
- Concrete paths to touch:
  - `packages/db` — `sms_templates` table + additive migration + seed.
  - `packages/sms` — template resolver used by `send(...)`.
  - `apps/admin` — read-only templates view.
- Testing standards: vitest, test-first; migrations additive-only per DoD.

### Project Structure Notes
- Spans `packages/db`, `packages/sms`, and `apps/admin`.
- Depends on Story 9.1 (sender `send(...)` consumes the resolved template).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E09-S03.md]
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
