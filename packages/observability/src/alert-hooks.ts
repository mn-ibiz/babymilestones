import {
  ledgerFailureAlert,
  webhookFailureAlert,
  type Alert,
} from "./alerts.js";

export type { Alert };

/**
 * Where alerts are delivered. The real transport (PagerDuty/email/Slack) is
 * deferred; callers pass any sink (an error tracker, a logger, a queue). The
 * default no-op makes these guards safe to drop in anywhere.
 */
export interface AlertSink {
  emit(alert: Alert): void;
}

const NOOP_SINK: AlertSink = { emit: () => {} };

export interface LedgerGuardOptions {
  operation: string;
  walletId?: string;
  correlationId?: string;
  sink?: AlertSink;
}

/**
 * Wrap a ledger insert so any failure emits a `ledger_insert_failure` alert
 * (AC3) before the error propagates. Returns the operation's result unchanged
 * on success. Opt-in: existing call sites are untouched until they adopt it.
 */
export async function guardLedgerInsert<T>(
  options: LedgerGuardOptions,
  op: () => Promise<T>,
): Promise<T> {
  const sink = options.sink ?? NOOP_SINK;
  try {
    return await op();
  } catch (error) {
    sink.emit(
      ledgerFailureAlert({
        operation: options.operation,
        walletId: options.walletId,
        correlationId: options.correlationId,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}

export interface WebhookGuardOptions {
  provider: string;
  correlationId?: string;
  sink?: AlertSink;
}

/**
 * Wrap a payments webhook handler so any failure emits a
 * `payments_webhook_failure` alert (AC3) before the error propagates.
 */
export async function guardWebhook<T>(
  options: WebhookGuardOptions,
  op: () => Promise<T>,
): Promise<T> {
  const sink = options.sink ?? NOOP_SINK;
  try {
    return await op();
  } catch (error) {
    sink.emit(
      webhookFailureAlert({
        provider: options.provider,
        correlationId: options.correlationId,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
