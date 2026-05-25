import { createLogger } from "@bm/observability";

/** Canonical structured (JSON) logger for the jobs worker (X8-S01). */
export const logger = createLogger({
  service: "jobs",
  level: process.env.LOG_LEVEL ?? "info",
});
