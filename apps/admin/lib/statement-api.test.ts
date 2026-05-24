import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadStatement, statementUrl } from "./statement-api";

describe("admin reception statement-api (P1-E03-S08)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the by-id statement URL for a given parent", () => {
    expect(statementUrl("u-123", { from: "2026-01-01", to: "2026-12-31" })).toBe(
      "/parents/u-123/statement?from=2026-01-01&to=2026-12-31",
    );
  });

  it("returns CSV text for a sync (200) response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("timestamp,kind\r\n", { status: 200 })),
    );
    const out = await downloadStatement("u-123", { from: "2026-01-01", to: "2026-12-31" });
    expect(out.kind).toBe("csv");
    if (out.kind === "csv") expect(out.filename).toContain("u-123");
  });

  it("returns a pending handle for an async (202) response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "pending", from: "a", to: "b" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const out = await downloadStatement("u-123", { from: "2024-01-01", to: "2026-06-01" });
    expect(out.kind).toBe("pending");
  });

  it("throws on a 403 (parent traversal blocked server-side)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })),
    );
    await expect(
      downloadStatement("u-999", { from: "2026-01-01", to: "2026-12-31" }),
    ).rejects.toThrow("Forbidden");
  });
});
