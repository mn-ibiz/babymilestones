import { eq } from "drizzle-orm";
import { jobRuns, type Database } from "@bm/db";
import { logger as defaultLogger } from "./logger.js";
import type { Job } from "./registry.js";

/**
 * Minimal Sentry-style error sink (P3-E06-S01 AC3). The real provider is wired
 * at boot; tests inject a recorder. Matches `@bm/observability`'s ErrorTracker
 * shape (`captureException`) so the production tracker drops straight in.
 */
export interface JobTracker {
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

/** Structured-logger slice the runner needs (the shared jobs logger fits). */
export interface RunnerLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface RunnerDeps {
  db: Database;
  /** Failed runs are reported here (AC3). Defaults to a no-op. */
  tracker?: JobTracker;
  /** Structured logger for run lifecycle. Defaults to the jobs logger. */
  logger?: RunnerLogger;
  /** Clock injection for deterministic started/ended stamps in tests. */
  now?: () => Date;
}

export interface RunOptions {
  /** `schedule` (cron tick) or `manual` (admin run-now, AC4). Default schedule. */
  trigger?: "schedule" | "manual";
  /** Acting user id for a manual run; NULL for the scheduler. */
  triggeredBy?: string | null;
}

export interface RunResult {
  /** The job_runs row id (AC2). */
  runId: string;
  status: "success" | "failed";
  error?: string;
}

/** Normalise any thrown value into a string error message for `job_runs.error`. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/**
 * Execute one job under the framework, recording the run in `job_runs` (AC2) and
 * reporting failures to the error tracker (AC3).
 *
 * Lifecycle: insert a `running` row stamped `startedAt`, invoke the handler, then
 * stamp `endedAt` + a terminal status. On a thrown handler the run is marked
 * `failed` with the error message persisted, the error is forwarded to the
 * tracker, and an `error` line is logged — but the throw is SWALLOWED so a single
 * bad job can never crash the scheduler or abort sibling jobs (error isolation).
 * The outcome is returned so a caller (e.g. the admin run-now endpoint) can
 * surface success/failure.
 *
 * The terminal-status update is wrapped in its own try/catch: even if writing the
 * outcome fails (e.g. a DB blip), the runner still returns a result and reports —
 * it never leaves an exception escaping. A `running` row whose process dies is a
 * deliberately observable "stuck" state for the dashboard, not silently lost.
 */
export async function runJob(
  deps: RunnerDeps,
  job: Job,
  opts: RunOptions = {},
): Promise<RunResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const startedAt = now();

  // AC2: open the run record before the handler runs, so an in-flight/crashed
  // run is visible (status 'running') rather than invisible until completion.
  const [run] = await deps.db
    .insert(jobRuns)
    .values({
      jobName: job.name,
      status: "running",
      trigger: opts.trigger ?? "schedule",
      triggeredBy: opts.triggeredBy ?? null,
      startedAt,
    })
    .returning();
  const runId = run!.id;

  log.info({ event: "job.run.started", job: job.name, run_id: runId, trigger: opts.trigger ?? "schedule" });

  try {
    await job.run();
    const endedAt = now();
    await deps.db
      .update(jobRuns)
      .set({ status: "success", endedAt })
      .where(eq(jobRuns.id, runId));
    log.info({
      event: "job.run.succeeded",
      job: job.name,
      run_id: runId,
      duration_ms: endedAt.getTime() - startedAt.getTime(),
    });
    return { runId, status: "success" };
  } catch (err) {
    const message = errorMessage(err);
    // AC3: surface the failure to the error tracker (Sentry-style).
    deps.tracker?.captureException(err, { job: job.name, run_id: runId });
    log.error({ event: "job.run.failed", job: job.name, run_id: runId, err: message }, "job run failed");
    // AC2: persist the failure. Guard the write itself so a DB blip here can't
    // turn a handled failure into an unhandled rejection.
    try {
      await deps.db
        .update(jobRuns)
        .set({ status: "failed", endedAt: now(), error: message })
        .where(eq(jobRuns.id, runId));
    } catch (writeErr) {
      log.error(
        { event: "job.run.record_failed", job: job.name, run_id: runId, err: errorMessage(writeErr) },
        "failed to record job run failure",
      );
    }
    // Error isolation: never rethrow — a bad job must not crash the scheduler.
    return { runId, status: "failed", error: message };
  }
}

/** Handle to stop a running scheduler (clears every interval timer). */
export interface SchedulerHandle {
  stop: () => void;
}

/**
 * Start the single-worker scheduler (P3-E06; "single-worker model in P3"). For
 * every job with an `intervalMs`, a timer fires `runJob` on that cadence. Each
 * tick is independently isolated (runJob swallows handler errors), and an
 * overlap guard skips a tick while that same job's previous run is still in
 * flight — so a slow nightly job can never pile up concurrent copies of itself.
 *
 * Jobs without `intervalMs` (queue-drain style) are not auto-scheduled here.
 * Returns a handle whose `stop()` clears all timers (used on shutdown / in tests).
 */
export function startScheduler(deps: RunnerDeps, jobs: Job[]): SchedulerHandle {
  const timers: ReturnType<typeof setInterval>[] = [];
  const inFlight = new Set<string>();

  for (const job of jobs) {
    if (!job.intervalMs) continue;
    const timer = setInterval(() => {
      // Overlap guard: skip if this job's prior tick hasn't finished.
      if (inFlight.has(job.name)) return;
      inFlight.add(job.name);
      // runJob never rejects (it isolates handler errors), but guard the chain
      // defensively so the timer is never wedged by an unexpected throw.
      void runJob(deps, job)
        .catch(() => {})
        .finally(() => inFlight.delete(job.name));
    }, job.intervalMs);
    // Don't keep the event loop alive solely for the scheduler.
    if (typeof timer.unref === "function") timer.unref();
    timers.push(timer);
  }

  return {
    stop: () => {
      for (const t of timers) clearInterval(t);
      timers.length = 0;
    },
  };
}
