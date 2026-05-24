# Story 13.2: Async drain worker to audit_log projection

Status: ready-for-dev

> Canonical ID: X5-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X5-S02.md

## Story

As an investigator,
I want fast, queryable audit history,
so that I can search audited actions by actor, target, action, and time without scanning the outbox.

## Acceptance Criteria

1. Worker in `apps/jobs` polls `audit_outbox` every 5s.
2. Writes to projection table `audit_log` with indexes on `(actor)`, `(target_table, target_id)`, `(action)`, `(created_at)`.
3. Marks outbox rows `processed_at` on success.
4. Failures retried with exponential backoff; dead-lettered after 24h.

## Tasks / Subtasks

- [ ] Task 1: Add `audit_log` projection table (AC: #2)
  - [ ] Define `audit_log` in `packages/db/src/` mirroring outbox fields; add indexes on `(actor_user_id)`, `(target_table, target_id)`, `(action)`, `(created_at)`.
  - [ ] Additive-only Drizzle migration in `packages/db`.
- [ ] Task 2: Implement the drain worker (AC: #1, #3)
  - [ ] Add worker module under `apps/jobs/src/` and register it via `apps/jobs/src/registry.ts` (`register({ name: "audit-drain", run })`).
  - [ ] Poll `audit_outbox` for rows where `processed_at IS NULL` every 5s; insert into `audit_log`; set `processed_at = now()` on success (idempotent per outbox id).
- [ ] Task 3: Retry + dead-letter handling (AC: #4)
  - [ ] On failure, retry with exponential backoff; track attempt count/next-attempt; dead-letter rows still unprocessed after 24h (flag/route them rather than blocking the queue).
- [ ] Task 4: Tests (AC: all)
  - [ ] vitest: worker drains pending rows into `audit_log`; marks `processed_at`; indexes present; backoff escalates and rows dead-letter after the 24h threshold (clock-injectable). Test-first.

## Dev Notes

- Second half of the outbox pattern from X5-S01: the worker projects durable `audit_outbox` rows into the query-optimised `audit_log`. Polling interval is 5s.
- Anchor: worker in `apps/jobs` (register through `apps/jobs/src/registry.ts`); `audit_log` table + migration in `packages/db`.
- Migrations additive-only. TS strict, vitest test-first.

### Project Structure Notes
- New worker file in `apps/jobs/src/`, registered in `apps/jobs/src/registry.ts`. New `audit_log` table + indexes + migration in `packages/db`.
- Dependencies: X5-S01 (`audit_outbox` + helper) and X8 (jobs runner / `apps/jobs` runtime).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X5-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X5]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
