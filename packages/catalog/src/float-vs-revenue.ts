/**
 * P5-E05-S04 (Story 35.4) — Wallet float vs revenue snapshot.
 *
 * The accountant's daily treasury view: how much CUSTOMER money is sitting in
 * wallets (the `customer_wallet_liability` we owe back) versus the segregated
 * (float/bank) balance that actually backs it, plus the revenue earned each day.
 *
 * The pure {@link aggregateFloatVsRevenue} reducer takes the per-day inputs the
 * DB read already resolved — for every calendar day in `[from, to]` the
 * end-of-day `walletLiabilityCents`, the `segregatedBalanceCents`, and that day's
 * `revenueCents` — and produces:
 *
 *  - AC1: the SNAPSHOT for the last (most-recent) day — its liability total,
 *    segregated balance, revenue earned that day, and the PRIOR-DAY delta: the
 *    change in wallet liability vs the immediately-preceding day (today − yesterday;
 *    on the first day, baselined at 0, so the delta is the whole liability).
 *  - AC2: the full ascending N-day SERIES (90 days by default) for the
 *    float-vs-revenue chart, each point carrying its own prior-day liability delta.
 *
 * No I/O — exhaustively unit-tested. The companion `float-vs-revenue-db.ts`
 * assembles the inputs from the append-only wallet ledger + float accounts +
 * the Epic 27 daily-revenue source.
 */

/** One day's already-resolved figures (the DB read hands these in), in cents. */
export interface FloatVsRevenueDayInput {
  /** Calendar day (`YYYY-MM-DD`, UTC). */
  date: string;
  /** Total customer-wallet liability as-of end-of-day (Σ wallet_ledger ≤ day). */
  walletLiabilityCents: number;
  /** Segregated float/bank balance as-of end-of-day (Σ float openings + tagged ledger ≤ day). */
  segregatedBalanceCents: number;
  /** Revenue earned that calendar day (net of refunds), the Epic 27 source. */
  revenueCents: number;
}

/** The inputs the aggregation reduces — one row per calendar day, ascending. */
export interface FloatVsRevenueInput {
  /** Inclusive window start (`YYYY-MM-DD`). Echoed back. */
  from: string;
  /** Inclusive window end (`YYYY-MM-DD`) — the snapshot day. Echoed back. */
  to: string;
  /** One entry per calendar day in `[from, to]`, ascending. May be empty. */
  days: readonly FloatVsRevenueDayInput[];
}

/** One chart-series point: a day's float, revenue + its prior-day liability delta (AC2). */
export interface FloatVsRevenuePoint {
  date: string;
  walletLiabilityCents: number;
  segregatedBalanceCents: number;
  revenueCents: number;
  /** This day's wallet liability − the previous day's (today − yesterday). */
  priorDayDeltaCents: number;
}

/** The headline daily snapshot for the most-recent day (AC1). */
export interface FloatVsRevenueSnapshot {
  date: string;
  /** Total customer money sitting in wallets (the liability we owe back). */
  walletLiabilityCents: number;
  /** The segregated (float/bank) balance backing that liability. */
  segregatedBalanceCents: number;
  /** Revenue earned that day. */
  revenueCents: number;
  /** Change in wallet liability vs the prior day (today − yesterday). */
  priorDayDeltaCents: number;
}

/** The fully-reduced float-vs-revenue report (AC1/AC2). */
export interface FloatVsRevenue {
  from: string;
  to: string;
  /** Today's headline snapshot (AC1). */
  snapshot: FloatVsRevenueSnapshot;
  /** The full ascending N-day series for the chart (AC2). */
  series: FloatVsRevenuePoint[];
}

/**
 * Reduce the per-day inputs to the daily snapshot + N-day series (AC1/AC2). Pure
 * — no I/O. The prior-day delta is `liability[i] − liability[i-1]` (baselined at 0
 * for the first day, so day-0's delta is its whole liability). The snapshot is the
 * last (most-recent) day; on an empty window every figure is 0 and the snapshot
 * date is `to`.
 */
export function aggregateFloatVsRevenue(input: FloatVsRevenueInput): FloatVsRevenue {
  const series: FloatVsRevenuePoint[] = [];
  let prevLiability = 0;
  for (const day of input.days) {
    series.push({
      date: day.date,
      walletLiabilityCents: day.walletLiabilityCents,
      segregatedBalanceCents: day.segregatedBalanceCents,
      revenueCents: day.revenueCents,
      priorDayDeltaCents: day.walletLiabilityCents - prevLiability,
    });
    prevLiability = day.walletLiabilityCents;
  }

  const last = series[series.length - 1];
  const snapshot: FloatVsRevenueSnapshot = last
    ? {
        date: last.date,
        walletLiabilityCents: last.walletLiabilityCents,
        segregatedBalanceCents: last.segregatedBalanceCents,
        revenueCents: last.revenueCents,
        priorDayDeltaCents: last.priorDayDeltaCents,
      }
    : {
        date: input.to,
        walletLiabilityCents: 0,
        segregatedBalanceCents: 0,
        revenueCents: 0,
        priorDayDeltaCents: 0,
      };

  return { from: input.from, to: input.to, snapshot, series };
}
