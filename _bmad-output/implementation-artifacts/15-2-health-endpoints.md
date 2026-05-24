# Story 15.2: Health endpoints

Status: ready-for-dev

> Canonical ID: X8-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X8-S02.md

## Story

As a load balancer,
I want a fast health check that tells me an app is alive,
so that traffic only routes to instances that are up and ready.

## Acceptance Criteria

1. `/health/live` (process up) and `/health/ready` (DB reachable, Redis reachable) on every app.
2. Returns < 100ms p95.

## Tasks / Subtasks

- [ ] Task 1: Liveness + readiness on the API (AC: #1)
  - [ ] In `apps/api/src/app.ts`, extend the existing `/healthz` to add `/health/live` (process-up, no I/O) and `/health/ready` (checks Postgres reachable + Redis reachable). Keep checks lightweight.
- [ ] Task 2: Health endpoints on every app (AC: #1)
  - [ ] Add equivalent `/health/live` and `/health/ready` to `apps/jobs`, `apps/platform`, `apps/pos`, `apps/admin` (readiness checks the dependencies each app actually uses — DB/Redis where applicable).
- [ ] Task 3: Performance (AC: #2)
  - [ ] Ensure responses are < 100ms p95 (cheap readiness probes; short DB/Redis ping timeouts).
- [ ] Task 4: Tests (AC: all)
  - [ ] vitest: `/health/live` returns ok when process up; `/health/ready` returns ok only when DB+Redis reachable and degraded/failing when not; assert latency budget on the probe path. Test-first. (Existing `apps/api/src/app.test.ts` covers `/healthz` — extend rather than break it.)

## Dev Notes

- Anchor: `apps/api` — `/healthz` already exists in `apps/api/src/app.ts` (and is tested in `apps/api/src/app.test.ts`); extend it into `/health/live` + `/health/ready`. Replicate the pattern in the other apps.
- Redis + Postgres are provisioned via `infra/docker-compose.yml`; readiness pings those.
- TS strict, vitest test-first.

### Project Structure Notes
- Routes in `apps/api/src/app.ts` (or a `apps/api/src/routes/health.ts`); equivalents in each Next app and `apps/jobs`.
- Dependencies: none.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X8-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X8]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
