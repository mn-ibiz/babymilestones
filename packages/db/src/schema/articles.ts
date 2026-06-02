import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * `articles` (P6-E06-S04 / Story 36.4) — the parenting-stories blog. A DB-backed
 * blog of parenting articles for SEO + engagement. Each row is a slugged, tagged,
 * authored markdown post with a draft/published lifecycle (AC1). Admin CRUD is
 * gated on `manage config` (AC2); the public list + per-article pages render
 * PUBLISHED rows only (AC3) — drafts are never exposed.
 *
 * Lifecycle (AC1): `status` is 'draft' until published, then 'published' with
 * `publishedAt` stamped. Unpublishing reverts to 'draft' (and clears the public
 * surface). The body is stored as raw markdown (`bodyMd`); it is rendered to a
 * SAFE HTML subset at the edge (no MDX, no `dangerouslySetInnerHTML` of raw input).
 */
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL slug — lowercase kebab-case, unique so a slug resolves to one article. */
    slug: text("slug").notNull().unique(),
    /** Article title (the public H1 + list title). */
    title: text("title").notNull(),
    /** The article body as raw markdown / MDX text. Rendered to safe HTML at read. */
    bodyMd: text("body_md").notNull(),
    /** Optional cover/hero image URL (a link to an image stored elsewhere). */
    coverImageUrl: text("cover_image_url"),
    /** Free-text tags for filtering/browse (a Postgres text[] array). */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`)
      .$type<string[]>(),
    /** The author's display name (free text — not necessarily a system user). */
    author: text("author").notNull(),
    /** Lifecycle (AC1): 'draft' (not yet/again published) | 'published' (live). */
    status: text("status").notNull().default("draft"),
    /** When the article was last published. NULL = never published (draft-only). */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** The admin who created the article (FK to users). */
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    // The public list reads published rows newest-first; the status filter narrows.
    statusPublishedIdx: index("articles_status_published_at_idx").on(t.status, t.publishedAt),
  }),
);

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleInsert = typeof articles.$inferInsert;
