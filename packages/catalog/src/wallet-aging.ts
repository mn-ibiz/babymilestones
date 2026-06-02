/**
 * P3-E05-S04 (Story 27.4) — Wallet aging-report aggregation.
 *
 * "How long have outstanding balances been open." The accountant picks a report
 * date and sees every parent's open balance sorted into aging buckets by the AGE
 * of the amount, with a per-parent row under each bucket (AC1/AC2).
 *
 * Definitions are kept consistent with the rest of reporting (27.1 / 27.2 / 22-x):
 *  - OUTSTANDING is the same definition the operations dashboard / parent surfaces
 *    use: an invoice whose `status NOT IN ('settled','void')` AND whose
 *    `amount_due` is positive. The DB read filters status; this aggregation drops
 *    any non-positive `amountDueCents` defensively so a zero/over-settled invoice
 *    never appears (AC2).
 *  - AGE of an outstanding amount = whole days from the invoice's `createdAt` (the
 *    only age-bearing field on an invoice — FIFO settlement clears the oldest
 *    `created_at` first, see `invoices` schema) to the report `asOf` instant,
 *    floored. There is no separate due-date column, so `createdAt` IS the
 *    established age basis.
 *
 * BUCKETING IS PER-INVOICE. Each outstanding invoice's amount is placed in the
 * bucket matching ITS OWN age, then a parent's invoices that land in the SAME
 * bucket are summed into one per-parent row. A parent with invoices spanning two
 * age ranges therefore appears under two buckets — the correct AR-aging semantics
 * (each slice of the balance is aged independently), not a single per-parent
 * oldest-invoice bucket.
 *
 * Buckets: 0–7, 8–30, 31–60, 61–90, 90+ days (AC1) — inclusive day ranges, so
 * day 7 → 0–7, day 8 → 8–30, day 30 → 8–30, day 31 → 31–60, … day 90 → 61–90,
 * day 91 → 90+.
 *
 * Pure — no I/O — so it is exhaustively unit-tested, the same split 27.1 / 27.2 /
 * 27.3 use. The DB read ({@link loadWalletAging}) is a thin projection.
 */

const DAY_MS = 86_400_000;

/** One aging bucket definition: a key, label, and inclusive day range. */
export interface WalletAgingBucketDef {
  key: string;
  label: string;
  /** Inclusive lower bound in days. */
  minDays: number;
  /** Inclusive upper bound in days, or null for the open-ended final bucket. */
  maxDays: number | null;
}

/**
 * The five aging buckets, in display order (AC1). Inclusive day ranges; the final
 * bucket is open-ended (90+). The boundary cut-overs (7→8, 30→31, 60→61, 90→91)
 * fall exactly where the AC labels imply.
 */
export const WALLET_AGING_BUCKETS: readonly WalletAgingBucketDef[] = [
  { key: "d0_7", label: "0–7 days", minDays: 0, maxDays: 7 },
  { key: "d8_30", label: "8–30 days", minDays: 8, maxDays: 30 },
  { key: "d31_60", label: "31–60 days", minDays: 31, maxDays: 60 },
  { key: "d61_90", label: "61–90 days", minDays: 61, maxDays: 90 },
  { key: "d90_plus", label: "90+ days", minDays: 91, maxDays: null },
] as const;

/** One outstanding invoice, projected to exactly what the aging report needs. */
export interface AgingInvoiceRow {
  invoiceId: string;
  /** Owning parent profile id (`parents.id`). */
  parentId: string;
  /** The parent's `users.id` — the profile-link key (`/parents/:userId/...`). */
  userId: string;
  /** Display name, e.g. "Pat Doe". */
  parentName: string;
  /** Remaining amount owed, integer KES cents. Non-positive rows are dropped. */
  amountDueCents: number;
  /** When the invoice was raised — the age basis. */
  createdAt: Date;
}

/** The inputs the aging aggregation reduces — the DB read hands these in. */
export interface WalletAgingInput {
  /** The report instant ("now"). Ages are measured to here. */
  asOf: Date;
  /** Every outstanding invoice (status already filtered by the DB read). */
  invoices: readonly AgingInvoiceRow[];
}

/** One parent's outstanding slice within a single bucket (AC2). */
export interface WalletAgingRow {
  parentId: string;
  /** Profile-link key — the row clicks through to `/parents/:userId/...` (AC2). */
  userId: string;
  parentName: string;
  /** Summed outstanding for this parent within this bucket, integer cents. */
  amountCents: number;
}

/** One aging bucket with its per-parent rows + total (AC1/AC2). */
export interface WalletAgingBucket {
  key: string;
  label: string;
  minDays: number;
  maxDays: number | null;
  /** Per-parent rows, ranked by amount desc, then name, then id. */
  rows: WalletAgingRow[];
  /** Sum of every row in the bucket, integer cents. */
  totalCents: number;
}

/** The fully-reduced wallet aging report (AC1/AC2). */
export interface WalletAgingReport {
  /** The report instant as an ISO string (echoed for the surface / CSV header). */
  asOf: string;
  /** The five buckets, always present (zero-filled), in display order. */
  buckets: WalletAgingBucket[];
  /** Grand total outstanding across every bucket, integer cents. */
  totalCents: number;
}

/** Whole days between two instants, floored, never negative. */
function ageDays(createdAt: Date, asOf: Date): number {
  const diff = asOf.getTime() - createdAt.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / DAY_MS);
}

/** Index of the bucket an age (days) falls into. */
function bucketIndexForAge(days: number): number {
  for (let i = 0; i < WALLET_AGING_BUCKETS.length; i++) {
    const b = WALLET_AGING_BUCKETS[i]!;
    if (days >= b.minDays && (b.maxDays === null || days <= b.maxDays)) return i;
  }
  // Unreachable: the final bucket is open-ended, but be safe.
  return WALLET_AGING_BUCKETS.length - 1;
}

/**
 * Reduce the outstanding invoices into per-bucket, per-parent rows (AC1/AC2).
 * Pure — no I/O. Each outstanding invoice is aged independently and placed in its
 * own bucket (PER-INVOICE); a parent's invoices within the SAME bucket sum into
 * one row. Non-positive `amountDueCents` rows are dropped (zero/over-settled).
 * Rows within a bucket rank by amount desc, then parent name, then parent id.
 * Every bucket is always present (zero-filled) so the surface is stable.
 */
export function aggregateWalletAging(inputData: WalletAgingInput): WalletAgingReport {
  // bucketIndex → (parentId → row accumulator)
  const buckets: Map<string, WalletAgingRow & { _seedName: string }>[] = WALLET_AGING_BUCKETS.map(
    () => new Map(),
  );

  for (const invoice of inputData.invoices) {
    if (invoice.amountDueCents <= 0) continue; // not outstanding
    const idx = bucketIndexForAge(ageDays(invoice.createdAt, inputData.asOf));
    const bucket = buckets[idx]!;
    let row = bucket.get(invoice.parentId);
    if (!row) {
      row = {
        parentId: invoice.parentId,
        userId: invoice.userId,
        parentName: invoice.parentName,
        amountCents: 0,
        _seedName: invoice.parentName,
      };
      bucket.set(invoice.parentId, row);
    }
    row.amountCents += invoice.amountDueCents;
  }

  let grandTotal = 0;
  const outBuckets: WalletAgingBucket[] = WALLET_AGING_BUCKETS.map((def, idx) => {
    const rows: WalletAgingRow[] = [...buckets[idx]!.values()].map((r) => ({
      parentId: r.parentId,
      userId: r.userId,
      parentName: r.parentName,
      amountCents: r.amountCents,
    }));
    rows.sort(
      (a, b) =>
        b.amountCents - a.amountCents ||
        a.parentName.localeCompare(b.parentName) ||
        (a.parentId < b.parentId ? -1 : a.parentId > b.parentId ? 1 : 0),
    );
    const totalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
    grandTotal += totalCents;
    return {
      key: def.key,
      label: def.label,
      minDays: def.minDays,
      maxDays: def.maxDays,
      rows,
      totalCents,
    };
  });

  return {
    asOf: inputData.asOf.toISOString(),
    buckets: outBuckets,
    totalCents: grandTotal,
  };
}
