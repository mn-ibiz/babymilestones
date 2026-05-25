# Review findings — X8-S01 (15-1 structured logging + error tracking)

Single self-review pass. BLOCKER/high-severity findings were fixed inline; the
items below are lower-severity follow-ups deferred by design (the testable seam
ships now; real infra/transport is deferred per the story hint).

## Deferred (low/medium severity)

1. **Frontend (Next) error capture — partial (AC2).** Each Next app (`platform`,
   `pos`, `admin`) gets a structured server-side `logger` (`apps/*/lib/logger.ts`)
   and can import the `ErrorTracker` seam, but no React error boundary /
   `instrumentation.ts` `onRequestError` hook is wired yet. The API path fully
   captures via `setErrorHandler`. Follow-up: add a Next `instrumentation.ts`
   `onRequestError` per app forwarding to a real provider once chosen.

2. **Alert call-site adoption — opt-in only (AC3).** `guardWebhook` /
   `guardLedgerInsert` wrappers and the pure alert rules
   (`ErrorRateWindow`, `webhookFailureAlert`, `ledgerFailureAlert`) are delivered
   and unit-tested, but the existing `packages/payments` webhook handlers and
   `packages/wallet` `post()` are NOT yet wrapped — doing so would churn widely
   used signatures and risk regressions across many done stories. Follow-up:
   adopt the guards at those call sites + connect an `AlertSink` to the real
   notification transport.

3. **Real error-tracking provider deferred.** Only `NoopErrorTracker` (prod
   default) and `InMemoryErrorTracker` (tests) exist. A Sentry-style provider
   implementing `ErrorTracker` is the intended drop-in — deferred per story hint.

4. **Error-rate alert evaluation loop deferred.** `ErrorRateWindow` is a pure,
   tested accumulator; nothing yet feeds live request outcomes into it on a
   timer. Wire it into the API request lifecycle + a periodic `alert()` poll when
   the alert transport lands.
