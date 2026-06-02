import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { wcOrders, wcOutbox, wcOutboxDead, wcSyncState } from "@bm/db";
import {
  WC_BACKOFF_MS,
  WC_MAX_ATTEMPTS,
  wcBackoffMs,
  getSyncState,
  upsertWcOrder,
  advanceCheckpoint,
  enqueueWcWriteback,
  claimDueWcWritebacks,
  markWcWritebackDone,
  recordWcWritebackFailure,
  listWcDeadLetters,
  replayWcDeadLetter,
  resolveWcDeadLetter,
  discardWcDeadLetter,
} from "./sync.js";

/**
 * Story 29.7 — WooCommerce sync state machine: backoff schedule (AC3), the
 * checkpoint + order upsert (AC1), and the outbox / dead-letter transitions
 * (AC2/AC3/AC4). PGlite-backed, injected clock.
 */
describe("WooCommerce sync state machine (Story 29.7)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-06-02T12:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  describe("backoff schedule (AC3)", () => {
    it("produces exactly [1m, 5m, 30m, 2h, 6h]", () => {
      expect(WC_BACKOFF_MS).toEqual([
        1 * 60_000,
        5 * 60_000,
        30 * 60_000,
        2 * 60 * 60_000,
        6 * 60 * 60_000,
      ]);
      expect(wcBackoffMs(1)).toBe(60_000);
      expect(wcBackoffMs(2)).toBe(5 * 60_000);
      expect(wcBackoffMs(3)).toBe(30 * 60_000);
      expect(wcBackoffMs(4)).toBe(2 * 60 * 60_000);
      expect(wcBackoffMs(5)).toBe(6 * 60 * 60_000);
    });

    it("dead-letters retryable failures after 5 attempts", () => {
      expect(WC_MAX_ATTEMPTS).toBe(5);
    });

    it("clamps an out-of-range attempt to the ladder ends", () => {
      expect(wcBackoffMs(0)).toBe(60_000);
      expect(wcBackoffMs(99)).toBe(6 * 60 * 60_000);
    });
  });

  describe("checkpoint (AC1)", () => {
    it("getSyncState lazily creates the singleton row with null checkpoints", async () => {
      const s = await getSyncState(dbh.db);
      expect(s.lastSyncAt).toBeNull();
      expect(s.lastPullAt).toBeNull();
      // Idempotent — a second read does not create a second row.
      await getSyncState(dbh.db);
      const rows = await dbh.db.select().from(wcSyncState);
      expect(rows).toHaveLength(1);
    });

    it("advanceCheckpoint records the newest modification + the pull completion", async () => {
      await advanceCheckpoint(dbh.db, {
        lastSyncAt: new Date("2026-06-02T11:30:00Z"),
        now: NOW,
      });
      const s = await getSyncState(dbh.db);
      expect(s.lastSyncAt?.toISOString()).toBe("2026-06-02T11:30:00.000Z");
      expect(s.lastPullAt?.toISOString()).toBe(NOW.toISOString());
    });

    it("does not move the checkpoint backwards", async () => {
      await advanceCheckpoint(dbh.db, { lastSyncAt: new Date("2026-06-02T11:30:00Z"), now: NOW });
      await advanceCheckpoint(dbh.db, {
        lastSyncAt: new Date("2026-06-02T10:00:00Z"),
        now: new Date("2026-06-02T12:05:00Z"),
      });
      const s = await getSyncState(dbh.db);
      // last_sync_at stays at the newer value; last_pull_at still advances.
      expect(s.lastSyncAt?.toISOString()).toBe("2026-06-02T11:30:00.000Z");
      expect(s.lastPullAt?.toISOString()).toBe("2026-06-02T12:05:00.000Z");
    });
  });

  describe("order upsert (AC1)", () => {
    it("inserts then idempotently updates on the woo order id", async () => {
      await upsertWcOrder(dbh.db, {
        id: 101,
        status: "processing",
        number: "101",
        total: "50.00",
        currency: "KES",
        date_modified: "2026-06-02T11:00:00",
      });
      await upsertWcOrder(dbh.db, {
        id: 101,
        status: "completed",
        number: "101",
        date_modified: "2026-06-02T11:30:00",
      });
      const rows = await dbh.db.select().from(wcOrders);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.wooOrderId).toBe(101);
      expect(rows[0]!.status).toBe("completed");
      expect(rows[0]!.dateModified).toBe("2026-06-02T11:30:00");
    });

    it("sets local_status='new' on insert (Story 29.1)", async () => {
      await upsertWcOrder(dbh.db, { id: 202, status: "processing", number: "202" });
      const [row] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 202));
      expect(row!.localStatus).toBe("new");
    });

    it("does NOT overwrite local_status on a re-pull — the POS owns it (Story 29.1)", async () => {
      // First pull inserts the order (local_status defaults to 'new').
      await upsertWcOrder(dbh.db, { id: 303, status: "processing", number: "303" });
      // The POS advances the workflow.
      await dbh.db
        .update(wcOrders)
        .set({ localStatus: "packing" })
        .where(eq(wcOrders.wooOrderId, 303));
      // A subsequent pull refreshes Woo-sourced fields but must leave local_status alone.
      await upsertWcOrder(dbh.db, { id: 303, status: "completed", number: "303" });
      const [row] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 303));
      expect(row!.status).toBe("completed"); // Woo field refreshed
      expect(row!.localStatus).toBe("packing"); // POS workflow preserved
    });
  });

  describe("outbox enqueue + FIFO claim (AC2)", () => {
    it("enqueues a row pending + due immediately, idempotent on the key", async () => {
      const a = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "order_status:101:completed",
        kind: "order_status",
        request: { wooOrderId: 101, status: "completed" },
        now: NOW,
      });
      // A duplicate enqueue is a no-op returning the existing row (idempotency).
      const b = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "order_status:101:completed",
        kind: "order_status",
        request: { wooOrderId: 101, status: "completed" },
        now: NOW,
      });
      expect(a.id).toBe(b.id);
      const rows = await dbh.db.select().from(wcOutbox);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("pending");
    });

    it("claims due pending rows oldest-first (FIFO), bounded by the limit", async () => {
      await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "k1",
        kind: "order_status",
        request: {},
        now: new Date("2026-06-02T11:00:00Z"),
      });
      await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "k2",
        kind: "order_status",
        request: {},
        now: new Date("2026-06-02T11:05:00Z"),
      });
      await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "k3",
        kind: "order_status",
        request: {},
        now: new Date("2026-06-02T11:10:00Z"),
      });
      const due = await claimDueWcWritebacks(dbh.db, { now: NOW, limit: 2 });
      expect(due.map((r) => r.idempotencyKey)).toEqual(["k1", "k2"]);
    });

    it("does not claim a row whose next_attempt_at is in the future", async () => {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "future",
        kind: "stock_push",
        request: {},
        now: NOW,
      });
      await dbh.db
        .update(wcOutbox)
        .set({ nextAttemptAt: new Date("2026-06-02T13:00:00Z") })
        .where(eq(wcOutbox.id, row.id));
      const due = await claimDueWcWritebacks(dbh.db, { now: NOW, limit: 10 });
      expect(due).toHaveLength(0);
    });
  });

  describe("retry policy (AC3)", () => {
    it("on a retryable failure backs off via the ladder, staying pending", async () => {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "k",
        kind: "order_status",
        request: {},
        now: NOW,
      });
      const r = await recordWcWritebackFailure(dbh.db, {
        id: row.id,
        error: "503",
        retryable: true,
        now: NOW,
      });
      expect(r.outcome).toBe("retry");
      const [after] = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
      expect(after!.status).toBe("pending");
      expect(after!.attempts).toBe(1);
      expect(after!.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
      expect(after!.lastError).toBe("503");
    });

    it("dead-letters a retryable failure after 5 attempts and removes it from the outbox", async () => {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "persistent5xx",
        kind: "order_status",
        request: { wooOrderId: 9, status: "completed" },
        now: NOW,
      });
      // 4 retryable failures keep it pending...
      for (let i = 0; i < 4; i++) {
        const r = await recordWcWritebackFailure(dbh.db, {
          id: row.id,
          error: "503",
          retryable: true,
          now: NOW,
        });
        expect(r.outcome).toBe("retry");
      }
      // ...the 5th dead-letters it.
      const last = await recordWcWritebackFailure(dbh.db, {
        id: row.id,
        error: "503 final",
        retryable: true,
        now: NOW,
      });
      expect(last.outcome).toBe("dead_letter");

      const live = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
      expect(live).toHaveLength(0); // removed from the live outbox
      const dead = await dbh.db.select().from(wcOutboxDead);
      expect(dead).toHaveLength(1);
      expect(dead[0]!.idempotencyKey).toBe("persistent5xx");
      expect(dead[0]!.attempts).toBe(5);
      expect(dead[0]!.lastError).toBe("503 final");
      expect(dead[0]!.status).toBe("dead");
      expect((dead[0]!.request as Record<string, unknown>).wooOrderId).toBe(9);
    });

    it("a 4xx (non-retryable) failure: one retry then dead-letter", async () => {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "badreq",
        kind: "order_status",
        request: {},
        now: NOW,
      });
      // First non-retryable failure → a single retry is scheduled.
      const r1 = await recordWcWritebackFailure(dbh.db, {
        id: row.id,
        error: "400 bad",
        retryable: false,
        now: NOW,
      });
      expect(r1.outcome).toBe("retry");
      const [after1] = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
      expect(after1!.attempts).toBe(1);
      expect(after1!.status).toBe("pending");

      // Second non-retryable failure → dead-letter (no exponential climb to 5).
      const r2 = await recordWcWritebackFailure(dbh.db, {
        id: row.id,
        error: "400 bad again",
        retryable: false,
        now: NOW,
      });
      expect(r2.outcome).toBe("dead_letter");
      const live = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
      expect(live).toHaveLength(0);
      const dead = await dbh.db.select().from(wcOutboxDead);
      expect(dead).toHaveLength(1);
      expect(dead[0]!.lastError).toBe("400 bad again");
    });

    it("markWcWritebackDone marks the row done", async () => {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: "ok",
        kind: "stock_push",
        request: {},
        now: NOW,
      });
      await markWcWritebackDone(dbh.db, { id: row.id, now: NOW });
      const [after] = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
      expect(after!.status).toBe("done");
      expect(after!.doneAt).not.toBeNull();
    });
  });

  describe("dead-letter management (AC4)", () => {
    async function deadLetterOne(key: string) {
      const row = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: key,
        kind: "order_status",
        request: { wooOrderId: 5, status: "completed" },
        now: NOW,
      });
      await recordWcWritebackFailure(dbh.db, { id: row.id, error: "400", retryable: false, now: NOW });
      await recordWcWritebackFailure(dbh.db, { id: row.id, error: "400", retryable: false, now: NOW });
    }

    it("lists only un-actioned dead rows, newest-first", async () => {
      await deadLetterOne("d1");
      const list = await listWcDeadLetters(dbh.db);
      expect(list).toHaveLength(1);
      expect(list[0]!.idempotencyKey).toBe("d1");
      expect(list[0]!.status).toBe("dead");
    });

    it("replay re-enqueues the request into the live outbox and resolves the dead row", async () => {
      await deadLetterOne("d1");
      const [dead] = await listWcDeadLetters(dbh.db);
      const enqueued = await replayWcDeadLetter(dbh.db, { id: dead!.id, now: NOW });
      expect(enqueued.kind).toBe("order_status");
      expect((enqueued.request as Record<string, unknown>).wooOrderId).toBe(5);

      // Back in the live outbox, pending + due, attempts reset.
      const live = await dbh.db.select().from(wcOutbox);
      expect(live).toHaveLength(1);
      expect(live[0]!.status).toBe("pending");
      expect(live[0]!.attempts).toBe(0);

      // The dead row is now resolved (no longer listed).
      const [deadRow] = await dbh.db
        .select()
        .from(wcOutboxDead)
        .where(eq(wcOutboxDead.id, dead!.id));
      expect(deadRow!.status).toBe("resolved");
      const list = await listWcDeadLetters(dbh.db);
      expect(list).toHaveLength(0);
    });

    it("mark-resolved transitions the row and removes it from the list", async () => {
      await deadLetterOne("d1");
      const [dead] = await listWcDeadLetters(dbh.db);
      await resolveWcDeadLetter(dbh.db, { id: dead!.id, now: NOW });
      const [row] = await dbh.db.select().from(wcOutboxDead).where(eq(wcOutboxDead.id, dead!.id));
      expect(row!.status).toBe("resolved");
      expect(row!.resolvedAt).not.toBeNull();
      expect(await listWcDeadLetters(dbh.db)).toHaveLength(0);
    });

    it("discard transitions the row and removes it from the list", async () => {
      await deadLetterOne("d1");
      const [dead] = await listWcDeadLetters(dbh.db);
      await discardWcDeadLetter(dbh.db, { id: dead!.id, now: NOW });
      const [row] = await dbh.db.select().from(wcOutboxDead).where(eq(wcOutboxDead.id, dead!.id));
      expect(row!.status).toBe("discarded");
      expect(row!.discardedAt).not.toBeNull();
      expect(await listWcDeadLetters(dbh.db)).toHaveLength(0);
    });

    it("replay of an already-actioned dead row is rejected", async () => {
      await deadLetterOne("d1");
      const [dead] = await listWcDeadLetters(dbh.db);
      await discardWcDeadLetter(dbh.db, { id: dead!.id, now: NOW });
      await expect(replayWcDeadLetter(dbh.db, { id: dead!.id, now: NOW })).rejects.toThrow();
    });
  });
});
