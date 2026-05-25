/**
 * Error-tracking seam. The real Sentry-style provider is deferred (AC2); this
 * interface is what the API/jobs/apps depend on so a provider can be dropped in
 * without touching call sites. The correlation id tags every event.
 */
export interface ErrorContext {
  correlationId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ErrorTracker {
  captureException(error: unknown, context?: ErrorContext): void;
  captureMessage(message: string, context?: ErrorContext): void;
}

/** Default provider: discards everything. Used until a real tracker is wired. */
export class NoopErrorTracker implements ErrorTracker {
  captureException(): void {}
  captureMessage(): void {}
}

export interface CapturedEvent {
  error?: unknown;
  message?: string;
  context?: ErrorContext;
  at: number;
}

/** Test/diagnostic provider that records every capture in memory. */
export class InMemoryErrorTracker implements ErrorTracker {
  readonly events: CapturedEvent[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  captureException(error: unknown, context?: ErrorContext): void {
    this.events.push({ error, context, at: this.now() });
  }

  captureMessage(message: string, context?: ErrorContext): void {
    this.events.push({ message, context, at: this.now() });
  }

  clear(): void {
    this.events.length = 0;
  }
}
