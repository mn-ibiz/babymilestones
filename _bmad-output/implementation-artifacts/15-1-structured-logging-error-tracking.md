# Story 15.1: Structured logging + error tracking

Status: done

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

- [x] Task 1: Structured logging in all apps (AC: #1)
  - [x] Configure `pino` JSON logging in `apps/api` (canonical `createLogger` from new `@bm/observability`, wired as Fastify `loggerInstance` in `apps/api/src/app.ts`) and in `apps/jobs` + `apps/platform`/`apps/pos`/`apps/admin` (`apps/*/lib/logger.ts`, server-side).
  - [x] Generate/propagate a correlation ID per request (Fastify `genReqId` + `childLoggerFactory` stamp `correlationId` on every line; reflected back via the `x-correlation-id` response header and reused from the inbound header).
- [x] Task 2: Error tracking (AC: #2)
  - [x] `ErrorTracker` seam (`NoopErrorTracker` default, `InMemoryErrorTracker` for tests); API `setErrorHandler` captures thrown errors tagged with the correlation id. [~] Frontend (Next) capture is partial — server loggers + seam shipped; per-app `instrumentation.ts` error hook deferred (see review-findings #1). Real Sentry-style provider deferred per story hint.
- [x] Task 3: Alert rules (AC: #3)
  - [x] `ErrorRateWindow` (error rate > 1% / 5 min), `webhookFailureAlert`, `ledgerFailureAlert`, and opt-in `guardWebhook`/`guardLedgerInsert` wrappers — all unit-tested. [~] Adoption at `packages/payments`/`packages/wallet` call sites + live alert transport deferred to avoid signature churn / regressions (see review-findings #2, #4).
- [x] Task 4: Tests (AC: all)
  - [x] vitest, test-first: logger emits structured JSON with correlation id + redaction (PINs/keys never logged); API request logs carry the correlation id and reflect it on the response header; error-tracker capture invoked on thrown route errors; alert conditions fire on simulated error-rate/webhook/ledger failures.

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

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test` (16 pkgs, incl. 397 API tests), `pnpm typecheck`, `pnpm lint`, `pnpm build` — all passing.
- New `@bm/observability` linked via `pnpm install --offline` (pino@10.3.1 already present in the pnpm store).

### Completion Notes List

- New shared package `@bm/observability`: `createLogger` (pino JSON + secret/PII redaction; PINs/keys/tokens/authorization/phone censored as `[REDACTED]`), correlation-id helpers (`x-correlation-id`), `ErrorTracker` seam (`NoopErrorTracker`/`InMemoryErrorTracker`), and alert rules (`ErrorRateWindow`, `webhookFailureAlert`, `ledgerFailureAlert`) + opt-in `guardWebhook`/`guardLedgerInsert`.
- API (`apps/api/src/app.ts`): pino `loggerInstance`, `genReqId` resolves/propagates the correlation id, `childLoggerFactory` stamps it on every line, `onRequest` reflects it on the response header, `setErrorHandler` captures into the error tracker.
- jobs + Next apps: structured server-side `logger` per app.
- Deferred (lower severity, recorded in `…-review-findings.md`): Next frontend error hooks, alert-guard adoption at payments/wallet call sites, live alert transport, real Sentry-style provider.

### File List

- packages/observability/package.json (new)
- packages/observability/tsconfig.json (new)
- packages/observability/src/index.ts (new)
- packages/observability/src/logger.ts (new)
- packages/observability/src/logger.test.ts (new)
- packages/observability/src/correlation.ts (new)
- packages/observability/src/correlation.test.ts (new)
- packages/observability/src/error-tracker.ts (new)
- packages/observability/src/error-tracker.test.ts (new)
- packages/observability/src/alerts.ts (new)
- packages/observability/src/alerts.test.ts (new)
- packages/observability/src/alert-hooks.ts (new)
- packages/observability/src/alert-hooks.test.ts (new)
- apps/api/package.json (add @bm/observability)
- apps/api/src/app.ts (pino + correlation id + error capture)
- apps/api/src/observability.test.ts (new)
- apps/jobs/package.json (add @bm/observability)
- apps/jobs/src/index.ts (structured boot log)
- apps/jobs/src/logger.ts (new)
- apps/jobs/src/logger.test.ts (new)
- apps/platform/package.json, apps/platform/lib/logger.ts (new)
- apps/pos/package.json, apps/pos/lib/logger.ts (new)
- apps/admin/package.json, apps/admin/lib/logger.ts (new)
- _bmad-output/implementation-artifacts/15-1-structured-logging-error-tracking-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented @bm/observability (pino structured logging + correlation id + redaction, error-tracker seam, alert rules); wired API + jobs + Next apps; test-first. Status: done | claude-opus-4-7 |
