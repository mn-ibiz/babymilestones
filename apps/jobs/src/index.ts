import { register, registered } from "./registry.js";
import { logger } from "./logger.js";
import { createDataExportJob } from "./jobs/data-export.js";
import { createWalletStatementJob } from "./jobs/wallet-statement.js";
import { createMpesaReconcileJob } from "./jobs/mpesa-reconcile.js";
import { createAuditDrainJob } from "./jobs/audit-drain.js";
import { createDbBackupJob } from "./jobs/db-backup.js";
import { createSlotGenerationJob } from "./jobs/slot-generation.js";
import { createSalonSlotGenerationJob } from "./jobs/salon-slot-generation.js";
import { createCoachingSlotGenerationJob } from "./jobs/coaching-slot-generation.js";
import { createCoachingRemindersJob } from "./jobs/coaching-reminders.js";
import { createSubscriptionRenewJob } from "./jobs/subscription-renew.js";
import { createAnonymiseObservationsJob } from "./jobs/anonymise-observations.js";
import { createSmsRetryJob } from "./jobs/sms-retry.js";
import { createCommissionRunJob } from "./jobs/commission-run.js";
import { createEtimsRetryJob } from "./jobs/etims-retry.js";
import { createBackupPruneJob } from "./jobs/backup-prune.js";
import { createOutstandingRemindersJob } from "./jobs/outstanding-reminders.js";
import { createWcSyncPullJob } from "./jobs/wc-sync-pull.js";
import { createWcOutboxDrainJob } from "./jobs/wc-outbox-drain.js";
import { createWcStockReconcileJob } from "./jobs/wc-stock-reconcile.js";

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
export { createSalonSlotGenerationJob } from "./jobs/salon-slot-generation.js";
export type { SalonSlotGenerationJobDeps } from "./jobs/salon-slot-generation.js";
export { createCoachingSlotGenerationJob } from "./jobs/coaching-slot-generation.js";
export type { CoachingSlotGenerationJobDeps } from "./jobs/coaching-slot-generation.js";
export { createCoachingRemindersJob } from "./jobs/coaching-reminders.js";
export type { CoachingRemindersJobDeps, CoachingRemindersLogger } from "./jobs/coaching-reminders.js";
export { createSubscriptionRenewJob } from "./jobs/subscription-renew.js";
export type { SubscriptionRenewJobDeps } from "./jobs/subscription-renew.js";
export { createAnonymiseObservationsJob } from "./jobs/anonymise-observations.js";
export type { AnonymiseObservationsJobDeps } from "./jobs/anonymise-observations.js";
export { createSmsRetryJob, backoffMs, BACKOFF_MS, MAX_ATTEMPTS } from "./jobs/sms-retry.js";
export type { SmsRetryJobDeps, SmsResend } from "./jobs/sms-retry.js";

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
export { createCommissionRunJob } from "./jobs/commission-run.js";
export type { CommissionRunJobDeps } from "./jobs/commission-run.js";
export { createEtimsRetryJob } from "./jobs/etims-retry.js";
export type {
  EtimsRetryJobDeps,
  EtimsResubmit,
  EtimsRetryLogger,
} from "./jobs/etims-retry.js";
export { createBackupPruneJob } from "./jobs/backup-prune.js";
// `BackupStore` is already re-exported from db-backup.js above (identical
// shape: `remove(location)`); the pruner reuses that contract, so we export
// only the pruner-specific deps here to avoid a duplicate-identifier clash.
export type { BackupPruneJobDeps } from "./jobs/backup-prune.js";
export {
  selectBackupsToPrune,
  type PrunableBackup,
} from "./jobs/backup-retention.js";
export { createOutstandingRemindersJob } from "./jobs/outstanding-reminders.js";
export type { OutstandingRemindersJobDeps } from "./jobs/outstanding-reminders.js";
// P4-E04-S07 (Story 29.7): WooCommerce sync pull + writeback outbox drain.
export { createWcSyncPullJob } from "./jobs/wc-sync-pull.js";
export type { WcSyncPullJobDeps, WcPullClient, WcSyncPullLogger } from "./jobs/wc-sync-pull.js";
export { createWcOutboxDrainJob } from "./jobs/wc-outbox-drain.js";
export type { WcOutboxDrainJobDeps, WcDrainClient, WcOutboxDrainLogger } from "./jobs/wc-outbox-drain.js";
// P4-E04-S05 (Story 29.5): nightly stock reconciliation report.
export { createWcStockReconcileJob } from "./jobs/wc-stock-reconcile.js";
export type { WcStockReconcileJobDeps, WcStockReconcileLogger } from "./jobs/wc-stock-reconcile.js";

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

/** Wire the nightly salon slot-generation cron (P3-E03-S01 AC2: daily, 60-day horizon). */
export function registerSalonSlotGenerationJob(
  deps: Parameters<typeof createSalonSlotGenerationJob>[0],
): void {
  register(createSalonSlotGenerationJob(deps));
}

/** Wire the nightly coaching slot-generation cron (P5-E01-S02 AC1: daily, 60-day horizon). */
export function registerCoachingSlotGenerationJob(
  deps: Parameters<typeof createCoachingSlotGenerationJob>[0],
): void {
  register(createCoachingSlotGenerationJob(deps));
}

/** Wire the daily day-before 1:1 coaching reminder cron (P5-E01-S02 AC5). */
export function registerCoachingRemindersJob(
  deps: Parameters<typeof createCoachingRemindersJob>[0],
): void {
  register(createCoachingRemindersJob(deps));
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

/** Wire the SMS retry worker (P3-E06-S04: backoff retry + dead-letter). */
export function registerSmsRetryJob(
  deps: Parameters<typeof createSmsRetryJob>[0],
): void {
  register(createSmsRetryJob(deps));
}
/** Wire the monthly commission run (P3-E01-S03: 02:00 on the 1st). */
export function registerCommissionRunJob(
  deps: Parameters<typeof createCommissionRunJob>[0],
): void {
  register(createCommissionRunJob(deps));
}
/** Wire the eTIMS retry / dead-letter worker (P5-E02-S02; 60s cadence). */
export function registerEtimsRetryJob(
  deps: Parameters<typeof createEtimsRetryJob>[0],
): void {
  register(createEtimsRetryJob(deps));
}
/** Wire the daily policy-driven backup pruner cron (P2-E06-S02). */
export function registerBackupPruneJob(
  deps: Parameters<typeof createBackupPruneJob>[0],
): void {
  register(createBackupPruneJob(deps));
}
/** Wire the daily outstanding-balance reminder cron (P2-E07-S02). */
export function registerOutstandingRemindersJob(
  deps: Parameters<typeof createOutstandingRemindersJob>[0],
): void {
  register(createOutstandingRemindersJob(deps));
}
/** Wire the WooCommerce order pull scheduler (P4-E04-S07; default 2-min cadence). */
export function registerWcSyncPullJob(
  deps: Parameters<typeof createWcSyncPullJob>[0],
): void {
  register(createWcSyncPullJob(deps));
}
/** Wire the WooCommerce writeback outbox drain worker (P4-E04-S07; bounded concurrency). */
export function registerWcOutboxDrainJob(
  deps: Parameters<typeof createWcOutboxDrainJob>[0],
): void {
  register(createWcOutboxDrainJob(deps));
}
/** Wire the nightly WooCommerce stock-reconciliation report job (P4-E04-S05). */
export function registerWcStockReconcileJob(
  deps: Parameters<typeof createWcStockReconcileJob>[0],
): void {
  register(createWcStockReconcileJob(deps));
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
