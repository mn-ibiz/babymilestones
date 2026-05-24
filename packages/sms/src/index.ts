import { smsOutbox } from "@bm/db";
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
