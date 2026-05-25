# Story 22.3: Auto-credit toggle visibility for parent (read-only)

Status: backlog

> Canonical ID: P2-E07-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S03.md

## Story

As parent,
I want to see whether I'm allowed to go negative — not control it, but know,
so that the capability described above is delivered.

## Acceptance Criteria

1. Wallet page shows: "Auto-credit: Enabled by admin" or "Auto-credit: Not enabled".
2. If disabled, helper copy explains: "Top up before booking to avoid an outstanding balance".
3. No edit affordance for parent.

## Tasks / Subtasks

- [ ] Task 1: Implement Auto-credit toggle visibility for parent (read-only) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Wallet page shows: "Auto-credit: Enabled by admin" or "Auto-credit: Not enabled".
  - [ ] Satisfy AC#2: If disabled, helper copy explains: "Top up before booking to avoid an outstanding balance".
  - [ ] Satisfy AC#3: No edit affordance for parent.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E03-S07. --- *End of P2 stories.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
