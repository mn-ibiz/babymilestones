import {
  boolean,
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

/**
 * `staff_availability` (P3-E03-S01 / Story 25.1 AC1) — a recurring WEEKLY rule
 * for a stylist: on `dayOfWeek` (0=Sun..6=Sat), between `startTime` and
 * `endTime`, the stylist is in — but only during the calendar range
 * `[effectiveFrom, effectiveTo]` (inclusive both ends; `effectiveTo` null =
 * open/ongoing). This is the TEMPLATE; it is not bookable directly.
 *
 * The nightly salon-slot generator (mirroring the P2-E01 cron) materialises each
 * active availability × each salon service into concrete {@link salonSlots} for a
 * rolling future horizon (AC2). `isActive = false` retires a rule without deleting
 * the slots it already generated. Times are `HH:MM` 24h wall-clock strings; the
 * migration CHECK-constrains the format, `startTime < endTime`, and a non-inverted
 * effective range.
 */
export const staffAvailability = pgTable(
  "staff_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    /** 0 = Sunday .. 6 = Saturday (JS `Date#getDay()` convention). */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Window start, `HH:MM` 24h wall-clock. */
    startTime: text("start_time").notNull(),
    /** Window end, `HH:MM` 24h wall-clock (after `startTime`). */
    endTime: text("end_time").notNull(),
    /** Calendar date the weekly rule starts applying (inclusive lower bound). */
    effectiveFrom: date("effective_from").notNull(),
    /** Calendar date the rule stops applying (INCLUSIVE upper bound); null = open. */
    effectiveTo: date("effective_to"),
    /** Soft on/off — an inactive rule keeps the slots it already generated. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdIdx: index("staff_availability_staff_id_idx").on(t.staffId),
    activeDowIdx: index("staff_availability_active_dow_idx").on(t.isActive, t.dayOfWeek),
  }),
);

export type StaffAvailabilityRow = typeof staffAvailability.$inferSelect;
export type StaffAvailabilityInsert = typeof staffAvailability.$inferInsert;

/**
 * `salon_slots` (P3-E03-S01 / Story 25.1 AC2) — the concrete, bookable
 * materialisation of a stylist's availability for a specific salon service: one
 * row per (availability × service × date × window) for a rolling future horizon,
 * regenerated nightly. `durationMinutes` is a SNAPSHOT taken from the service at
 * generation time, so a later duration edit only changes FUTURE regenerated slots
 * — already-generated / booked slots keep their snapshot (AC3).
 *
 * A booking consumes a salon slot via `bookings.salonSlotId`; a slot referenced
 * by a booking is protected from deletion on regeneration (AC3).
 */
export const salonSlots = pgTable(
  "salon_slots",
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
    /** Duration snapshot (minutes) from the service at generation time (AC3). */
    durationMinutes: integer("duration_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    availServiceDateStartUniq: uniqueIndex("salon_slots_avail_service_date_start_uniq").on(
      t.availabilityId,
      t.serviceId,
      t.slotDate,
      t.startTime,
    ),
    staffDateIdx: index("salon_slots_staff_id_slot_date_idx").on(t.staffId, t.slotDate),
    serviceDateIdx: index("salon_slots_service_id_slot_date_idx").on(t.serviceId, t.slotDate),
  }),
);

export type SalonSlotRow = typeof salonSlots.$inferSelect;
export type SalonSlotInsert = typeof salonSlots.$inferInsert;
