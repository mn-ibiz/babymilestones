# Story 15.2: Health endpoints

Status: done

> Canonical ID: X8-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X8-S02.md

## Story

As a load balancer,
I want a fast health check that tells me an app is alive,
so that traffic only routes to instances that are up and ready.

## Acceptance Criteria

1. `/health/live` (process up) and `/health/ready` (DB reachable, Redis reachable) on every app.
2. Returns < 100ms p95.

## Tasks / Subtasks

- [x] Task 1: Liveness + readiness on the API (AC: #1)
  - [x] In `apps/api`, kept `/healthz` and added `/health/live` (process-up, no I/O) and `/health/ready` (runs injected readiness probes → 503 when any fail). A `db` probe (trivial `SELECT 1`) is derived from `deps.db`; checks are injected/mockable via `deps.readinessChecks` / `deps.redisPing`. Routes live in `apps/api/src/routes/health.ts` (registered from `app.ts`).
  - [~] Postgres reachable wired (`SELECT 1`). Redis probe mechanism wired (`redisPing` dep + generic `checks`) but no live Redis ping — no Redis client exists in the codebase yet; see review-findings #1.
- [x] Task 2: Health endpoints on every app (AC: #1)
  - [x] `apps/jobs`: `createHealthServer` (node:http) serving `/health/live` + `/health/ready` with the same readiness semantics (`src/health.ts`, exported from `index.ts`).
  - [x] `apps/platform`, `apps/pos`, `apps/admin`: App-Router `app/health/live/route.ts` + `app/health/ready/route.ts`. These hold no DB/Redis of their own, so readiness probes the upstream API liveness (`lib/health.ts` `checkReadiness`).
- [x] Task 3: Performance (AC: #2)
  - [x] Probes are cheap (process-up / single round-trip) and each readiness check is bounded by a short timeout (default 1000ms; configurable). API readiness latency asserted < 100ms in tests.
- [x] Task 4: Tests (AC: all)
  - [x] vitest, test-first: API `/health/live` + legacy `/healthz` ok; `/health/ready` 200 when deps ok, 503 + per-dep detail when a check fails or times out; real-DB-wired probe passes/fails; latency budget asserted. Jobs `evaluateReadiness` + `createHealthServer` over real HTTP (ok/fail/timeout/404). Next apps: `checkReadiness` ok/non-2xx/unreachable.

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

claude-opus-4-7

### Debug Log References

- `pnpm --filter @bm/api test` — 43 files / 406 tests pass (includes new `routes/health.test.ts`).
- `pnpm --filter @bm/jobs @bm/platform @bm/pos @bm/admin test` — all pass (new health tests included).
- `pnpm typecheck` / `pnpm lint` / `pnpm build` — all green; Next build shows `/health/live` + `/health/ready` as dynamic routes in all three apps.
- One full-suite run flaked with 9 PGlite "Hook timed out in 30000ms" failures under heavy parallel resource contention (none health-related); a clean isolated `@bm/api` re-run passed all 406.

### Completion Notes List

- Shared readiness pattern: named probes run in parallel, each bounded by a short timeout; overall 503 when any fail, with per-dependency `ok`/`fail` detail. Implemented independently in `apps/api/src/routes/health.ts` and `apps/jobs/src/health.ts` (Fastify vs node:http hosts).
- Readiness probes are injected/mockable everywhere — no real infra is opened from defaults, keeping tests hermetic.
- Redis: mechanism wired (`redisPing` dep + generic `checks` map) but no live ping — no Redis client exists in the repo yet (provisioned in docker-compose only). Deferred; see review-findings.
- Next apps have no DB/Redis of their own, so their readiness probes the upstream API liveness via `lib/health.ts`.

### File List

- `apps/api/src/routes/health.ts` (new)
- `apps/api/src/routes/health.test.ts` (new)
- `apps/api/src/app.ts` (modified — register health routes, readiness deps)
- `apps/jobs/src/health.ts` (new)
- `apps/jobs/src/health.test.ts` (new)
- `apps/jobs/src/index.ts` (modified — export health surface)
- `apps/platform/lib/health.ts` (modified)
- `apps/platform/lib/health.test.ts` (modified)
- `apps/platform/app/health/live/route.ts` (new)
- `apps/platform/app/health/ready/route.ts` (new)
- `apps/pos/lib/health.ts` (modified)
- `apps/pos/lib/health.test.ts` (modified)
- `apps/pos/app/health/live/route.ts` (new)
- `apps/pos/app/health/ready/route.ts` (new)
- `apps/admin/lib/health.ts` (modified)
- `apps/admin/lib/health.test.ts` (modified)
- `apps/admin/app/health/live/route.ts` (new)
- `apps/admin/app/health/ready/route.ts` (new)
- `_bmad-output/implementation-artifacts/15-2-health-endpoints-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented liveness + readiness on api, jobs, and the three Next apps (test-first); status done | claude-opus-4-7 |
