/**
 * Server-side route enforcement (P1-E10-S01 AC2). Thin Next wrapper over the
 * pure `guardRoute` predicate: resolve the API-attested principal, and on denial
 * short-circuit to the 403 `/forbidden` view. Kept separate from `lib/guard.ts`
 * so the predicate stays pure + unit-testable; this file is the only place that
 * touches `next/navigation` + `next/headers`.
 *
 * Usage in a gated server component (page or segment layout):
 *   await enforceRoute("/staff");
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guardRoute, FORBIDDEN_PATH } from "./guard.js";
import { resolvePrincipal } from "./session-context.js";

/**
 * Enforce that the signed-in principal may access `path`. Redirects to the 403
 * page on denial; returns the resolved role on success. The API re-authorizes
 * every action regardless — this is the render-time gate.
 */
export async function enforceRoute(path: string): Promise<string> {
  const principal = resolvePrincipal(await headers());
  const role = principal?.role ?? "";
  const outcome = guardRoute(role, path);
  if (!outcome.ok) {
    redirect(FORBIDDEN_PATH);
  }
  return role;
}
