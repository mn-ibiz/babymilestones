import { eq } from "drizzle-orm";
import { wooConfig, type Database, type Transaction, type WooConfigRow } from "@bm/db";
import type { WooConfigPublic, WooConfigSaveInput } from "@bm/contracts";
import { encryptSecret, decryptSecret } from "./crypto.js";
import type { WooConfig } from "./client.js";

/**
 * WooCommerce credential persistence (P4-E04-S06 / Story 29.6, AC3).
 *
 * Secrets are encrypted at rest (AES-256-GCM via `./crypto`) and are WRITE-ONLY:
 * the public projection ({@link getWooConfigPublic}) returns the site URL and a
 * boolean "is set" per credential, NEVER the value. Decryption happens only
 * server-side when a client is constructed ({@link resolveWooClientConfig}).
 *
 * There is a single config row (singleton, enforced by the DB unique index), so
 * save is an upsert keyed on the existing row's id; omitting a secret on update
 * KEEPS the previously-stored encrypted value.
 */

/** A drizzle executor — the top-level db or a transaction handle. */
export type WooConfigExecutor = Database | Transaction;

/** Read the single config row (server-internal — carries ciphertext), or null. */
export async function getWooConfig(db: WooConfigExecutor): Promise<WooConfigRow | null> {
  const [row] = await db.select().from(wooConfig).limit(1);
  return row ?? null;
}

/**
 * Secret-free projection of the WooCommerce config for the client (AC3). Returns
 * the site URL and whether each credential is stored — never a credential value.
 */
export async function getWooConfigPublic(db: WooConfigExecutor): Promise<WooConfigPublic> {
  const row = await getWooConfig(db);
  if (!row) {
    return { siteUrl: null, hasConsumerKey: false, hasConsumerSecret: false, updatedAt: null };
  }
  return {
    siteUrl: row.siteUrl,
    hasConsumerKey: row.consumerKeyEnc !== null && row.consumerKeyEnc !== "",
    hasConsumerSecret: row.consumerSecretEnc !== null && row.consumerSecretEnc !== "",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface SaveWooConfigArgs {
  input: WooConfigSaveInput;
  /** Master key material used to encrypt the secrets at rest. */
  encryptionKey: string;
}

/**
 * Upsert the single WooCommerce config (AC3). `siteUrl` is always written. A
 * provided `consumerKey`/`consumerSecret` is encrypted and stored; an omitted
 * one KEEPS the previously-stored encrypted value (so the operator can change
 * the URL without re-entering secrets). Returns the persisted row.
 */
export async function saveWooConfig(
  db: Database,
  args: SaveWooConfigArgs,
): Promise<WooConfigRow> {
  const { input, encryptionKey } = args;
  return db.transaction(async (tx) => {
    const existing = await getWooConfig(tx);

    const keyEnc =
      input.consumerKey !== undefined
        ? encryptSecret(input.consumerKey, encryptionKey)
        : (existing?.consumerKeyEnc ?? null);
    const secretEnc =
      input.consumerSecret !== undefined
        ? encryptSecret(input.consumerSecret, encryptionKey)
        : (existing?.consumerSecretEnc ?? null);

    const now = new Date();
    if (existing) {
      const [row] = await tx
        .update(wooConfig)
        .set({
          siteUrl: input.siteUrl,
          consumerKeyEnc: keyEnc,
          consumerSecretEnc: secretEnc,
          updatedAt: now,
        })
        .where(eq(wooConfig.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await tx
      .insert(wooConfig)
      .values({
        siteUrl: input.siteUrl,
        consumerKeyEnc: keyEnc,
        consumerSecretEnc: secretEnc,
      })
      .returning();
    return row!;
  });
}

/**
 * Decrypt the stored credentials into a ready-to-use {@link WooConfig} for
 * server-side client construction. Returns null when no row exists or the
 * credentials are incomplete (so callers can short-circuit before building a
 * client that would only fail auth).
 */
export async function resolveWooClientConfig(
  db: WooConfigExecutor,
  encryptionKey: string,
): Promise<WooConfig | null> {
  const row = await getWooConfig(db);
  if (!row || !row.consumerKeyEnc || !row.consumerSecretEnc) return null;
  return {
    siteUrl: row.siteUrl,
    consumerKey: decryptSecret(row.consumerKeyEnc, encryptionKey),
    consumerSecret: decryptSecret(row.consumerSecretEnc, encryptionKey),
  };
}
