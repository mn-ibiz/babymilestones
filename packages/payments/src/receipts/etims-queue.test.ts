import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { kraEtimsQueue } from "@bm/db";
import {
  ETIMS_BACKOFF_CAP_MS,
  etimsBackoffMs,
  enqueueEtimsSubmission,
  claimDueEtimsSubmissions,
  markEtimsSubmissionSent,
  recordEtimsSubmissionFailure,
  listDeadLetters,
  requeueDeadLetter,
} from "./etims-queue.js";
import type { WriteReceiptPayload } from "./index.js";

/**
 * P5-E02-S02 — eTIMS submission queue. Pure backoff math + the PGlite-backed
 * state machine (enqueue idempotency, claim-due window, sent, failure→backoff,
 * exhaust→dead_letter, list + requeue).
 */
describe("etimsBackoffMs (P5-E02-S02)", () => {
  it("first attempt waits 1 minute", () => {
    expect(etimsBackoffMs(1)).toBe(60_000);
  });

  it("doubles each attempt", () => {
    expect(etimsBackoffMs(2)).toBe(120_000);
    expect(etimsBackoffMs(3)).toBe(240_000);
  });

  it("caps at 24h", () => {
    expect(etimsBackoffMs(100)).toBe(ETIMS_BACKOFF_CAP_MS);
    expect(ETIMS_BACKOFF_CAP_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("eTIMS queue state machine (P5-E02-S02)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-05-30T12:00:00Z");
  const payload: WriteReceiptPayload = {
    series: "BM-2026",
    paymentMethod: "cash",
    postedBy: "s",
    lines: [{ serviceId: "svc", quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }],
  };

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  function enqueue(seq: number, opts: { maxAttempts?: number } = {}) {
    return enqueueEtimsSubmission(dbh.db, {
      series: "BM-2026",
      sequenceNumber: seq,
      payload,
      error: "initial failure",
      now: NOW,
      ...(opts.maxAttempts != null ? { maxAttempts: opts.maxAttempts } : {}),
    });
  }

  it("enqueues a pending row keyed by <series>-<sequence>, due now", async () => {
    const row = await enqueue(1);
    expect(row.idempotencyKey).toBe("BM-2026-000001");
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime());
  });

  it("is idempotent: enqueuing the same receipt twice keeps one row", async () => {
    const a = await enqueue(1);
    const b = await enqueue(1);
    expect(b.id).toBe(a.id);
    const rows = await dbh.db.select().from(kraEtimsQueue);
    expect(rows).toHaveLength(1);
  });

  it("claims due pending rows but not future ones", async () => {
    const r1 = await enqueue(1);
    const r2 = await enqueue(2);
    await dbh.db
      .update(kraEtimsQueue)
      .set({ nextAttemptAt: new Date("2026-06-01T00:00:00Z") })
      .where(eq(kraEtimsQueue.id, r2.id));
    const due = await claimDueEtimsSubmissions(dbh.db, { now: NOW, limit: 10 });
    expect(due.map((r) => r.id)).toEqual([r1.id]);
  });

  it("marks a submission sent", async () => {
    const row = await enqueue(1);
    await markEtimsSubmissionSent(dbh.db, { id: row.id, now: NOW });
    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.status).toBe("sent");
    expect(after!.sentAt).not.toBeNull();
  });

  it("on failure increments attempts and backs off (stays pending)", async () => {
    const row = await enqueue(1, { maxAttempts: 5 });
    const res = await recordEtimsSubmissionFailure(dbh.db, { id: row.id, error: "down", now: NOW });
    expect(res).toEqual({ status: "pending", attempts: 1 });
    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect(after!.lastError).toBe("down");
  });

  it("dead-letters once attempts reach max_attempts", async () => {
    const row = await enqueue(1, { maxAttempts: 1 });
    const res = await recordEtimsSubmissionFailure(dbh.db, { id: row.id, error: "terminal", now: NOW });
    expect(res.status).toBe("dead_letter");
    const [after] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, row.id));
    expect(after!.status).toBe("dead_letter");
    expect(after!.deadLetteredAt).not.toBeNull();
  });

  it("lists dead letters", async () => {
    const row = await enqueue(1, { maxAttempts: 1 });
    await recordEtimsSubmissionFailure(dbh.db, { id: row.id, error: "terminal", now: NOW });
    const dead = await listDeadLetters(dbh.db);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.idempotencyKey).toBe("BM-2026-000001");
  });

  it("requeues a dead letter back to pending, due now, attempts reset", async () => {
    const row = await enqueue(1, { maxAttempts: 1 });
    await recordEtimsSubmissionFailure(dbh.db, { id: row.id, error: "terminal", now: NOW });
    const requeued = await requeueDeadLetter(dbh.db, { id: row.id, now: NOW });
    expect(requeued.status).toBe("pending");
    expect(requeued.attempts).toBe(0);
    expect(requeued.deadLetteredAt).toBeNull();
    expect(requeued.nextAttemptAt.getTime()).toBe(NOW.getTime());
  });
});
