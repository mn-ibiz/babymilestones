import { eq } from "drizzle-orm";
import { smsOutbox } from "@bm/db";
import type { SmsExecutor, SmsPayload, SmsResult, SmsSender } from "./index.js";
import { getActiveSmsConfig } from "./config.js";
import { checkProviderUrlSafety } from "./url-safety.js";
import { type SmsTemplateData, renderTemplate } from "./templates.js";
import { getActiveTemplate, interpolateTemplate } from "./template-store.js";

/**
 * Provider-agnostic HTTP transport (P5-E03-S01, Decision 19). Mirrors the
 * payments `PaymentTransport` seam: production injects `globalThis.fetch`, tests
 * inject a fake. Keeping it to (url, init) → response-like means the adapter
 * NEVER reaches the network from a default — a transport is always passed in.
 */
export interface SmsTransportResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type SmsTransport = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<SmsTransportResponse>;

/**
 * Construction options for {@link LiveSmsAdapter}. The literal API key is
 * resolved by the caller (from the env var named by `sms_config.api_key_ref`)
 * and the transport is injected — the adapter holds no global state and reaches
 * no network of its own.
 */
export interface LiveSmsAdapterOptions {
  /** Injected HTTP transport (prod: globalThis.fetch; tests: a fake). */
  transport: SmsTransport;
  /** Resolved literal API key (from the env ref) — required; never logged. */
  apiKey: string;
}

/** A provider's send response, normalised to the fields we persist. */
interface ProviderSendResult {
  messageId: string | null;
  costCents: number | null;
}

/** Render the body for a key, DB registry first then the in-code fallback. */
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
 * Live SMS adapter (P5-E03-S01). Reads the single active provider config from
 * `sms_config` (AC1), POSTs the rendered message to its URL with bearer auth
 * derived from the resolved API key (AC2), and records the outcome — status,
 * provider message id, cost — back on the queued `sms_outbox` row (AC3). The
 * provider URL is re-validated against the SSRF guard at send time (AC4), so a
 * config that slipped past the edge can never make the server call a private
 * address.
 *
 * It implements the exact {@link SmsSender} interface, so it is a drop-in for
 * the stub behind `createSmsSender` — no call site changes.
 */
export class LiveSmsAdapter implements SmsSender {
  constructor(
    private readonly db: SmsExecutor,
    private readonly opts: LiveSmsAdapterOptions,
  ) {}

  async send(payload: SmsPayload): Promise<SmsResult> {
    if (!this.opts.apiKey || this.opts.apiKey.trim() === "") {
      throw new Error("@bm/sms: live adapter requires a resolved API key");
    }
    const config = await getActiveSmsConfig(this.db);
    if (!config) {
      throw new Error("@bm/sms: no active sms_config — cannot send live");
    }
    // AC4: re-validate the provider URL before any network call.
    const safety = checkProviderUrlSafety(config.apiUrl);
    if (!safety.ok) {
      throw new Error(`@bm/sms: provider URL rejected (${safety.reason}): ${safety.message}`);
    }

    const data = payload.data ?? {};
    const body = await resolveBody(this.db, payload.template, data);

    // Queue the row first so a crash mid-dispatch still leaves an audit trail.
    const [row] = await this.db
      .insert(smsOutbox)
      .values({
        phone: payload.to,
        body,
        template: payload.template,
        data,
        status: "queued",
        provider: "live",
      })
      .returning({ id: smsOutbox.id });
    const id = row!.id;

    try {
      const result = await this.dispatch(config.apiUrl, config.senderId, payload.to, body);
      await this.db
        .update(smsOutbox)
        .set({
          status: "sent",
          providerMessageId: result.messageId,
          costCents: result.costCents,
          dispatchedAt: new Date(),
          error: null,
        })
        .where(eq(smsOutbox.id, id));
    } catch (err) {
      // Never silently drop: persist the failure on the row (status=failed).
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(smsOutbox)
        .set({ status: "failed", error: message, dispatchedAt: new Date() })
        .where(eq(smsOutbox.id, id));
    }

    return { id };
  }

  /** POST the rendered message to the provider; normalise the response. */
  private async dispatch(
    apiUrl: string,
    from: string,
    to: string,
    message: string,
  ): Promise<ProviderSendResult> {
    const res = await this.opts.transport(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ to, from, message }),
    });
    if (!res.ok) {
      throw new Error(`sms provider send failed: ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      messageId: pickMessageId(json),
      costCents: pickCost(json),
    };
  }
}

/** Read a provider message id under any of the common field names. */
function pickMessageId(json: Record<string, unknown>): string | null {
  const candidate = json.messageId ?? json.message_id ?? json.id ?? json.MessageId;
  return typeof candidate === "string" ? candidate : null;
}

/** Read a per-message cost (minor units) if the provider returns one. */
function pickCost(json: Record<string, unknown>): number | null {
  const candidate = json.cost ?? json.costCents ?? json.cost_cents;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}
