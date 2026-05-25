import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initPaystack,
  verifyPaystack,
  isTerminalState,
  validateAmount,
} from "./paystack-api";

describe("parent paystack-api (P1-E04-S04)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC1: validates the amount bounds", () => {
    expect(validateAmount(10)).toContain("Minimum");
    expect(validateAmount(2_000_000)).toContain("Maximum");
    expect(validateAmount(50.5)).toContain("whole number");
    expect(validateAmount(500)).toBeNull();
  });

  it("AC1/AC4: initializes a checkout, sends CSRF + saveCard, returns the hosted URL", async () => {
    const fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>> =
      vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            reference: "ref-1",
            authorizationUrl: "https://checkout.paystack.com/x",
            state: "INITIALIZED",
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await initPaystack(500, true, "csrf-token");
    expect(out.authorizationUrl).toBe("https://checkout.paystack.com/x");
    expect(out.reference).toBe("ref-1");
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-token");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({ amountKes: 500, saveCard: true });
  });

  it("throws on an init error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 502 })),
    );
    await expect(initPaystack(500, false, "t")).rejects.toThrow("nope");
  });

  it("AC2/AC3: verifies a transaction on redirect-back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ reference: "ref-1", state: "SUCCEEDED" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    expect(await verifyPaystack("ref-1")).toBe("SUCCEEDED");
  });

  it("recognises terminal states for polling", () => {
    expect(isTerminalState("SUCCEEDED")).toBe(true);
    expect(isTerminalState("FAILED")).toBe(true);
    expect(isTerminalState("ABANDONED")).toBe(true);
    expect(isTerminalState("INITIALIZED")).toBe(false);
  });
});
