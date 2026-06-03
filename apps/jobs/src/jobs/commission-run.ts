import { audit, type Database } from "@bm/db";
import { createCommissionRun, priorMonthPeriod } from "@bm/catalog";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** Roughly-monthly cadence (the run itself is idempotent per period). */
const MONTHLY_MS = 30 * 24 * 60 * 60 * 1000;
/** P3-E06-S03 AC2: max attempts per scheduled run before an alert is raised. */
export const COMMISSION_MAX_ATTEMPTS = 3;

/** Minimal structured-logger shape the job needs. */
export interface CommissionRunLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface CommissionRunJobDeps {
  db: Database;
  /** Clock injection for deterministic period boundaries in tests. */
  now?: () => Date;
  /** Structured logger for the run summary; defaults to the jobs logger. */
  logger?: CommissionRunLogger;
  /** Override the per-run attempt cap (defaults to {@link COMMISSION_MAX_ATTEMPTS}). */
  maxAttempts?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Monthly commission run (P3-E01-S03), registered in the jobs framework
 * (P3-E06-S03). Registered as `commission.monthly` with cron `0 2 1 * *` (02:00
 * on the 1st of each month, AC1); `intervalMs` keeps the single-worker scheduler
 * firing it on a monthly cadence (the run itself is idempotent per period). Each
 * run:
 *  - computes the PRIOR calendar month's half-open period (S03 AC2),
 *  - writes one `commission_runs` row + a `commission_run_lines` row per staff
 *    member with positive net commission, claiming the period's ledger entries (S03 AC3),
 *  - is IDEMPOTENT — running twice for the same month is a no-op (S03 AC4), via the
 *    monthly-period unique index in `createCommissionRun`,
 *  - audits `commission.run.created` (S03 AC5) for a newly-created run only.
 *
 * Retry/alert (P3-E06-S03 AC2): a single scheduled run retries the work up to
 * {@link COMMISSION_MAX_ATTEMPTS} (3) times. Because the run is idempotent, a
 * retry after a partial/transient failure is safe. If all 3 attempts fail the
 * job RAISES AN ALERT — it audits `commission.run.failed` and logs an error
 * line — then RETHROWS so the framework's `runJob` records the failed `job_runs`
 * row and forwards it to the Sentry-style error tracker. `onFailure:
 * "alert-only"` because the run is a once-a-month one-shot, not a poll loop:
 * after exhausting its in-run retries the alert is the terminal action, not a
 * silent roll-forward to next tick.
 */
export function createCommissionRunJob(deps: CommissionRunJobDeps): Job {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const maxAttempts = deps.maxAttempts ?? COMMISSION_MAX_ATTEMPTS;

  return {
    name: "commission.monthly",
    intervalMs: MONTHLY_MS,
    cron: "0 2 1 * *",
    onFailure: "alert-only",
    maxAttempts,
    run: async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await runOnce(db, clock, log);
          return; // success — done for this period.
        } catch (err) {
          lastError = err;
          log.error(
            { event: "commission.run.attempt_failed", attempt, max_attempts: maxAttempts, err: errorMessage(err) },
            `commission run attempt ${attempt}/${maxAttempts} failed`,
          );
        }
      }

      // AC2: all attempts exhausted — raise the alert and rethrow lastError so the
      // framework records + reports the REAL failure. Order matters: the error log
      // fires FIRST and the audit insert is GUARDED, because the most common cause
      // of failing every attempt is the DB itself being down — in which case the
      // audit insert would also throw, and (unguarded) would swallow the alert log
      // and propagate a misleading insert error instead of lastError.
      const message = errorMessage(lastError);
      log.error(
        { event: "commission.run.failed", attempts: maxAttempts, err: message },
        "commission run failed after max attempts — manual intervention required",
      );
      try {
        await audit(db, {
          actor: null,
          action: "commission.run.failed",
          target: { table: "commission_runs", id: null },
          payload: { attempts: maxAttempts, last_error: message },
        });
      } catch (auditErr) {
        log.error(
          { event: "commission.run.failed_audit_error", err: errorMessage(auditErr) },
          "failed to write commission.run.failed audit row",
        );
      }
      throw lastError instanceof Error ? lastError : new Error(message);
    },
  };
}

/** One commission-run attempt: idempotent close of the prior month (S03 AC2-AC5). */
async function runOnce(
  db: Database,
  clock: () => Date,
  log: CommissionRunLogger,
): Promise<void> {
  const at = clock();
  const { periodStart, periodEnd } = priorMonthPeriod(at);
  const result = await createCommissionRun(db, { kind: "monthly", periodStart, periodEnd, createdBy: null });

  if (!result.alreadyExisted) {
    // Audit only a genuinely new run — an idempotent re-run is a silent no-op.
    await audit(db, {
      actor: null,
      action: "commission.run.created",
      target: { table: "commission_runs", id: result.run.id },
      payload: {
        kind: "monthly",
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        total_cents: result.run.totalCents,
        line_count: result.lines.length,
      },
    });
  }

  log.info(
    {
      event: "commission.run",
      run_id: result.run.id,
      already_existed: result.alreadyExisted,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_cents: result.run.totalCents,
      line_count: result.lines.length,
    },
    result.alreadyExisted
      ? "commission run: month already closed (no-op)"
      : `commission run: closed ${periodStart.toISOString().slice(0, 7)} (${result.lines.length} line(s), ${result.run.totalCents} cents)`,
  );
}
