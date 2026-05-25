# Story 13.2: Async drain worker to audit_log projection

Status: done

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

- [x] Task 1: Add `audit_log` projection table (AC: #2)
  - [x] Define `audit_log` in `packages/db/src/schema/audit.ts` mirroring outbox fields; indexes on `(actor_user_id)`, `(target_table, target_id)`, `(action)`, `(created_at)`.
  - [x] Additive-only Drizzle migration `0040_audit_log_projection.sql` (also adds outbox `attempt_count`/`next_attempt_at`/`dead_lettered_at`).
- [x] Task 2: Implement the drain worker (AC: #1, #3)
  - [x] Worker module `apps/jobs/src/jobs/audit-drain.ts`; registered via `registerAuditDrainJob` (`register({ name: "audit-drain", intervalMs: 5_000, run })`).
  - [x] Polls `audit_outbox` where `processed_at IS NULL` (oldest-first), projects into `audit_log` (PK = outbox id, `ON CONFLICT DO NOTHING`), sets `processed_at` on success — idempotent/resumable per outbox id.
- [x] Task 3: Retry + dead-letter handling (AC: #4)
  - [x] On failure: `attempt_count++` + `next_attempt_at` via exponential backoff (1s base, doubling, 1h cap); rows still unprocessed 24h after creation are dead-lettered (`dead_lettered_at`) and skipped so they never block the queue.
- [x] Task 4: Tests (AC: all)
  - [x] vitest (test-first): drains pending → `audit_log` + `processed_at`; oldest-first ordering; re-run skips processed (idempotent); batch size; backoff escalates + skips inside the window; dead-letters past 24h with healthy rows still draining; four indexes present. Clock + projector injected.

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

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. The
  `@bm/api` suite hit a one-off 30s setup-hook timeout under parallel load on the
  first pass (no assertion failures); a re-run passed 393/393 — known PGlite
  flake. `@bm/jobs` 20/20 (8 new). Fixed one lint nit (unused `and` import).

### Completion Notes List

- `audit_log` projection table + 4 investigator indexes (actor / target / action
  / created_at), PK = source outbox id so projection is idempotent + resumable.
- Drain worker `audit-drain` (5s cadence) drains unprocessed outbox rows
  oldest-first into `audit_log`, marks `processed_at`. Crash-safe: re-runs never
  double-project.
- AC4: exponential backoff (1s→1h cap) via `attempt_count`/`next_attempt_at`;
  24h dead-letter (`dead_lettered_at`) so a poison row never wedges the queue.
- Clock + projector are injectable for deterministic tests.
- Deferred (low severity) logged in `-review-findings.md` — chiefly: the 10-3
  viewer still reads `audit_outbox`; repoint at `audit_log` in a later change.

### File List

- packages/db/src/schema/audit.ts (modified — `auditLog` table + outbox backoff/dead-letter cols)
- packages/db/migrations/0040_audit_log_projection.sql (new)
- apps/jobs/src/jobs/audit-drain.ts (new)
- apps/jobs/src/jobs/audit-drain.test.ts (new)
- apps/jobs/src/index.ts (modified — export + `registerAuditDrainJob`)
- _bmad-output/implementation-artifacts/13-2-async-drain-worker-audit-log-projection-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented audit_log projection table + async drain worker (backoff + 24h dead-letter); test-first, gate green | claude-opus-4-7 |
