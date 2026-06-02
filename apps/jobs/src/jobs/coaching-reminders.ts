import { and, eq, ne } from "drizzle-orm";
import {
  audit,
  auditOutbox,
  bookings,
  children,
  coachingSlots,
  parents,
  services,
  staff,
  users,
  type Database,
} from "@bm/db";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

const DAILY_MS = 24 * 60 * 60 * 1000;

/** Minimal structured-logger shape the job needs. */
export interface CoachingRemindersLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface CoachingRemindersJobDeps {
  db: Database;
  /** SMS sender for the reminders. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock injection for deterministic "tomorrow" in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary; defaults to the jobs logger. */
  logger?: CoachingRemindersLogger;
}

/** `YYYY-MM-DD` for the day after `at` (UTC calendar). */
function tomorrowIso(at: Date): string {
  return new Date(at.getTime() + DAILY_MS).toISOString().slice(0, 10);
}

/**
 * Day-before 1:1 coaching reminder cron (P5-E01-S02 / Story 31.2 AC5). Daily, for
 * every non-cancelled coaching booking whose slot falls TOMORROW:
 *  - queues a `coaching.reminder` stub-SMS to the parent with the child + offering
 *    + coach + slot date/time,
 *  - is IDEMPOTENT per booking: a `coaching.reminder.sent` audit marker keyed on
 *    the booking id makes a second run the same day a no-op (no double-send),
 *  - audits `coaching.reminder.sent` for each queued reminder.
 *
 * Follows the `outstanding-reminders` / `subscription-renew` daily-job pattern.
 * Build via this factory and register like the sibling jobs.
 */
export function createCoachingRemindersJob(deps: CoachingRemindersJobDeps): Job {
  const db = deps.db;
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  return {
    name: "coaching-reminders",
    intervalMs: DAILY_MS,
    cron: "0 18 * * *",
    run: async () => {
      const target = tomorrowIso(clock());

      // Every non-cancelled coaching booking whose slot is tomorrow, joined to the
      // child, offering, coach (live name fallback to snapshot), and the parent's
      // phone.
      const rows = await db
        .select({
          bookingId: bookings.id,
          parentId: bookings.parentId,
          childName: children.firstName,
          offeringName: services.name,
          // P5-E01-S05: discreet-billing facts neutralise the offering name.
          discreetBillingEnabled: services.discreetBillingEnabled,
          discreetBillingLabel: services.discreetBillingLabel,
          coachName: staff.displayName,
          coachNameSnapshot: bookings.staffNameSnapshot,
          slotDate: coachingSlots.slotDate,
          startTime: coachingSlots.startTime,
          phone: users.phone,
        })
        .from(bookings)
        .innerJoin(coachingSlots, eq(bookings.coachingSlotId, coachingSlots.id))
        .innerJoin(children, eq(bookings.childId, children.id))
        .leftJoin(services, eq(coachingSlots.serviceId, services.id))
        .leftJoin(staff, eq(coachingSlots.staffId, staff.id))
        .innerJoin(parents, eq(bookings.parentId, parents.id))
        .innerJoin(users, eq(parents.userId, users.id))
        .where(and(eq(coachingSlots.slotDate, target), ne(bookings.status, "cancelled")));

      let queued = 0;
      for (const row of rows) {
        if (!row.phone) continue;

        // Idempotency: at most one reminder per booking. A re-run finds the marker
        // and skips.
        const prior = await db
          .select({ id: auditOutbox.id })
          .from(auditOutbox)
          .where(
            and(
              eq(auditOutbox.action, "coaching.reminder.sent"),
              eq(auditOutbox.targetTable, "bookings"),
              eq(auditOutbox.targetId, row.bookingId),
            ),
          );
        if (prior.length > 0) continue;

        // P5-E01-S05 (AC2): a discreet (sensitive) offering reminds under its
        // NEUTRAL label so the SMS carries no sensitive service detail. Non-discreet
        // offerings keep their real name unchanged.
        const discreetLabel = (row.discreetBillingLabel ?? "").trim();
        const offeringName =
          row.discreetBillingEnabled && discreetLabel !== ""
            ? discreetLabel
            : (row.offeringName ?? "coaching session");
        await sender.send({
          to: row.phone,
          template: "coaching.reminder",
          data: {
            childName: row.childName,
            offeringName,
            coachName: row.coachName ?? row.coachNameSnapshot,
            date: row.slotDate,
            time: row.startTime,
          },
        });
        await audit(db, {
          actor: null,
          action: "coaching.reminder.sent",
          target: { table: "bookings", id: row.bookingId },
          payload: { slot_date: row.slotDate, start_time: row.startTime },
        });
        queued += 1;
      }

      log.info(
        { event: "coaching.reminders", queued, candidates: rows.length, target },
        `coaching reminders: queued ${queued} for ${target}`,
      );
    },
  };
}
