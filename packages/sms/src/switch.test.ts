import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { setSetting } from "@bm/db";
import {
  SMS_LIVE_ENABLED_KEY,
  isSmsLiveEnabled,
  resolveSmsSender,
} from "./switch.js";
import { LiveSmsAdapter } from "./live.js";
import { StubSmsSender } from "./index.js";
import type { SmsTransport } from "./live.js";

/**
 * P5-E03-S02 — live/stub switch flag. The `sms.live_enabled` setting selects the
 * sender behind the `SmsSender` seam. DEFAULT is OFF: nothing sends a real SMS
 * until an admin explicitly enables it.
 */
describe("sms live/stub switch", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  const noopTransport: SmsTransport = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  });

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
  });

  it("defaults to OFF when the flag is unset (AC1, AC2 — fail safe to stub)", async () => {
    expect(await isSmsLiveEnabled(db)).toBe(false);
    const sender = await resolveSmsSender(db, { transport: noopTransport, apiKey: "k" });
    expect(sender).toBeInstanceOf(StubSmsSender);
  });

  it("returns the StubSmsSender when the flag is explicitly false (AC2)", async () => {
    await setSetting(db, SMS_LIVE_ENABLED_KEY, false);
    const sender = await resolveSmsSender(db, { transport: noopTransport, apiKey: "k" });
    expect(sender).toBeInstanceOf(StubSmsSender);
  });

  it("returns the LiveSmsAdapter when the flag is true (AC1, AC2)", async () => {
    await setSetting(db, SMS_LIVE_ENABLED_KEY, true);
    expect(await isSmsLiveEnabled(db)).toBe(true);
    const sender = await resolveSmsSender(db, { transport: noopTransport, apiKey: "k" });
    expect(sender).toBeInstanceOf(LiveSmsAdapter);
  });

  it("falls back to the stub when live is enabled but no transport/key is wired (no accidental real send)", async () => {
    await setSetting(db, SMS_LIVE_ENABLED_KEY, true);
    const sender = await resolveSmsSender(db, null);
    expect(sender).toBeInstanceOf(StubSmsSender);
  });

  it("treats a non-boolean stored value as OFF (defensive)", async () => {
    await setSetting(db, SMS_LIVE_ENABLED_KEY, "yes");
    expect(await isSmsLiveEnabled(db)).toBe(false);
  });
});
