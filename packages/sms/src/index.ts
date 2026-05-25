import { eq } from "drizzle-orm";
import { parents, smsOutbox } from "@bm/db";
import type { Database, Transaction } from "@bm/db";
import { type SmsTemplateData, renderTemplate } from "./templates.js";

export { renderTemplate } from "./templates.js";
export type { SmsTemplateData, SmsTemplateKey } from "./templates.js";

/** @bm/sms — provider-agnostic SMS sender. Launch ships a DB-backed stub. */
export const PACKAGE = "@bm/sms" as const;

/** Any drizzle executor (top-level db or a transaction handle). */
export type SmsExecutor = Database | Transaction;

/**
 * Canonical send payload (P1-E09-S01 AC1). Callers describe the message by
 * destination + template key + data bag; the sender renders the body. This is
 * the provider-agnostic seam — product code only ever builds this and calls
 * `send(...)`, never a provider directly.
 */
export interface SmsPayload {
  /** Normalised destination phone (+2547XXXXXXXX). */
  to: string;
  /** Logical template key, e.g. "auth.reset.code". */
  template: string;
  /** Template data bag used to render the body. */
  data?: SmsTemplateData;
}

/** Result of a queued send: the `sms_outbox` row id (AC1). */
export interface SmsResult {
  id: string;
}

/**
 * The provider-agnostic sender contract (P1-E09-S01 AC1). At launch the only
 * implementation is {@link StubSmsSender}; the live provider (P5-E03) is a
 * one-line config swap via {@link createSmsSender}.
 */
export interface SmsSender {
  send(payload: SmsPayload): Promise<SmsResult>;
}

/**
 * Stub sender (P1-E09-S01, consolidating P1-E01-S05). "Delivers" a message by
 * rendering the template body and recording it in `sms_outbox`; it never calls
 * an external API (AC2). Tests read the row back. The row `id` is the queued id.
 */
export class StubSmsSender implements SmsSender {
  constructor(private readonly db: SmsExecutor) {}

  async send(payload: SmsPayload): Promise<SmsResult> {
    const data = payload.data ?? {};
    const body = renderTemplate(payload.template, data);
    const [row] = await this.db
      .insert(smsOutbox)
      .values({
        phone: payload.to,
        body,
        template: payload.template,
        data,
        status: "queued",
      })
      .returning({ id: smsOutbox.id });
    return { id: row!.id };
  }
}

/** Provider selection config — the one place P5-E03 flips to go live (AC3). */
export interface SmsConfig {
  /** "stub" (default, launch) records to sms_outbox; "live" is wired in P5-E03. */
  provider?: "stub" | "live";
}

/**
 * Bind the active sender behind the {@link SmsSender} interface (AC3). All
 * product code resolves its sender here, so the provider switch in P5-E03 is a
 * single config flag rather than a code change at every call site.
 */
export function createSmsSender(db: SmsExecutor, config: SmsConfig = {}): SmsSender {
  switch (config.provider ?? "stub") {
    case "stub":
      return new StubSmsSender(db);
    case "live":
      // P5-E03: construct the live provider adapter here behind the same seam.
      throw new Error("@bm/sms: live provider not wired yet (P5-E03)");
    default:
      return new StubSmsSender(db);
  }
}

/**
 * Marketing consent gate (P1-E02-S04 AC3). NON-transactional (marketing)
 * messages route through this before any send; transactional messages (booking
 * confirms, OTP) bypass it and are always delivered. Returns true iff the
 * targeted parent has opted in. Unknown parent → not consented (fail closed).
 */
export async function isMarketingOptedIn(
  db: SmsExecutor,
  parentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ optIn: parents.smsMarketingOptIn })
    .from(parents)
    .where(eq(parents.id, parentId));
  return row?.optIn ?? false;
}

/**
 * Consent-aware sender wrapping any underlying {@link SmsSender}. Transactional
 * sends always go through; marketing sends are dropped unless the parent opted
 * in (AC3). Returns the queued {@link SmsResult}, or null when dropped.
 */
export class ConsentAwareSmsSender {
  constructor(
    private readonly db: SmsExecutor,
    private readonly sender: SmsSender,
  ) {}

  /** Always send — booking confirms, OTP, receipts (never gated). */
  async sendTransactional(payload: SmsPayload): Promise<SmsResult> {
    return this.sender.send(payload);
  }

  /** Send only if the parent opted in to marketing SMS (AC3). */
  async sendMarketing(parentId: string, payload: SmsPayload): Promise<SmsResult | null> {
    if (!(await isMarketingOptedIn(this.db, parentId))) return null;
    return this.sender.send(payload);
  }

  /**
   * Send a reception receipt copy (P1-E05-S06 AC3). Gated on the parent's SMS
   * consent flag (P1-E02-S04): a parent who has not opted in does not get an
   * unsolicited receipt text — the copy is dropped (the print path is
   * unaffected). Returns the queued result, or null when dropped.
   */
  async sendReceipt(parentId: string, payload: SmsPayload): Promise<SmsResult | null> {
    if (!(await isMarketingOptedIn(this.db, parentId))) return null;
    return this.sender.send(payload);
  }
}
