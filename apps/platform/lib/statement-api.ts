/**
 * Wallet statement (CSV) download client for the parent dashboard (P1-E03-S08).
 * Framework-agnostic + dependency-free so it unit-tests without a DOM and never
 * pulls server-only code into the Next bundle. The wallet page consumes this to
 * build the download request for the authed parent's OWN statement (AC2).
 */

/** An inclusive date-range window for a statement export. */
export interface StatementWindow {
  /** `YYYY-MM-DD` (inclusive). */
  from: string;
  /** `YYYY-MM-DD` (inclusive). */
  to: string;
}

/** A long range (> 12 months) is generated asynchronously by the API (AC3). */
export interface StatementPending {
  status: "pending";
  from: string;
  to: string;
}

export type StatementResult =
  | { kind: "csv"; csv: string; filename: string }
  | { kind: "pending"; pending: StatementPending };

/** Build the authed parent's own-statement URL (wallet from the session). */
export function statementUrl(window: StatementWindow): string {
  const qs = new URLSearchParams({ from: window.from, to: window.to });
  return `/parents/me/statement?${qs.toString()}`;
}

/**
 * Download the authed parent's wallet statement (AC1/AC2). Returns the CSV text
 * for sync ranges (≤ 12 months) or a pending handle for async ranges (AC3).
 */
export async function downloadStatement(window: StatementWindow): Promise<StatementResult> {
  const res = await fetch(statementUrl(window), { credentials: "include" });
  if (res.status === 202) {
    return { kind: "pending", pending: (await res.json()) as StatementPending };
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to download statement (${res.status})`);
  }
  const csv = await res.text();
  return { kind: "csv", csv, filename: `wallet-statement-${window.from}_${window.to}.csv` };
}
