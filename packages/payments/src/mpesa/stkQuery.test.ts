import { describe, expect, it } from "vitest";
import { createMpesaAdapter } from "./stkPush.js";
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

/**
 * Transport that records calls and returns canned token + stkpushquery responses.
 * The query endpoint is `/mpesa/stkpushquery/v1/query`.
 */
function fakeTransport(
  queryResponse: unknown,
  opts: { tokenStatus?: number; queryStatus?: number } = {},
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
    return new Response(JSON.stringify(queryResponse), {
      status: opts.queryStatus ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, calls };
}

describe("M-Pesa stkQuery adapter (P1-E04-S03)", () => {
  it("maps a paid query (ResultCode '0') to a success result", async () => {
    const { transport, calls } = fakeTransport({
      ResponseCode: "0",
      ResponseDescription: "The service request has been accepted successfully",
      MerchantRequestID: "mr-1",
      CheckoutRequestID: "ws_CO_123",
      ResultCode: "0",
      ResultDesc: "The service request is processed successfully.",
    });
    const mpesa = createMpesaAdapter({
      config,
      transport,
      now: () => new Date("2026-05-25T08:30:00Z"),
    });

    const result = await mpesa.stkQuery({ checkoutRequestId: "ws_CO_123" });

    expect(result.status).toBe("success");
    expect(result.checkoutRequestId).toBe("ws_CO_123");
    expect(result.resultCode).toBe(0);
    // Hit the query endpoint (not the push endpoint), with the checkout id in the body.
    const queryCall = calls.find((c) => c.url.includes("/stkpushquery/"));
    expect(queryCall).toBeDefined();
    expect(String(queryCall?.init.body)).toContain("ws_CO_123");
  });

  it("maps a cancelled/failed query (non-zero ResultCode) to a failed result", async () => {
    const { transport } = fakeTransport({
      ResponseCode: "0",
      ResponseDescription: "The service request has been accepted successfully",
      MerchantRequestID: "mr-1",
      CheckoutRequestID: "ws_CO_123",
      ResultCode: "1032",
      ResultDesc: "Request cancelled by user",
    });
    const mpesa = createMpesaAdapter({ config, transport });

    const result = await mpesa.stkQuery({ checkoutRequestId: "ws_CO_123" });

    expect(result.status).toBe("failed");
    expect(result.resultCode).toBe(1032);
    expect(result.resultDesc).toBe("Request cancelled by user");
  });

  it("maps the still-processing query (ResultCode '1037'/'1032' pending semantics) to pending when the transaction is not yet resolved", async () => {
    // Daraja returns ResponseCode != "0" while the STK is still being processed
    // (e.g. "The transaction is being processed"). Treat as pending → retry later.
    const { transport } = fakeTransport({
      ResponseCode: "500.001.1001",
      ResponseDescription: "The transaction is being processed",
      errorCode: "500.001.1001",
      errorMessage: "The transaction is being processed",
    });
    const mpesa = createMpesaAdapter({ config, transport });

    const result = await mpesa.stkQuery({ checkoutRequestId: "ws_CO_123" });

    expect(result.status).toBe("pending");
  });

  it("throws MpesaTransportError on a non-200 query HTTP status", async () => {
    const { transport } = fakeTransport({}, { queryStatus: 503 });
    const mpesa = createMpesaAdapter({ config, transport });

    await expect(mpesa.stkQuery({ checkoutRequestId: "ws_CO_123" })).rejects.toThrow();
  });
});
