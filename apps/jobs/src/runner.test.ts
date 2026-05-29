import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { jobRuns } from "@bm/db";
import { runJob, startScheduler, type JobTracker } from "./runner.js";
import type { Job } from "./registry.js";

/**
 * P3-E06-S01 — job framework: scheduling + observability. DB-backed via PGlite.
 * Covers the run ledger (AC2: started_at/ended_at/status/error), Sentry-style
 * failure alerting (AC3), error isolation, and the scheduler overlap guard.
 */
const NOW = new Date("2026-05-30T02:00:00.000Z");

function recordingTracker(): {
  tracker: JobTracker;
  calls: Array<{ err: unknown; ctx?: Record<string, unknown> }>;
} {
  const calls: Array<{ err: unknown; ctx?: Record<string, unknown> }> = [];
  return { tracker: { captureException: (err, ctx) => calls.push({ err, ctx }) }, calls };
}

describe("runJob (AC2, AC3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("records a successful run with started_at, ended_at and status=success (AC2)", async () => {
    let ran = 0;
    const job: Job = { name: "demo", intervalMs: 1000, run: async () => { ran += 1; } };
    const ended = new Date(NOW.getTime() + 5000);
    let calls = 0;
    const res = await runJob({ db: dbh.db, now: () => (calls++ === 0 ? NOW : ended) }, job);

    expect(ran).toBe(1);
    expect(res.status).toBe("success");
    const [row] = await dbh.db.select().from(jobRuns).where(eq(jobRuns.id, res.runId));
    expect(row!.jobName).toBe("demo");
    expect(row!.status).toBe("success");
    expect(row!.startedAt.toISOString()).toBe(NOW.toISOString());
    expect(row!.endedAt!.toISOString()).toBe(ended.toISOString());
    expect(row!.error).toBeNull();
    expect(row!.trigger).toBe("schedule");
  });

  it("records a failed run with the error message and reports to the tracker (AC2, AC3)", async () => {
    const job: Job = { name: "boom", run: async () => { throw new Error("kaboom"); } };
    const { tracker, calls } = recordingTracker();
    const res = await runJob({ db: dbh.db, tracker, now: () => NOW }, job);

    expect(res.status).toBe("failed");
    expect(res.error).toContain("kaboom");
    const [row] = await dbh.db.select().from(jobRuns).where(eq(jobRuns.id, res.runId));
    expect(row!.status).toBe("failed");
    expect(row!.endedAt).not.toBeNull(); // AC2: ended_at stamped even on failure
    expect(row!.error).toContain("kaboom");
    // AC3: Sentry-style alert fired with job context.
    expect(calls).toHaveLength(1);
    expect((calls[0]!.ctx as { job: string }).job).toBe("boom");
  });

  it("isolates a thrown handler — runJob never rejects (error isolation)", async () => {
    const job: Job = { name: "boom2", run: async () => { throw new Error("nope"); } };
    // Must resolve (not reject) so a scheduler tick survives a bad job.
    await expect(runJob({ db: dbh.db, now: () => NOW }, job)).resolves.toMatchObject({ status: "failed" });
  });

  it("records a manual run with trigger=manual and the acting user (AC4 plumbing)", async () => {
    const job: Job = { name: "manual-demo", run: async () => {} };
    const actor = "11111111-1111-1111-1111-111111111111";
    const res = await runJob({ db: dbh.db, now: () => NOW }, job, { trigger: "manual", triggeredBy: actor });
    const [row] = await dbh.db.select().from(jobRuns).where(eq(jobRuns.id, res.runId));
    expect(row!.trigger).toBe("manual");
    expect(row!.triggeredBy).toBe(actor);
  });
});

describe("startScheduler (AC1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
    vi.useFakeTimers();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await dbh.close();
  });

  it("fires a job on its interval and records each run", async () => {
    let runs = 0;
    const job: Job = { name: "ticker", intervalMs: 1000, run: async () => { runs += 1; } };
    const handle = startScheduler({ db: dbh.db }, [job]);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop();
    expect(runs).toBe(2);

    const rows = await dbh.db.select().from(jobRuns).orderBy(asc(jobRuns.startedAt));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.jobName === "ticker")).toBe(true);
  });

  it("skips a tick while the previous run of the SAME job is still in flight (overlap guard)", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: async () => { started += 1; await gate; },
    };
    const handle = startScheduler({ db: dbh.db }, [job]);

    // First tick starts and blocks on the gate.
    await vi.advanceTimersByTimeAsync(1000);
    // Second tick must be skipped (prior still running).
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(1);

    // Release the first run; a later tick may now start a fresh one.
    release();
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop();
    expect(started).toBe(2);
  });

  it("does not auto-schedule a job without intervalMs", async () => {
    let runs = 0;
    const job: Job = { name: "drain", run: async () => { runs += 1; } };
    const handle = startScheduler({ db: dbh.db }, [job]);
    await vi.advanceTimersByTimeAsync(10_000);
    handle.stop();
    expect(runs).toBe(0);
  });
});
