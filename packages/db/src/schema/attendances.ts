import { pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";

/**
 * Attendance lifecycle of a booked slot (P2-E03-S02 / S03). DISTINCT from
 * `bookings.checkedInAt` (the P1 walk-in stamp): a P2 slot booking is created in
 * advance and only attended once the attendant checks the child in. One row per
 * booking (`bookingIdUniq`) fences a double check-in.
 *
 * Check-in (S02) sets `checkedInAt` + optional `droppedOffAt` and triggers the
 * P1-E03-S05 wallet debit. The hand-off (S03) sets `checkedOutAt` and writes an
 * observation row — those columns are nullable until then.
 */
export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    /** When the attendant checked the child in (AC3). */
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    /** Optional drop-off time captured at check-in (AC2). */
    droppedOffAt: timestamp("dropped_off_at", { withTimezone: true }),
    /** Acting staff user id who checked the child in. */
    checkedInBy: uuid("checked_in_by"),
    /** Hand-off (S03): when the child was collected. Null until checked out. */
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    /** Acting staff user id who performed the hand-off (S03). */
    checkedOutBy: uuid("checked_out_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookingIdUniq: uniqueIndex("attendances_booking_id_uniq").on(t.bookingId),
  }),
);

export type AttendanceRow = typeof attendances.$inferSelect;
export type AttendanceInsert = typeof attendances.$inferInsert;
