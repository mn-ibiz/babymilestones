import { register, registered } from "./registry.js";
import { logger } from "./logger.js";
import { createDataExportJob } from "./jobs/data-export.js";
import { createWalletStatementJob } from "./jobs/wallet-statement.js";
import { createMpesaReconcileJob } from "./jobs/mpesa-reconcile.js";
import { createAuditDrainJob } from "./jobs/audit-drain.js";

export { createDataExportJob } from "./jobs/data-export.js";
export { createWalletStatementJob } from "./jobs/wallet-statement.js";
export type { StatementRequest } from "./jobs/wallet-statement.js";
export { createMpesaReconcileJob } from "./jobs/mpesa-reconcile.js";
export type { MpesaReconcileJobDeps, MpesaQuerier } from "./jobs/mpesa-reconcile.js";
export { createAuditDrainJob } from "./jobs/audit-drain.js";
export type { AuditDrainJobDeps, Projector } from "./jobs/audit-drain.js";

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
