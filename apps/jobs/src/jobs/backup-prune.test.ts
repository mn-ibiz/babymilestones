import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { backupRuns, settings, auditOutbox } from "@bm/db";
import { BACKUP_RETENTION_SETTING_KEY } from "@bm/contracts";
import { createBackupPruneJob, type BackupStore } from "./backup-prune.js";

const DAY = 24 * 60 * 60 * 1000;

/** In-memory off-host store stub with delete tracking. */
class FakeStore implements BackupStore {
  deleted: string[] = [];
  async remove(location: string): Promise<void> {
    this.deleted.push(location);
  }
}

describe("backup-prune job (P2-E06-S02)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("registers under 'backup-prune' with a daily cadence", () => {
    const job = createBackupPruneJob({ db: dbh.db, store: new FakeStore() });
    expect(job.name).toBe("backup-prune");
    expect(job.intervalMs).toBe(DAY);
  });

  it("prunes per the stored policy, removing off-host objects and stamping prunedAt", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 2, monthlyKeep: 0, graceDays: 0 },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 1 * DAY), location: "off-host/d1.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 2 * DAY), location: "off-host/d2.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 3 * DAY), location: "off-host/d3.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 4 * DAY), location: "off-host/d4.dump", sizeBytes: 1 },
    ]);

    const store = new FakeStore();
    await createBackupPruneJob({ db: dbh.db, store, now: () => at }).run();

    expect(store.deleted.sort()).toEqual(["off-host/d3.dump", "off-host/d4.dump"]);
    const rows = await dbh.db.select().from(backupRuns);
    const pruned = rows.filter((r) => r.prunedAt != null).map((r) => r.location).sort();
    expect(pruned).toEqual(["off-host/d3.dump", "off-host/d4.dump"]);
  });

  it("NEVER prunes the most-recent successful backup", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 1 * DAY), location: "off-host/newest.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 400 * DAY), location: "off-host/ancient.dump", sizeBytes: 1 },
    ]);

    const store = new FakeStore();
    await createBackupPruneJob({ db: dbh.db, store, now: () => at }).run();

    expect(store.deleted).toEqual(["off-host/ancient.dump"]);
    const [newest] = await dbh.db
      .select()
      .from(backupRuns)
      .where(eq(backupRuns.location, "off-host/newest.dump"));
    expect(newest!.prunedAt).toBeNull();
  });

  it("honours the grace period", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 1, monthlyKeep: 0, graceDays: 7 },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 1 * DAY), location: "off-host/a.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 5 * DAY), location: "off-host/b.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 30 * DAY), location: "off-host/c.dump", sizeBytes: 1 },
    ]);

    const store = new FakeStore();
    await createBackupPruneJob({ db: dbh.db, store, now: () => at }).run();

    expect(store.deleted).toEqual(["off-host/c.dump"]);
  });

  it("uses the default policy when none is stored (never throws)", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    // Default dailyKeep 30 / graceDays 7. A single 90-day-old backup is the
    // most-recent successful → always kept; nothing pruned.
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 90 * DAY), location: "off-host/only.dump", sizeBytes: 1 },
    ]);
    const store = new FakeStore();
    await expect(
      createBackupPruneJob({ db: dbh.db, store, now: () => at }).run(),
    ).resolves.toBeUndefined();
    expect(store.deleted).toEqual([]);
  });

  it("writes an audit row for each pruned backup", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 1 * DAY), location: "off-host/keep.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 50 * DAY), location: "off-host/gone.dump", sizeBytes: 1 },
    ]);

    await createBackupPruneJob({ db: dbh.db, store: new FakeStore(), now: () => at }).run();

    const logs = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "backup.run.pruned"));
    expect(logs).toHaveLength(1);
    expect((logs[0]!.payload as { location: string }).location).toBe("off-host/gone.dump");
  });

  it("does not re-delete an already-pruned backup on a second run (idempotent)", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 1, monthlyKeep: 0, graceDays: 0 },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 1 * DAY), location: "off-host/keep.dump", sizeBytes: 1 },
      { status: "success", startedAt: new Date(at.getTime() - 50 * DAY), location: "off-host/gone.dump", sizeBytes: 1 },
    ]);
    const store = new FakeStore();
    const job = createBackupPruneJob({ db: dbh.db, store, now: () => at });
    await job.run();
    await job.run();
    expect(store.deleted).toEqual(["off-host/gone.dump"]);
  });

  it("falls back to defaults when the stored policy is malformed (never throws)", async () => {
    const at = new Date("2026-06-01T02:00:00Z");
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: -9, monthlyKeep: "nope" },
    });
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: new Date(at.getTime() - 200 * DAY), location: "off-host/only.dump", sizeBytes: 1 },
    ]);
    const store = new FakeStore();
    await expect(
      createBackupPruneJob({ db: dbh.db, store, now: () => at }).run(),
    ).resolves.toBeUndefined();
    // Single most-recent successful backup → always kept under defaults too.
    expect(store.deleted).toEqual([]);
  });
});
