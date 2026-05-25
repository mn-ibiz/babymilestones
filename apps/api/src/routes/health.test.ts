import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { buildApp, type AppDeps } from "../app.js";
import { registerHealthRoutes } from "./health.js";

describe("API health endpoints (X8-S02)", () => {
  it("liveness /health/live returns ok with no I/O", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("keeps the legacy /healthz liveness probe", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("readiness /health/ready returns 200 when every dependency is reachable", async () => {
    const app = Fastify();
    registerHealthRoutes(app, {
      checks: {
        db: async () => {},
        redis: async () => {},
      },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      checks: { db: "ok", redis: "ok" },
    });
    await app.close();
  });

  it("readiness returns 503 and names the failing dependency when a check throws", async () => {
    const app = Fastify();
    registerHealthRoutes(app, {
      checks: {
        db: async () => {
          throw new Error("connection refused");
        },
        redis: async () => {},
      },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "unavailable",
      checks: { db: "fail", redis: "ok" },
    });
    await app.close();
  });

  it("readiness without any dependency wiring reports ok (process-only app)", async () => {
    const app = Fastify();
    registerHealthRoutes(app, { checks: {} });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: {} });
    await app.close();
  });

  it("a check that hangs is bounded by the readiness timeout and reports fail", async () => {
    const app = Fastify();
    registerHealthRoutes(app, {
      timeoutMs: 20,
      checks: {
        db: () => new Promise<void>(() => {}),
      },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable", checks: { db: "fail" } });
    await app.close();
  });

  it("buildApp wires a real DB readiness check that passes when the query succeeds", async () => {
    const fakeDb = {
      execute: async () => ({ rows: [{ "?column?": 1 }] }),
    } as unknown as AppDeps["db"];
    const app = buildApp({ db: fakeDb });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.db).toBe("ok");
    await app.close();
  });

  it("buildApp readiness reports 503 when the DB probe query fails", async () => {
    const fakeDb = {
      execute: async () => {
        throw new Error("db down");
      },
    } as unknown as AppDeps["db"];
    const app = buildApp({ db: fakeDb });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.db).toBe("fail");
    await app.close();
  });

  it("readiness probe stays well within the p95 latency budget", async () => {
    const app = buildApp();
    const start = performance.now();
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    const elapsed = performance.now() - start;
    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(100);
    await app.close();
  });
});
