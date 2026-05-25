import { describe, expect, it } from "vitest";
import { appName, checkReadiness } from "./health.js";

describe("admin health (X8-S02)", () => {
  it("is named", () => {
    expect(appName).toBe("Admin");
  });

  it("readiness is ok when the upstream API liveness probe succeeds", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const result = await checkReadiness({ apiBaseUrl: "http://api.test", fetchImpl });
    expect(result).toEqual({ ready: true, checks: { api: "ok" } });
  });

  it("readiness fails when the API responds non-2xx", async () => {
    const fetchImpl = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const result = await checkReadiness({ apiBaseUrl: "http://api.test", fetchImpl });
    expect(result).toEqual({ ready: false, checks: { api: "fail" } });
  });

  it("readiness fails when the API is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await checkReadiness({ apiBaseUrl: "http://api.test", fetchImpl });
    expect(result).toEqual({ ready: false, checks: { api: "fail" } });
  });
});
