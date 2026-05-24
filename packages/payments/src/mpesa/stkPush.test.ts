import { describe, expect, it, vi } from "vitest";
import { createMpesaAdapter, MpesaConfigError, MpesaTransportError } from "./stkPush.js";
import type { DarajaTransport } from "./stkPush.js";

/** Full, valid Daraja config — credentials come from env in production, never DB. */
const config = {
  baseUrl: "https://sandbox.safaricom.co.ke",
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pk",
  callbackUrl: "https://api.babymilestones.co.ke/payments/mpesa/callback",
} as const;

/** A transport that records calls and returns canned token + stkpush responses. */
function fakeTransport(
  stkResponse: unknown,
  opts: { tokenStatus?: number; stkStatus?: number } = {},
): { transport: DarajaTransport; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport: DarajaTransport = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/oauth/")) {
      return new Response(JSON.stringify({ access_token: "tok-123", expires_in: "3599" }), {
        status: opts.tokenStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(stkResponse), {
      status: opts.stkStatus ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, calls };
}

const okStk = {
  MerchantRequestID: "mr-1",
  CheckoutRequestID: "ws_CO_123",
  ResponseCode: "0",
  ResponseDescription: "Success. Request accepted for processing",
  CustomerMessage: "Success. Request accepted for processing",
};

describe("M-Pesa STK push adapter (P1-E04-S01)", () => {
  it("conforms to the unified Charge interface and returns a charge on success", async () => {
    const { transport } = fakeTransport(okStk);
    const mpesa = createMpesaAdapter({ config, transport, now: () => new Date("2026-05-25T08:30:00Z") });

    const charge = await mpesa.stkPush({ amountKes: 500, phone: "+254712345678", accountRef: "wallet-1" });

    expect(charge.provider).toBe("mpesa");
    expect(charge.status).toBe("pending");
    expect(charge.checkoutRequestId).toBe("ws_CO_123");
    expect(charge.merchantRequestId).toBe("mr-1");
  });

  it("never performs real network IO — the injected transport is the only caller", async () => {
    const { transport, calls } = fakeTransport(okStk);
    const mpesa = createMpesaAdapter({ config, transport, now: () => new Date("2026-05-25T08:30:00Z") });
    await mpesa.stkPush({ amountKes: 500, phone: "+254712345678", accountRef: "w1" });
    // One token fetch + one stkpush call, both via the injected transport.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("/oauth/");
    expect(calls[1]!.url).toContain("/mpesa/stkpush/v1/processrequest");
  });

  it("sends a correctly shaped Daraja stkpush body (timestamp, password, amount, MSISDN)", async () => {
    const { transport, calls } = fakeTransport(okStk);
    const mpesa = createMpesaAdapter({ config, transport, now: () => new Date("2026-05-25T08:30:00Z") });
    await mpesa.stkPush({ amountKes: 500, phone: "+254712345678", accountRef: "wallet-1" });

    const body = JSON.parse(String(calls[1]!.init.body)) as Record<string, unknown>;
    expect(body.BusinessShortCode).toBe("174379");
    expect(body.Amount).toBe(500);
    // MSISDN must be the Daraja 2547… form (no leading +).
    expect(body.PhoneNumber).toBe("254712345678");
    expect(body.PartyA).toBe("254712345678");
    // 08:30 UTC → 11:30 EAT (UTC+3); Daraja timestamps are East Africa Time.
    expect(body.Timestamp).toBe("20260525113000");
    expect(body.TransactionType).toBe("CustomerPayBillOnline");
    expect(body.CallBackURL).toBe(config.callbackUrl);
    expect(body.AccountReference).toBe("wallet-1");
    // Password = base64(shortcode + passkey + timestamp).
    const expected = Buffer.from(`174379pk20260525113000`).toString("base64");
    expect(body.Password).toBe(expected);
    // Bearer token from the oauth step is attached.
    const headers = calls[1]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("rejects a non-zero Daraja ResponseCode as a failed charge", async () => {
    const { transport } = fakeTransport({
      MerchantRequestID: "mr-2",
      CheckoutRequestID: "ws_CO_err",
      ResponseCode: "1",
      ResponseDescription: "Insufficient funds",
    });
    const mpesa = createMpesaAdapter({ config, transport });
    const charge = await mpesa.stkPush({ amountKes: 500, phone: "+254712345678", accountRef: "w1" });
    expect(charge.status).toBe("failed");
    expect(charge.failureReason).toContain("Insufficient funds");
  });

  it("throws MpesaTransportError on a non-2xx stkpush HTTP response", async () => {
    const { transport } = fakeTransport({ errorMessage: "bad" }, { stkStatus: 500 });
    const mpesa = createMpesaAdapter({ config, transport });
    await expect(
      mpesa.stkPush({ amountKes: 500, phone: "+254712345678", accountRef: "w1" }),
    ).rejects.toBeInstanceOf(MpesaTransportError);
  });

  it("throws MpesaConfigError when required credentials are missing", () => {
    expect(() =>
      createMpesaAdapter({
        config: { ...config, consumerKey: "" },
        transport: vi.fn(),
      }),
    ).toThrow(MpesaConfigError);
  });

  it("normalises a 07… phone to the Daraja 2547… MSISDN", async () => {
    const { transport, calls } = fakeTransport(okStk);
    const mpesa = createMpesaAdapter({ config, transport, now: () => new Date("2026-05-25T08:30:00Z") });
    await mpesa.stkPush({ amountKes: 500, phone: "0712345678", accountRef: "w1" });
    const body = JSON.parse(String(calls[1]!.init.body)) as Record<string, unknown>;
    expect(body.PhoneNumber).toBe("254712345678");
  });
});
