/**
 * Runtime receipt-writer selection by the eTIMS enable flag (P5-E02-S03).
 *
 * The flag lives in the generic `settings` table under the `etims` section
 * (`{ enabled: boolean }`, contracts `etimsSettingsSchema`). It defaults to OFF,
 * so production keeps using the {@link LocalReceiptWriter} until an admin
 * explicitly enables eTIMS — and flipping back to OFF is a clean rollback that
 * only affects NEW receipts (historical ones are never re-issued, AC4).
 *
 * Selecting the writer is a READ (not audited). The flag CHANGE is audited where
 * it is written (the admin settings route). When the flag is ON but no eTIMS
 * wiring (config + transport) is supplied, this fails SAFE to the local writer
 * rather than throwing on every receipt.
 */
import { eq } from "drizzle-orm";
import { settings, type Database } from "@bm/db";
import { LocalReceiptWriter } from "./local-receipt-writer.js";
import {
  createEtimsReceiptWriter,
  type EtimsConfig,
  type EtimsTransport,
} from "./etims-receipt-writer.js";
import type { ReceiptWriter } from "./index.js";

/** The `settings` key the eTIMS enable flag is stored under (matches contracts). */
export const ETIMS_SETTING_KEY = "etims" as const;

/** eTIMS wiring the selector hands to {@link createEtimsReceiptWriter} when ON. */
export interface EtimsWiring {
  config: EtimsConfig;
  transport?: EtimsTransport;
}

export interface ResolveReceiptWriterOptions {
  /** eTIMS config + injectable transport (env-sourced in production). */
  etims?: EtimsWiring;
}

/** Read the eTIMS enable flag (defaults to false when unset). */
export async function isEtimsEnabled(db: Database): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, ETIMS_SETTING_KEY));
  if (!row) return false;
  const value = row.value as { enabled?: unknown };
  return value.enabled === true;
}

/**
 * Resolve the receipt writer to use for a NEW receipt, honouring the runtime
 * flag. OFF (default) → local; ON with eTIMS wired → live eTIMS writer; ON but
 * unwired → local (fail-safe). No call-site reads the writer class directly —
 * they route through here so the swap is one place.
 */
export async function resolveReceiptWriter(
  db: Database,
  options: ResolveReceiptWriterOptions = {},
): Promise<ReceiptWriter> {
  const enabled = await isEtimsEnabled(db);
  if (enabled && options.etims) {
    return createEtimsReceiptWriter(options.etims.config, { transport: options.etims.transport });
  }
  return new LocalReceiptWriter();
}
