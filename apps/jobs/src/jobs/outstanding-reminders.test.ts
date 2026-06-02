import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, invoices, parents, smsOutbox, users } from "@bm/db";
import { createOutstandingRemindersJob } from "./outstanding-reminders.js";

/**
 * P2-E07-S02 — outstanding-balance nudge cron. DB-backed via PGlite with an
 * injected clock. Covers the day1/day7/day30 schedule (AC1/AC2), the daily
 * cadence + queued stub-SMS (AC2), and the non-transactional opt-out (AC3).
 */
const NOW = new Date("2026-06-30T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Created-at for an invoice that is `days` old as of NOW. */
function ageDays(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

describe("outstanding-balance reminder cron (P2-E07-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Seed a parent (opted-in by default) with one outstanding invoice. */
  async function seed(opts: {
    phone?: string;
    optIn?: boolean;
    amountDue?: number;
    status?: string;
    createdAt?: Date;
  } = {}) {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: opts.phone ?? "+254712000001", pinHash: "x" })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "A", lastName: "B", smsMarketingOptIn: opts.optIn ?? true })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({
        parentId: p!.id,
        amountDue: opts.amountDue ?? 120_000, // KES 1,200.00
        status: opts.status ?? "outstanding",
        createdAt: opts.createdAt ?? ageDays(1),
      })
      .returning();
    return { parentId: p!.id, userId: u!.id, phone: u!.phone, invoiceId: inv!.id };
  }

  const run = () => createOutstandingRemindersJob({ db: dbh.db, now: () => NOW }).run();
  const smsFor = (template: string) =>
    dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, template));

  it("is a daily cron job (AC2)", () => {
    const job = createOutstandingRemindersJob({ db: dbh.db });
    expect(job.name).toBe("outstanding-reminders");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(job.cron).toBe("0 9 * * *");
  });

  it("queues the day-1 nudge for a 1-day-old outstanding balance (AC2)", async () => {
    await seed({ createdAt: ageDays(1) });
    await run();
    const rows = await smsFor("outstanding.day1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe("+254712000001");
    expect(rows[0]!.body).toContain("KES 1,200.00");
    expect(rows[0]!.status).toBe("queued");
  });

  it("queues the day-7 nudge at exactly 7 days old (AC2)", async () => {
    await seed({ createdAt: ageDays(7) });
    await run();
    expect(await smsFor("outstanding.day7")).toHaveLength(1);
    expect(await smsFor("outstanding.day1")).toHaveLength(0);
  });

  it("queues the day-30 nudge at exactly 30 days old (AC2)", async () => {
    await seed({ createdAt: ageDays(30) });
    await run();
    expect(await smsFor("outstanding.day30")).toHaveLength(1);
  });

  it("queues nothing on an off-schedule day (e.g. 3 days old)", async () => {
    await seed({ createdAt: ageDays(3) });
    await run();
    expect(await smsFor("outstanding.day1")).toHaveLength(0);
    expect(await smsFor("outstanding.day7")).toHaveLength(0);
    expect(await smsFor("outstanding.day30")).toHaveLength(0);
  });

  it("does NOT nudge a parent who opted out of non-transactional SMS (AC3)", async () => {
    await seed({ optIn: false, createdAt: ageDays(1) });
    await run();
    expect(await smsFor("outstanding.day1")).toHaveLength(0);
  });

  it("does NOT nudge when the balance is settled (nothing owed)", async () => {
    await seed({ status: "settled", createdAt: ageDays(1) });
    await run();
    expect(await smsFor("outstanding.day1")).toHaveLength(0);
  });

  it("does NOT nudge when the only invoice is void", async () => {
    await seed({ status: "void", createdAt: ageDays(7) });
    await run();
    expect(await smsFor("outstanding.day7")).toHaveLength(0);
  });

  it("is idempotent — a second run the same day does not double-queue (AC2)", async () => {
    await seed({ createdAt: ageDays(1) });
    await run();
    await run();
    expect(await smsFor("outstanding.day1")).toHaveLength(1);
  });

  it("audits each queued reminder", async () => {
    await seed({ createdAt: ageDays(7) });
    await run();
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "outstanding.reminder.sent"));
    expect(audits).toHaveLength(1);
  });

  it("sums multiple outstanding invoices and ages from the OLDEST (AC2)", async () => {
    const { parentId } = await seed({ amountDue: 50_000, createdAt: ageDays(7) });
    // A newer invoice for the same parent — total owed is the sum.
    await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: 30_000, status: "pending", createdAt: ageDays(2) })
      .returning();
    await run();
    const rows = await smsFor("outstanding.day7");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain("KES 800.00"); // 50,000 + 30,000 cents
  });

  it("nudges multiple eligible parents independently", async () => {
    await seed({ phone: "+254712000001", createdAt: ageDays(1) });
    await seed({ phone: "+254712000002", createdAt: ageDays(7) });
    await run();
    expect(await smsFor("outstanding.day1")).toHaveLength(1);
    expect(await smsFor("outstanding.day7")).toHaveLength(1);
  });
});
