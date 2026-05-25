import { desc, eq, ne, and } from "drizzle-orm";
import { smsConfig, type Database, type SmsConfigRow, type Transaction } from "@bm/db";

/** A drizzle executor — the top-level db or a transaction handle. */
export type ConfigExecutor = Database | Transaction;

/** Secret-free projection of an sms_config row (AC2: never expose a key value). */
export interface PublicSmsConfig {
  id: string;
  senderId: string;
  apiUrl: string;
  apiKeyRef: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map a row to its public shape. The table never stores a secret (only
 * `api_key_ref`), but this projection is the single seam every read goes
 * through, so the API can never accidentally leak a future column.
 */
export function toPublicSmsConfig(row: SmsConfigRow): PublicSmsConfig {
  return {
    id: row.id,
    senderId: row.senderId,
    apiUrl: row.apiUrl,
    apiKeyRef: row.apiKeyRef,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateSmsConfigInput {
  senderId: string;
  apiUrl: string;
  apiKeyRef: string;
  isActive?: boolean;
}

/** Clear `is_active` on every other active row (within a tx) — single-active (AC4). */
async function deactivateOthers(tx: ConfigExecutor, exceptId: string | null): Promise<void> {
  const where =
    exceptId === null
      ? eq(smsConfig.isActive, true)
      : and(eq(smsConfig.isActive, true), ne(smsConfig.id, exceptId));
  await tx.update(smsConfig).set({ isActive: false, updatedAt: new Date() }).where(where);
}

/**
 * Create an SMS provider config (AC1). When `isActive` is requested the previous
 * active row is deactivated in the SAME transaction first, so the partial unique
 * index (AC4) never trips and exactly one row stays active.
 */
export async function createSmsConfig(
  db: Database,
  input: CreateSmsConfigInput,
): Promise<SmsConfigRow> {
  return db.transaction(async (tx) => {
    if (input.isActive) await deactivateOthers(tx, null);
    const [row] = await tx
      .insert(smsConfig)
      .values({
        senderId: input.senderId,
        apiUrl: input.apiUrl,
        apiKeyRef: input.apiKeyRef,
        isActive: input.isActive ?? false,
      })
      .returning();
    return row!;
  });
}

export interface UpdateSmsConfigInput {
  senderId?: string;
  apiUrl?: string;
  apiKeyRef?: string;
  isActive?: boolean;
}

/**
 * Update a config (AC1). Partial patch. Activating a row (`isActive: true`)
 * deactivates every other row in the same transaction (AC4). Returns the updated
 * row, or null when the id is unknown.
 */
export async function updateSmsConfig(
  db: Database,
  id: string,
  patch: UpdateSmsConfigInput,
): Promise<SmsConfigRow | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(smsConfig).where(eq(smsConfig.id, id));
    if (!existing) return null;
    if (patch.isActive === true) await deactivateOthers(tx, id);
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.senderId !== undefined) set.senderId = patch.senderId;
    if (patch.apiUrl !== undefined) set.apiUrl = patch.apiUrl;
    if (patch.apiKeyRef !== undefined) set.apiKeyRef = patch.apiKeyRef;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    const [row] = await tx.update(smsConfig).set(set).where(eq(smsConfig.id, id)).returning();
    return row!;
  });
}

/** List all configs, newest first. */
export async function listSmsConfigs(db: ConfigExecutor): Promise<SmsConfigRow[]> {
  return db.select().from(smsConfig).orderBy(desc(smsConfig.createdAt));
}

/** Read one config by id, or null. */
export async function getSmsConfig(db: ConfigExecutor, id: string): Promise<SmsConfigRow | null> {
  const [row] = await db.select().from(smsConfig).where(eq(smsConfig.id, id));
  return row ?? null;
}

/** The single active config, or null when none is active. */
export async function getActiveSmsConfig(db: ConfigExecutor): Promise<SmsConfigRow | null> {
  const [row] = await db.select().from(smsConfig).where(eq(smsConfig.isActive, true));
  return row ?? null;
}

/** Delete a config by id. Returns true when a row was removed. */
export async function deleteSmsConfig(db: ConfigExecutor, id: string): Promise<boolean> {
  const rows = await db.delete(smsConfig).where(eq(smsConfig.id, id)).returning();
  return rows.length > 0;
}
