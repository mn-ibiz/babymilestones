import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { setSetting, smsOutbox, smsSendLedger } from "@bm/db";
import { eq } from "drizzle-orm";
import {
  CappedSmsSender,
  getSmsCaps,
  dayWindow,
  usageForDay,
  SMS_CAP_PER_DAY_KEY,
  SMS_CAP_PER_RECIPIENT_DAY_KEY,
  SMS_CAP_MAX_COST_CENTS_KEY,
  SMS_CAP_EST_COST_CENTS_KEY,
  SMS_DEFAULT_CAP_PER_DAY,
  SMS_DEFAULT_CAP_PER_RECIPIENT_DAY,
} from "./limiter.js";
import type { SmsPayload, SmsResult, SmsSender } from "./index.js";

/**
 * P5-E03-S03 — SMS rate limit + cost control. Real PGlite for the durable
 * accounting ledger; a deterministic injected clock for the per-day window; a
 * fake inner sender so accounting is unit-tested without a provider. Covers the
 * per-day total cap (AC1), the per-recipient daily cap (AC1), deferral of an
 * over-cap message to the next day rather than a silent drop (AC2), the cost
 * ceiling, and settings-backed cap configuration (AC3).
 */

/** A fake inner sender that records a fixed cost on the outbox row it writes. */
function fakeSender(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  costPerMsg: number,
): { sender: SmsSender; sent: SmsPayload[] } {
  const sent: SmsPayload[] = [];
  const sender: SmsSender = {
    async send(payload: SmsPayload): Promise<SmsResult> {
      sent.push(payload);
      const [row] = await db
        .insert(smsOutbox)
        .values({
          phone: payload.to,
          body: "x",
          template: payload.template,
          data: payload.data ?? {},
          status: "sent",
          provider: "live",
          costCents: costPerMsg,
        })
        .returning({ id: smsOutbox.id });
      return { id: row!.id };
    },
  };
  return { sender, sent };
}

const TO = "+254712345678";
const payloadTo = (to: string): SmsPayload => ({ to, template: "raw", data: { body: "hi" } });

describe("SMS rate limit + cost control (P5-E03-S03)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
  });

  it("exposes sane defaults and reads admin-configured caps from settings (AC1, AC3)", async () => {
    const defaults = await getSmsCaps(db);
    expect(defaults.perDay).toBe(SMS_DEFAULT_CAP_PER_DAY);
    expect(defaults.perRecipientDay).toBe(SMS_DEFAULT_CAP_PER_RECIPIENT_DAY);
    expect(defaults.maxCostCents).toBeGreaterThan(0);
    expect(defaults.estCostCents).toBeGreaterThan(0);

    await setSetting(db, SMS_CAP_PER_DAY_KEY, 5);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 2);
    await setSetting(db, SMS_CAP_MAX_COST_CENTS_KEY, 500);
    await setSetting(db, SMS_CAP_EST_COST_CENTS_KEY, 80);
    const caps = await getSmsCaps(db);
    expect(caps).toEqual({ perDay: 5, perRecipientDay: 2, maxCostCents: 500, estCostCents: 80 });
  });

  it("dispatches under the per-day cap and records each in the ledger (AC1)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 3);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 100);
    const { sender, sent } = fakeSender(db, 80);
    const now = new Date("2026-05-30T10:00:00Z");
    const limited = new CappedSmsSender(db, sender, { now: () => now });

    await limited.send(payloadTo("+254700000001"));
    await limited.send(payloadTo("+254700000002"));
    await limited.send(payloadTo("+254700000003"));

    expect(sent).toHaveLength(3);
    const ledger = await db.select().from(smsSendLedger);
    expect(ledger).toHaveLength(3);
    expect(ledger.every((r) => r.costCents === 80)).toBe(true);
  });

  it("defers (queues for next day) the message that exceeds the per-day total cap — never drops it (AC1, AC2)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 2);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 100);
    const { sender, sent } = fakeSender(db, 50);
    const now = new Date("2026-05-30T10:00:00Z");
    const limited = new CappedSmsSender(db, sender, { now: () => now });

    await limited.send(payloadTo("+254700000001"));
    await limited.send(payloadTo("+254700000002"));
    // Third exceeds perDay=2 → deferred, not sent, not dropped.
    const res = await limited.send(payloadTo("+254700000003"));
    expect(res.deferred).toBe(true);
    expect(res.reason).toBe("per_day");

    // Inner sender saw only 2; the deferred message is persisted on sms_outbox as
    // status=deferred with a next-day watermark (recoverable, not lost).
    expect(sent).toHaveLength(2);
    const [row] = await db.select().from(smsOutbox).where(eq(smsOutbox.id, res.id));
    expect(row!.status).toBe("deferred");
    expect(row!.deferredUntil).toBeInstanceOf(Date);
    // Next-day watermark is the start of the following UTC day.
    expect(row!.deferredUntil!.toISOString()).toBe("2026-05-31T00:00:00.000Z");
  });

  it("defers a message that exceeds the per-recipient daily cap while others still send (AC1, AC2)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 100);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 2);
    const { sender, sent } = fakeSender(db, 10);
    const now = new Date("2026-05-30T12:00:00Z");
    const limited = new CappedSmsSender(db, sender, { now: () => now });

    await limited.send(payloadTo(TO));
    await limited.send(payloadTo(TO));
    // Third to the SAME recipient is over the per-recipient cap → deferred.
    const capped = await limited.send(payloadTo(TO));
    expect(capped.deferred).toBe(true);
    expect(capped.reason).toBe("per_recipient");

    // A different recipient is unaffected (per-recipient cap is per phone).
    const other = await limited.send(payloadTo("+254799999999"));
    expect(other.deferred).toBeFalsy();

    expect(sent).toHaveLength(3); // 2 to TO + 1 to the other recipient
  });

  it("defers when the day's spend would exceed the cost ceiling, using the estimated per-message cost (AC2)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 1000);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 1000);
    await setSetting(db, SMS_CAP_MAX_COST_CENTS_KEY, 200);
    await setSetting(db, SMS_CAP_EST_COST_CENTS_KEY, 80);
    const { sender, sent } = fakeSender(db, 80);
    const now = new Date("2026-05-30T10:00:00Z");
    const limited = new CappedSmsSender(db, sender, { now: () => now });

    await limited.send(payloadTo("+254700000001")); // 80
    await limited.send(payloadTo("+254700000002")); // 160
    const capped = await limited.send(payloadTo("+254700000003")); // 160+80=240 > 200
    expect(capped.deferred).toBe(true);
    expect(capped.reason).toBe("cost");
    expect(sent).toHaveLength(2);
  });

  it("rolls over at the day boundary: yesterday's sends do not count against today (AC1 — deterministic clock)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 2);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 100);
    const { sender } = fakeSender(db, 10);

    let nowValue = new Date("2026-05-30T23:30:00Z");
    const limited = new CappedSmsSender(db, sender, { now: () => nowValue });

    await limited.send(payloadTo("+254700000001"));
    await limited.send(payloadTo("+254700000002"));
    // Third on the 30th is over the daily cap → deferred.
    expect((await limited.send(payloadTo("+254700000003"))).deferred).toBe(true);

    // Cross into the next UTC day — the cap resets, sends resume.
    nowValue = new Date("2026-05-31T00:05:00Z");
    const next = await limited.send(payloadTo("+254700000004"));
    expect(next.deferred).toBeFalsy();
  });

  it("usageForDay sums count + cost for the UTC day precisely; per-recipient counts isolate (AC1 accounting)", async () => {
    const day = new Date("2026-05-30T12:00:00Z");
    const within = dayWindow(day);
    // Two for TO today, one for another today, and one yesterday (out of window).
    await db.insert(smsSendLedger).values([
      { recipient: TO, costCents: 40, sentAt: new Date("2026-05-30T00:00:00Z") },
      { recipient: TO, costCents: 10, sentAt: new Date("2026-05-30T23:59:59Z") },
      { recipient: "+254799999999", costCents: 7, sentAt: new Date("2026-05-30T08:00:00Z") },
      { recipient: TO, costCents: 999, sentAt: new Date("2026-05-29T23:59:59Z") },
    ]);
    expect(within.start.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(within.end.toISOString()).toBe("2026-05-31T00:00:00.000Z");

    const total = await usageForDay(db, day, null);
    expect(total.count).toBe(3);
    expect(total.costCents).toBe(57);

    const forTo = await usageForDay(db, day, TO);
    expect(forTo.count).toBe(2);
    expect(forTo.costCents).toBe(50);
  });

  it("implements the SmsSender interface (drop-in wrapper, seam-preserving)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 10);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, 10);
    const { sender } = fakeSender(db, 5);
    const limited = new CappedSmsSender(db, sender);
    const result = await limited.send(payloadTo(TO));
    expect(typeof result.id).toBe("string");
    expect(result.id).toBeTruthy();
    expect(result.deferred).toBeFalsy();
  });

  it("treats a zero/invalid cap as disabled rather than blocking all sends (defensive)", async () => {
    await setSetting(db, SMS_CAP_PER_DAY_KEY, 0);
    await setSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY, -3);
    await setSetting(db, SMS_CAP_MAX_COST_CENTS_KEY, 0);
    const { sender, sent } = fakeSender(db, 5);
    const limited = new CappedSmsSender(db, sender);
    await limited.send(payloadTo(TO));
    await limited.send(payloadTo(TO));
    expect(sent).toHaveLength(2);
  });
});
