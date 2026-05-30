import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, smsOutbox } from "@bm/db";
import { BACKOFF_MS, MAX_ATTEMPTS, backoffMs, createSmsRetryJob } from "./sms-retry.js";

/**
 * P3-E06-S04 — SMS retry worker. DB-backed via PGlite with an injected clock +
 * resend. Covers eligibility (AC1), exponential backoff (AC2), and the
 * dead-letter + alert at the 5th failed attempt (AC3).
 */
const NOW = new Date("2026-05-30T08:00:00.000Z");

describe("backoffMs (AC2)", () => {
  it("is the 1m/5m/30m/2h/12h ladder, 1-indexed and clamped", () => {
    expect(backoffMs(1)).toBe(1 * 60_000);
    expect(backoffMs(2)).toBe(5 * 60_000);
    expect(backoffMs(3)).toBe(30 * 60_000);
    expect(backoffMs(4)).toBe(2 * 60 * 60_000);
    expect(backoffMs(5)).toBe(12 * 60 * 60_000);
    // Clamp out-of-range to the ends.
    expect(backoffMs(0)).toBe(BACKOFF_MS[0]);
    expect(backoffMs(99)).toBe(BACKOFF_MS[BACKOFF_MS.length - 1]);
  });
});

describe("sms-retry worker (P3-E06-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedFailed(opts: {
    attemptCount?: number;
    nextAttemptAt?: Date | null;
    status?: string;
    deadLetteredAt?: Date | null;
  } = {}) {
    const [row] = await dbh.db
      .insert(smsOutbox)
      .values({
        phone: "+254700000001",
        body: "hi",
        template: "raw",
        status: opts.status ?? "failed",
        attemptCount: opts.attemptCount ?? 0,
        nextAttemptAt: opts.nextAttemptAt ?? null,
        deadLetteredAt: opts.deadLetteredAt ?? null,
      })
      .returning();
    return row!.id;
  }

  it("re-sends a due failed row and marks it sent (AC1)", async () => {
    const id = await seedFailed({ attemptCount: 1 });
    const job = createSmsRetryJob({ db: dbh.db, now: () => NOW, resend: async () => {} });
    await job.run();
    const [row] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, id));
    expect(row!.status).toBe("sent");
    expect(row!.sentAt).not.toBeNull();
    expect(row!.nextAttemptAt).toBeNull();
  });

  it("skips a queued row, a future-gated row, and a dead-lettered row (AC1)", async () => {
    const queued = await seedFailed({ status: "queued" });
    const future = await seedFailed({ attemptCount: 1, nextAttemptAt: new Date(NOW.getTime() + 60_000) });
    const dead = await seedFailed({ attemptCount: 5, status: "dead_lettered", deadLetteredAt: NOW });
    let resends = 0;
    const job = createSmsRetryJob({ db: dbh.db, now: () => NOW, resend: async () => { resends += 1; } });
    await job.run();
    expect(resends).toBe(0);
    for (const id of [queued, future, dead]) {
      const [row] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, id));
      expect(row!.status).not.toBe("sent");
    }
  });

  it("on failure bumps attempt_count and schedules backoff (AC2)", async () => {
    const id = await seedFailed({ attemptCount: 0 });
    const job = createSmsRetryJob({
      db: dbh.db,
      now: () => NOW,
      resend: async () => { throw new Error("provider down"); },
    });
    await job.run();
    const [row] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, id));
    expect(row!.status).toBe("failed");
    expect(row!.attemptCount).toBe(1);
    expect(row!.nextAttemptAt!.toISOString()).toBe(new Date(NOW.getTime() + backoffMs(1)).toISOString());
    expect(row!.lastError).toContain("provider down");
  });

  it("dead-letters + audits + alerts after the 5th failed attempt (AC3)", async () => {
    // attemptCount 4 → this failed attempt is the 5th = dead-letter.
    const id = await seedFailed({ attemptCount: MAX_ATTEMPTS - 1 });
    const alerts: Array<Record<string, unknown>> = [];
    const job = createSmsRetryJob({
      db: dbh.db,
      now: () => NOW,
      resend: async () => { throw new Error("still down"); },
      logger: { info: () => {}, warn: () => {}, error: (obj) => alerts.push(obj) },
    });
    await job.run();
    const [row] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, id));
    expect(row!.status).toBe("dead_lettered");
    expect(row!.attemptCount).toBe(MAX_ATTEMPTS);
    expect(row!.deadLetteredAt).not.toBeNull();
    // AC3: alert raised.
    expect(alerts.some((a) => a.event === "sms.retry.dead_lettered")).toBe(true);
    // AC3: audited.
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "sms.retry.dead_lettered"));
    expect(events).toHaveLength(1);
    expect(events[0]!.targetId).toBe(id);
  });

  it("isolates a failing row so the rest of the batch still sends", async () => {
    const bad = await seedFailed({ attemptCount: 1 });
    const good = await seedFailed({ attemptCount: 1 });
    const job = createSmsRetryJob({
      db: dbh.db,
      now: () => NOW,
      resend: async (r) => { if (r.id === bad) throw new Error("nope"); },
    });
    await job.run();
    const [goodRow] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, good));
    const [badRow] = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.id, bad));
    expect(goodRow!.status).toBe("sent");
    expect(badRow!.status).toBe("failed");
    expect(badRow!.attemptCount).toBe(2);
  });
});
