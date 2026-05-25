import { describe, expect, it } from "vitest";
import {
  createPaystackAdapter,
  PaystackConfigError,
  PaystackTransportError,
} from "./paystack.js";
import type { PaystackTransport } from "./paystack.js";

/** Full, valid Paystack config — secret key comes from env in production, never DB. */
const config = {
  baseUrl: "https://api.paystack.co",
  secretKey: "sk_test_abc",
  callbackUrl: "https://app.babymilestones.co.ke/top-up/paystack/return",
} as const;

/** A transport that records calls and returns canned init/verify responses. */
function fakeTransport(
  body: unknown,
  opts: { status?: number } = {},
): { transport: PaystackTransport; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport: PaystackTransport = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status: opts.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, calls };
}

const okInit = {
  status: true,
  message: "Authorization URL created",
  data: {
    authorization_url: "https://checkout.paystack.com/abc123",
    access_code: "ac_abc123",
    reference: "ref-from-server",
  },
};

const okVerifySuccess = {
  status: true,
  message: "Verification successful",
  data: {
    status: "success",
    reference: "ref-1",
    amount: 50_000,
    currency: "KES",
    authorization: {
      authorization_code: "AUTH_xyz",
      reusable: true,
      last4: "4081",
      card_type: "visa",
    },
  },
};

describe("Paystack adapter (P1-E04-S04)", () => {
  it("throws on missing config", () => {
    expect(() =>
      createPaystackAdapter({
        config: { baseUrl: "", secretKey: "", callbackUrl: "" },
        transport: async () => new Response("{}"),
      }),
    ).toThrow(PaystackConfigError);
  });

  it("init: posts to transaction/initialize with email, amount (minor), reference; returns a pending charge", async () => {
    const { transport, calls } = fakeTransport(okInit);
    const paystack = createPaystackAdapter({ config, transport });

    const charge = await paystack.init({
      email: "parent@example.com",
      amount: 50_000,
      reference: "ref-1",
    });

    expect(charge.provider).toBe("paystack");
    expect(charge.status).toBe("pending");
    expect(charge.reference).toBe("ref-1");
    expect(charge.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(charge.accessCode).toBe("ac_abc123");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/initialize");
    const sent = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(sent.email).toBe("parent@example.com");
    expect(sent.amount).toBe(50_000);
    expect(sent.reference).toBe("ref-1");
    expect(sent.callback_url).toBe(config.callbackUrl);
    // Server-only secret key carried as Bearer auth.
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_abc");
  });

  it("init: card-on-file passes the saved authorization_code for a repeat top-up", async () => {
    const { transport, calls } = fakeTransport(okInit);
    const paystack = createPaystackAdapter({ config, transport });

    await paystack.init({
      email: "parent@example.com",
      amount: 50_000,
      reference: "ref-2",
      authorizationCode: "AUTH_saved",
    });

    const sent = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(sent.authorization_code).toBe("AUTH_saved");
  });

  it("init: returns a failed charge when Paystack reports status:false", async () => {
    const { transport } = fakeTransport({ status: false, message: "Invalid key" });
    const paystack = createPaystackAdapter({ config, transport });
    const charge = await paystack.init({
      email: "p@example.com",
      amount: 50_000,
      reference: "ref-x",
    });
    expect(charge.status).toBe("failed");
    expect(charge.failureReason).toBe("Invalid key");
  });

  it("init: throws PaystackTransportError on a non-2xx HTTP response", async () => {
    const { transport } = fakeTransport({ status: false }, { status: 503 });
    const paystack = createPaystackAdapter({ config, transport });
    await expect(
      paystack.init({ email: "p@example.com", amount: 50_000, reference: "r" }),
    ).rejects.toBeInstanceOf(PaystackTransportError);
  });

  it("verify: maps a successful transaction (returns authorization for card-on-file)", async () => {
    const { transport, calls } = fakeTransport(okVerifySuccess);
    const paystack = createPaystackAdapter({ config, transport });

    const result = await paystack.verify({ reference: "ref-1" });

    expect(result.provider).toBe("paystack");
    expect(result.status).toBe("success");
    expect(result.reference).toBe("ref-1");
    expect(result.amount).toBe(50_000);
    expect(result.authorization?.authorizationCode).toBe("AUTH_xyz");
    expect(result.authorization?.reusable).toBe(true);
    expect(result.authorization?.last4).toBe("4081");

    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/verify/ref-1");
    expect(String(calls[0]!.init.method).toUpperCase()).toBe("GET");
  });

  it("verify: maps a failed transaction status to failed", async () => {
    const { transport } = fakeTransport({
      status: true,
      data: { status: "failed", reference: "ref-3", amount: 50_000 },
    });
    const paystack = createPaystackAdapter({ config, transport });
    const result = await paystack.verify({ reference: "ref-3" });
    expect(result.status).toBe("failed");
  });

  it("verify: treats an in-progress (abandoned/ongoing) transaction as pending", async () => {
    const { transport } = fakeTransport({
      status: true,
      data: { status: "ongoing", reference: "ref-4", amount: 50_000 },
    });
    const paystack = createPaystackAdapter({ config, transport });
    const result = await paystack.verify({ reference: "ref-4" });
    expect(result.status).toBe("pending");
  });

  it("verify: url-encodes the reference", async () => {
    const { transport, calls } = fakeTransport(okVerifySuccess);
    const paystack = createPaystackAdapter({ config, transport });
    await paystack.verify({ reference: "ref/with space" });
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/verify/ref%2Fwith%20space");
  });
});
