import { eq } from "drizzle-orm";
import { parents, smsOutbox } from "@bm/db";
import type { Database, Transaction } from "@bm/db";

/** @bm/sms — provider-agnostic SMS sender. Launch ships a DB-backed stub. */
export const PACKAGE = "@bm/sms" as const;

/** Any drizzle executor (top-level db or a transaction handle). */
export type SmsExecutor = Database | Transaction;

export interface SmsMessage {
  /** Normalised destination phone (+2547XXXXXXXX). */
  phone: string;
  /** Rendered message body. */
  body: string;
  /** Logical template name, e.g. "auth.reset.code". */
  template?: string;
}

export interface SmsSender {
  send(msg: SmsMessage): Promise<void>;
}

/**
 * Stub sender (P1-E01-S05). "Delivers" a message by recording it in
 * `sms_outbox`; tests read the row back. The real provider adapter + config is
 * epic P1-E09 — this stays intentionally minimal.
 */
export class StubSmsSender implements SmsSender {
  constructor(private readonly db: SmsExecutor) {}

  async send(msg: SmsMessage): Promise<void> {
    await this.db.insert(smsOutbox).values({
      phone: msg.phone,
      body: msg.body,
      template: msg.template ?? null,
    });
  }
}

/**
 * Marketing consent gate (P1-E02-S04 AC3). The X4 dispatcher routes
 * NON-transactional (marketing) messages through this before any send;
 * transactional messages (booking confirms, OTP) bypass it entirely and are
 * always delivered. Returns true iff the targeted parent has opted in.
 *
 * Resolution is by parent id (callers already hold it from the booking/parent
 * context). Unknown parent → not consented (fail closed).
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
 * sends always go through; marketing sends are dropped unless the parent has
 * opted in (AC3). Returns whether the message was actually dispatched.
 */
export class ConsentAwareSmsSender {
  constructor(
    private readonly db: SmsExecutor,
    private readonly sender: SmsSender,
  ) {}

  /** Always send — booking confirms, OTP, receipts (never gated). */
  async sendTransactional(msg: SmsMessage): Promise<boolean> {
    await this.sender.send(msg);
    return true;
  }

  /** Send only if the parent opted in to marketing SMS (AC3). */
  async sendMarketing(parentId: string, msg: SmsMessage): Promise<boolean> {
    if (!(await isMarketingOptedIn(this.db, parentId))) return false;
    await this.sender.send(msg);
    return true;
  }

  /**
   * Send a reception receipt copy (P1-E05-S06 AC3). Gated on the parent's SMS
   * consent flag (P1-E02-S04): a parent who has not opted in does not get an
   * unsolicited receipt text — the copy is dropped (the print path is
   * unaffected). Returns true iff the stub actually recorded the message.
   */
  async sendReceipt(parentId: string, msg: SmsMessage): Promise<boolean> {
    if (!(await isMarketingOptedIn(this.db, parentId))) return false;
    await this.sender.send(msg);
    return true;
  }
}
