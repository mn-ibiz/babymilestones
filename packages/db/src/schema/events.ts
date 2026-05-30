import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

/**
 * Events (Epic 30 — Events & Recital Ticketing).
 * Mirrors migration 0067_events.sql.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    // unit: reading_corner | talent_recital | general
    unit: text("unit").notNull().default("general"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    venue: text("venue"),
    capacity: integer("capacity").notNull(),
    published: boolean("published").notNull().default(false),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("events_starts_at_idx").on(table.startsAt),
    index("events_published_idx").on(table.published),
  ],
);
