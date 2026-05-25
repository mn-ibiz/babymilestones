import { describe, expect, it } from "vitest";
import { evaluateReadiness, createHealthServer } from "./health.js";

describe("jobs health (X8-S02)", () => {
  it("evaluateReadiness reports ok when every probe resolves", async () => {
    const result = await evaluateReadiness({ db: async () => {}, redis: async () => {} });
    expect(result).toEqual({ ready: true, checks: { db: "ok", redis: "ok" } });
  });

  it("evaluateReadiness reports the failing probe", async () => {
    const result = await evaluateReadiness({
      db: async () => {
        throw new Error("down");
      },
      redis: async () => {},
    });
    expect(result).toEqual({ ready: false, checks: { db: "fail", redis: "ok" } });
  });

  it("evaluateReadiness bounds a hanging probe by the timeout", async () => {
    const result = await evaluateReadiness({ db: () => new Promise<void>(() => {}) }, 20);
    expect(result).toEqual({ ready: false, checks: { db: "fail" } });
  });

  it("health server serves /health/live and /health/ready over HTTP", async () => {
    const server = createHealthServer({ checks: { db: async () => {} } });
    const port = await server.listen(0);
    try {
      const live = await fetch(`http://127.0.0.1:${port}/health/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: "ok" });

      const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: "ok", checks: { db: "ok" } });
    } finally {
      await server.close();
    }
  });

  it("health server returns 503 from /health/ready when a probe fails", async () => {
    const server = createHealthServer({
      checks: {
        db: async () => {
          throw new Error("db down");
        },
      },
    });
    const port = await server.listen(0);
    try {
      const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: "unavailable", checks: { db: "fail" } });
    } finally {
      await server.close();
    }
  });

  it("unknown paths 404 on the health server", async () => {
    const server = createHealthServer({ checks: {} });
    const port = await server.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/nope`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
