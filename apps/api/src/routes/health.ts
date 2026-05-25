import type { FastifyInstance } from "fastify";

/**
 * A single readiness probe. Resolves when the dependency is reachable; throws
 * (or rejects) when it is not. Probes are injected/mockable so tests never touch
 * real infra and apps wire only the dependencies they actually use (X8-S02 AC1).
 */
export type ReadinessCheck = () => Promise<void>;

export interface HealthRoutesOptions {
  /**
   * Named readiness probes (e.g. `db`, `redis`). The readiness endpoint runs
   * them in parallel and reports per-dependency status. An empty map means the
   * app has no external dependencies — readiness then mirrors liveness.
   */
  checks?: Record<string, ReadinessCheck>;
  /**
   * Per-probe timeout in ms (AC2: cheap probes, short ping timeouts). A probe
   * that exceeds this is reported as failing rather than blocking the response.
   * Defaults to 1000ms.
   */
  timeoutMs?: number;
}

/** Result of running the readiness probes: overall verdict + per-dep detail. */
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
 * Run every readiness probe (in parallel, each bounded by `timeoutMs`) and
 * collapse the results into an overall verdict. Shared so any app — the Fastify
 * API, the jobs worker, or a Next route handler — gets identical semantics.
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
  const result: Record<string, "ok" | "fail"> = {};
  for (const [name, status] of outcomes) result[name] = status;
  return { ready: outcomes.every(([, status]) => status === "ok"), checks: result };
}

/**
 * Register the standard health surface on a Fastify instance (X8-S02):
 * - `GET /health/live`  — liveness: process is up, no I/O.
 * - `GET /health/ready` — readiness: every injected dependency is reachable;
 *   503 with per-dependency detail when any probe fails or times out.
 */
export function registerHealthRoutes(app: FastifyInstance, opts: HealthRoutesOptions = {}): void {
  const checks = opts.checks ?? {};
  const timeoutMs = opts.timeoutMs ?? 1000;

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_req, reply) => {
    const result = await evaluateReadiness(checks, timeoutMs);
    reply.status(result.ready ? 200 : 503);
    return { status: result.ready ? "ok" : "unavailable", checks: result.checks };
  });
}
