/**
 * Single shared PostgreSQL schema (Decision 16).
 * Domain tables are unprefixed; payment-provider tables are prefixed
 * (mpesa_*, paystack_*). Schema definitions land with their owning stories.
 */
export const SCHEMA_VERSION = "0.0.0" as const;
