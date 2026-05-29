import { eq } from "drizzle-orm";
import { parents, smsOutbox } from "@bm/db";
import type { Database, Transaction } from "@bm/db";
import { type SmsTemplateData, renderTemplate } from "./templates.js";
import { getActiveTemplate, interpolateTemplate } from "./template-store.js";
import { LiveSmsAdapter, type SmsTransport } from "./live.js";

export { renderTemplate } from "./templates.js";
export type { SmsTemplateData, SmsTemplateKey } from "./templates.js";
export {
  resolveTemplate,
  interpolateTemplate,
  getActiveTemplate,
  listTemplateVersions,
  listActiveTemplates,
  toPublicSmsTemplate,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "./template-store.js";
export type { PublicSmsTemplate, TemplateExecutor } from "./template-store.js";
export { checkProviderUrlSafety, isSafeProviderUrl } from "./url-safety.js";
export type { UrlSafetyResult, UrlSafetyReason } from "./url-safety.js";
export { LiveSmsAdapter } from "./live.js";
export type {
  SmsTransport,
  SmsTransportResponse,
  LiveSmsAdapterOptions,
} from "./live.js";
export {
  createSmsConfig,
  updateSmsConfig,
  listSmsConfigs,
  getSmsConfig,
  getActiveSmsConfig,
  deleteSmsConfig,
  toPublicSmsConfig,
} from "./config.js";
export type {
  PublicSmsConfig,
  CreateSmsConfigInput,
  UpdateSmsConfigInput,
  ConfigExecutor,
} from "./config.js";

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
 * Render the SMS body for a template key at send time (P1-E09-S03). The DB
 * registry (`sms_templates`) is authoritative: if an active template is
 * registered for the key, its versioned body is interpolated from `data` (AC2).
 * Keys NOT in the registry fall back to the in-code renderer — this keeps the
 * passthrough templates (`raw`, pre-rendered receipts) working without forcing
 * a DB row, while all registered copy is DB-driven and versioned. An unknown
 * key in neither place throws (unknown-key handled).
 */
async function resolveBody(
  db: SmsExecutor,
  template: string,
  data: SmsTemplateData,
): Promise<string> {
  const registered = await getActiveTemplate(db, template);
  if (registered) return interpolateTemplate(registered.body, data);
  return renderTemplate(template, data);
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
    const body = await resolveBody(this.db, payload.template, data);
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
  /** "stub" (default, launch) records to sms_outbox; "live" dispatches (P5-E03). */
  provider?: "stub" | "live";
  /**
   * Required when `provider === "live"`: the injected HTTP transport and the
   * resolved API key. Omitting them on a live selection is a programming error
   * (we never reach the network from defaults), so it throws rather than
   * silently falling back to the stub and pretending to send.
   */
  live?: { transport: SmsTransport; apiKey: string };
}

/**
 * Bind the active sender behind the {@link SmsSender} interface (AC3). All
 * product code resolves its sender here, so the provider switch in P5-E03 is a
 * single config flag rather than a code change at every call site. The DEFAULT
 * is the stub — nothing sends a real SMS until a caller explicitly selects
 * `provider: "live"` AND supplies the transport + key.
 */
export function createSmsSender(db: SmsExecutor, config: SmsConfig = {}): SmsSender {
  switch (config.provider ?? "stub") {
    case "stub":
      return new StubSmsSender(db);
    case "live":
      if (!config.live) {
        throw new Error("@bm/sms: live provider selected without transport + apiKey");
      }
      return new LiveSmsAdapter(db, config.live);
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
