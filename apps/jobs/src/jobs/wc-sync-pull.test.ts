import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, wcOrders } from "@bm/db";
import { getSyncState } from "@bm/woocommerce";
import type { WooOrder } from "@bm/contracts";
import { createWcSyncPullJob } from "./wc-sync-pull.js";

/**
 * Story 29.7 (AC1, AC6) — the WooCommerce order pull cycle. Injected fake Woo
 * client (no network). Covers: pulls since the checkpoint, idempotent upsert on
 * re-run, the checkpoint advances, and a single summary-level audit row (counts,
 * not per-item).
 */
describe("WooCommerce sync pull job (Story 29.7)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-06-02T12:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

  function order(id: number, modified: string, status = "processing"): WooOrder {
    return { id, status, number: String(id), date_modified: modified } as WooOrder;
  }

  /** A fake client whose listOrders returns a fixed page set and records the `since` it saw. */
  function fakeClient(pages: WooOrder[][]) {
    const seenSince: (string | undefined)[] = [];
    let call = 0;
    return {
      seenSince,
      client: {
        listOrders: async (opts?: { since?: string; page?: number }) => {
          seenSince.push(opts?.since);
          const page = pages[call] ?? [];
          call += 1;
          return page;
        },
      },
    };
  }

  it("registers a 2-minute-cadence job named wc-sync-pull (AC1)", () => {
    const { client } = fakeClient([[]]);
    const job = createWcSyncPullJob({ db: dbh.db, client, now: () => NOW, logger: silentLogger });
    expect(job.name).toBe("wc-sync-pull");
    expect(job.intervalMs).toBe(120_000);
  });

  it("pulls orders, upserts them, advances the checkpoint, and audits a summary (AC1, AC6)", async () => {
    const { client } = fakeClient([
      [order(1, "2026-06-02T11:00:00"), order(2, "2026-06-02T11:30:00")],
      [], // second page empty → stop
    ]);
    const job = createWcSyncPullJob({ db: dbh.db, client, now: () => NOW, logger: silentLogger });
    await job.run();

    const rows = await dbh.db.select().from(wcOrders);
    expect(rows.map((r) => r.wooOrderId).sort()).toEqual([1, 2]);

    const state = await getSyncState(dbh.db);
    // Checkpoint advances to the newest date_modified pulled.
    expect(state.lastSyncAt?.toISOString()).toBe("2026-06-02T11:30:00.000Z");
    expect(state.lastPullAt?.toISOString()).toBe(NOW.toISOString());

    // AC6: exactly ONE summary audit row (counts, not per-item).
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "woocommerce.sync.pulled"));
    expect(audits).toHaveLength(1);
    expect((audits[0]!.payload as Record<string, unknown>).count).toBe(2);
  });

  it("passes the checkpoint as `since` on the next run (AC1)", async () => {
    const first = fakeClient([[order(1, "2026-06-02T11:00:00")], []]);
    const job1 = createWcSyncPullJob({ db: dbh.db, client: first.client, now: () => NOW, logger: silentLogger });
    await job1.run();
    // First run had no checkpoint → since undefined.
    expect(first.seenSince[0]).toBeUndefined();

    const second = fakeClient([[], []]);
    const job2 = createWcSyncPullJob({
      db: dbh.db,
      client: second.client,
      now: () => new Date("2026-06-02T12:05:00Z"),
      logger: silentLogger,
    });
    await job2.run();
    // Second run pulls since the recorded checkpoint.
    expect(second.seenSince[0]).toBe("2026-06-02T11:00:00.000Z");
  });

  it("is idempotent on re-run — re-pulling the same order does not duplicate it (AC1)", async () => {
    const a = fakeClient([[order(1, "2026-06-02T11:00:00", "processing")], []]);
    await createWcSyncPullJob({ db: dbh.db, client: a.client, now: () => NOW, logger: silentLogger }).run();
    // Re-pull the SAME order id with an updated status.
    const b = fakeClient([[order(1, "2026-06-02T11:00:00", "completed")], []]);
    await createWcSyncPullJob({ db: dbh.db, client: b.client, now: () => NOW, logger: silentLogger }).run();

    const rows = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 1));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("completed");
  });

  it("preserves an existing order's local_status across a re-pull (Story 29.1)", async () => {
    // First pull inserts order 1 (local_status defaults to 'new').
    const a = fakeClient([[order(1, "2026-06-02T11:00:00", "processing")], []]);
    await createWcSyncPullJob({ db: dbh.db, client: a.client, now: () => NOW, logger: silentLogger }).run();
    // The POS advances the workflow on the local mirror.
    await dbh.db.update(wcOrders).set({ localStatus: "packing" }).where(eq(wcOrders.wooOrderId, 1));
    // A subsequent pull refreshes Woo-sourced fields but must NOT reset local_status.
    const b = fakeClient([[order(1, "2026-06-02T11:30:00", "completed")], []]);
    await createWcSyncPullJob({
      db: dbh.db,
      client: b.client,
      now: () => new Date("2026-06-02T12:05:00Z"),
      logger: silentLogger,
    }).run();

    const [row] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 1));
    expect(row!.status).toBe("completed"); // Woo field refreshed by the re-pull
    expect(row!.localStatus).toBe("packing"); // POS workflow survives the re-pull
  });

  it("stamps last_pull_at even when the pull returns nothing (idle but healthy)", async () => {
    const { client } = fakeClient([[]]);
    await createWcSyncPullJob({ db: dbh.db, client, now: () => NOW, logger: silentLogger }).run();
    const state = await getSyncState(dbh.db);
    expect(state.lastPullAt?.toISOString()).toBe(NOW.toISOString());
    expect(state.lastSyncAt).toBeNull();
  });

  it("does not audit nor advance the checkpoint when listOrders throws (failure surfaces)", async () => {
    const job = createWcSyncPullJob({
      db: dbh.db,
      client: {
        listOrders: async () => {
          throw new Error("woo 503");
        },
      },
      now: () => NOW,
      logger: silentLogger,
    });
    await expect(job.run()).rejects.toThrow("woo 503");
    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits).toHaveLength(0);
    const state = await getSyncState(dbh.db);
    expect(state.lastPullAt).toBeNull();
  });
});
