import { createLogger } from "@bm/observability";

/**
 * Canonical structured (JSON) server-side logger for the pos app (X8-S01).
 * Use only in server components, route handlers, and server actions — pino is a
 * Node logger and must never be imported into client bundles.
 */
export const logger = createLogger({
  service: "pos",
  level: process.env.LOG_LEVEL ?? "info",
});
