import { eq } from "drizzle-orm";
import { dataExports, type Database } from "@bm/db";
import { runExport, type ExportStorage } from "@bm/export";
import type { Job } from "../registry.js";

export interface DataExportJobDeps {
  db: Database;
  storage: ExportStorage;
}

/**
 * Async data-export worker (P1-E02-S05). Drains every `pending` data_exports
 * row: gathers the parent's record, bundles a ZIP into the signed-URL store,
 * mints a single-use 7-day token, SMSes the link, and audits. Generation is
 * async (>5s) — the request endpoint only enqueues; this job does the work.
 */
export function createDataExportJob(deps: DataExportJobDeps): Job {
  return {
    name: "data-export",
    run: async () => {
      const pending = await deps.db
        .select({ id: dataExports.id })
        .from(dataExports)
        .where(eq(dataExports.status, "pending"));
      for (const row of pending) {
        await runExport(row.id, { db: deps.db, storage: deps.storage });
      }
    },
  };
}
