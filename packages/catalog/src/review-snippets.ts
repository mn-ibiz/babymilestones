import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { audit, children, feedback, parents, reviewSnippets } from "@bm/db";
import type { ReviewSnippetRow } from "@bm/db";
import type { Executor } from "./services.js";

/**
 * P6-E04-S04 (Story 34.4) — Public review snippets. The CURATED, public face of the
 * Feedback Engine (Epic 34). An admin hand-picks which 5-star {@link feedback}
 * comments to publish as testimonials on the marketing home page; each is shown
 * under an ANONYMISED attribution label ("Parent of two, Nairobi") — NEVER a real
 * parent name (AC1). Publication / unpublication is a deliberate, audited admin act
 * (AC3). The public list ({@link listPublishedSnippets}) exposes ONLY the quote +
 * attribution label — never the parent identity, never the feedback id (AC2).
 *
 *   - {@link curateReviewSnippet} — create a snippet from a 5-star feedback (with a
 *     comment); rejects a non-5-star or comment-less feedback. Defaults the
 *     attribution from the parent's active-children count + residential area, always
 *     overridable.
 *   - {@link publishReviewSnippet} / {@link unpublishReviewSnippet} — flip the public
 *     visibility; both audited.
 *   - {@link listPublishedSnippets} — the public projection (quote + attribution).
 *   - {@link listSnippetsForAdmin} / {@link listFiveStarCandidates} — the admin views.
 */

/** Quote cap — matches the feedback comment cap (Story 34.1 AC2). */
export const REVIEW_QUOTE_MAX = 200;
/** Attribution-label cap (matches the column CHECK). */
export const REVIEW_ATTRIBUTION_MAX = 120;
/** Default cap on published quotes returned to the public home page. */
export const PUBLISHED_SNIPPETS_LIMIT = 12;

/**
 * The home page auto-pulls exactly the LATEST 3 published snippets (Story 36.5 AC1):
 * social proof is a tight three-card strip ordered by publish recency, not the full
 * curated list. See {@link listLatestPublishedSnippets}.
 */
export const HOME_TESTIMONIALS_LIMIT = 3;

/** The required rating for a feedback comment to be curatable (AC1). */
const FIVE_STAR = 5;

/** The curated feedback was not a 5-star rating — only 5★ may be curated (AC1). */
export class ReviewSnippetNotFiveStarError extends Error {
  constructor() {
    super("Only 5-star feedback can be published as a review snippet");
    this.name = "ReviewSnippetNotFiveStarError";
  }
}

/** The curated feedback has no comment — there is no quote to publish. */
export class ReviewSnippetNoCommentError extends Error {
  constructor() {
    super("This feedback has no comment to publish");
    this.name = "ReviewSnippetNoCommentError";
  }
}

/** The referenced feedback / snippet does not exist. */
export class ReviewSnippetNotFoundError extends Error {
  constructor(what: "feedback" | "snippet" = "snippet") {
    super(what === "feedback" ? "Feedback not found" : "Review snippet not found");
    this.name = "ReviewSnippetNotFoundError";
  }
}

/* ----------------------------------------------- anonymised attribution (AC1) */

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;

/**
 * Spell a small children-count (1..10) for the attribution label; fall back to the
 * numeral above the spelled range. Pure.
 */
export function childrenCountWord(count: number): string {
  if (count >= 1 && count < COUNT_WORDS.length) return COUNT_WORDS[count]!;
  return String(count);
}

/**
 * Build the ANONYMISED attribution label from a children-count + place (AC1):
 * "Parent of two, Nairobi". With no children, just "Parent[, place]"; with no
 * place, drop the trailing place. NEVER contains a real name — it is built purely
 * from the count + the residential area. Pure + framework-free.
 */
export function buildAttributionLabel(childCount: number, place: string | null | undefined): string {
  const trimmedPlace = (place ?? "").trim();
  const base = childCount >= 1 ? `Parent of ${childrenCountWord(childCount)}` : "Parent";
  const label = trimmedPlace.length > 0 ? `${base}, ${trimmedPlace}` : base;
  return label.slice(0, REVIEW_ATTRIBUTION_MAX);
}

/**
 * Generate the DEFAULT anonymised attribution for a parent (by their user id) from
 * REAL data: the count of their non-archived children + their residential area
 * (AC1). Returns a label like "Parent of two, Nairobi". The parent's real name is
 * never read — only the count and the area. The admin can override the result.
 */
export async function generateDefaultAttribution(db: Executor, parentUserId: string): Promise<string> {
  const [profile] = await db
    .select({ parentId: parents.id, residentialArea: parents.residentialArea })
    .from(parents)
    .where(eq(parents.userId, parentUserId));
  if (!profile) return buildAttributionLabel(0, null);

  const [counted] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(children)
    .where(and(eq(children.parentId, profile.parentId), isNull(children.archivedAt)));
  const childCount = counted?.count ?? 0;
  return buildAttributionLabel(childCount, profile.residentialArea);
}

/* ------------------------------------------------------------------ curation */

export interface CurateReviewSnippetInput {
  /** The 5-star feedback (with a comment) to curate. */
  feedbackId: string;
  /** The admin curating it (for created_by + the audit actor). */
  actor: string;
  /**
   * The published quote. Defaults to the feedback comment; the admin may trim it.
   * Trimmed to {@link REVIEW_QUOTE_MAX}.
   */
  quote?: string;
  /**
   * The ANONYMISED attribution label. Defaults to the generated
   * "Parent of <n>, <place>"; the admin may override it (privacy guarantee, AC1).
   */
  attributionLabel?: string;
}

/**
 * Curate a review snippet from a 5-star feedback comment (AC1). Loads the feedback,
 * REJECTS it if it is not a 5-star rating or has no comment, defaults the quote to
 * the comment and the attribution to the generated anonymised label, and inserts a
 * (still-unpublished) snippet. Curation itself is not audited — only the later
 * PUBLISH is (AC3) — but the created_by is recorded.
 */
export async function curateReviewSnippet(
  db: Executor,
  input: CurateReviewSnippetInput,
): Promise<ReviewSnippetRow> {
  const [fb] = await db
    .select({ id: feedback.id, parentId: feedback.parentId, rating: feedback.rating, comment: feedback.comment })
    .from(feedback)
    .where(eq(feedback.id, input.feedbackId));
  if (!fb) throw new ReviewSnippetNotFoundError("feedback");
  if (fb.rating !== FIVE_STAR) throw new ReviewSnippetNotFiveStarError();
  const comment = (fb.comment ?? "").trim();
  if (comment.length === 0) throw new ReviewSnippetNoCommentError();

  const quote = (input.quote ?? comment).slice(0, REVIEW_QUOTE_MAX);
  const attributionLabel = (
    input.attributionLabel ?? (await generateDefaultAttribution(db, fb.parentId))
  ).slice(0, REVIEW_ATTRIBUTION_MAX);

  const [row] = await db
    .insert(reviewSnippets)
    .values({ feedbackId: fb.id, quote, attributionLabel, createdBy: input.actor })
    .returning();
  return row!;
}

export interface UpdateSnippetAttributionInput {
  snippetId: string;
  attributionLabel: string;
}

/**
 * Override a snippet's displayed attribution label (AC1) — the admin's privacy +
 * accuracy guarantee. Trimmed to the cap.
 */
export async function updateSnippetAttribution(
  db: Executor,
  input: UpdateSnippetAttributionInput,
): Promise<ReviewSnippetRow> {
  const [row] = await db
    .update(reviewSnippets)
    .set({ attributionLabel: input.attributionLabel.slice(0, REVIEW_ATTRIBUTION_MAX), updatedAt: new Date() })
    .where(eq(reviewSnippets.id, input.snippetId))
    .returning();
  if (!row) throw new ReviewSnippetNotFoundError();
  return row;
}

export interface ReorderReviewSnippetsInput {
  /** The snippet ids in the desired display order (index becomes display_order). */
  orderedIds: string[];
}

/** Set the home-page display order for a list of snippets (lower shows first). */
export async function reorderReviewSnippets(db: Executor, input: ReorderReviewSnippetsInput): Promise<void> {
  for (let i = 0; i < input.orderedIds.length; i++) {
    await db
      .update(reviewSnippets)
      .set({ displayOrder: i, updatedAt: new Date() })
      .where(eq(reviewSnippets.id, input.orderedIds[i]!));
  }
}

/* ----------------------------------------------------- publish / unpublish (AC3) */

export interface PublishReviewSnippetInput {
  snippetId: string;
  /** The admin acting (audit actor). */
  actor: string;
  /** Publish timestamp (defaults to now). Injected for deterministic tests. */
  at?: Date;
  ip?: string | null;
}

/**
 * Publish a curated snippet to the public home page (AC2) and AUDIT it (AC3). Sets
 * `published_at`. The audit payload carries the snippet + feedback ids and the
 * attribution label — NEVER the parent's real name (the label is already anonymised).
 */
export async function publishReviewSnippet(
  db: Executor,
  input: PublishReviewSnippetInput,
): Promise<ReviewSnippetRow> {
  const at = input.at ?? new Date();
  const [row] = await db
    .update(reviewSnippets)
    .set({ publishedAt: at, updatedAt: at })
    .where(eq(reviewSnippets.id, input.snippetId))
    .returning();
  if (!row) throw new ReviewSnippetNotFoundError();

  await audit(db, {
    actor: input.actor,
    action: "review_snippet.published",
    target: { table: "review_snippets", id: row.id },
    payload: {
      feedback_id: row.feedbackId,
      attribution_label: row.attributionLabel,
      ip: input.ip ?? undefined,
    },
  });
  return row;
}

export interface UnpublishReviewSnippetInput {
  snippetId: string;
  actor: string;
  at?: Date;
  ip?: string | null;
}

/** Pull a snippet from the public home page (clears `published_at`) and AUDIT it (AC3). */
export async function unpublishReviewSnippet(
  db: Executor,
  input: UnpublishReviewSnippetInput,
): Promise<ReviewSnippetRow> {
  const at = input.at ?? new Date();
  const [row] = await db
    .update(reviewSnippets)
    .set({ publishedAt: null, updatedAt: at })
    .where(eq(reviewSnippets.id, input.snippetId))
    .returning();
  if (!row) throw new ReviewSnippetNotFoundError();

  await audit(db, {
    actor: input.actor,
    action: "review_snippet.unpublished",
    target: { table: "review_snippets", id: row.id },
    payload: { feedback_id: row.feedbackId, ip: input.ip ?? undefined },
  });
  return row;
}

/* --------------------------------------------------------------- public read (AC2) */

/**
 * The PUBLIC projection of a published snippet (AC2): the quote + the anonymised
 * attribution label, plus a public id (the snippet's own id — not the feedback id,
 * not the parent id). Carries NO parent identity and NO feedback id.
 */
export interface PublicReviewSnippet {
  id: string;
  quote: string;
  attributionLabel: string;
}

export interface ListPublishedSnippetsOpts {
  /** Cap on returned quotes (defaults to {@link PUBLISHED_SNIPPETS_LIMIT}). */
  limit?: number;
}

/**
 * The public testimonials list (AC2): ONLY published snippets, ordered by
 * display_order (nulls last) then most-recently published, capped. The projection
 * deliberately selects ONLY the snippet id + quote + attribution label so no parent
 * identity or feedback id can ever leak to the public surface.
 */
export async function listPublishedSnippets(
  db: Executor,
  opts: ListPublishedSnippetsOpts = {},
): Promise<PublicReviewSnippet[]> {
  const limit = opts.limit ?? PUBLISHED_SNIPPETS_LIMIT;
  const rows = await db
    .select({
      id: reviewSnippets.id,
      quote: reviewSnippets.quote,
      attributionLabel: reviewSnippets.attributionLabel,
    })
    .from(reviewSnippets)
    .where(isNotNull(reviewSnippets.publishedAt))
    .orderBy(
      sql`${reviewSnippets.displayOrder} asc nulls last`,
      desc(reviewSnippets.publishedAt),
    )
    .limit(limit);
  return rows.map((r) => ({ id: r.id, quote: r.quote, attributionLabel: r.attributionLabel }));
}

/**
 * The HOME-PAGE social-proof projection (Story 36.5 AC1): the LATEST published
 * snippets ordered STRICTLY by publish recency (`published_at` DESC), capped to
 * {@link HOME_TESTIMONIALS_LIMIT} (3) by default. This deliberately differs from
 * {@link listPublishedSnippets} (which honours the admin's `display_order` for the
 * full curated list): the home strip auto-pulls whatever was most-recently curated &
 * published, so a fresh publication propagates to the home page within the endpoint's
 * 1h cache window — no reorder required. Same PII-absence guarantee: only the snippet
 * id + quote + attribution label cross the boundary.
 */
export async function listLatestPublishedSnippets(
  db: Executor,
  opts: ListPublishedSnippetsOpts = {},
): Promise<PublicReviewSnippet[]> {
  const limit = opts.limit ?? HOME_TESTIMONIALS_LIMIT;
  const rows = await db
    .select({
      id: reviewSnippets.id,
      quote: reviewSnippets.quote,
      attributionLabel: reviewSnippets.attributionLabel,
    })
    .from(reviewSnippets)
    .where(isNotNull(reviewSnippets.publishedAt))
    .orderBy(desc(reviewSnippets.publishedAt), desc(reviewSnippets.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, quote: r.quote, attributionLabel: r.attributionLabel }));
}

/* ---------------------------------------------------------------- admin reads */

/** A 5-star feedback comment available to curate (AC1) — with a default attribution. */
export interface FiveStarCandidate {
  feedbackId: string;
  comment: string;
  rating: number;
  submittedAt: Date;
  /** Suggested anonymised attribution from real data; the admin may override it. */
  suggestedAttribution: string;
}

/**
 * List 5-star feedback comments NOT yet curated, newest-first, each with a suggested
 * anonymised attribution (AC1). Only rating=5 with a non-empty comment qualifies.
 */
export async function listFiveStarCandidates(db: Executor): Promise<FiveStarCandidate[]> {
  const rows = await db
    .select({
      feedbackId: feedback.id,
      parentId: feedback.parentId,
      comment: feedback.comment,
      rating: feedback.rating,
      submittedAt: feedback.submittedAt,
      snippetId: reviewSnippets.id,
    })
    .from(feedback)
    .leftJoin(reviewSnippets, eq(reviewSnippets.feedbackId, feedback.id))
    .where(and(eq(feedback.rating, FIVE_STAR), isNotNull(feedback.submittedAt)))
    .orderBy(desc(feedback.submittedAt));

  const candidates: FiveStarCandidate[] = [];
  for (const r of rows) {
    if (r.snippetId) continue; // already curated
    const comment = (r.comment ?? "").trim();
    if (comment.length === 0) continue; // no quote to publish
    candidates.push({
      feedbackId: r.feedbackId,
      comment,
      rating: r.rating ?? FIVE_STAR,
      submittedAt: r.submittedAt!,
      suggestedAttribution: await generateDefaultAttribution(db, r.parentId),
    });
  }
  return candidates;
}

/** A curated snippet as the admin sees it — with its publish state + feedback id. */
export interface AdminReviewSnippet {
  id: string;
  feedbackId: string;
  quote: string;
  attributionLabel: string;
  published: boolean;
  publishedAt: Date | null;
  displayOrder: number | null;
  createdAt: Date;
}

/** List all curated snippets for the admin curation screen (published + drafts). */
export async function listSnippetsForAdmin(db: Executor): Promise<AdminReviewSnippet[]> {
  const rows = await db
    .select()
    .from(reviewSnippets)
    .orderBy(sql`${reviewSnippets.displayOrder} asc nulls last`, asc(reviewSnippets.createdAt));
  return rows.map((r) => ({
    id: r.id,
    feedbackId: r.feedbackId,
    quote: r.quote,
    attributionLabel: r.attributionLabel,
    published: r.publishedAt !== null,
    publishedAt: r.publishedAt,
    displayOrder: r.displayOrder,
    createdAt: r.createdAt,
  }));
}
