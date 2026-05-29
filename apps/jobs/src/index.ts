import { register, registered } from "./registry.js";
import { logger } from "./logger.js";
import { createDataExportJob } from "./jobs/data-export.js";
import { createWalletStatementJob } from "./jobs/wallet-statement.js";
import { createMpesaReconcileJob } from "./jobs/mpesa-reconcile.js";
import { createAuditDrainJob } from "./jobs/audit-drain.js";
import { createDbBackupJob } from "./jobs/db-backup.js";
import { createSlotGenerationJob } from "./jobs/slot-generation.js";
import { createSubscriptionRenewJob } from "./jobs/subscription-renew.js";
import { createAnonymiseObservationsJob } from "./jobs/anonymise-observations.js";

export { createDataExportJob } from "./jobs/data-export.js";
export { createWalletStatementJob } from "./jobs/wallet-statement.js";
export type { StatementRequest } from "./jobs/wallet-statement.js";
export { createMpesaReconcileJob } from "./jobs/mpesa-reconcile.js";
export type { MpesaReconcileJobDeps, MpesaQuerier } from "./jobs/mpesa-reconcile.js";
export { createAuditDrainJob } from "./jobs/audit-drain.js";
export type { AuditDrainJobDeps, Projector } from "./jobs/audit-drain.js";
export { createDbBackupJob } from "./jobs/db-backup.js";
export type {
  DbBackupJobDeps,
  BackupDump,
  BackupResult,
  BackupStore,
} from "./jobs/db-backup.js";
export { createSlotGenerationJob } from "./jobs/slot-generation.js";
export type { SlotGenerationJobDeps } from "./jobs/slot-generation.js";
export { createSubscriptionRenewJob } from "./jobs/subscription-renew.js";
export type { SubscriptionRenewJobDeps } from "./jobs/subscription-renew.js";
export { createAnonymiseObservationsJob } from "./jobs/anonymise-observations.js";
export type { AnonymiseObservationsJobDeps } from "./jobs/anonymise-observations.js";

// P3-E06-S01: the job framework — runJob records each run in job_runs + alerts
// on failure; startScheduler is the single-worker cron loop.
export { runJob, startScheduler } from "./runner.js";
export type {
  RunnerDeps,
  RunOptions,
  RunResult,
  SchedulerHandle,
  JobTracker,
  RunnerLogger,
} from "./runner.js";
// P3-E06-S01 AC1: the registry surface (name, schedule, on-failure policy).
export { schedule, allJobs } from "./registry.js";
export type { Job, JobDescriptor, OnFailurePolicy } from "./registry.js";

/**
 * Wire the data-export worker (P1-E02-S05) given a live db + storage. The boot
 * shim below registers nothing until real infra is injected (DATABASE_URL +
 * object store land with the deploy story); tests construct the job directly.
 */
export function registerDataExportJob(deps: Parameters<typeof createDataExportJob>[0]): void {
  register(createDataExportJob(deps));
}

/** Wire the async wallet-statement worker (P1-E03-S08 AC3). */
export function registerWalletStatementJob(
  deps: Parameters<typeof createWalletStatementJob>[0],
): void {
  register(createWalletStatementJob(deps));
}

/** Wire the M-Pesa reconciliation cron (P1-E04-S03 AC1: 60s cadence). */
export function registerMpesaReconcileJob(
  deps: Parameters<typeof createMpesaReconcileJob>[0],
): void {
  register(createMpesaReconcileJob(deps));
}

/** Wire the async audit drain worker (X5-S02 AC1: 5s cadence → audit_log). */
export function registerAuditDrainJob(
  deps: Parameters<typeof createAuditDrainJob>[0],
): void {
  register(createAuditDrainJob(deps));
}

/** Wire the daily DB backup + 30-day retention cron (X8-S03). */
export function registerDbBackupJob(
  deps: Parameters<typeof createDbBackupJob>[0],
): void {
  register(createDbBackupJob(deps));
}

/** Wire the nightly slot-generation cron (P2-E01-S01 AC2: daily, 60-day horizon). */
export function registerSlotGenerationJob(
  deps: Parameters<typeof createSlotGenerationJob>[0],
): void {
  register(createSlotGenerationJob(deps));
}

/** Wire the daily subscription renewal / dunning cron (P2-E02-S05). */
export function registerSubscriptionRenewJob(
  deps: Parameters<typeof createSubscriptionRenewJob>[0],
): void {
  register(createSubscriptionRenewJob(deps));
}

/** Wire the nightly 24-month observation anonymisation cron (P2-E03-S05 / P3-E06-S02). */
export function registerAnonymiseObservationsJob(
  deps: Parameters<typeof createAnonymiseObservationsJob>[0],
): void {
  register(createAnonymiseObservationsJob(deps));
}

export { logger } from "./logger.js";
export {
  createHealthServer,
  evaluateReadiness,
  type ReadinessCheck,
  type ReadinessResult,
  type HealthServer,
  type HealthServerOptions,
} from "./health.js";

logger.info({ event: "jobs.boot", registered: registered() }, "jobs worker booted");
