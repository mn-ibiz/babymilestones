import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  adminAlerts,
  auditOutbox,
  feedback,
  parents,
  setSetting,
  smsOutbox,
  staff,
  users,
} from "@bm/db";
import {
  ADMIN_ALERT_PHONE_SETTING_KEY,
  createNegativeFeedbackAlertJob,
} from "./negative-feedback-alert.js";

/**
 * P6-E04-S03 (Story 34.3) — negative-feedback alert cron. DB-backed via PGlite.
 * A new feedback with rating ≤2 raises ONE in-app `admin_alerts` row + ONE
 * SMS-stub to the configured ops/admin number, within the 5-minute SLA (the cron
 * runs every ~5 min). Idempotent: a re-run never double-raises (AC1). The alert
 * links to the feedback detail (AC2). A >2 rating raises nothing.
 */
const NOW = new Date("2026-06-12T10:05:00.000Z");
const ADMIN_PHONE = "+254712000999";

describe("negative-feedback alert cron (P6-E04-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
    // The configured ops/admin alert recipient (a settings-driven number).
    await setSetting(dbh.db, ADMIN_ALERT_PHONE_SETTING_KEY, ADMIN_PHONE);
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  const nextPhone = () => `+25471${String(1_000_000 + seq++).padStart(7, "0")}`;

  async function seedParent() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" });
    return u!.id;
  }

  /** Seed a SUBMITTED feedback row with the given rating. */
  async function seedFeedback(opts: {
    rating: number;
    sourceType?: string;
    sourceId?: string;
    staffId?: string | null;
    submittedAt?: Date;
    alertedAt?: Date | null;
  }) {
    const parentUserId = await seedParent();
    const [f] = await dbh.db
      .insert(feedback)
      .values({
        sourceType: opts.sourceType ?? "salon",
        sourceId: opts.sourceId ?? `src-${seq++}`,
        parentId: parentUserId,
        attributedStaffId: opts.staffId ?? null,
        rating: opts.rating,
        submittedAt: opts.submittedAt ?? new Date(NOW.getTime() - 60_000),
        invitedAt: new Date(NOW.getTime() - 3_600_000),
        alertedAt: opts.alertedAt ?? null,
      })
      .returning();
    return f!;
  }

  const run = () => createNegativeFeedbackAlertJob({ db: dbh.db, now: () => NOW }).run();
  const alertsFor = (sourceId: string) =>
    dbh.db.select().from(adminAlerts).where(eq(adminAlerts.sourceId, sourceId));
  const negativeSms = () =>
    dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "feedback.negative_alert"));

  it("runs on a ~5-minute cadence (the 5-minute SLA, AC1)", () => {
    const job = createNegativeFeedbackAlertJob({ db: dbh.db });
    expect(job.name).toBe("negative-feedback-alert");
    expect(job.intervalMs).toBe(5 * 60 * 1000);
    expect(job.cron).toBe("*/5 * * * *");
  });

  it("raises exactly one in-app alert + one SMS for a new ≤2 feedback (AC1)", async () => {
    const f = await seedFeedback({ rating: 1 });
    await run();

    const alerts = await alertsFor(f.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("negative_feedback");
    expect(alerts[0]!.sourceType).toBe("feedback");

    const sms = await negativeSms();
    expect(sms).toHaveLength(1);
    expect(sms[0]!.phone).toBe(ADMIN_PHONE);
    expect(sms[0]!.body).toContain("1/5");
  });

  it("raises an alert at the boundary rating of 2 but NOT at 3 (AC1)", async () => {
    const low = await seedFeedback({ rating: 2 });
    const ok = await seedFeedback({ rating: 3 });
    await run();
    expect(await alertsFor(low.id)).toHaveLength(1);
    expect(await alertsFor(ok.id)).toHaveLength(0);
  });

  it("raises NOTHING for a high (>2) rating", async () => {
    await seedFeedback({ rating: 5 });
    await run();
    expect(await negativeSms()).toHaveLength(0);
    expect(await dbh.db.select().from(adminAlerts)).toHaveLength(0);
  });

  it("the alert links to the feedback detail (AC2)", async () => {
    const f = await seedFeedback({ rating: 1 });
    await run();
    const [alert] = await alertsFor(f.id);
    // Links into the admin feedback detail surface, carrying the feedback id.
    expect(alert!.linkPath).toContain("/feedback");
    expect(alert!.linkPath).toContain(f.id);
    // The SMS carries the same detail link so an admin can follow up.
    const [sms] = await negativeSms();
    expect(sms!.body).toContain("/feedback");
  });

  it("is idempotent — a second run raises no duplicate alert or SMS (AC1)", async () => {
    const f = await seedFeedback({ rating: 1 });
    await run();
    await run();
    expect(await alertsFor(f.id)).toHaveLength(1);
    expect(await negativeSms()).toHaveLength(1);
    // The feedback row is stamped so a re-scan skips it.
    const [row] = await dbh.db.select().from(feedback).where(eq(feedback.id, f.id));
    expect(row!.alertedAt).not.toBeNull();
  });

  it("does NOT alert an already-stamped (previously alerted) feedback", async () => {
    const f = await seedFeedback({ rating: 1, alertedAt: new Date(NOW.getTime() - 600_000) });
    await run();
    expect(await alertsFor(f.id)).toHaveLength(0);
    expect(await negativeSms()).toHaveLength(0);
  });

  it("does NOT alert an UNSUBMITTED low-rated row (defensive submitted-only scan)", async () => {
    // An open invitation has rating NULL today; this guards a future rating-before-
    // submit path — a row with a low rating but no submittedAt must be skipped.
    const f = await seedFeedback({ rating: 1, submittedAt: undefined });
    // Force submitted_at back to NULL to simulate the unsubmitted state.
    await dbh.db.update(feedback).set({ submittedAt: null }).where(eq(feedback.id, f.id));
    await run();
    expect(await alertsFor(f.id)).toHaveLength(0);
    expect(await negativeSms()).toHaveLength(0);
  });

  it("audits feedback.negative_alert once per alerted feedback (AC1)", async () => {
    await seedFeedback({ rating: 1 });
    await run();
    await run();
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "feedback.negative_alert"));
    expect(audits).toHaveLength(1);
  });

  it("still raises the in-app alert when the SMS send throws (try/catch resilience)", async () => {
    const f = await seedFeedback({ rating: 1 });
    const sms = {
      send: async () => {
        throw new Error("provider down");
      },
    };
    await createNegativeFeedbackAlertJob({ db: dbh.db, now: () => NOW, sms }).run();
    // The in-app alert is raised + the row stamped even though the SMS failed.
    expect(await alertsFor(f.id)).toHaveLength(1);
    const [row] = await dbh.db.select().from(feedback).where(eq(feedback.id, f.id));
    expect(row!.alertedAt).not.toBeNull();
  });

  it("raises the in-app alert even when no admin phone is configured (no SMS)", async () => {
    // Clear the configured number.
    await setSetting(dbh.db, ADMIN_ALERT_PHONE_SETTING_KEY, "");
    const f = await seedFeedback({ rating: 1 });
    await run();
    expect(await alertsFor(f.id)).toHaveLength(1);
    expect(await negativeSms()).toHaveLength(0);
  });

  it("names the unit in the alert from the feedback source type", async () => {
    const f = await seedFeedback({ rating: 1, sourceType: "salon" });
    await run();
    const [alert] = await alertsFor(f.id);
    expect(alert!.title.toLowerCase()).toContain("salon");
  });

  it("processes multiple new low feedbacks in one run, each once", async () => {
    const a = await seedFeedback({ rating: 0 });
    const b = await seedFeedback({ rating: 2 });
    await run();
    expect(await alertsFor(a.id)).toHaveLength(1);
    expect(await alertsFor(b.id)).toHaveLength(1);
    expect(await negativeSms()).toHaveLength(2);
  });

  it("falls back to a staff-name seeded alert title when a staff is attributed", async () => {
    const [s] = await dbh.db
      .insert(staff)
      .values({ displayName: "Asha", role: "stylist" })
      .returning();
    const f = await seedFeedback({ rating: 1, staffId: s!.id });
    await run();
    const [alert] = await alertsFor(f.id);
    // Staff attribution is carried in the body for follow-up context.
    expect(alert!.body ?? "").toContain("Asha");
  });
});
