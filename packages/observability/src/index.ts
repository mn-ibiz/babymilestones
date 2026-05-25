/**
 * @bm/observability — structured logging + error tracking foundation (X8-S01).
 *
 * - `createLogger` / `REDACT_PATHS` / `REDACTED`: canonical pino JSON logger
 *   with secret + PII redaction (never logs PINs/keys).
 * - correlation-id helpers: per-request id, propagated via the
 *   `x-correlation-id` header and stamped on child loggers.
 * - `ErrorTracker` seam: `NoopErrorTracker` default + `InMemoryErrorTracker` for
 *   tests; a real Sentry-style provider is deferred.
 * - alert rules: error-rate window, payments-webhook failure, ledger-insert
 *   failure (AC3).
 */
export const PACKAGE = "@bm/observability" as const;

export { createLogger, REDACTED, REDACT_PATHS } from "./logger.js";
export type { CreateLoggerOptions, Logger, LogDestination } from "./logger.js";

export {
  CORRELATION_ID_HEADER,
  generateCorrelationId,
  resolveCorrelationId,
} from "./correlation.js";

export {
  NoopErrorTracker,
  InMemoryErrorTracker,
} from "./error-tracker.js";
export type { ErrorTracker, ErrorContext, CapturedEvent } from "./error-tracker.js";

export {
  ErrorRateWindow,
  webhookFailureAlert,
  ledgerFailureAlert,
} from "./alerts.js";
export type {
  Alert,
  AlertKind,
  AlertSeverity,
  ErrorRateWindowOptions,
  WebhookFailureInput,
  LedgerFailureInput,
} from "./alerts.js";

export { guardLedgerInsert, guardWebhook } from "./alert-hooks.js";
export type {
  AlertSink,
  LedgerGuardOptions,
  WebhookGuardOptions,
} from "./alert-hooks.js";
