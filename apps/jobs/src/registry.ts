export type Job = {
  name: string;
  run: () => Promise<void>;
  /** Optional fixed cadence in ms (e.g. 60_000 for a 60s cron). Omit for queue-drain workers. */
  intervalMs?: number;
};

/** Workers register here: SMS retry, commission run, anonymisation, M-Pesa recovery, Woo sync. */
const jobs = new Map<string, Job>();

export function register(job: Job): void {
  jobs.set(job.name, job);
}

export function registered(): string[] {
  return [...jobs.keys()];
}
