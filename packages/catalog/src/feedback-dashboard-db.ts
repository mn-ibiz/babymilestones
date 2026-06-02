import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { feedback, parents, staff } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateFeedbackDashboard,
  feedbackUnitForSourceType,
  type AggregateFeedbackDashboardOpts,
  type FeedbackDashboard,
  type FeedbackResponseRow,
  type FeedbackUnit,
} from "./feedback-dashboard.js";

/**
 * P6-E04-S02 (Story 34.2) — DB read behind the feedback dashboard. A thin
 * projection: it loads the SUBMITTED feedback (`submitted_at` set, with a rating)
 * whose `submitted_at` falls in the inclusive window, joins the attributed staff
 * for the display name, and hands everything to the pure
 * {@link aggregateFeedbackDashboard} reducer. Read-only.
 *
 * Window boundaries are UTC `[from 00:00, (to+1 day) 00:00)` on `submitted_at` —
 * an INCLUSIVE `[from, to]` calendar range (the `to` day is fully included).
 *
 * The individual-response read ({@link loadFeedbackResponses}) returns the rows
 * ANONYMISED by default — rating / comment / date / unit / staff but NO parent
 * identity — and only joins the parent (display name) when `reveal` is set (AC3).
 * The route layer gates the reveal on a strong permission and writes the audit row.
 */

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Inclusive upper bound: the UTC start of the day AFTER `date` (exclusive). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + 24 * 60 * 60 * 1000);
}

/** Submitted = a rating recorded with a non-null `submitted_at`. */
function submittedInWindow(from: string, to: string) {
  return and(
    isNotNull(feedback.submittedAt),
    isNotNull(feedback.rating),
    gte(feedback.submittedAt, dayStart(from)),
    lt(feedback.submittedAt, nextDayStart(to)),
  );
}

export interface LoadFeedbackDashboardOpts extends AggregateFeedbackDashboardOpts {
  /** Inclusive window start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive window end (`YYYY-MM-DD`). */
  to: string;
}

export async function loadFeedbackDashboard(
  db: Executor,
  opts: LoadFeedbackDashboardOpts,
): Promise<FeedbackDashboard> {
  // The window's submitted feedback, joined to the live staff display name.
  const rows = await db
    .select({
      id: feedback.id,
      sourceType: feedback.sourceType,
      staffId: feedback.attributedStaffId,
      staffName: staff.displayName,
      rating: feedback.rating,
    })
    .from(feedback)
    .leftJoin(staff, eq(feedback.attributedStaffId, staff.id))
    .where(submittedInWindow(opts.from, opts.to));

  const responses: FeedbackResponseRow[] = rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    staffId: r.staffId,
    staffName: r.staffName,
    rating: r.rating ?? 0,
  }));

  return aggregateFeedbackDashboard(
    { from: opts.from, to: opts.to, responses },
    { minSampleSize: opts.minSampleSize },
  );
}

/* ----------------------------------------------- individual responses (AC3) */

/** An anonymised individual response (AC3) — NO parent identity. */
export interface FeedbackResponseDetail {
  id: string;
  unit: FeedbackUnit;
  sourceType: string;
  staffId: string | null;
  staffName: string | null;
  rating: number;
  comment: string | null;
  submittedAt: Date;
  /** Present ONLY on a de-anonymised (revealed) read (AC3). */
  parentId?: string;
  /** Present ONLY on a de-anonymised (revealed) read (AC3). */
  parentName?: string;
}

export interface LoadFeedbackResponsesOpts {
  /** Inclusive window start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive window end (`YYYY-MM-DD`). */
  to: string;
  /** Restrict to one dashboard unit (maps back to its source types). */
  unit?: FeedbackUnit;
  /** Restrict to one attributed staff member. */
  staffId?: string;
  /**
   * De-anonymise (AC3): when true the parent identity (id + display name) is
   * joined in. DEFAULT is false — the anonymised projection. The route layer is
   * responsible for gating this on a strong permission + writing the audit row.
   */
  reveal?: boolean;
}

/** The source types that roll up to a given dashboard unit (reverse mapping). */
function sourceTypesForUnit(unit: FeedbackUnit, present: readonly string[]): string[] {
  return present.filter((st) => feedbackUnitForSourceType(st) === unit);
}

export async function loadFeedbackResponses(
  db: Executor,
  opts: LoadFeedbackResponsesOpts,
): Promise<FeedbackResponseDetail[]> {
  const filters = [submittedInWindow(opts.from, opts.to)];
  if (opts.staffId) filters.push(eq(feedback.attributedStaffId, opts.staffId));
  if (opts.unit) {
    // Resolve the unit to the concrete source types present in this window so the
    // SQL filter stays a simple IN-list (the unit→source-type map is in app code).
    const distinct = await db
      .selectDistinct({ sourceType: feedback.sourceType })
      .from(feedback)
      .where(submittedInWindow(opts.from, opts.to));
    const sourceTypes = sourceTypesForUnit(
      opts.unit,
      distinct.map((d) => d.sourceType),
    );
    // No source type maps to this unit in the window → no rows.
    if (sourceTypes.length === 0) return [];
    filters.push(inArray(feedback.sourceType, sourceTypes));
  }

  const rows = await db
    .select({
      id: feedback.id,
      sourceType: feedback.sourceType,
      staffId: feedback.attributedStaffId,
      staffName: staff.displayName,
      rating: feedback.rating,
      comment: feedback.comment,
      submittedAt: feedback.submittedAt,
      parentId: feedback.parentId,
      parentFirstName: parents.firstName,
      parentLastName: parents.lastName,
    })
    .from(feedback)
    .leftJoin(staff, eq(feedback.attributedStaffId, staff.id))
    .leftJoin(parents, eq(parents.userId, feedback.parentId))
    .where(and(...filters))
    .orderBy(feedback.submittedAt);

  return rows.map((r) => {
    const base: FeedbackResponseDetail = {
      id: r.id,
      unit: feedbackUnitForSourceType(r.sourceType),
      sourceType: r.sourceType,
      staffId: r.staffId,
      staffName: r.staffName,
      rating: r.rating ?? 0,
      comment: r.comment,
      // submittedAt is non-null by the window filter.
      submittedAt: r.submittedAt!,
    };
    if (opts.reveal) {
      base.parentId = r.parentId;
      const name = [r.parentFirstName, r.parentLastName].filter(Boolean).join(" ").trim();
      base.parentName = name.length > 0 ? name : r.parentId;
    }
    return base;
  });
}
