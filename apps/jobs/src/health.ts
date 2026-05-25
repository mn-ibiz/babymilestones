import { createServer, type Server } from "node:http";

/**
 * A single readiness probe: resolves when the dependency is reachable, throws
 * when it is not. Injected/mockable so the worker never opens a real connection
 * from defaults and tests stay hermetic (X8-S02 AC1).
 */
export type ReadinessCheck = () => Promise<void>;

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, "ok" | "fail">;
}

function withTimeout(check: ReadinessCheck, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("readiness check timed out")), timeoutMs);
    check().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Run every readiness probe in parallel (each bounded by `timeoutMs`) and
 * collapse to an overall verdict with per-dependency detail. Mirrors the API's
 * readiness semantics so both surfaces behave identically (X8-S02).
 */
export async function evaluateReadiness(
  checks: Record<string, ReadinessCheck>,
  timeoutMs = 1000,
): Promise<ReadinessResult> {
  const entries = Object.entries(checks);
  const outcomes = await Promise.all(
    entries.map(async ([name, check]) => {
      try {
        await withTimeout(check, timeoutMs);
        return [name, "ok"] as const;
      } catch {
        return [name, "fail"] as const;
      }
    }),
  );
  const checkResults: Record<string, "ok" | "fail"> = {};
  for (const [name, status] of outcomes) checkResults[name] = status;
  return { ready: outcomes.every(([, status]) => status === "ok"), checks: checkResults };
}

export interface HealthServerOptions {
  /** Named readiness probes (e.g. `db`, `redis`) for `/health/ready`. */
  checks?: Record<string, ReadinessCheck>;
  /** Per-probe timeout in ms (AC2). Defaults to 1000ms. */
  timeoutMs?: number;
}

export interface HealthServer {
  /** Start listening; resolves with the bound port (pass 0 for an ephemeral port). */
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

function sendJson(
  reply: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  reply.writeHead(status, { "content-type": "application/json" });
  reply.end(payload);
}

/**
 * Minimal HTTP health surface for the jobs worker (which has no Fastify app):
 * `GET /health/live` (process-up) and `GET /health/ready` (dependency probes →
 * 503 on failure). Used by the orchestrator/load balancer to gate the worker.
 */
export function createHealthServer(opts: HealthServerOptions = {}): HealthServer {
  const checks = opts.checks ?? {};
  const timeoutMs = opts.timeoutMs ?? 1000;

  const server: Server = createServer((req, reply) => {
    const url = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && url === "/health/live") {
      sendJson(reply, 200, { status: "ok" });
      return;
    }
    if (req.method === "GET" && url === "/health/ready") {
      void evaluateReadiness(checks, timeoutMs).then((result) => {
        sendJson(reply, result.ready ? 200 : 503, {
          status: result.ready ? "ok" : "unavailable",
          checks: result.checks,
        });
      });
      return;
    }
    sendJson(reply, 404, { status: "not_found" });
  });

  return {
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
          const addr = server.address();
          const bound = typeof addr === "object" && addr ? addr.port : port;
          resolve(bound);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
