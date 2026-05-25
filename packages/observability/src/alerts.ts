/**
 * Alert rules (AC3). These are pure, testable predicates over observed events;
 * the real notification transport (PagerDuty/email/etc.) is deferred and would
 * subscribe to the `Alert` objects produced here.
 */
export type AlertKind =
  | "error_rate"
  | "payments_webhook_failure"
  | "ledger_insert_failure";

export type AlertSeverity = "warning" | "critical";

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  detail: Record<string, unknown>;
}

export interface ErrorRateWindowOptions {
  /** Rolling window length in ms (5 min for AC3). */
  windowMs: number;
  /** Error ratio that triggers an alert (0.01 = 1%). */
  thresholdRatio: number;
  /** Minimum samples in the window before a ratio can alert. Default 1. */
  minSamples?: number;
}

interface Sample {
  at: number;
  errored: boolean;
}

/**
 * Sliding-window error-rate tracker. Record every request outcome; `alert()`
 * returns a critical alert when the error ratio over the window exceeds the
 * threshold (any error rate > 1% / 5 min).
 */
export class ErrorRateWindow {
  private readonly samples: Sample[] = [];
  private readonly windowMs: number;
  private readonly thresholdRatio: number;
  private readonly minSamples: number;

  constructor(options: ErrorRateWindowOptions) {
    this.windowMs = options.windowMs;
    this.thresholdRatio = options.thresholdRatio;
    this.minSamples = options.minSamples ?? 1;
  }

  record(errored: boolean, at: number = Date.now()): void {
    this.samples.push({ at, errored });
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.at < cutoff) {
      this.samples.shift();
    }
  }

  /** Current error ratio over the live window (0 when empty). */
  ratio(now: number = Date.now()): number {
    this.prune(now);
    if (this.samples.length === 0) return 0;
    const errors = this.samples.reduce((n, s) => n + (s.errored ? 1 : 0), 0);
    return errors / this.samples.length;
  }

  alert(now: number = Date.now()): Alert | null {
    this.prune(now);
    if (this.samples.length < this.minSamples) return null;
    const ratio = this.ratio(now);
    if (ratio <= this.thresholdRatio) return null;
    return {
      kind: "error_rate",
      severity: "critical",
      message: `Error rate ${(ratio * 100).toFixed(2)}% exceeds ${(this.thresholdRatio * 100).toFixed(2)}% over ${this.windowMs / 60_000}min`,
      detail: { ratio, samples: this.samples.length, windowMs: this.windowMs },
    };
  }
}

export interface WebhookFailureInput {
  provider: string;
  reason: string;
  correlationId?: string;
}

/** Any payments webhook failure is a critical alert. */
export function webhookFailureAlert(input: WebhookFailureInput): Alert {
  return {
    kind: "payments_webhook_failure",
    severity: "critical",
    message: `Payments webhook failure (${input.provider}): ${input.reason}`,
    detail: { ...input },
  };
}

export interface LedgerFailureInput {
  operation: string;
  reason: string;
  walletId?: string;
  correlationId?: string;
}

/** Any ledger insert failure is a critical alert. */
export function ledgerFailureAlert(input: LedgerFailureInput): Alert {
  return {
    kind: "ledger_insert_failure",
    severity: "critical",
    message: `Ledger insert failure (${input.operation}): ${input.reason}`,
    detail: { ...input },
  };
}
