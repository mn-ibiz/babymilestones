import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { parents } from "./parents.js";

/**
 * Children registry (P1-E02-S03). Each child belongs to one parent profile via
 * `parentId` (FK to `parents.id`). `firstName` + `dateOfBirth` are required; the
 * rest are nullable. `archivedAt` drives soft-delete — children are never
 * hard-deleted so historical bookings remain intact (AC4). DOB is a calendar
 * date (no time component); age-in-months is derived, never stored (AC2).
 */
export const children = pgTable(
  "children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    // `date` mode "string" keeps the value as an ISO YYYY-MM-DD string, matching
    // the contract input and avoiding timezone drift on a pure calendar date.
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    gender: text("gender"),
    allergiesNotes: text("allergies_notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdIdx: index("children_parent_id_idx").on(t.parentId),
  }),
);

export type ChildRow = typeof children.$inferSelect;
