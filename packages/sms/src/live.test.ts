import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { smsConfig, smsOutbox, smsTemplates } from "@bm/db";
import { eq } from "drizzle-orm";
import { LiveSmsAdapter, type SmsTransport, type SmsTransportResponse } from "./live.js";

/**
 * P5-E03-S01 — live, provider-agnostic SMS adapter. Real PGlite; the HTTP
 * transport is injected so no test ever touches the network. Covers reading
 * config from `sms_config` (AC1), the authed POST (AC2), recording the result +
 * provider message id in `sms_outbox` (AC3), and the SSRF guard (AC4).
 */
describe("LiveSmsAdapter", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
  });

  async function seedActiveConfig(apiUrl = "https://api.smsprovider.test/send") {
    const [row] = await db
      .insert(smsConfig)
      .values({ senderId: "BABY", apiUrl, apiKeyRef: "SMS_API_KEY", isActive: true })
      .returning();
    return row!;
  }

  /** A transport that records calls and returns a canned 2xx with a message id. */
  function okTransport(messageId = "prov-msg-1"): {
    transport: SmsTransport;
    calls: Array<{ url: string; init: unknown }>;
  } {
    const calls: Array<{ url: string; init: unknown }> = [];
    const transport: SmsTransport = async (url, init) => {
      calls.push({ url, init });
      const res: SmsTransportResponse = {
        ok: true,
        status: 200,
        json: async () => ({ messageId, cost: 80 }),
        text: async () => JSON.stringify({ messageId, cost: 80 }),
      };
      return res;
    };
    return { transport, calls };
  }

  it("reads the active provider config from sms_config and POSTs to its URL (AC1, AC2)", async () => {
    await seedActiveConfig("https://api.smsprovider.test/v1/send");
    const { transport, calls } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "secret-key" });

    await adapter.send({ to: "+254712345678", template: "raw", data: { body: "Hi" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.smsprovider.test/v1/send");
    const init = calls[0]!.init as { method?: string; headers?: Record<string, string>; body?: string };
    expect(init.method).toBe("POST");
    // Auth derived from the resolved API key (never the ref) — provider-agnostic
    // bearer scheme.
    expect(init.headers?.authorization).toContain("secret-key");
    const payload = JSON.parse(init.body ?? "{}");
    expect(payload.to).toBe("+254712345678");
    expect(payload.from).toBe("BABY");
    expect(payload.message).toBe("Hi");
  });

  it("records the send result + provider message id in sms_outbox (AC3)", async () => {
    await seedActiveConfig();
    const { transport } = okTransport("prov-xyz-9");
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });

    const result = await adapter.send({ to: "+254700000000", template: "raw", data: { body: "Yo" } });

    const [row] = await db.select().from(smsOutbox).where(eq(smsOutbox.id, result.id));
    expect(row!.status).toBe("sent");
    expect(row!.provider).toBe("live");
    expect(row!.providerMessageId).toBe("prov-xyz-9");
    expect(row!.costCents).toBe(80);
    expect(row!.dispatchedAt).toBeInstanceOf(Date);
    expect(row!.error).toBeNull();
  });

  it("renders a registered DB template body before sending (reuses the resolver)", async () => {
    await seedActiveConfig();
    // Use a key the launch seed (migration 0036) does NOT already activate, so
    // this row is the sole active template for its (key, language).
    await db.insert(smsTemplates).values({ key: "test.custom", body: "Hi {name}", version: 1, isActive: true });
    const { transport, calls } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });

    await adapter.send({ to: "+254711111111", template: "test.custom", data: { name: "Asha" } });

    const init = calls[0]!.init as { body?: string };
    expect(JSON.parse(init.body ?? "{}").message).toBe("Hi Asha");
  });

  it("records a failed send (provider non-2xx) without throwing or losing the row (AC3)", async () => {
    await seedActiveConfig();
    const transport: SmsTransport = async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: "bad gateway" }),
      text: async () => "bad gateway",
    });
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });

    const result = await adapter.send({ to: "+254722222222", template: "raw", data: { body: "x" } });

    const [row] = await db.select().from(smsOutbox).where(eq(smsOutbox.id, result.id));
    expect(row!.status).toBe("failed");
    expect(row!.provider).toBe("live");
    expect(row!.providerMessageId).toBeNull();
    expect(row!.error).toContain("502");
    expect(row!.dispatchedAt).toBeInstanceOf(Date);
  });

  it("throws when no active provider config exists (cannot go live unconfigured) (AC1)", async () => {
    const { transport } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });
    await expect(
      adapter.send({ to: "+254712345678", template: "raw", data: { body: "Hi" } }),
    ).rejects.toThrow(/no active/i);
  });

  it("re-validates the configured URL against the SSRF guard before any network call (AC4)", async () => {
    // A private/loopback URL slipped past config edge validation must still be
    // rejected by the adapter at send time, and no transport call is made.
    await seedActiveConfig("https://169.254.169.254/latest/meta-data");
    const { transport, calls } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });

    await expect(
      adapter.send({ to: "+254712345678", template: "raw", data: { body: "Hi" } }),
    ).rejects.toThrow(/private|ssrf|url/i);
    expect(calls).toHaveLength(0);
  });

  it("requires a resolved API key (never sends with an empty credential) (AC2)", async () => {
    await seedActiveConfig();
    const { transport, calls } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "" });
    await expect(
      adapter.send({ to: "+254712345678", template: "raw", data: { body: "Hi" } }),
    ).rejects.toThrow(/api key/i);
    expect(calls).toHaveLength(0);
  });

  it("satisfies the SmsSender interface (returns a queued id) (AC: interface seam)", async () => {
    await seedActiveConfig();
    const { transport } = okTransport();
    const adapter = new LiveSmsAdapter(db, { transport, apiKey: "k" });
    const result = await adapter.send({ to: "+254712345678", template: "raw", data: { body: "Hi" } });
    expect(typeof result.id).toBe("string");
    expect(result.id).toBeTruthy();
  });
});
