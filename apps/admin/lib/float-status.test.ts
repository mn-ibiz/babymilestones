import { describe, expect, it, vi } from "vitest";
import { fetchFloatStatus, floatStatusFromResponse } from "./float-status.js";

describe("floatStatusFromResponse (AC3)", () => {
  it("maps healthy → ok and unhealthy → low", () => {
    expect(floatStatusFromResponse({ healthy: true })).toBe("ok");
    expect(floatStatusFromResponse({ healthy: false })).toBe("low");
  });
  it("maps a missing body → unknown", () => {
    expect(floatStatusFromResponse(null)).toBe("unknown");
    expect(floatStatusFromResponse(undefined)).toBe("unknown");
  });
});

describe("fetchFloatStatus (AC3 — degrade safely, never false-green)", () => {
  it("returns ok when the API reports healthy", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ healthy: true }) }) as Response);
    expect(await fetchFloatStatus(f)).toBe("ok");
  });

  it("returns low when the API reports unhealthy", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ healthy: false }) }) as Response);
    expect(await fetchFloatStatus(f)).toBe("low");
  });

  it("degrades to unknown on a non-OK response", async () => {
    const f = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response);
    expect(await fetchFloatStatus(f)).toBe("unknown");
  });

  it("degrades to unknown when the fetch throws", async () => {
    const f = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await fetchFloatStatus(f as unknown as typeof fetch)).toBe("unknown");
  });
});
