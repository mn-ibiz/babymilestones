import { afterEach, describe, expect, it, vi } from "vitest";
import { changePin, requestDataExport } from "./profile-api.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("requestDataExport (P1-E02-S05 AC1)", () => {
  it("POSTs to /parents/me/exports with the CSRF token and returns the queued state", async () => {
    vi.stubGlobal("document", { cookie: "bm_csrf=tok123" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exportId: "exp-1", status: "pending" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestDataExport();
    expect(res).toEqual({ exportId: "exp-1", status: "pending" });

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe("/parents/me/exports");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("tok123");
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) })),
    );
    await expect(requestDataExport()).rejects.toThrow("Unauthorized");
  });
});

describe("changePin (P1-E11-S04 AC3)", () => {
  it("PUTs to /parents/me/pin with the CSRF token and both PINs", async () => {
    vi.stubGlobal("document", { cookie: "bm_csrf=tok123" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await changePin({ currentPin: "1357", newPin: "8642" });

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe("/parents/me/pin");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("tok123");
    expect(JSON.parse(init.body as string)).toEqual({ currentPin: "1357", newPin: "8642" });
  });

  it("throws the server error message on a wrong current PIN", async () => {
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Current PIN is incorrect" }),
      })),
    );
    await expect(changePin({ currentPin: "0000", newPin: "8642" })).rejects.toThrow(
      "Current PIN is incorrect",
    );
  });
});
