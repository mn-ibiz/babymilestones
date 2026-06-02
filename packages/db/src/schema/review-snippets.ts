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
import { feedback } from "./feedback.js";
import { users } from "./users.js";

/**
 * `review_snippets` (P6-E04-S04 / Story 34.4) — the PUBLIC, CURATED face of the
 * Feedback Engine (Epic 34). An admin hand-picks which 5-star {@link feedback}
 * comments to publish as testimonials on the marketing home page, each shown under
 * an ANONYMISED attribution label (e.g. "Parent of two, Nairobi") — NEVER a real
 * parent name (AC1).
 *
 * A row is a curated projection of ONE `feedback` row: it copies the {@link quote}
 * (the comment text, possibly trimmed by the curator) and an
 * {@link attributionLabel} (defaulted from the parent's active-children count +
 * residential area, but ALWAYS editable by the admin to guarantee privacy +
 * accuracy). Curation is reserved to 5-star feedback (enforced in the curate
 * logic). Publication (`publishedAt` set) is a deliberate, audited admin act (AC3);
 * unpublishing clears it. {@link displayOrder} (nullable) orders the published
 * quotes on the home page.
 *
 * The public endpoint reads ONLY published rows and exposes ONLY the quote +
 * attribution_label — never the parent id/name, never the feedback id (AC2).
 */
export const reviewSnippets = pgTable(
  "review_snippets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The 5-star feedback this snippet curates (FK, cascades on feedback delete). */
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    /** The published quote — the feedback comment, possibly trimmed. ≤200 chars. */
    quote: text("quote").notNull(),
    /** The ANONYMISED attribution shown to the public. NEVER a real name. ≤120 chars. */
    attributionLabel: text("attribution_label").notNull(),
    /** When the snippet was PUBLISHED to the home page (AC2). NULL = curated only. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Optional ordering hint for the published quotes (lower first). */
    displayOrder: integer("display_order"),
    /** The admin who curated the snippet (FK to users). */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    feedbackUniq: uniqueIndex("review_snippets_feedback_uniq").on(t.feedbackId),
    publishedIdx: index("review_snippets_published_idx").on(t.publishedAt),
  }),
);

export type ReviewSnippetRow = typeof reviewSnippets.$inferSelect;
export type ReviewSnippetInsert = typeof reviewSnippets.$inferInsert;
