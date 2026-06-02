/**
 * Public staff-earnings view-model (P3-E02-S01). The pure aggregation behind the
 * unauthenticated `/staff-earnings` viewer: given a staff member's
 * commission-ledger entries (signed integer cents, each stamped with the UTC time
 * it occurred) and their CONFIRMED payouts, derive the three numbers the viewer
 * shows — month-to-date net, last calendar month's net, and the most recent payout
 * (amount + date).
 *
 * Reuses the commission ledger as the single source of truth (do NOT re-implement
 * ledger math here): the route hands this helper already-fetched rows. Everything
 * is integer-cents; period boundaries are UTC calendar months. No PII flows
 * through here — only amounts and timestamps (AC4).
 */

/** One commission-ledger entry, projected to just what the earnings math needs. */
export interface EarningsLedgerEntry {
  /** Signed integer cents: positive accrual, negative reversal. */
  amountCents: number;
  /** When the booking settled / was reversed (period attribution). */
  occurredAt: Date;
  /**
   * The service that drove this entry, for the breakdown (P3-E02-S02 AC1). A
   * service NAME only — never any parent/child/booking identifier (AC2). Null
   * when the booking had no service attached; bucketed under {@link UNATTRIBUTED}.
   */
  serviceName?: string | null;
  /**
   * True for a booking accrual (`source='booking'`) — i.e. one completed visit.
   * False for a refund reversal, which nets revenue down but is NOT a visit.
   * Optional so existing total-only callers (the three headline numbers) need
   * not supply it.
   */
  isVisit?: boolean;
}

/** Placeholder bucket for a visit whose booking carried no service (AC1). */
export const UNATTRIBUTED = "Unattributed";

/** One service ranked by how many completed visits it drove this period (AC1). */
export interface ServiceCount {
  serviceName: string;
  count: number;
}

/** One service ranked by the net commission cents it drove this period (AC1). */
export interface ServiceRevenue {
  serviceName: string;
  revenueCents: number;
}

/** One confirmed payout to the staff member (a paid-out commission-run line). */
export interface EarningsPayout {
  /** Net commission cents paid in that run. */
  amountCents: number;
  /** When the accountant confirmed the external payout was made. */
  paidOutAt: Date;
}

export interface MonthBounds {
  /** Inclusive start of `now`'s UTC calendar month. */
  thisMonthStart: Date;
  /** Exclusive end of `now`'s month = start of next month. */
  nextMonthStart: Date;
  /** Inclusive start of the prior UTC calendar month. */
  lastMonthStart: Date;
}

/** The `this-month` / `last-month` UTC calendar-month boundaries around `now`. */
export function monthBoundsUtc(now: Date): MonthBounds {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  return {
    thisMonthStart: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
    nextMonthStart: new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0)),
    lastMonthStart: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
  };
}

export interface StaffEarningsInput {
  ledger: EarningsLedgerEntry[];
  payouts: EarningsPayout[];
  now: Date;
}

/** The computed earnings view-model — the ONLY numbers exposed to the viewer. */
export interface StaffEarningsView {
  /** Net commission cents accrued in `now`'s month so far. */
  monthToDateCents: number;
  /** Net commission cents accrued in the prior calendar month. */
  lastMonthCents: number;
  /** Most recent confirmed payout amount in cents, or null if never paid out. */
  lastPayoutCents: number | null;
  /** When that most recent payout was confirmed, or null. */
  lastPayoutAt: Date | null;
  /**
   * Number of completed visits (booking accruals) in the SAME month-to-date
   * window the total reflects (P3-E02-S02 AC1). Reversals are not visits.
   */
  completedVisits: number;
  /** Up to 3 services with the most completed visits this period (AC1). */
  topServicesByCount: ServiceCount[];
  /** Up to 3 services with the most net commission revenue this period (AC1). */
  topServicesByRevenue: ServiceRevenue[];
}

/** Net cents over ledger entries whose `occurredAt` falls in `[start, end)`. */
function netInWindow(ledger: EarningsLedgerEntry[], start: Date, end: Date): number {
  let net = 0;
  for (const e of ledger) {
    const t = e.occurredAt.getTime();
    if (t >= start.getTime() && t < end.getTime()) net += e.amountCents;
  }
  return net;
}

/** The service-name bucket for an entry — its name, or the unattributed placeholder. */
function bucketName(e: EarningsLedgerEntry): string {
  const name = e.serviceName;
  return name === undefined || name === null || name === "" ? UNATTRIBUTED : name;
}

/**
 * Per-service visit counts + net revenue over the ledger entries that fall inside
 * `[start, end)` — the SAME window the headline total reflects (AC1). A completed
 * visit is a booking accrual (`isVisit`); a reversal nets revenue down but is not
 * counted as a visit. Returns the top 3 of each, descending by metric and ties
 * broken alphabetically by service name for deterministic, stable output.
 */
function breakdownInWindow(
  ledger: EarningsLedgerEntry[],
  start: Date,
  end: Date,
): { completedVisits: number; topByCount: ServiceCount[]; topByRevenue: ServiceRevenue[] } {
  const counts = new Map<string, number>();
  const revenue = new Map<string, number>();
  let completedVisits = 0;

  for (const e of ledger) {
    const t = e.occurredAt.getTime();
    if (t < start.getTime() || t >= end.getTime()) continue;
    const name = bucketName(e);
    // Every entry (accrual or reversal) nets into the service's revenue.
    revenue.set(name, (revenue.get(name) ?? 0) + e.amountCents);
    // Only booking accruals are completed visits.
    if (e.isVisit) {
      completedVisits += 1;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const topByCount: ServiceCount[] = [...counts.entries()]
    .map(([serviceName, count]) => ({ serviceName, count }))
    .sort((a, b) => b.count - a.count || a.serviceName.localeCompare(b.serviceName))
    .slice(0, 3);

  const topByRevenue: ServiceRevenue[] = [...revenue.entries()]
    .map(([serviceName, revenueCents]) => ({ serviceName, revenueCents }))
    .sort((a, b) => b.revenueCents - a.revenueCents || a.serviceName.localeCompare(b.serviceName))
    .slice(0, 3);

  return { completedVisits, topByCount, topByRevenue };
}

/**
 * Compute the public earnings view-model (AC3 + P3-E02-S02 AC1). Month-to-date is
 * the net over the half-open `[thisMonthStart, nextMonthStart)`; last-month is the
 * net over `[lastMonthStart, thisMonthStart)`. The last payout is the confirmed
 * payout with the latest `paidOutAt`. The breakdown — completed-visit count and
 * top services by count / revenue — is scoped to the SAME month-to-date window the
 * headline total reflects (AC1). Pure — no I/O — so it is exhaustively unit-tested.
 */
export function computeStaffEarnings(input: StaffEarningsInput): StaffEarningsView {
  const { thisMonthStart, nextMonthStart, lastMonthStart } = monthBoundsUtc(input.now);

  const monthToDateCents = netInWindow(input.ledger, thisMonthStart, nextMonthStart);
  const lastMonthCents = netInWindow(input.ledger, lastMonthStart, thisMonthStart);

  let latest: EarningsPayout | null = null;
  for (const p of input.payouts) {
    if (!latest || p.paidOutAt.getTime() > latest.paidOutAt.getTime()) latest = p;
  }

  const { completedVisits, topByCount, topByRevenue } = breakdownInWindow(
    input.ledger,
    thisMonthStart,
    nextMonthStart,
  );

  return {
    monthToDateCents,
    lastMonthCents,
    lastPayoutCents: latest ? latest.amountCents : null,
    lastPayoutAt: latest ? latest.paidOutAt : null,
    completedVisits,
    topServicesByCount: topByCount,
    topServicesByRevenue: topByRevenue,
  };
}
