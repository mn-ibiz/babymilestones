/** @bm/wallet — wallet statement (CSV) generation (P1-E03-S08).
 *
 *  A statement is the chronological list of `wallet_ledger` postings for one
 *  wallet over a date range, rendered as CSV. The balance-after column is
 *  derived from the running ledger total (consistent with P1-E03-S02 — balance
 *  is computed, never stored), seeded by the balance of all postings strictly
 *  *before* the range start so the first row in a windowed statement still
 *  shows the correct cumulative balance. Amounts are integer cents, formatted
 *  consistently to KES (two decimals). */
import type { Database, Transaction } from "@bm/db";
import { walletLedger } from "@bm/db";
import { and, asc, eq, gte, lte, lt, sql } from "drizzle-orm";
import type { Cents } from "./index.js";

/** A drizzle handle that can read the ledger (the pooled db or a transaction). */
type LedgerReader = Database | Transaction;

/** The CSV column order (AC1). Stable — tests assert this exact header. */
export const STATEMENT_COLUMNS = [
  "timestamp",
  "kind",
  "direction",
  "amount",
  "balance after",
  "reference",
] as const;

/** Inclusive date-range window for a statement. */
export interface StatementRange {
  /** Start of the window (inclusive). */
  from: Date;
  /** End of the window (inclusive). */
  to: Date;
}

export interface StatementInput {
  walletId: string;
  range: StatementRange;
}

/** The sync/async cutoff (AC3): ranges spanning more than this go async. */
export const SYNC_RANGE_MAX_MONTHS = 12;

/**
 * Format integer cents as a KES amount string with two decimals (e.g.
 * `150000` → `"1500.00"`, `-50000` → `"-500.00"`). No thousands separators or
 * currency symbol so the value is machine-parseable in the CSV.
 */
export function formatCents(amount: Cents): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = `${whole}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Escape a single CSV field per RFC 4180 (quote if it contains , " or newline) and
 * neutralise spreadsheet formula injection: a cell starting with `= + - @` (or a
 * leading tab/CR) is prefixed with a single quote, except plain numbers (incl.
 * signed money like `-500.00`) so numeric columns are not corrupted.
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) && !/^[+-]?\d/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * True when the range spans MORE than {@link SYNC_RANGE_MAX_MONTHS} months and
 * must therefore be generated asynchronously (AC3). The boundary is computed by
 * advancing `from` by exactly the max months: anything at or before that
 * instant is sync, anything strictly after is async.
 */
export function isAsyncRange(range: StatementRange): boolean {
  const cutoff = new Date(range.from);
  cutoff.setMonth(cutoff.getMonth() + SYNC_RANGE_MAX_MONTHS);
  return range.to.getTime() > cutoff.getTime();
}

/**
 * Generate the CSV statement for a wallet over a date range (AC1).
 *
 * Rows are ordered chronologically (oldest first), then by `id` to make ties
 * deterministic. The `balance after` column is the running cumulative balance
 * including every posting up to and including that row — seeded by the wallet's
 * balance strictly before `range.from` so a windowed statement is still
 * consistent with the full ledger. An empty window yields a header-only CSV.
 */
export async function generateStatementCsv(
  db: LedgerReader,
  input: StatementInput,
): Promise<string> {
  const { walletId, range } = input;

  // Seed the running balance with everything strictly before the window start.
  const [seedRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)` })
    .from(walletLedger)
    .where(and(eq(walletLedger.walletId, walletId), lt(walletLedger.createdAt, range.from)));
  let running = Number(seedRow?.total ?? 0);

  const rows = await db
    .select()
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.walletId, walletId),
        gte(walletLedger.createdAt, range.from),
        lte(walletLedger.createdAt, range.to),
      ),
    )
    .orderBy(asc(walletLedger.createdAt), asc(walletLedger.id));

  const lines: string[] = [STATEMENT_COLUMNS.map(csvField).join(",")];
  for (const row of rows) {
    running += row.amount;
    lines.push(
      [
        row.createdAt.toISOString(),
        row.kind,
        row.direction,
        formatCents(row.amount),
        formatCents(running),
        row.source,
      ]
        .map(csvField)
        .join(","),
    );
  }
  // Trailing newline so the file is POSIX-clean and ends each record.
  return lines.join("\r\n") + "\r\n";
}
