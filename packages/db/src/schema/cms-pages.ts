import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * `cms_pages` (P6-E06-S03 / Story 36.3) — the lightweight, DB-backed CMS for the
 * public per-unit marketing pages. One row per public slug (the unit key). An admin
 * edits hero copy / image, the CTA, and an ordered list of body sections WITHOUT a
 * deploy; the platform's per-unit public pages render the PUBLISHED row when one
 * exists, falling back to the static `unit-content` model otherwise.
 *
 * Lifecycle (AC2): `status` is 'draft' until published, then 'published' with
 * `publishedAt` stamped. Editing a published page reverts it to draft until
 * re-published, so the public never sees an in-progress edit.
 */

/** One ordered body section of a CMS page — a heading + (markdown/rich-text) body. */
export interface CmsBodySection {
  heading: string;
  body: string;
}

export const cmsPages = pgTable(
  "cms_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The page key — one row per public slug (the unit key, e.g. "play"). Unique. */
    slug: text("slug").notNull().unique(),
    /** Lifecycle (AC2): 'draft' (not yet/again published) | 'published' (live). */
    status: text("status").notNull().default("draft"),
    /** Hero headline / short copy. */
    heroCopy: text("hero_copy").notNull().default(""),
    /** Hero image URL (a link to an image stored elsewhere). */
    heroImageUrl: text("hero_image_url").notNull().default(""),
    /** CTA label (e.g. "Book now"). */
    ctaLabel: text("cta_label").notNull().default(""),
    /** CTA href (e.g. "/signup"). */
    ctaHref: text("cta_href").notNull().default(""),
    /** Ordered list of { heading, body } body sections. */
    bodySections: jsonb("body_sections")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<CmsBodySection[]>(),
    /** The admin who last saved the page (FK to users). */
    updatedBy: uuid("updated_by").references(() => users.id),
    /** When the page was last published. NULL = never published (draft-only). */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("cms_pages_status_idx").on(t.status),
  }),
);

export type CmsPageRow = typeof cmsPages.$inferSelect;
export type CmsPageInsert = typeof cmsPages.$inferInsert;

/**
 * `cms_page_revisions` (P6-E06-S03 / Story 36.3 AC3) — an append-only history of a
 * page's content. Every save AND every publish appends an immutable
 * {@link CmsPageSnapshot} so prior versions are retained and viewable.
 */
export interface CmsPageSnapshot {
  slug: string;
  status: string;
  heroCopy: string;
  heroImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bodySections: CmsBodySection[];
}

export const cmsPageRevisions = pgTable(
  "cms_page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The page this revision belongs to (cascade-deleted with the page). */
    pageId: uuid("page_id")
      .notNull()
      .references(() => cmsPages.id, { onDelete: "cascade" }),
    /** Immutable snapshot of the page content at save/publish time (AC3). */
    snapshot: jsonb("snapshot").notNull().$type<CmsPageSnapshot>(),
    /** The admin who created this revision (the saver/publisher). FK to users. */
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pageIdx: index("cms_page_revisions_page_idx").on(t.pageId, t.createdAt),
  }),
);

export type CmsPageRevisionRow = typeof cmsPageRevisions.$inferSelect;
export type CmsPageRevisionInsert = typeof cmsPageRevisions.$inferInsert;
