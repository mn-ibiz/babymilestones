import { materialiseDueRecurringExpenses } from "@bm/catalog";
import type { Database } from "@bm/db";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

const DAILY_MS = 24 * 60 * 60 * 1000;

/** Minimal structured-logger shape the job needs. */
export interface RecurringExpensesLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface RecurringExpensesJobDeps {
  db: Database;
  /** Clock injection for deterministic "today" in tests. Defaults to wall clock. */
  now?: () => Date;
  /** Structured logger for the per-run summary; defaults to the jobs logger. */
  logger?: RecurringExpensesLogger;
}

/** `Date` → the UTC `YYYY-MM-DD` calendar date the run materialises for. */
function asOfDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Recurring-expenses materialisation cron (P6-E05-S05 / Story 35.5 AC3). Daily:
 * for every ACTIVE `expense_recurring_templates` row whose `day_of_month` matches
 * today, materialise a concrete `expenses` row dated today — IDEMPOTENTLY at most
 * once per template per calendar month (guarded by `last_run_month`). A re-run the
 * same day (or any later day in the same month) re-finds the guard set and creates
 * nothing. Each materialised expense carries `recurring_template_id` back to its
 * template, so it shows in the Expenses list + the P&L exactly like a one-off.
 *
 * The materialisation is a batch side effect of the cron (not an interactive
 * mutation), so it is recorded in `job_runs` by the runner — NOT the audit log
 * (consistent with the audit-catalogue's exclusion of recurring/system batches).
 *
 * Build via this factory and register it exactly like the sibling daily crons
 * (outstanding-reminders, subscription-renew).
 */
export function createRecurringExpensesJob(deps: RecurringExpensesJobDeps): Job {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  return {
    name: "recurring-expenses",
    intervalMs: DAILY_MS,
    // Run early each morning, after midnight, so the day's recurring expenses
    // are materialised before the operations dashboards read them.
    cron: "0 1 * * *",
    run: async () => {
      const date = asOfDate(clock());
      const { created } = await materialiseDueRecurringExpenses(db, date);
      log.info(
        { event: "recurring.expenses.materialised", as_of_date: date, created },
        `recurring expenses: materialised ${created} for ${date}`,
      );
    },
  };
}
