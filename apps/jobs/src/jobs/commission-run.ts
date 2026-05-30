import { audit, type Database } from "@bm/db";
import { createCommissionRun, priorMonthPeriod } from "@bm/catalog";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** Roughly-monthly cadence (the run itself is idempotent per period). */
const MONTHLY_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimal structured-logger shape the job needs. */
export interface CommissionRunLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface CommissionRunJobDeps {
  db: Database;
  /** Clock injection for deterministic period boundaries in tests. */
  now?: () => Date;
  /** Structured logger for the run summary; defaults to the jobs logger. */
  logger?: CommissionRunLogger;
}

/**
 * Monthly commission run (P3-E01-S03). Scheduled to fire at 02:00 on the 1st of
 * each month (the runner's cron expression; here the factory mirrors the sibling
 * jobs' shape with a monthly cadence + injected clock). Each run:
 *  - computes the PRIOR calendar month's half-open period (AC2),
 *  - writes one `commission_runs` row + a `commission_run_lines` row per staff
 *    member with positive net commission, claiming the period's ledger entries (AC3),
 *  - is IDEMPOTENT — running twice for the same month is a no-op (AC4), via the
 *    monthly-period unique index in `createCommissionRun`,
 *  - audits `commission.run.created` (AC5) for a newly-created run only.
 *
 * Build via this factory and register it exactly like the sibling jobs
 * (subscription-renew, anonymise-observations). A later Jobs-Runner story (28-3)
 * wires it into the new scheduling framework with the real 02:00-on-the-1st cron.
 */
export function createCommissionRunJob(deps: CommissionRunJobDeps): Job {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  return {
    name: "commission-run",
    intervalMs: MONTHLY_MS,
    run: async () => {
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
    },
  };
}
