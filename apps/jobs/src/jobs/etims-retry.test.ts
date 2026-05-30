import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, kraEtimsQueue } from "@bm/db";
import { enqueueEtimsSubmission, type EtimsQueueRow } from "@bm/payments";
import { createEtimsRetryJob } from "./etims-retry.js";

/**
 * P5-E02-S02 — eTIMS retry + dead-letter worker. PGlite-backed, injected clock +
 * fake resubmit. Covers claim-due (AC1), success→sent, failure→backoff,
 * exhausted attempts→dead-letter + alert audit (AC2), and batch isolation.
 */
describe("eTIMS retry worker (P5-E02-S02)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-05-30T12:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function enqueue(seq: number, opts: { maxAttempts?: number; now?: Date } = {}) {
    return enqueueEtimsSubmission(dbh.db, {
      series: "BM-2026",
      sequenceNumber: seq,
      payload: { series: "BM-2026", paymentMethod: "cash", postedBy: "s", lines: [] },
      error: "initial failure",
      now: opts.now ?? NOW,
      ...(opts.maxAttempts != null ? { maxAttempts: opts.maxAttempts } : {}),
    });
  }

  it("registers a 60s-cadence job named etims-retry (jobs pattern)", () => {
    const job = createEtimsRetryJob({ db: dbh.db, resubmit: async () => {}, now: () => NOW });
    expect(job.name).toBe("etims-retry");
    expect(job.intervalMs).toBe(60_000);
  });

  it("re-submits a due row and marks it sent on success (AC1, AC2)", async () => {
    const row = await enqueue(1);
    const submitted: string[] = [];
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async (r: EtimsQueueRow) => {
        submitted.push(r.idempotencyKey);
      },
      now: () => NOW,
    });
    await job.run();

    expect(submitted).toEqual(["BM-2026:1"]);
    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.status).toBe("sent");
    expect(after!.sentAt).not.toBeNull();
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "etims.submission.sent"));
    expect(audits).toHaveLength(1);
  });

  it("does not claim a row whose next_attempt_at is in the future", async () => {
    const row = await enqueue(1);
    await dbh.db
      .update(kraEtimsQueue)
      .set({ nextAttemptAt: new Date("2026-06-01T00:00:00Z") })
      .where(eq(kraEtimsQueue.id, row.id));
    const submitted: string[] = [];
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async (r) => void submitted.push(r.idempotencyKey),
      now: () => NOW,
    });
    await job.run();
    expect(submitted).toEqual([]);
  });

  it("on failure increments attempts and backs off, staying pending (AC2)", async () => {
    const row = await enqueue(1, { maxAttempts: 5 });
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async () => {
        throw new Error("KRA still down");
      },
      now: () => NOW,
    });
    await job.run();

    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.status).toBe("pending");
    expect(after!.attempts).toBe(1);
    expect(after!.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect(after!.lastError).toBe("KRA still down");
  });

  it("dead-letters after exhausting attempts and writes the alert audit (AC2)", async () => {
    // maxAttempts 1 → the first failure dead-letters immediately.
    const row = await enqueue(1, { maxAttempts: 1 });
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async () => {
        throw new Error("terminal");
      },
      now: () => NOW,
    });
    await job.run();

    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.status).toBe("dead_letter");
    expect(after!.deadLetteredAt).not.toBeNull();
    const alert = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "etims.submission.dead_lettered"));
    expect(alert).toHaveLength(1);
    expect((alert[0]!.payload as Record<string, unknown>).idempotency_key).toBe("BM-2026:1");
  });

  it("isolates a failing row so the rest of the batch still processes", async () => {
    await enqueue(1);
    await enqueue(2);
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async (r) => {
        if (r.sequenceNumber === 1) throw new Error("boom");
      },
      now: () => NOW,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await job.run();

    const rows = await dbh.db.select().from(kraEtimsQueue);
    const byKey = new Map(rows.map((r) => [r.idempotencyKey, r.status]));
    expect(byKey.get("BM-2026:1")).toBe("pending"); // failed, backed off
    expect(byKey.get("BM-2026:2")).toBe("sent"); // succeeded
  });

  it("never double-registers: a retry reuses the row's stable idempotency key", async () => {
    const row = await enqueue(7);
    const keys: string[] = [];
    const job = createEtimsRetryJob({
      db: dbh.db,
      resubmit: async (r) => void keys.push(r.idempotencyKey),
      now: () => NOW,
    });
    await job.run();
    // Re-running after a (simulated) sent does nothing — the row is no longer due.
    await job.run();
    expect(keys).toEqual(["BM-2026:7"]);
    void row;
  });
});
