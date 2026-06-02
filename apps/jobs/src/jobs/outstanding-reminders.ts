import { and, eq, sql } from "drizzle-orm";
import { audit, auditOutbox, invoices, parents, users, type Database } from "@bm/db";
import { StubSmsSender, isMarketingOptedIn, type SmsSender } from "@bm/sms";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Nudge schedule (P2-E07-S02 AC1/AC2): the reminder fired when the OLDEST
 * outstanding invoice reaches exactly this many days old, keyed to its template.
 * One nudge per milestone; off-schedule days send nothing.
 */
const SCHEDULE: ReadonlyArray<{ ageDays: number; template: string }> = [
  { ageDays: 1, template: "outstanding.day1" },
  { ageDays: 7, template: "outstanding.day7" },
  { ageDays: 30, template: "outstanding.day30" },
];

/** Minimal structured-logger shape the job needs. */
export interface OutstandingRemindersLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface OutstandingRemindersJobDeps {
  db: Database;
  /** SMS sender for the nudges. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock injection for deterministic age windows in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary; defaults to the jobs logger. */
  logger?: OutstandingRemindersLogger;
}

/** Whole days elapsed between `from` and `to` (floored — calendar-agnostic). */
function fullDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAILY_MS);
}

/** Amount-due label for the template `amountKes` field, e.g. 120000 → "1,200.00". */
function toAmountKes(cents: number): string {
  return (cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Outstanding-balance reminder cron (P2-E07-S02). Daily, for every parent who
 * still owes money (the sum of invoices NOT settled/void > 0):
 *  - ages the debt from the OLDEST open invoice's `created_at` (AC2),
 *  - if that age is exactly a scheduled milestone (1 / 7 / 30 days) queues the
 *    matching stub-SMS nudge with the total owed (AC1/AC2),
 *  - HONOURS the non-transactional opt-out: a parent who has not opted in to
 *    marketing/non-transactional SMS is skipped — these reminders are not
 *    transactional (AC3),
 *  - is IDEMPOTENT per milestone-day: a second run the same day re-finds the
 *    already-queued nudge and does not double-send (AC2),
 *  - audits `outstanding.reminder.sent` for each queued nudge.
 *
 * Build via this factory and register it exactly like the sibling jobs
 * (subscription-renew, commission-run).
 */
export function createOutstandingRemindersJob(deps: OutstandingRemindersJobDeps): Job {
  const db = deps.db;
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  return {
    name: "outstanding-reminders",
    intervalMs: DAILY_MS,
    cron: "0 9 * * *",
    run: async () => {
      const at = clock();

      // Every parent who still owes: total owed + the oldest open invoice age.
      const owing = await db
        .select({
          parentId: invoices.parentId,
          owed: sql<string>`COALESCE(SUM(${invoices.amountDue}), 0)`,
          oldest: sql<string>`MIN(${invoices.createdAt})`,
        })
        .from(invoices)
        .where(sql`${invoices.status} NOT IN ('settled', 'void')`)
        .groupBy(invoices.parentId);

      let queued = 0;
      let skippedOptOut = 0;

      for (const row of owing) {
        const owed = Number(row.owed);
        if (owed <= 0) continue; // nothing actually owed

        const oldest = new Date(row.oldest);
        const age = fullDaysBetween(oldest, at);
        const milestone = SCHEDULE.find((s) => s.ageDays === age);
        if (!milestone) continue; // off-schedule day

        // AC3: non-transactional reminder — drop unless the parent opted in.
        if (!(await isMarketingOptedIn(db, row.parentId))) {
          skippedOptOut += 1;
          continue;
        }

        const [parent] = await db.select().from(parents).where(eq(parents.id, row.parentId));
        if (!parent) continue;
        const [user] = await db.select().from(users).where(eq(users.id, parent.userId));
        if (!user?.phone) continue;

        // Idempotency: this milestone nudge fires at most once per debt episode.
        // A milestone (1/7/30 days) is hit on a single calendar day, but the
        // daily cron also re-runs that same day. We dedup on whether THIS exact
        // template was already queued for the phone for the current open debt:
        // an `outstanding.reminder.sent` audit carries the oldest-invoice marker
        // so a re-run finds it and skips, while a future distinct debt (a newer
        // oldest invoice) is not suppressed. (AC2)
        const oldestKey = oldest.toISOString();
        const priorNudges = await db
          .select({ payload: auditOutbox.payload })
          .from(auditOutbox)
          .where(
            and(
              eq(auditOutbox.action, "outstanding.reminder.sent"),
              eq(auditOutbox.targetTable, "parents"),
              eq(auditOutbox.targetId, row.parentId),
            ),
          );
        const alreadyNudged = priorNudges.some((a) => {
          const p = a.payload as { template?: unknown; oldest?: unknown } | null;
          return p?.template === milestone.template && p?.oldest === oldestKey;
        });
        if (alreadyNudged) continue;

        await sender.send({
          to: user.phone,
          template: milestone.template,
          data: { amountKes: toAmountKes(owed) },
        });
        await audit(db, {
          actor: null,
          action: "outstanding.reminder.sent",
          target: { table: "parents", id: row.parentId },
          // `oldest` keys the idempotency marker to this debt episode (AC2).
          payload: { template: milestone.template, age_days: age, owed_cents: owed, oldest: oldestKey },
        });
        queued += 1;
      }

      log.info(
        { event: "outstanding.reminders", queued, skipped_opt_out: skippedOptOut, candidates: owing.length },
        `outstanding reminders: queued ${queued}, skipped ${skippedOptOut} opted-out`,
      );
    },
  };
}
