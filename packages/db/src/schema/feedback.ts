import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * `feedback` (P6-E04-S01 / Story 34.1) — the FOUNDATION of the Feedback Engine
 * (Epic 34): a 0–5 rating invitation created for every completed PAID touchpoint
 * (salon checkout, play/talent pickup, doula session end, order fulfilled,
 * coaching session end). Stories 34-2/3/4 build read models + analytics on top.
 *
 * LIFECYCLE: a touchpoint completion CREATES an open invitation (`rating` NULL,
 * `invitedAt` set). The parent later SUBMITS a 0–5 rating + optional ≤200-char
 * comment via the SMS-stub one-tap link (the public {@link token}) or the in-app
 * prompt — which sets rating/comment/submittedAt ONCE.
 *
 * AC3 idempotency is enforced two ways:
 *  1. UNIQUE (sourceType, sourceId) — one invitation per touchpoint; a replayed
 *     completion (retried hook) is swallowed via `onConflictDoNothing`.
 *  2. submit only ever fills a row whose `submittedAt IS NULL`, so a re-submit /
 *     replay can never overwrite an already-answered rating.
 *
 * `parentId` keys on `users.id` (matching the parent-scoped tables). `token` is a
 * separate public uuid so the SMS link never exposes the internal row id.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public, link-safe id the SMS-stub one-tap link carries (never the row id). */
    token: uuid("token").notNull().defaultRandom(),
    /** Completion kind: 'salon' | 'attendance' | 'order' | 'coaching' (extensible). */
    sourceType: text("source_type").notNull(),
    /** Id of the source touchpoint (attendance id, order id, …) — opaque text. */
    sourceId: text("source_id").notNull(),
    /** Parent who receives + owns the invitation (FK to `users`). */
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id),
    /** Staff the touchpoint is attributed to (nullable: an order has none). */
    attributedStaffId: uuid("attributed_staff_id"),
    /** 0..5 stars. NULL until the parent submits (an open invitation). */
    rating: integer("rating"),
    /** Optional free-text comment, ≤200 chars (AC2). NULL until/unless given. */
    comment: text("comment"),
    /** When the invitation was created (the touchpoint completion time). */
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** When the parent submitted. NULL = still pending (an open invitation). */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    sourceUniq: uniqueIndex("feedback_source_uniq").on(t.sourceType, t.sourceId),
    tokenUniq: uniqueIndex("feedback_token_uniq").on(t.token),
    parentPendingIdx: index("feedback_parent_pending_idx").on(t.parentId),
  }),
);

export type FeedbackRow = typeof feedback.$inferSelect;
export type FeedbackInsert = typeof feedback.$inferInsert;
