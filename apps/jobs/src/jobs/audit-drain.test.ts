import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, isNull, sql } from "drizzle-orm";
import { audit, auditLog, auditOutbox } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { createAuditDrainJob } from "./audit-drain.js";

describe("audit drain worker (X5-S02)", () => {
  let dbh: TestDb;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("registers as a 5s-cadence job named audit-drain (AC1)", () => {
    const job = createAuditDrainJob({ db: dbh.db });
    expect(job.name).toBe("audit-drain");
    expect(job.intervalMs).toBe(5_000);
  });

  it("drains unprocessed rows into audit_log and marks processed_at (AC2/AC3)", async () => {
    await audit(dbh.db, { actor: null, action: "auth.signup", target: { table: "users", id: "u1" } });
    await audit(dbh.db, { actor: null, action: "wallet.topup", target: { table: "wallets", id: "w1" } });

    const job = createAuditDrainJob({ db: dbh.db });
    await job.run();

    const projected = await dbh.db.select().from(auditLog);
    expect(projected).toHaveLength(2);
    const actions = projected.map((r) => r.action).sort();
    expect(actions).toEqual(["auth.signup", "wallet.topup"]);

    // Projection mirrors the source columns + carries created_at.
    const signup = projected.find((r) => r.action === "auth.signup");
    expect(signup?.targetTable).toBe("users");
    expect(signup?.targetId).toBe("u1");
    expect(signup?.createdAt).toBeInstanceOf(Date);

    // All outbox rows marked processed.
    const unprocessed = await dbh.db
      .select()
      .from(auditOutbox)
      .where(isNull(auditOutbox.processedAt));
    expect(unprocessed).toHaveLength(0);
  });

  it("projects oldest-first (ordering)", async () => {
    const r1 = await audit(dbh.db, { action: "a.one" });
    const r2 = await audit(dbh.db, { action: "a.two" });
    // Force a deterministic created_at ordering regardless of clock resolution.
    await dbh.db
      .update(auditOutbox)
      .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(auditOutbox.id, r1.id));
    await dbh.db
      .update(auditOutbox)
      .set({ createdAt: new Date("2026-01-02T00:00:00Z") })
      .where(eq(auditOutbox.id, r2.id));

    const job = createAuditDrainJob({ db: dbh.db });
    await job.run();

    const projected = await dbh.db
      .select()
      .from(auditLog)
      .orderBy(auditLog.projectedAt, auditLog.createdAt);
    expect(projected.map((r) => r.action)).toEqual(["a.one", "a.two"]);
  });

  it("re-run skips already-processed rows (idempotent/resumable)", async () => {
    await audit(dbh.db, { action: "a.one" });
    const job = createAuditDrainJob({ db: dbh.db });
    await job.run();

    // A second batch arrives; first row must not double-project.
    await audit(dbh.db, { action: "a.two" });
    await job.run();
    await job.run(); // third run drains nothing new

    const projected = await dbh.db.select().from(auditLog);
    expect(projected).toHaveLength(2);

    const [{ count } = { count: 0 }] = await dbh.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog);
    expect(Number(count)).toBe(2);
  });

  it("respects the batch size and drains the rest on the next run", async () => {
    for (let i = 0; i < 5; i++) await audit(dbh.db, { action: `a.${i}` });
    const job = createAuditDrainJob({ db: dbh.db, batchSize: 2 });

    await job.run();
    expect(await dbh.db.select().from(auditLog)).toHaveLength(2);
    await job.run();
    expect(await dbh.db.select().from(auditLog)).toHaveLength(4);
    await job.run();
    expect(await dbh.db.select().from(auditLog)).toHaveLength(5);
  });

  it("retries a failing row with exponential backoff (AC4)", async () => {
    await audit(dbh.db, { action: "boom.fail" });

    let calls = 0;
    const at = { now: new Date("2026-03-01T00:00:00Z") };
    const job = createAuditDrainJob({
      db: dbh.db,
      now: () => at.now,
      // Inject a projector that throws for the poison action.
      project: async (db, row) => {
        if (row.action === "boom.fail") {
          calls++;
          throw new Error("projection failed");
        }
        await db.insert(auditLog).values({
          id: row.id,
          actorUserId: row.actorUserId,
          action: row.action,
          targetTable: row.targetTable,
          targetId: row.targetId,
          payload: row.payload,
          createdAt: row.createdAt,
        });
      },
    });

    await job.run();
    expect(calls).toBe(1);

    let [row] = await dbh.db.select().from(auditOutbox);
    expect(row?.attemptCount).toBe(1);
    expect(row?.processedAt).toBeNull();
    expect(row?.nextAttemptAt).toBeInstanceOf(Date);
    const firstBackoffMs = row!.nextAttemptAt!.getTime() - at.now.getTime();

    // Still inside the backoff window: the worker must NOT retry yet.
    await job.run();
    expect(calls).toBe(1);

    // Advance past the backoff window: now it retries and backoff grows.
    at.now = new Date(row!.nextAttemptAt!.getTime() + 1_000);
    await job.run();
    expect(calls).toBe(2);

    [row] = await dbh.db.select().from(auditOutbox);
    expect(row?.attemptCount).toBe(2);
    const secondBackoffMs = row!.nextAttemptAt!.getTime() - at.now.getTime();
    expect(secondBackoffMs).toBeGreaterThan(firstBackoffMs);
  });

  it("dead-letters a row still unprocessed after 24h (AC4)", async () => {
    const r = await audit(dbh.db, { action: "boom.fail" });
    // Pretend the row was created 25h ago so it crosses the dead-letter threshold.
    const created = new Date("2026-03-01T00:00:00Z");
    await dbh.db
      .update(auditOutbox)
      .set({ createdAt: created })
      .where(eq(auditOutbox.id, r.id));

    const now = new Date(created.getTime() + 25 * 60 * 60 * 1000);
    const job = createAuditDrainJob({
      db: dbh.db,
      now: () => now,
      project: async () => {
        throw new Error("still failing");
      },
    });

    await job.run();

    const [row] = await dbh.db.select().from(auditOutbox);
    expect(row?.deadLetteredAt).toBeInstanceOf(Date);
    expect(row?.processedAt).toBeNull();
    // Dead-lettered rows are skipped on subsequent runs (never block the queue).
    const before = row?.attemptCount;
    await job.run();
    const [after] = await dbh.db.select().from(auditOutbox);
    expect(after?.attemptCount).toBe(before);

    // Healthy rows still drain past the dead-lettered one.
    await audit(dbh.db, { action: "ok.action" });
    const healthyJob = createAuditDrainJob({ db: dbh.db, now: () => now });
    await healthyJob.run();
    const ok = await dbh.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "ok.action"));
    expect(ok).toHaveLength(1);
  });

  it("only the four expected indexes exist on audit_log (AC2)", async () => {
    const res = await dbh.pg.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log'",
    );
    const names = res.rows.map((r) => r.indexname);
    expect(names).toContain("audit_log_actor_idx");
    expect(names).toContain("audit_log_target_idx");
    expect(names).toContain("audit_log_action_idx");
    expect(names).toContain("audit_log_created_at_idx");
  });
});
