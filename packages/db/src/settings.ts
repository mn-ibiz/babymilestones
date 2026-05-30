import { eq } from "drizzle-orm";
import { settings } from "./schema/settings.js";
import type { Database, Transaction } from "./client.js";

/** Any drizzle executor — the top-level db or a transaction handle. */
type SettingsExecutor = Database | Transaction;

/**
 * Generic typed key/value settings accessors over the `settings` table
 * (P1-E10-S04). Feature flags and tunables (the SMS live switch, the SMS rate
 * caps) live here so an admin can change them without a deploy.
 *
 * The `settings.value` column is a JSON document; a scalar flag is wrapped as
 * `{ v: <scalar> }` so the same column holds both rich section payloads and
 * single values. {@link getSetting} unwraps that envelope and returns the bare
 * value; an absent key returns `undefined`.
 */

interface ScalarEnvelope extends Record<string, unknown> {
  v: unknown;
}

/** Read a setting value by key, or `undefined` when the key is unset. */
export async function getSetting(db: SettingsExecutor, key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (!row) return undefined;
  const value = row.value as ScalarEnvelope | Record<string, unknown>;
  // Scalar flags are stored under the `v` envelope; rich sections are returned
  // as-is.
  if (value && typeof value === "object" && "v" in value) {
    return (value as ScalarEnvelope).v;
  }
  return value;
}

/**
 * Upsert a scalar setting value by key. The value is wrapped in the `{ v }`
 * envelope so {@link getSetting} can return the bare scalar. Idempotent on the
 * key (insert-or-update).
 */
export async function setSetting(
  db: SettingsExecutor,
  key: string,
  value: unknown,
): Promise<void> {
  const envelope: ScalarEnvelope = { v: value };
  await db
    .insert(settings)
    .values({ key, value: envelope })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: envelope, updatedAt: new Date() },
    });
}
