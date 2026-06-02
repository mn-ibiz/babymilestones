import { eq, sql } from "drizzle-orm";
import { parents, wallets, walletLedger } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateCohortRetention,
  type CohortParentRow,
  type CohortRetentionMatrix,
} from "./cohort-retention.js";

/**
 * Story 35.2 — DB read behind the cohort-retention matrix. A thin projection:
 *
 *  - SIGNUP month comes from `parents.created_at` (the signup instant), bucketed to
 *    its UTC calendar month (`YYYY-MM`); only parents whose signup month falls in the
 *    selected `[fromMonth, toMonth]` cohort range are loaded.
 *  - the ACTIVE-month set (AC2) is derived from each parent's PAID TOUCHPOINTS. The
 *    DEFAULT touchpoint signal is a wallet `debit` ledger entry — real money spent on
 *    a service, joined to the parent through `wallets.user_id`. Each debit's
 *    `created_at` is bucketed to its UTC calendar month; the distinct set of those
 *    months is the parent's active set. The signal is overridable via
 *    {@link LoadCohortRetentionOpts.activeSignal} so the "active" definition can be
 *    swapped (e.g. completed bookings, settled invoices) without changing the matrix.
 *
 * Both projections are handed to the pure {@link aggregateCohortRetention} reducer.
 * Read-only — not audited.
 *
 * Month bucketing is done in JS over the loaded `created_at` instants (UTC), the same
 * approach the peak-hours heatmap uses for its time buckets — keeping the month math
 * identical to the reducer and dialect-independent under the PGlite test harness.
 */
export interface LoadCohortRetentionOpts {
  /** Inclusive lower bound of signup-month cohorts (`YYYY-MM`). */
  fromMonth: string;
  /** Inclusive upper bound of signup-month cohorts (`YYYY-MM`). */
  toMonth: string;
  /**
   * The last fully-observable calendar month (`YYYY-MM`). Defaults to the current
   * UTC month. Offsets whose calendar month exceeds this are omitted so the current
   * partial month is never over-counted (AC1).
   */
  asOfMonth?: string;
  /**
   * Override for the "active" / paid-touchpoint signal (AC2). Given the same opts,
   * returns one row per (parentId, activeMonth) — the calendar months in which each
   * parent had a paid touchpoint. Defaults to {@link loadWalletDebitActiveMonths}
   * (wallet `debit` entries).
   */
  activeSignal?: (
    db: Executor,
    opts: LoadCohortRetentionOpts,
  ) => Promise<{ parentId: string; activeMonth: string }[]>;
}

/** A `Date` → its UTC calendar month, `YYYY-MM`. */
function toMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** The current UTC calendar month, `YYYY-MM`. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Default "active" signal (AC2): every wallet `debit` ledger entry, joined to its
 * parent via `wallets.user_id` → `parents.user_id`, projected to the parent id + the
 * debit's UTC calendar month. A debit is the canonical "a parent paid for a
 * touchpoint" event (money spent on a service); top-ups / refunds / adjustments are
 * NOT debits and so never mark a month active. Read-only.
 */
export async function loadWalletDebitActiveMonths(
  db: Executor,
  _opts: LoadCohortRetentionOpts,
): Promise<{ parentId: string; activeMonth: string }[]> {
  const rows = await db
    .select({ parentId: parents.id, createdAt: walletLedger.createdAt })
    .from(walletLedger)
    .innerJoin(wallets, eq(walletLedger.walletId, wallets.id))
    .innerJoin(parents, eq(wallets.userId, parents.userId))
    .where(sql`${walletLedger.direction} = 'debit' AND ${walletLedger.kind} = 'debit'`);

  return rows.map((r) => ({ parentId: r.parentId, activeMonth: toMonth(r.createdAt) }));
}

/**
 * Load the cohort-retention matrix for the selected signup-month range (AC1/AC2).
 * Loads in-range parents' signup months + each parent's paid-touchpoint months (the
 * default wallet-debit signal, or a supplied override), then delegates the matrix
 * math to the pure {@link aggregateCohortRetention}. Read-only — no audit.
 */
export async function loadCohortRetention(
  db: Executor,
  opts: LoadCohortRetentionOpts,
): Promise<CohortRetentionMatrix> {
  const asOfMonth = opts.asOfMonth ?? currentMonth();

  // Parents whose signup month falls in the cohort range. Filtered in SQL on the
  // UTC month boundaries `[fromMonth-01, (toMonth+1)-01)`.
  const fromStart = new Date(`${opts.fromMonth}-01T00:00:00.000Z`);
  const toExclusive = monthAfter(opts.toMonth);
  const parentRows = await db
    .select({ parentId: parents.id, createdAt: parents.createdAt })
    .from(parents)
    .where(
      sql`${parents.createdAt} >= ${fromStart} AND ${parents.createdAt} < ${toExclusive}`,
    );

  // Each parent's paid-touchpoint months (default: wallet debits).
  const signal = opts.activeSignal ?? loadWalletDebitActiveMonths;
  const activeRows = await signal(db, opts);
  const activeByParent = new Map<string, Set<string>>();
  for (const r of activeRows) {
    let set = activeByParent.get(r.parentId);
    if (!set) {
      set = new Set<string>();
      activeByParent.set(r.parentId, set);
    }
    set.add(r.activeMonth);
  }

  const cohortParents: CohortParentRow[] = parentRows.map((p) => ({
    parentId: p.parentId,
    signupMonth: toMonth(p.createdAt),
    activeMonths: [...(activeByParent.get(p.parentId) ?? [])],
  }));

  return aggregateCohortRetention({
    fromMonth: opts.fromMonth,
    toMonth: opts.toMonth,
    asOfMonth,
    parents: cohortParents,
  });
}

/** `YYYY-MM` → the UTC start of the FOLLOWING month (exclusive upper bound). */
function monthAfter(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  const year = m === 12 ? y! + 1 : y!;
  const nextMonth = m === 12 ? 1 : m! + 1;
  return new Date(`${String(year).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`);
}
