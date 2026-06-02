import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, feedback, type Database, type FeedbackRow } from "@bm/db";

/**
 * Feedback Engine FOUNDATION (P6-E04-S01 / Story 34.1) — the pure module behind a
 * 0–5 rating after every paid touchpoint. Stories 34-2/3/4 build read models +
 * analytics on top of the `feedback` table this module owns.
 *
 * It lives in `@bm/catalog` (not a new package) because the salon completion path
 * — which fires the FIRST invitation via the existing {@link SalonFeedbackHook} —
 * already lives here, and `@bm/catalog` depends only on `@bm/db`, so the other
 * completion points (attendance pickup, order fulfilment) can import the same
 * creator without a new dependency edge.
 *
 *   - {@link createFeedbackInvitation} — idempotent on (sourceType, sourceId);
 *     a replayed completion is swallowed (returns null), one row per touchpoint.
 *   - {@link submitFeedback} — records a 0–5 rating + optional ≤200-char comment
 *     ONCE; a re-submit of an already-answered token is a no-op (never overwrites).
 *   - {@link listPendingFeedbackForParent} — the parent's OPEN invitations only.
 */

/** Maximum comment length (AC2). */
export const FEEDBACK_COMMENT_MAX = 200;

/** A known completion-kind for a feedback touchpoint. Extensible (plain string). */
export type FeedbackSourceType = "salon" | "attendance" | "order" | "coaching" | (string & {});

export interface CreateFeedbackInvitationInput {
  /** The completion kind: 'salon' | 'attendance' | 'order' | 'coaching'. */
  sourceType: FeedbackSourceType;
  /** The source touchpoint id (attendance id, order id, …). */
  sourceId: string;
  /** The parent (users.id) who owns + receives the invitation. */
  parentId: string;
  /** The staff the touchpoint is attributed to (nullable: an order has none). */
  attributedStaffId?: string | null;
  /** Invitation timestamp (defaults to now). Injected for deterministic tests. */
  invitedAt?: Date;
}

/**
 * Create an OPEN feedback invitation for a completed paid touchpoint (AC1).
 *
 * IDEMPOTENT (AC3): keyed by the UNIQUE (sourceType, sourceId) constraint via
 * `onConflictDoNothing`. A replayed completion (a retried hook, a double-tap)
 * inserts nothing and returns `null`; the first call returns the created row. The
 * caller therefore knows whether THIS call created the invitation (e.g. to decide
 * whether to fire the SMS-stub once).
 */
export async function createFeedbackInvitation(
  db: Database,
  input: CreateFeedbackInvitationInput,
): Promise<FeedbackRow | null> {
  const [row] = await db
    .insert(feedback)
    .values({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      parentId: input.parentId,
      attributedStaffId: input.attributedStaffId ?? null,
      invitedAt: input.invitedAt ?? new Date(),
    })
    .onConflictDoNothing({ target: [feedback.sourceType, feedback.sourceId] })
    .returning();
  return row ?? null;
}

/** The submitted token does not resolve to any invitation. */
export class FeedbackInvitationNotFoundError extends Error {
  constructor() {
    super("Feedback invitation not found");
    this.name = "FeedbackInvitationNotFoundError";
  }
}

/** The authed parent does not own this invitation (ownership check). */
export class FeedbackNotOwnedError extends Error {
  constructor() {
    super("This feedback invitation belongs to another parent");
    this.name = "FeedbackNotOwnedError";
  }
}

/** The rating is not an integer in 0..5 (AC2). */
export class InvalidFeedbackRatingError extends Error {
  constructor() {
    super("Rating must be a whole number from 0 to 5");
    this.name = "InvalidFeedbackRatingError";
  }
}

/** The comment exceeds the 200-char cap (AC2). */
export class FeedbackCommentTooLongError extends Error {
  constructor() {
    super(`Comment must be ${FEEDBACK_COMMENT_MAX} characters or fewer`);
    this.name = "FeedbackCommentTooLongError";
  }
}

export interface SubmitFeedbackInput {
  /** The public token from the SMS link / in-app prompt. */
  token: string;
  /** The authed parent (users.id) — must own the invitation (ownership check). */
  parentId: string;
  /** 0–5 stars (integer). */
  rating: number;
  /** Optional free-text comment, ≤200 chars (AC2). */
  comment?: string | null;
  /** Submission timestamp (defaults to now). Injected for deterministic tests. */
  submittedAt?: Date;
  /** Acting user id for the audit row (defaults to the parent). */
  actor?: string;
  ip?: string | null;
}

/**
 * Record a 0–5 rating + optional ≤200-char comment for an invitation (AC2/AC3).
 *
 * Resolves the invitation by its public `token`, enforces OWNERSHIP (the authed
 * parent must own it), validates the rating (0..5 integer) + comment cap, then
 * writes the rating/comment/submittedAt ONLY when the row is still open
 * (`submitted_at IS NULL`). The conditional UPDATE is the idempotency guard
 * (AC3): a re-submit / replay of an already-answered token updates nothing and
 * returns the ORIGINAL row unchanged — the first answer is never overwritten.
 * Audits `feedback.submitted` on the FIRST (effective) submission only.
 */
export async function submitFeedback(
  db: Database,
  input: SubmitFeedbackInput,
): Promise<FeedbackRow> {
  if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5) {
    throw new InvalidFeedbackRatingError();
  }
  const comment = input.comment ?? null;
  if (comment !== null && comment.length > FEEDBACK_COMMENT_MAX) {
    throw new FeedbackCommentTooLongError();
  }

  return db.transaction(async (tx) => {
    // Lock the row so a concurrent double-tap serialises: the second sees
    // `submittedAt` set and short-circuits to the no-op replay path.
    const [existing] = await tx
      .select()
      .from(feedback)
      .where(eq(feedback.token, input.token))
      .for("update");
    if (!existing) throw new FeedbackInvitationNotFoundError();
    if (existing.parentId !== input.parentId) throw new FeedbackNotOwnedError();

    // Already answered → idempotent no-op: return the original, untouched.
    if (existing.submittedAt) return existing;

    const submittedAt = input.submittedAt ?? new Date();
    const [updated] = await tx
      .update(feedback)
      .set({ rating: input.rating, comment, submittedAt })
      // Conditional on still-open guards against a TOCTOU overwrite under the lock.
      .where(and(eq(feedback.id, existing.id), isNull(feedback.submittedAt)))
      .returning();

    // Audit the effective submission (ids only — never the comment text).
    await audit(tx, {
      actor: input.actor ?? input.parentId,
      action: "feedback.submitted",
      target: { table: "feedback", id: existing.id },
      payload: {
        source_type: existing.sourceType,
        source_id: existing.sourceId,
        rating: input.rating,
        has_comment: comment !== null && comment.length > 0,
        ip: input.ip ?? undefined,
      },
    });

    return updated ?? existing;
  });
}

/** A pending invitation projected for the in-app prompt / SMS link. */
export interface PendingFeedback {
  /** Internal row id (server-side only). */
  id: string;
  /** Public token the in-app prompt / SMS link submits against. */
  token: string;
  sourceType: string;
  sourceId: string;
  attributedStaffId: string | null;
  invitedAt: Date;
}

/**
 * List a parent's OPEN (unsubmitted) feedback invitations, newest first (AC2 —
 * the in-app prompt surface). Scoped to the parent: only their own rows, only
 * those still pending (`submitted_at IS NULL`).
 */
export async function listPendingFeedbackForParent(
  db: Database,
  parentId: string,
): Promise<PendingFeedback[]> {
  const rows = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.parentId, parentId), isNull(feedback.submittedAt)))
    .orderBy(desc(feedback.invitedAt));
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    attributedStaffId: r.attributedStaffId,
    invitedAt: r.invitedAt,
  }));
}
