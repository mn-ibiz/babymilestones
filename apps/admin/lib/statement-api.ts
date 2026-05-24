/**
 * Wallet statement (CSV) download client for the admin Reception screen
 * (P1-E03-S08). Framework-agnostic + dependency-free so it unit-tests without a
 * DOM and never pulls server-only code into the Next bundle. The parent header
 * consumes this to export a GIVEN parent's statement (AC2); the server re-checks
 * `read wallet` and rejects parents on the by-id route.
 */

export interface StatementWindow {
  /** `YYYY-MM-DD` (inclusive). */
  from: string;
  /** `YYYY-MM-DD` (inclusive). */
  to: string;
}

export interface StatementPending {
  status: "pending";
  from: string;
  to: string;
}

export type StatementResult =
  | { kind: "csv"; csv: string; filename: string }
  | { kind: "pending"; pending: StatementPending };

/** Build the by-id statement URL for a given parent userId (staff surface). */
export function statementUrl(userId: string, window: StatementWindow): string {
  const qs = new URLSearchParams({ from: window.from, to: window.to });
  return `/parents/${userId}/statement?${qs.toString()}`;
}

/**
 * Download a given parent's wallet statement from Reception (AC1/AC2). Returns
 * CSV text for sync ranges (≤ 12 months) or a pending handle for async ranges
 * (AC3).
 */
export async function downloadStatement(
  userId: string,
  window: StatementWindow,
): Promise<StatementResult> {
  const res = await fetch(statementUrl(userId, window), { credentials: "include" });
  if (res.status === 202) {
    return { kind: "pending", pending: (await res.json()) as StatementPending };
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to download statement (${res.status})`);
  }
  const csv = await res.text();
  return {
    kind: "csv",
    csv,
    filename: `wallet-statement-${userId}-${window.from}_${window.to}.csv`,
  };
}
