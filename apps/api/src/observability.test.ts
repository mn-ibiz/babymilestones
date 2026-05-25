import { describe, expect, it } from "vitest";
import { InMemoryErrorTracker, CORRELATION_ID_HEADER } from "@bm/observability";
import { buildApp } from "./app.js";

/** Sink that parses each pino JSON line written by the app logger. */
function makeLogSink() {
  const lines: Array<Record<string, unknown>> = [];
  return {
    lines,
    stream: {
      write(chunk: string) {
        for (const raw of chunk.split("\n")) {
          if (raw.trim() === "") continue;
          lines.push(JSON.parse(raw) as Record<string, unknown>);
        }
      },
    },
  };
}

describe("API observability wiring", () => {
  it("emits structured JSON request logs carrying a correlation id", async () => {
    const sink = makeLogSink();
    const app = buildApp({ logStream: sink.stream, logLevel: "info" });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);

    const cid = res.headers[CORRELATION_ID_HEADER];
    expect(typeof cid).toBe("string");
    expect((cid as string).length).toBeGreaterThan(0);

    // Every log line is JSON and request-scoped lines carry the correlation id.
    expect(sink.lines.length).toBeGreaterThan(0);
    const withCid = sink.lines.filter((l) => l.correlationId === cid);
    expect(withCid.length).toBeGreaterThan(0);
    expect(sink.lines.every((l) => typeof l.level === "number")).toBe(true);
    await app.close();
  });

  it("reuses an inbound correlation id from the request header", async () => {
    const sink = makeLogSink();
    const app = buildApp({ logStream: sink.stream });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { [CORRELATION_ID_HEADER]: "inbound-cid-123" },
    });
    expect(res.headers[CORRELATION_ID_HEADER]).toBe("inbound-cid-123");
    await app.close();
  });

  it("captures thrown route errors in the error tracker tagged with the correlation id", async () => {
    const tracker = new InMemoryErrorTracker();
    const app = buildApp({ errorTracker: tracker });
    app.get("/__boom", async () => {
      throw new Error("kaboom");
    });
    const res = await app.inject({
      method: "GET",
      url: "/__boom",
      headers: { [CORRELATION_ID_HEADER]: "err-cid" },
    });
    expect(res.statusCode).toBe(500);
    expect(tracker.events).toHaveLength(1);
    const event = tracker.events[0]!;
    expect((event.error as Error).message).toBe("kaboom");
    expect(event.context?.correlationId).toBe("err-cid");
    await app.close();
  });

  it("does not leak secrets/PINs into logs", async () => {
    const sink = makeLogSink();
    const app = buildApp({ logStream: sink.stream });
    await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { authorization: "Bearer super-secret-token", "x-pin": "1234" },
    });
    const dump = JSON.stringify(sink.lines);
    expect(dump).not.toContain("super-secret-token");
    await app.close();
  });
});
