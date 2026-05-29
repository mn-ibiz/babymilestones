import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { attendances } from "./attendances.js";
import { bookings } from "./bookings.js";
import { children } from "./children.js";
import { parents } from "./parents.js";

/**
 * Free-text pickup observation (P2-E03-S03). One row per hand-off: the child's
 * `mood` (one of the fixed 5-emoji picker), selected `activities` (a configurable
 * chip list, stored as a JSON string array), and a single optional free-text
 * `note`. `childId` / `parentId` are denormalised so the 24-month anonymisation
 * job (S05) can NULL them in place and scrub `note`; `anonymisedAt` marks a
 * cleared row. `attendantNameSnapshot` is captured at hand-off for the parent
 * feed (S04).
 */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    attendanceId: uuid("attendance_id").references(() => attendances.id),
    /** Denormalised owner ids — NULLed by the S05 anonymisation job. */
    childId: uuid("child_id").references(() => children.id),
    parentId: uuid("parent_id").references(() => parents.id),
    /** Mood emoji (default 😊). Required. */
    mood: text("mood").notNull(),
    /** Selected activity chips — a JSON array of strings (AC1). */
    activities: jsonb("activities").$type<string[]>().notNull().default([]),
    /** Single optional free-text line (AC1). Scrubbed of names by S05. */
    note: text("note"),
    /** Acting attendant user id (attribution). */
    attendantId: uuid("attendant_id"),
    /** Attendant display name snapshot, shown in the parent feed (S04). */
    attendantNameSnapshot: text("attendant_name_snapshot").notNull(),
    /** Set by the S05 anonymisation job once PII is cleared (NULL until then). */
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    childIdCreatedAtIdx: index("observations_child_id_created_at_idx").on(t.childId, t.createdAt),
    bookingIdUniq: uniqueIndex("observations_booking_id_uniq").on(t.bookingId),
    createdAtIdx: index("observations_created_at_idx").on(t.createdAt),
  }),
);

export type ObservationRow = typeof observations.$inferSelect;
export type ObservationInsert = typeof observations.$inferInsert;
