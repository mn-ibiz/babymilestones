import { and, eq, isNull, lte } from "drizzle-orm";
import {
  adminAlerts,
  audit,
  feedback,
  getSetting,
  staff,
  type Database,
} from "@bm/db";
import { feedbackUnitForSourceType } from "@bm/catalog";
import { feedbackUnitLabel } from "@bm/contracts";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** The cron cadence: every 5 minutes — the "within 5 minutes" SLA (AC1). */
const FIVE_MIN_MS = 5 * 60 * 1000;

/** A rating at or below this threshold is "negative" and triggers an alert (AC1). */
export const NEGATIVE_FEEDBACK_RATING_MAX = 2;

/** The alert type all negative-feedback alerts carry (the in-app `admin_alerts` row). */
export const NEGATIVE_FEEDBACK_ALERT_TYPE = "negative_feedback";

/**
 * The settings key holding the configured ops/admin alert recipient phone number
 * (Story 34.3). A single, deploy-free-changeable number in the `settings` table —
 * the sane "configured ops alert number" recipient source. When unset/empty the
 * in-app alert is STILL raised; only the SMS is skipped.
 */
export const ADMIN_ALERT_PHONE_SETTING_KEY = "alerts.admin_phone";

/** Minimal structured-logger shape the job needs. */
export interface NegativeFeedbackAlertLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface NegativeFeedbackAlertJobDeps {
  db: Database;
  /** SMS sender for the ops alert. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock injection for deterministic windows in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary; defaults to the jobs logger. */
  logger?: NegativeFeedbackAlertLogger;
}

/**
 * The in-app link to a feedback detail (the Story 34.2 responses surface). The
 * admin `/feedback` dashboard drills into the individual responses; we carry the
 * feedback id as a focus anchor so the alert points at the specific response.
 */
function feedbackDetailLink(feedbackId: string): string {
  return `/feedback?focus=${feedbackId}`;
}

/**
 * Negative-feedback alert cron (P6-E04-S03 / Story 34.3). Runs every ~5 minutes
 * (the "within 5 minutes" SLA, AC1). Scans SUBMITTED feedback with a LOW rating
 * (≤2) that has NOT yet been alerted (`alerted_at IS NULL`), and for each:
 *
 *   - raises ONE in-app `admin_alerts` row (`negative_feedback`) linking to the
 *     feedback detail (AC2). The `title`/`body` carry only the rating + unit +
 *     attributed staff — NEVER the parent's comment text;
 *   - sends ONE SMS-stub `feedback.negative_alert` to the configured ops/admin
 *     number (`alerts.admin_phone`), in a try/catch so a provider failure never
 *     blocks the in-app alert (logged as a warning);
 *   - audits `feedback.negative_alert`;
 *   - stamps `feedback.alerted_at` so a re-run skips the row.
 *
 * IDEMPOTENT (AC1): the `alerted_at` stamp is the primary guard; the
 * `admin_alerts` UNIQUE (type, source_type, source_id) is a second guard so a
 * racing re-run can never insert a duplicate alert. Build via this factory and
 * register it exactly like the sibling cron jobs.
 */
export function createNegativeFeedbackAlertJob(deps: NegativeFeedbackAlertJobDeps): Job {
  const db = deps.db;
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  return {
    name: "negative-feedback-alert",
    intervalMs: FIVE_MIN_MS,
    cron: "*/5 * * * *",
    run: async () => {
      const at = clock();

      // The not-yet-alerted, submitted, low-rated feedback. Join the attributed
      // staff for follow-up context (display name only).
      const rows = await db
        .select({
          id: feedback.id,
          sourceType: feedback.sourceType,
          rating: feedback.rating,
          staffName: staff.displayName,
        })
        .from(feedback)
        .leftJoin(staff, eq(feedback.attributedStaffId, staff.id))
        .where(
          and(
            isNull(feedback.alertedAt),
            lte(feedback.rating, NEGATIVE_FEEDBACK_RATING_MAX),
          ),
        );

      // The configured ops/admin recipient (deploy-free changeable). Empty → no SMS.
      const phoneSetting = await getSetting(db, ADMIN_ALERT_PHONE_SETTING_KEY);
      const adminPhone = typeof phoneSetting === "string" ? phoneSetting.trim() : "";

      let raised = 0;
      let smsSent = 0;
      let smsFailed = 0;

      for (const row of rows) {
        const rating = row.rating ?? 0;
        const unitLabel = feedbackUnitLabel(feedbackUnitForSourceType(row.sourceType));
        const link = feedbackDetailLink(row.id);
        const title = `Low rating (${rating}/5) for ${unitLabel}`;
        const body = row.staffName
          ? `A ${rating}/5 rating was left for ${unitLabel} (${row.staffName}).`
          : `A ${rating}/5 rating was left for ${unitLabel}.`;

        // Raise the in-app alert. The UNIQUE (type, source_type, source_id) +
        // onConflictDoNothing make this idempotent even under a racing re-run.
        await db
          .insert(adminAlerts)
          .values({
            type: NEGATIVE_FEEDBACK_ALERT_TYPE,
            severity: "warning",
            sourceType: "feedback",
            sourceId: row.id,
            title,
            body,
            linkPath: link,
          })
          .onConflictDoNothing({
            target: [adminAlerts.type, adminAlerts.sourceType, adminAlerts.sourceId],
          });

        // Stamp the feedback so a re-run skips it (the primary idempotency guard).
        await db
          .update(feedback)
          .set({ alertedAt: at })
          .where(and(eq(feedback.id, row.id), isNull(feedback.alertedAt)));

        // Audit the alert (once per alerted feedback — the stamp guards the rest).
        await audit(db, {
          actor: null,
          action: "feedback.negative_alert",
          target: { table: "feedback", id: row.id },
          payload: { rating, unit: unitLabel, link },
        });

        // SMS the configured ops number. A provider failure must never block the
        // in-app alert — try/catch + warn, the alert is already raised + stamped.
        if (adminPhone) {
          try {
            await sender.send({
              to: adminPhone,
              template: "feedback.negative_alert",
              data: { rating: String(rating), unit: unitLabel, link },
            });
            smsSent += 1;
          } catch (err) {
            smsFailed += 1;
            log.warn(
              { event: "feedback.negative_alert.sms_failed", feedback_id: row.id, err: String(err) },
              "negative-feedback alert SMS failed",
            );
          }
        }

        raised += 1;
      }

      log.info(
        { event: "feedback.negative_alert", raised, sms_sent: smsSent, sms_failed: smsFailed, scanned: rows.length },
        `negative-feedback alerts: raised ${raised}, sms ${smsSent} sent / ${smsFailed} failed`,
      );
    },
  };
}
