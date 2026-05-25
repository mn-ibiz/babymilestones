/**
 * Health/readiness helpers for the Next parent app (X8-S02).
 *
 * Liveness is process-up (the route handler simply returns ok). Readiness for a
 * Next surface means its single upstream dependency — the API — is reachable;
 * the app holds no DB/Redis connection of its own, so it probes the API's own
 * liveness endpoint. `fetchImpl` is injected so this is unit-testable without a
 * running server or Next runtime.
 */
/** Stable surface name, surfaced in logs/probes. */
export const appName = "Platform";

export interface ReadinessOptions {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, "ok" | "fail">;
}

export async function checkReadiness(opts: ReadinessOptions = {}): Promise<ReadinessResult> {
  const base = opts.apiBaseUrl ?? process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let api: "ok" | "fail" = "fail";
  try {
    const res = await fetchImpl(`${base}/health/live`, { signal: controller.signal });
    api = res.ok ? "ok" : "fail";
  } catch {
    api = "fail";
  } finally {
    clearTimeout(timer);
  }
  return { ready: api === "ok", checks: { api } };
}
