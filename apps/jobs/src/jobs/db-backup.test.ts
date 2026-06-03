import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { backupRuns } from "@bm/db";
import { createDbBackupJob, type BackupDump, type BackupStore } from "./db-backup.js";

/** In-memory off-host store stub: locations → size, with delete tracking. */
class FakeStore implements BackupStore {
  objects = new Map<string, number>();
  deleted: string[] = [];
  put(location: string, sizeBytes: number): void {
    this.objects.set(location, sizeBytes);
  }
  async remove(location: string): Promise<void> {
    this.objects.delete(location);
    this.deleted.push(location);
  }
}

describe("db-backup job (X8-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("registers under the name 'db-backup' with a daily cadence", () => {
    const job = createDbBackupJob({
      db: dbh.db,
      store: new FakeStore(),
      dump: async () => ({ location: "x", sizeBytes: 1 }),
    });
    expect(job.name).toBe("db-backup");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);
  });

  it("records a successful run with the injected dump's result (AC1, AC3)", async () => {
    const store = new FakeStore();
    const dump: BackupDump = vi.fn(async () => {
      store.put("off-host/2026-05-25.dump", 4096);
      return { location: "off-host/2026-05-25.dump", sizeBytes: 4096 };
    });

    await createDbBackupJob({ db: dbh.db, store, dump }).run();

    expect(dump).toHaveBeenCalledTimes(1);
    const [row] = await dbh.db.select().from(backupRuns);
    expect(row!.status).toBe("success");
    expect(row!.location).toBe("off-host/2026-05-25.dump");
    expect(row!.sizeBytes).toBe(4096);
    expect(row!.finishedAt).not.toBeNull();
    expect(row!.error).toBeNull();
  });

  it("records a failed run AND re-throws so the runner alerts (AC3)", async () => {
    const store = new FakeStore();
    const dump: BackupDump = vi.fn(async () => {
      throw new Error("pg_dump exploded");
    });

    // The handler records the failure THEN re-throws — the jobs runner only
    // reports to the error tracker when run() rejects.
    await expect(createDbBackupJob({ db: dbh.db, store, dump }).run()).rejects.toThrow(
      "pg_dump exploded",
    );

    const [row] = await dbh.db.select().from(backupRuns);
    expect(row!.status).toBe("failed");
    expect(row!.error).toContain("pg_dump exploded");
    expect(row!.location).toBeNull();
    expect(row!.finishedAt).not.toBeNull();
  });

  it("never destroys the last good backup when dumps fail past retention (review fix)", async () => {
    const store = new FakeStore();
    const dayMs = 24 * 60 * 60 * 1000;
    const at = new Date("2026-05-25T02:00:00Z");
    // The ONLY successful backup is 40 days old (past the 30-day window).
    const old = new Date(at.getTime() - 40 * dayMs);
    store.put("off-host/only.dump", 10);
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: old, finishedAt: old, location: "off-host/only.dump", sizeBytes: 10 },
    ]);
    // Today's dump fails — so no fresh success is created and the prune must not run.
    const dump: BackupDump = async () => {
      throw new Error("dump down");
    };

    await expect(
      createDbBackupJob({ db: dbh.db, store, dump, now: () => at }).run(),
    ).rejects.toThrow("dump down");

    // The sole 40-day-old backup survives despite being past retention.
    expect(store.deleted).toEqual([]);
    expect(store.objects.has("off-host/only.dump")).toBe(true);
  });

  it("prunes snapshots older than 30 days and keeps newer ones (AC2)", async () => {
    const store = new FakeStore();
    const dayMs = 24 * 60 * 60 * 1000;
    const at = new Date("2026-05-25T02:00:00Z");

    // Seed: one run 40 days old (stale), one 5 days old (kept). Both succeeded.
    const old = new Date(at.getTime() - 40 * dayMs);
    const recent = new Date(at.getTime() - 5 * dayMs);
    store.put("off-host/old.dump", 10);
    store.put("off-host/recent.dump", 20);
    await dbh.db.insert(backupRuns).values([
      { status: "success", startedAt: old, finishedAt: old, location: "off-host/old.dump", sizeBytes: 10 },
      { status: "success", startedAt: recent, finishedAt: recent, location: "off-host/recent.dump", sizeBytes: 20 },
    ]);

    const dump: BackupDump = async () => {
      store.put("off-host/today.dump", 30);
      return { location: "off-host/today.dump", sizeBytes: 30 };
    };

    await createDbBackupJob({ db: dbh.db, store, dump, now: () => at }).run();

    expect(store.deleted).toEqual(["off-host/old.dump"]);
    expect(store.objects.has("off-host/recent.dump")).toBe(true);
    expect(store.objects.has("off-host/today.dump")).toBe(true);

    const rows = await dbh.db.select().from(backupRuns);
    const oldRow = rows.find((r) => r.location === "off-host/old.dump");
    const recentRow = rows.find((r) => r.location === "off-host/recent.dump");
    expect(oldRow!.prunedAt).not.toBeNull();
    expect(recentRow!.prunedAt).toBeNull();
  });

  it("does not prune already-pruned or failed runs (AC2)", async () => {
    const store = new FakeStore();
    const dayMs = 24 * 60 * 60 * 1000;
    const at = new Date("2026-05-25T02:00:00Z");
    const old = new Date(at.getTime() - 40 * dayMs);

    await dbh.db.insert(backupRuns).values([
      // already pruned — must not re-delete
      { status: "success", startedAt: old, finishedAt: old, location: "off-host/gone.dump", prunedAt: old },
      // failed, no location — nothing to delete
      { status: "failed", startedAt: old, finishedAt: old, error: "boom" },
    ]);

    const dump: BackupDump = async () => ({ location: "off-host/today.dump", sizeBytes: 1 });
    await createDbBackupJob({ db: dbh.db, store, dump, now: () => at }).run();

    expect(store.deleted).toEqual([]);
  });
});
