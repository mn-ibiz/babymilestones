import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStkStatus,
  initiateStkPush,
  isTerminalState,
  validateAmount,
  STK_PROGRESS_SECONDS,
} from "./mpesa-api";

describe("parent mpesa-api (P1-E04-S01)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC1: validates the amount bounds", () => {
    expect(validateAmount(10)).toContain("Minimum");
    expect(validateAmount(80_000)).toContain("Maximum");
    expect(validateAmount(50.5)).toContain("whole number");
    expect(validateAmount(500)).toBeNull();
  });

  it("AC3: exposes the 90-second progress window", () => {
    expect(STK_PROGRESS_SECONDS).toBe(90);
  });

  it("AC2: initiates an STK push and returns the checkout handle", async () => {
    const fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>> =
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ checkoutRequestId: "ws_CO_1", state: "STK_SENT" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const out = await initiateStkPush(500, "csrf-token");
    expect(out).toEqual({ checkoutRequestId: "ws_CO_1", state: "STK_SENT" });
    // Sends the CSRF header + credentials.
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-token");
    expect(init.credentials).toBe("include");
  });

  it("throws on an initiate error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 502 })),
    );
    await expect(initiateStkPush(500, "t")).rejects.toThrow("nope");
  });

  it("AC4: fetches the current STK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ checkoutRequestId: "ws_CO_1", state: "STK_SENT" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    expect(await fetchStkStatus("ws_CO_1")).toBe("STK_SENT");
  });

  it("recognises terminal states for polling", () => {
    expect(isTerminalState("SUCCEEDED")).toBe(true);
    expect(isTerminalState("FAILED")).toBe(true);
    expect(isTerminalState("STK_SENT")).toBe(false);
    expect(isTerminalState("CALLBACK_PENDING")).toBe(false);
  });
});
