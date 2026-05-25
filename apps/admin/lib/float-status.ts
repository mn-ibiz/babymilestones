/**
 * Float status read for the console header dot (P1-E10-S01 AC3, consuming the
 * P1-E06 float surface in `apps/api`). Framework-agnostic + dependency-free so
 * it unit-tests without a DOM and never pulls server-only code into the bundle.
 *
 * The API owns the health decision (it knows each float account's balance vs its
 * low-float threshold from P1-E06); this maps that response onto the three-state
 * `FloatStatus` the header dot renders. Any error/unreachable surface degrades to
 * `unknown` (rendered red) rather than falsely showing green.
 */
import type { FloatStatus } from "./nav.js";

/** The float-health summary shape the API returns. */
export interface FloatHealthResponse {
  /** True when no float account is below its low-float threshold. */
  healthy: boolean;
}

/** Default float-status endpoint on the API (P1-E06 surface). */
export const FLOAT_STATUS_URL = "/treasury/float-status";

/** Map an API float-health response onto the header's three-state status. */
export function floatStatusFromResponse(body: FloatHealthResponse | null | undefined): FloatStatus {
  if (!body) return "unknown";
  return body.healthy ? "ok" : "low";
}

/**
 * Fetch the current float status for the header dot. Never throws — an
 * unreachable or non-OK surface degrades to `unknown` (red dot) so a transient
 * API hiccup never paints a misleading green dot.
 */
export async function fetchFloatStatus(
  fetchImpl: typeof fetch = fetch,
  url: string = FLOAT_STATUS_URL,
): Promise<FloatStatus> {
  try {
    const res = await fetchImpl(url, { credentials: "include" });
    if (!res.ok) return "unknown";
    const body = (await res.json()) as FloatHealthResponse;
    return floatStatusFromResponse(body);
  } catch {
    return "unknown";
  }
}
