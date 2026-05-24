import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDataExport } from "./profile-api.js";

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
