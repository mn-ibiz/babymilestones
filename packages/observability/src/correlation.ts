import { randomUUID } from "node:crypto";

/** Canonical header carrying the request/correlation id across services. */
export const CORRELATION_ID_HEADER = "x-correlation-id" as const;

/** Generate a fresh correlation id (UUID v4). */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Resolve a correlation id from an inbound header value, falling back to a
 * freshly generated one. Accepts the raw Node header shape (string | string[] |
 * undefined) so it can be wired straight into a request hook.
 */
export function resolveCorrelationId(
  inbound: string | string[] | undefined,
): string {
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  if (typeof value === "string" && value.trim() !== "") return value;
  return generateCorrelationId();
}
