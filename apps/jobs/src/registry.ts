/**
 * On-failure policy for a registered job (P3-E06-S01 AC1). The framework's
 * `runJob` always records the failure in `job_runs` and alerts the tracker; this
 * declares what the scheduler does NEXT:
 *  - `retry-next-tick` (default): leave it; the next scheduled tick re-attempts.
 *    Suits idempotent crons (anonymise, reconcile, sms-retry) — the work simply
 *    rolls forward to the following run.
 *  - `alert-only`: record + alert but take no scheduling action (one-shot style).
 */
export type OnFailurePolicy = "retry-next-tick" | "alert-only";

export type Job = {
  name: string;
  run: () => Promise<void>;
  /** Optional fixed cadence in ms (e.g. 60_000 for a 60s cron). Omit for queue-drain workers. */
  intervalMs?: number;
  /**
   * Human/ops-facing cron expression for the cadence (AC1: the registry exposes
   * a schedule). The single-worker scheduler runs off `intervalMs`; `cron` is the
   * canonical declaration surfaced in the registry + admin observability.
   */
  cron?: string;
  /** What the scheduler does after a failed run (AC1). Defaults to retry-next-tick. */
  onFailure?: OnFailurePolicy;
  /**
   * Max attempts the handler makes per scheduled run before giving up and
   * raising an alert (P3-E06-S03 AC2). A handler that wraps its own in-run retry
   * loop (e.g. the monthly commission run) declares the cap here so the registry
   * + admin observability can surface it. Omit (or `1`) for one-shot jobs.
   */
  maxAttempts?: number;
};

/** A registry entry's public descriptor (AC1: name, schedule, on-failure policy). */
export interface JobDescriptor {
  name: string;
  cron: string | null;
  intervalMs: number | null;
  onFailure: OnFailurePolicy;
  /** Per-run attempt cap before alert (P3-E06-S03 AC2); 1 = single-shot. */
  maxAttempts: number;
}

/** Workers register here: SMS retry, commission run, anonymisation, M-Pesa recovery, Woo sync. */
const jobs = new Map<string, Job>();

export function register(job: Job): void {
  jobs.set(job.name, job);
}

export function registered(): string[] {
  return [...jobs.keys()];
}

/** The full registry as public descriptors (AC1). */
export function schedule(): JobDescriptor[] {
  return [...jobs.values()].map((j) => ({
    name: j.name,
    cron: j.cron ?? null,
    intervalMs: j.intervalMs ?? null,
    onFailure: j.onFailure ?? "retry-next-tick",
    maxAttempts: j.maxAttempts ?? 1,
  }));
}

/** All registered jobs (used to wire the scheduler + the admin run-now registry). */
export function allJobs(): Job[] {
  return [...jobs.values()];
}
