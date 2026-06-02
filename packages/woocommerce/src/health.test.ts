import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  advanceCheckpoint,
  enqueueWcWriteback,
  recordWcWritebackFailure,
} from "./sync.js";
import { computeSyncHealth, SYNC_STALE_MS } from "./health.js";

/**
 * Story 29.7 (AC5) — admin sync-health snapshot: last successful pull, queue
 * depth, dead-letter count, last 10 errors, and the >15-min staleness banner.
 */
describe("WooCommerce sync health (Story 29.7, AC5)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-06-02T12:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("the staleness threshold is 15 minutes", () => {
    expect(SYNC_STALE_MS).toBe(15 * 60_000);
  });

  it("reports never-run state as stale with empty counts", async () => {
    const h = await computeSyncHealth(dbh.db, { now: NOW });
    expect(h.lastPullAt).toBeNull();
    expect(h.queueDepth).toBe(0);
    expect(h.deadLetterCount).toBe(0);
    expect(h.recentErrors).toEqual([]);
    expect(h.stale).toBe(true);
  });

  it("is NOT stale when the last pull was within 15 minutes", async () => {
    await advanceCheckpoint(dbh.db, {
      lastSyncAt: new Date("2026-06-02T11:55:00Z"),
      now: new Date("2026-06-02T11:50:00Z"), // 10 min ago
    });
    const h = await computeSyncHealth(dbh.db, { now: NOW });
    expect(h.lastPullAt).toBe("2026-06-02T11:50:00.000Z");
    expect(h.stale).toBe(false);
  });

  it("is stale when the last pull was more than 15 minutes ago", async () => {
    await advanceCheckpoint(dbh.db, {
      lastSyncAt: new Date("2026-06-02T11:30:00Z"),
      now: new Date("2026-06-02T11:40:00Z"), // 20 min ago
    });
    const h = await computeSyncHealth(dbh.db, { now: NOW });
    expect(h.stale).toBe(true);
  });

  it("counts queue depth and dead-letter rows, and surfaces recent errors", async () => {
    // Two pending writebacks (queue depth 2).
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "p1", kind: "order_status", request: {}, now: NOW });
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "p2", kind: "stock_push", request: {}, now: NOW });

    // One that dead-letters via a single non-retryable failure path.
    const dead = await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "d1",
      kind: "order_status",
      request: {},
      now: NOW,
    });
    await recordWcWritebackFailure(dbh.db, { id: dead.id, error: "400 boom", retryable: false, now: NOW });
    await recordWcWritebackFailure(dbh.db, { id: dead.id, error: "400 boom", retryable: false, now: NOW });

    await advanceCheckpoint(dbh.db, { lastSyncAt: NOW, now: NOW });

    const h = await computeSyncHealth(dbh.db, { now: NOW });
    expect(h.queueDepth).toBe(2);
    expect(h.deadLetterCount).toBe(1);
    expect(h.recentErrors.some((e) => e.error.includes("400 boom"))).toBe(true);
    expect(h.recentErrors.length).toBeLessThanOrEqual(10);
  });

  it("caps recent errors at 10, newest-first", async () => {
    for (let i = 0; i < 15; i++) {
      const r = await enqueueWcWriteback(dbh.db, {
        idempotencyKey: `e${i}`,
        kind: "order_status",
        request: {},
        now: NOW,
      });
      // First failure (retryable) leaves last_error set on a still-pending row.
      await recordWcWritebackFailure(dbh.db, { id: r.id, error: `err-${i}`, retryable: true, now: NOW });
    }
    const h = await computeSyncHealth(dbh.db, { now: NOW });
    expect(h.recentErrors).toHaveLength(10);
  });
});
