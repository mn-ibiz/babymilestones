/**
 * Single shared PostgreSQL schema (Decision 16).
 * Domain tables are unprefixed; payment-provider tables are prefixed
 * (mpesa_*, paystack_*). Schema definitions land with their owning stories.
 */
export const SCHEMA_VERSION = "0.0.0" as const;

export * from "./schema/index.js";
export { getSetting, setSetting } from "./settings.js";
export { audit } from "./audit.js";
export type { AuditInput, AuditExecutor } from "./audit.js";
export type { Database, Transaction } from "./client.js";
