# Story 15.1: Structured logging + error tracking

Status: ready-for-dev

> Canonical ID: X8-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X8-S01.md

## Story

As on-call,
I want to know about errors within 5 minutes of them happening,
so that I can respond to incidents before they widen.

## Acceptance Criteria

1. `pino` JSON logs in all apps; correlation ID per request.
2. Sentry-equivalent error tracker capturing API + frontend errors.
3. Alert rules: any error rate > 1%/5min, any payments webhook failure, any ledger insert failure.

## Tasks / Subtasks

- [ ] Task 1: Structured logging in all apps (AC: #1)
  - [ ] Configure `pino` JSON logging in `apps/api` (Fastify has pino built-in — enable structured output in `apps/api/src/app.ts`) and in `apps/jobs`, `apps/platform`, `apps/pos`, `apps/admin`.
  - [ ] Generate/propagate a correlation ID per request (Fastify request hook on `apps/api`; thread through logs and downstream calls).
- [ ] Task 2: Error tracking (AC: #2)
  - [ ] Integrate a Sentry-equivalent error tracker capturing API (Fastify) errors and frontend (Next apps) errors; tag events with the correlation ID.
- [ ] Task 3: Alert rules (AC: #3)
  - [ ] Configure alerts: error rate > 1% over 5 min; any payments webhook failure; any ledger insert failure (hook into `packages/payments` webhook paths and `packages/wallet` ledger inserts).
- [ ] Task 4: Tests (AC: all)
  - [ ] vitest: log output is JSON with a correlation ID present per request; error-tracker capture invoked on thrown errors; alert-trigger conditions fire on simulated webhook/ledger failures. Test-first.

## Dev Notes

- Anchor: `apps/api` (Fastify; `apps/api/src/app.ts` buildApp) for the canonical pino + correlation-ID setup; replicate logging across all apps (`apps/jobs`, `apps/platform`, `apps/pos`, `apps/admin`).
- Payments webhook failures originate in `packages/payments` adapters; ledger insert failures in `packages/wallet` — alert hooks tie to those surfaces.
- TS strict, vitest test-first.

### Project Structure Notes
- Logging config touches all apps; correlation-ID middleware in `apps/api`. Error-tracker init per app. Alert config lives with observability/infra wiring.
- Dependencies: none.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X8-S01.md]
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
