import { getSetting } from "@bm/db";
import type { SmsExecutor, SmsSender } from "./index.js";
import { StubSmsSender } from "./index.js";
import { LiveSmsAdapter, type LiveSmsAdapterOptions } from "./live.js";

/**
 * The settings key (P5-E03-S02 AC1) that flips SMS from the stub to the live
 * provider. Stored in the generic `settings` k/v store; an admin toggles it once
 * the sender ID is registered. The value is a boolean; ANYTHING that is not
 * literal `true` is treated as OFF, so the system is fail-safe to the stub.
 */
export const SMS_LIVE_ENABLED_KEY = "sms.live_enabled" as const;

/**
 * Read the live switch (AC1). Returns true ONLY when the stored value is the
 * boolean `true`. Unset, false, or any non-boolean → false (no real sends).
 */
export async function isSmsLiveEnabled(db: SmsExecutor): Promise<boolean> {
  const value = await getSetting(db, SMS_LIVE_ENABLED_KEY);
  return value === true;
}

/**
 * Resolve the active {@link SmsSender} behind the seam (AC2). When the flag is
 * ON *and* live transport + key are wired, returns the {@link LiveSmsAdapter};
 * otherwise the {@link StubSmsSender}. Live without wired credentials degrades
 * to the stub rather than risking a half-configured real send.
 *
 * `live` is the resolved transport + API key (the literal key from the env var
 * named by `sms_config.api_key_ref`), supplied by the composition root — never
 * read from the DB and never logged.
 */
export async function resolveSmsSender(
  db: SmsExecutor,
  live: LiveSmsAdapterOptions | null,
): Promise<SmsSender> {
  if (live && (await isSmsLiveEnabled(db))) {
    return new LiveSmsAdapter(db, live);
  }
  return new StubSmsSender(db);
}
