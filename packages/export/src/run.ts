import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { audit, dataExports, users } from "@bm/db";
import type { Database } from "@bm/db";
import { StubSmsSender } from "@bm/sms";
import { gatherParentExport, exportToZipEntries } from "./gather.js";
import { createZip } from "./zip.js";
import type { ExportStorage } from "./storage.js";

/** Token validity window: 7 days (AC2). */
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RunExportDeps {
  db: Database;
  storage: ExportStorage;
  /** Base URL the download link is built from. */
  downloadBaseUrl?: string;
  /** Clock injection for deterministic expiry tests. */
  now?: () => number;
}

/**
 * Process one pending export request: gather the parent's record, bundle a ZIP,
 * store it at the signed-URL S3-equivalent, mint a single-use 7-day download
 * token, SMS the link (stub), and audit the export. Idempotent-ish: only acts
 * on rows still in `pending`.
 */
export async function runExport(exportId: string, deps: RunExportDeps): Promise<void> {
  const { db, storage } = deps;
  const now = deps.now ?? Date.now;
  const baseUrl = deps.downloadBaseUrl ?? "https://app.babymilestones.co.ke";

  const [row] = await db.select().from(dataExports).where(eq(dataExports.id, exportId));
  if (!row) throw new Error(`data_export ${exportId} not found`);
  if (row.status !== "pending") return; // already processed — do not re-run

  try {
    const bundle = await gatherParentExport(db, row.userId);
    const zip = createZip(exportToZipEntries(bundle));
    const storageKey = `exports/${row.userId}/${row.id}.zip`;
    await storage.put(storageKey, zip);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now() + EXPORT_TTL_MS);

    await db.transaction(async (tx) => {
      await tx
        .update(dataExports)
        .set({
          status: "ready",
          downloadToken: token,
          storageKey,
          expiresAt,
          completedAt: new Date(now()),
        })
        .where(eq(dataExports.id, row.id));

      await audit(tx, {
        actor: row.userId,
        action: "parent.data.export.completed",
        target: { table: "data_exports", id: row.id },
        payload: { storage_key: storageKey, expires_at: expiresAt.toISOString() },
      });
    });

    // AC2/AC3: notify via SMS stub with the single-use 7-day link.
    const [user] = await db.select().from(users).where(eq(users.id, row.userId));
    if (user) {
      const link = `${baseUrl}/exports/download?token=${token}`;
      await new StubSmsSender(db).send({
        to: user.phone,
        template: "parent.data.export.ready",
        data: { link },
      });
    }
  } catch (err) {
    await db
      .update(dataExports)
      .set({ status: "failed", failedReason: err instanceof Error ? err.message : String(err) })
      .where(eq(dataExports.id, row.id));
    throw err;
  }
}
