import { eq } from "drizzle-orm";
import { settings, type Database } from "@bm/db";
import {
  BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_BACKUP_RETENTION_POLICY,
  backupRetentionPolicySchema,
  type BackupRetentionPolicy,
} from "@bm/contracts";

/**
 * Resolve the effective backup retention policy: the stored policy if one has
 * been saved and is valid, otherwise the sensible defaults. This MUST never
 * throw merely because an admin has not configured a policy (or saved a
 * malformed one) — callers (the API and the pruner job) always get a usable
 * policy.
 */
export async function getEffectiveBackupRetentionPolicy(
  db: Database,
): Promise<BackupRetentionPolicy> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, BACKUP_RETENTION_SETTING_KEY))
    .limit(1);
  if (!row) return DEFAULT_BACKUP_RETENTION_POLICY;
  const parsed = backupRetentionPolicySchema.safeParse(row.value);
  return parsed.success ? parsed.data : DEFAULT_BACKUP_RETENTION_POLICY;
}

/**
 * Persist a validated retention policy under the well-known settings key,
 * upserting so there is only ever one policy row. `updatedBy` stamps the actor
 * on the settings row (the API layer additionally writes a durable audit row).
 */
export async function saveBackupRetentionPolicy(
  db: Database,
  policy: BackupRetentionPolicy,
  updatedBy: string | null = null,
): Promise<void> {
  await db
    .insert(settings)
    .values({ key: BACKUP_RETENTION_SETTING_KEY, value: policy, updatedBy })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: policy, updatedBy, updatedAt: new Date() },
    });
}
