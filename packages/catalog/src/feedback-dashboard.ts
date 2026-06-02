/**
 * P6-E04-S02 (Story 34.2) — Feedback dashboard aggregation (by unit, by staff).
 *
 * The pure {@link aggregateFeedbackDashboard} reducer turns the SUBMITTED feedback
 * rows in a date window into the dashboard read model (AC1):
 *
 *  - per-UNIT: { count, average, distribution[0..5] }. A row's unit is derived
 *    from its `source_type` ({@link feedbackUnitForSourceType}): salon checkout →
 *    `salon`, attendance pickup → `play`, coaching session → `coaching`, order
 *    fulfilled → `order`, anything else → `other`.
 *  - per-STAFF: { staffId, count, average } — BUT the average is SUPPRESSED until
 *    the staff member has at least {@link FEEDBACK_MIN_SAMPLE_SIZE} responses. The
 *    guardrail (AC1) keeps one early one-star from surfacing as a "staff average"
 *    that misrepresents the staff member; below the threshold the count is still
 *    surfaced (so the admin can see ratings are accruing) but `average` is `null`.
 *
 * The DB read ({@link loadFeedbackDashboard} in `feedback-dashboard-db.ts`) stays a
 * thin projection so this aggregation is exhaustively unit-tested with no I/O —
 * the same split the operations-dashboard aggregation uses.
 */

/**
 * Minimum number of submitted responses before a STAFF average is surfaced (AC1).
 * Below this, the average is suppressed (`null`, `enoughSamples=false`) so a single
 * early one-star never becomes a headline "staff average". A named constant so the
 * guardrail is configurable in exactly one place.
 */
export const FEEDBACK_MIN_SAMPLE_SIZE = 5;

/** The unit a feedback touchpoint rolls up to on the dashboard. */
export type FeedbackUnit = "salon" | "play" | "talent" | "coaching" | "order" | "event" | "other";

/**
 * Map a feedback `source_type` to the dashboard UNIT it rolls up to (AC1). The
 * source types are the completion kinds the invitation creator writes (salon
 * checkout, attendance pickup, order fulfilled, coaching session end). An unknown
 * / future source type buckets into `other` so the dashboard never drops a row.
 */
export function feedbackUnitForSourceType(sourceType: string): FeedbackUnit {
  switch (sourceType) {
    case "salon":
      return "salon";
    case "attendance":
      return "play";
    case "talent":
      return "talent";
    case "coaching":
      return "coaching";
    case "order":
      return "order";
    case "event":
      return "event";
    default:
      return "other";
  }
}

/** One submitted feedback row, projected to exactly what the dashboard needs. */
export interface FeedbackResponseRow {
  /** Feedback row id (server-side only — never the parent identity). */
  id: string;
  /** Completion kind: 'salon' | 'attendance' | 'order' | 'coaching' | … . */
  sourceType: string;
  /** Attributed staff id, or null when the touchpoint carries no attribution. */
  staffId: string | null;
  /** Staff display name (live), or null when missing / unattributed. */
  staffName: string | null;
  /** The submitted 0..5 rating. */
  rating: number;
}

/** The inputs the dashboard aggregation reduces — the DB read hands these in. */
export interface FeedbackDashboardInput {
  /** Inclusive window start (`YYYY-MM-DD`). Echoed back on the result. */
  from: string;
  /** Inclusive window end (`YYYY-MM-DD`). Echoed back on the result. */
  to: string;
  /** The submitted feedback rows whose `submittedAt` falls in the window. */
  responses: readonly FeedbackResponseRow[];
}

/** Per-unit aggregate: count, average, and the 0..5 rating distribution (AC1). */
export interface FeedbackUnitStats {
  unit: FeedbackUnit;
  count: number;
  /** Mean rating across this unit's responses (count > 0 ⇒ defined). */
  average: number;
  /** Histogram indexed 0..5 (`distribution[r]` = number of `r`-star responses). */
  distribution: number[];
}

/** Per-staff aggregate with the min-sample guardrail applied (AC1). */
export interface FeedbackStaffStats {
  staffId: string;
  staffName: string;
  count: number;
  /**
   * Mean rating — but `null` until {@link enoughSamples} (the min-sample
   * guardrail, AC1). The count is always surfaced; the average is suppressed
   * below {@link FEEDBACK_MIN_SAMPLE_SIZE}.
   */
  average: number | null;
  /** True once `count >= FEEDBACK_MIN_SAMPLE_SIZE` — the average is then trustworthy. */
  enoughSamples: boolean;
}

/** The fully-reduced feedback dashboard (AC1). */
export interface FeedbackDashboard {
  from: string;
  to: string;
  totalResponses: number;
  units: FeedbackUnitStats[];
  staff: FeedbackStaffStats[];
}

export interface AggregateFeedbackDashboardOpts {
  /** Min-sample-size override (defaults to {@link FEEDBACK_MIN_SAMPLE_SIZE}). */
  minSampleSize?: number;
}

interface UnitAcc {
  count: number;
  sum: number;
  distribution: number[];
}

interface StaffAcc {
  staffId: string;
  staffName: string;
  count: number;
  sum: number;
}

/**
 * Reduce the window's submitted feedback to the per-unit + per-staff dashboard
 * (AC1). Pure — no I/O. Per-unit gives count/average/distribution; per-staff
 * applies the min-sample guardrail (the average is suppressed to `null` until the
 * staff member has at least {@link FEEDBACK_MIN_SAMPLE_SIZE} responses). Units are
 * ordered by unit label; staff by name then id (stable, deterministic).
 */
export function aggregateFeedbackDashboard(
  inputData: FeedbackDashboardInput,
  opts: AggregateFeedbackDashboardOpts = {},
): FeedbackDashboard {
  const minSampleSize = opts.minSampleSize ?? FEEDBACK_MIN_SAMPLE_SIZE;

  const byUnit = new Map<FeedbackUnit, UnitAcc>();
  const byStaff = new Map<string, StaffAcc>();

  for (const r of inputData.responses) {
    const unit = feedbackUnitForSourceType(r.sourceType);
    let u = byUnit.get(unit);
    if (!u) {
      u = { count: 0, sum: 0, distribution: [0, 0, 0, 0, 0, 0] };
      byUnit.set(unit, u);
    }
    u.count += 1;
    u.sum += r.rating;
    if (r.rating >= 0 && r.rating <= 5) u.distribution[r.rating]! += 1;

    if (r.staffId !== null) {
      let s = byStaff.get(r.staffId);
      if (!s) {
        s = {
          staffId: r.staffId,
          // Fall back to a stable label so the row is never nameless.
          staffName: r.staffName ?? `Staff ${r.staffId.slice(0, 8)}`,
          count: 0,
          sum: 0,
        };
        byStaff.set(r.staffId, s);
      }
      // Prefer the first non-null live name we see.
      if (r.staffName) s.staffName = r.staffName;
      s.count += 1;
      s.sum += r.rating;
    }
  }

  const units: FeedbackUnitStats[] = [...byUnit.entries()]
    .map(([unit, acc]) => ({
      unit,
      count: acc.count,
      average: acc.sum / acc.count,
      distribution: acc.distribution,
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit));

  const staff: FeedbackStaffStats[] = [...byStaff.values()]
    .map((acc) => {
      const enoughSamples = acc.count >= minSampleSize;
      return {
        staffId: acc.staffId,
        staffName: acc.staffName,
        count: acc.count,
        average: enoughSamples ? acc.sum / acc.count : null,
        enoughSamples,
      };
    })
    .sort(
      (a, b) =>
        a.staffName.localeCompare(b.staffName) ||
        (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
    );

  return {
    from: inputData.from,
    to: inputData.to,
    totalResponses: inputData.responses.length,
    units,
    staff,
  };
}
