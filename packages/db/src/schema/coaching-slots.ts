import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { services } from "./services.js";
import { staff } from "./staff.js";
import { staffAvailability } from "./staff-availability.js";

/**
 * `coaching_slots` (P5-E01-S02 / Story 31.2 AC1/AC3) — the concrete, bookable
 * materialisation of a coach's availability for a specific coaching offering: one
 * row per (availability × service × date × window) for a rolling future horizon,
 * regenerated nightly. Mirrors {@link salonSlots} but for the COACHING unit, with
 * a strict capacity of 1 — a 1:1 session holds its slot PRIVATELY, so a booked
 * slot is unavailable to everyone else (AC3).
 *
 * Coach availability REUSES the generic `staff_availability` table (the same
 * mechanism as P3-E03-S01, AC1). `durationMinutes` is a SNAPSHOT taken from the
 * offering's `coachingDurationMinutes` at generation time, so a later duration
 * edit only changes FUTURE regenerated slots — already-generated / booked slots
 * keep their snapshot.
 *
 * A booking consumes a coaching slot via `bookings.coachingSlotId`; a slot
 * referenced by a non-cancelled booking is protected from deletion on
 * regeneration.
 */
export const coachingSlots = pgTable(
  "coaching_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** The availability rule that generated this slot (nullable for ad-hoc slots). */
    availabilityId: uuid("availability_id").references(() => staffAvailability.id),
    /** Calendar date the slot falls on. */
    slotDate: date("slot_date").notNull(),
    /** Window start, `HH:MM` 24h wall-clock. */
    startTime: text("start_time").notNull(),
    /** Window end, `HH:MM` 24h wall-clock. */
    endTime: text("end_time").notNull(),
    /** Duration snapshot (minutes) from the offering at generation time. */
    durationMinutes: integer("duration_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    availServiceDateStartUniq: uniqueIndex("coaching_slots_avail_service_date_start_uniq").on(
      t.availabilityId,
      t.serviceId,
      t.slotDate,
      t.startTime,
    ),
    staffDateIdx: index("coaching_slots_staff_id_slot_date_idx").on(t.staffId, t.slotDate),
    serviceDateIdx: index("coaching_slots_service_id_slot_date_idx").on(t.serviceId, t.slotDate),
  }),
);

export type CoachingSlotRow = typeof coachingSlots.$inferSelect;
export type CoachingSlotInsert = typeof coachingSlots.$inferInsert;
