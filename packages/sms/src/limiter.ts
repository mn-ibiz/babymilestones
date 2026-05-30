import { and, eq, gte, lt } from "drizzle-orm";
import { getSetting, smsOutbox, smsSendLedger } from "@bm/db";
import type { SmsExecutor, SmsPayload, SmsResult, SmsSender } from "./index.js";

/**
 * P5-E03-S03 — SMS rate limit + cost control. A {@link CappedSmsSender} wraps any
 * {@link SmsSender} (seam-preserving — drop-in behind `resolveSmsSender`, no
 * call-site change) and enforces, per UTC day:
 *   - a per-day TOTAL send cap (AC1, default 10,000),
 *   - a per-recipient DAILY cap (AC1, default 10),
 *   - a per-day cost ceiling (cost control).
 *
 * A message that would breach any cap is NOT dropped: it is recorded on
 * `sms_outbox` with `status = "deferred"` and a `deferred_until` watermark set to
 * the start of the next UTC day, so a worker can re-attempt it tomorrow when the
 * window resets (AC2 — queue for next day). Allowed sends are dispatched via the
 * wrapped sender and recorded in the durable `sms_send_ledger` (count + actual
 * cost) so accounting survives restarts and multiple sender instances.
 *
 * All day math uses an injected clock, so burst behaviour and the day-boundary
 * roll-over are deterministically unit-tested (AC1).
 */

/** Settings keys for the caps (generic k/v settings store — admin-adjustable, AC3). */
export const SMS_CAP_PER_DAY_KEY = "sms.cap.per_day" as const;
export const SMS_CAP_PER_RECIPIENT_DAY_KEY = "sms.cap.per_recipient_day" as const;
export const SMS_CAP_MAX_COST_CENTS_KEY = "sms.cap.max_cost_cents_per_day" as const;
export const SMS_CAP_EST_COST_CENTS_KEY = "sms.cap.est_cost_cents" as const;

/** Spec defaults (AC1). */
export const SMS_DEFAULT_CAP_PER_DAY = 10_000;
export const SMS_DEFAULT_CAP_PER_RECIPIENT_DAY = 10;
const SMS_DEFAULT_MAX_COST_CENTS = 1_000_000; // KES 10,000.00/day
const SMS_DEFAULT_EST_COST_CENTS = 100; // assumed per-message cost for the pre-send cost check

export interface SmsCaps {
  perDay: number;
  perRecipientDay: number;
  maxCostCents: number;
  estCostCents: number;
}

/** Coerce a stored setting to a positive integer, or fall back to a default. */
function posInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

/** Read the configured caps from the settings store, applying defaults (AC3). */
export async function getSmsCaps(db: SmsExecutor): Promise<SmsCaps> {
  const [perDay, perRecipient, maxCost, est] = await Promise.all([
    getSetting(db, SMS_CAP_PER_DAY_KEY),
    getSetting(db, SMS_CAP_PER_RECIPIENT_DAY_KEY),
    getSetting(db, SMS_CAP_MAX_COST_CENTS_KEY),
    getSetting(db, SMS_CAP_EST_COST_CENTS_KEY),
  ]);
  return {
    perDay: posInt(perDay, SMS_DEFAULT_CAP_PER_DAY),
    perRecipientDay: posInt(perRecipient, SMS_DEFAULT_CAP_PER_RECIPIENT_DAY),
    maxCostCents: posInt(maxCost, SMS_DEFAULT_MAX_COST_CENTS),
    estCostCents: posInt(est, SMS_DEFAULT_EST_COST_CENTS),
  };
}

export interface DayWindow {
  /** Inclusive lower bound — the start of `now`'s UTC day (00:00:00Z). */
  start: Date;
  /** Exclusive upper bound — the start of the next UTC day. */
  end: Date;
}

/** The `[start, end)` UTC-day window containing `now`. */
export function dayWindow(now: Date): DayWindow {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export interface DayUsage {
  count: number;
  costCents: number;
}

/**
 * Sum the count + cost of ledger rows in `now`'s UTC day. When `recipient` is a
 * phone, scope to that recipient (the per-recipient daily cap); when null, the
 * whole-day total. The injected `now` makes the window deterministic (AC1).
 */
export async function usageForDay(
  db: SmsExecutor,
  now: Date,
  recipient: string | null,
): Promise<DayUsage> {
  const { start, end } = dayWindow(now);
  const where = recipient
    ? and(
        gte(smsSendLedger.sentAt, start),
        lt(smsSendLedger.sentAt, end),
        eq(smsSendLedger.recipient, recipient),
      )
    : and(gte(smsSendLedger.sentAt, start), lt(smsSendLedger.sentAt, end));
  const rows = await db
    .select({ cost: smsSendLedger.costCents })
    .from(smsSendLedger)
    .where(where);
  let costCents = 0;
  for (const r of rows) costCents += r.cost ?? 0;
  return { count: rows.length, costCents };
}

/** Why a send was deferred: per-day total, per-recipient daily, or cost ceiling. */
export type CapReason = "per_day" | "per_recipient" | "cost";

/**
 * Result of a capped send. Extends the base {@link SmsResult} `id` with the
 * deferral outcome: `deferred` is true when the message was held over to the next
 * day (and `reason` says which cap tripped); the `id` then references the
 * `status = "deferred"` `sms_outbox` row, not a dispatched message.
 */
export interface CappedSmsResult extends SmsResult {
  deferred?: boolean;
  reason?: CapReason;
}

export interface CappedSmsSenderOptions {
  /** Injected clock; defaults to the real wall clock. Deterministic in tests. */
  now?: () => Date;
}

/**
 * Cost/rate-capped wrapper around any {@link SmsSender}. Implements the
 * {@link SmsSender} interface so it slots in behind the seam (no call-site
 * change). Per send:
 *   1. Read caps + the current day's usage (deterministic via the injected clock).
 *   2. If this message would breach the per-day total cap, the per-recipient
 *      daily cap, or push estimated spend over the day's cost ceiling, DEFER it:
 *      write a `status = "deferred"` outbox row with a next-day `deferred_until`
 *      watermark and return without calling the inner sender — nothing is sent or
 *      dropped (AC2).
 *   3. Otherwise dispatch via the inner sender, then record the actual cost in
 *      the ledger at the injected `now` so the next decision reflects real spend.
 */
export class CappedSmsSender implements SmsSender {
  private readonly now: () => Date;

  constructor(
    private readonly db: SmsExecutor,
    private readonly inner: SmsSender,
    opts: CappedSmsSenderOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  async send(payload: SmsPayload): Promise<CappedSmsResult> {
    const now = this.now();
    const caps = await getSmsCaps(this.db);

    const dayUsage = await usageForDay(this.db, now, null);
    const recipientUsage = await usageForDay(this.db, now, payload.to);

    // AC1/AC2 — defer (queue for next day) on any breached cap. Order: total,
    // per-recipient, then cost.
    let reason: CapReason | null = null;
    if (dayUsage.count + 1 > caps.perDay) reason = "per_day";
    else if (recipientUsage.count + 1 > caps.perRecipientDay) reason = "per_recipient";
    else if (dayUsage.costCents + caps.estCostCents > caps.maxCostCents) reason = "cost";

    if (reason) {
      return this.defer(payload, now, reason);
    }

    // Within caps — dispatch via the wrapped sender, then account the real cost.
    const result = await this.inner.send(payload);
    const actualCost = await this.readActualCost(result.id);
    await this.db.insert(smsSendLedger).values({
      outboxId: result.id,
      recipient: payload.to,
      sentAt: now,
      costCents: actualCost,
    });
    return result;
  }

  /**
   * Persist an over-cap message as deferred (AC2). It lands on `sms_outbox` with
   * `status = "deferred"` and `deferred_until` = the start of the next UTC day,
   * so it is recoverable by a retry worker tomorrow — never silently dropped. We
   * record the rendered template inputs so the deferred row carries enough to
   * re-send (the body is rendered by the sender on the retry).
   */
  private async defer(
    payload: SmsPayload,
    now: Date,
    reason: CapReason,
  ): Promise<CappedSmsResult> {
    const deferredUntil = dayWindow(now).end;
    const [row] = await this.db
      .insert(smsOutbox)
      .values({
        phone: payload.to,
        body: "",
        template: payload.template,
        data: payload.data ?? {},
        status: "deferred",
        provider: "live",
        error: `deferred: ${reason} cap reached`,
        deferredUntil,
      })
      .returning({ id: smsOutbox.id });
    return { id: row!.id, deferred: true, reason };
  }

  /** Read the dispatched message's actual cost from its outbox row (0 if none). */
  private async readActualCost(outboxId: string): Promise<number> {
    const [row] = await this.db
      .select({ cost: smsOutbox.costCents })
      .from(smsOutbox)
      .where(eq(smsOutbox.id, outboxId));
    return row?.cost ?? 0;
  }
}
