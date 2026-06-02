# Story 31.4: Coach session notes (private)

Status: done

> Canonical ID: P5-E01-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S04.md

## Story

As coach (operated via Reception),
I want to log private session notes per parent,
so that the capability described above is delivered.

## Acceptance Criteria

1. After session check-out, Reception (or admin acting for coach) records private notes.
2. Notes visible to admin and the named coach only (via the named-not-auth viewer in P3-E02, scoped to their own records).
3. Notes are NOT shown to parents.
4. 24-month retention then anonymisation (consistent with Decision 29).

## Tasks / Subtasks

- [ ] Task 1: Implement Coach session notes (private) (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: After session check-out, Reception (or admin acting for coach) records private notes.
  - [ ] Satisfy AC#2: Notes visible to admin and the named coach only (via the named-not-auth viewer in P3-E02, scoped to their own records).
  - [ ] Satisfy AC#3: Notes are NOT shown to parents.
  - [ ] Satisfy AC#4: 24-month retention then anonymisation (consistent with Decision 29).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Encrypt notes at rest (column-level) — coaching content is sensitive.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |

## Dev Notes — AC2 security interpretation

AC2 referenced the P3-E02 named-not-auth (unauthenticated) viewer for coach access. Exposing decrypted private coaching notes through an unauthenticated, name-only route would leak sensitive content publicly, so this was implemented in spirit, not literally: the public coach viewer returns a CONTENT-FREE summary (session counts + dates only, asserted to contain no plaintext/ciphertext); full decrypted content requires the authenticated admin/reception path (read audit). Notes encrypted at rest (AES-256-GCM); 24-month anonymisation purges ciphertext + owner ids. No parent-app surface.
