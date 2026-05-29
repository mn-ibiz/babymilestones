import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { services } from "./services.js";

/**
 * `service_schedules` (P2-E01-S01 AC1) — a recurring weekly availability rule for
 * a service: on `dayOfWeek` (0=Sun..6=Sat), between `startTime` and `endTime`,
 * offer slots of `slotDurationMinutes` each, each holding `capacity` children.
 *
 * A schedule is the TEMPLATE — it is not bookable directly. The nightly job
 * (P2-E01 cron) materialises it into concrete {@link sessionSlots} for the next
 * 60 days (AC2). Admin CRUD lives over this table (AC4); every change is audited
 * (AC5). `isActive = false` retires a rule without deleting it.
 *
 * Times are stored as `HH:MM` 24h strings (wall-clock); the migration CHECK-
 * constrains the format and that `startTime < endTime`.
 */
export const serviceSchedules = pgTable(
  "service_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** 0 = Sunday .. 6 = Saturday (JS `Date#getDay()` convention). */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Window start, `HH:MM` 24h wall-clock. */
    startTime: text("start_time").notNull(),
    /** Window end, `HH:MM` 24h wall-clock (after `startTime`). */
    endTime: text("end_time").notNull(),
    /** Length of each generated slot in minutes (> 0). */
    slotDurationMinutes: integer("slot_duration_minutes").notNull(),
    /** Children per slot (>= 0; 0 = temporarily closed but kept on the rule). */
    capacity: integer("capacity").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serviceIdIdx: index("service_schedules_service_id_idx").on(t.serviceId),
  }),
);

export type ServiceScheduleRow = typeof serviceSchedules.$inferSelect;
export type ServiceScheduleInsert = typeof serviceSchedules.$inferInsert;

/**
 * `session_slots` (P2-E01-S01 AC2) — the concrete, bookable materialisation of a
 * schedule: one row per (date × window) for the next 60 days, regenerated
 * nightly. `capacity` is a SNAPSHOT taken from the schedule at generation time,
 * so a later schedule edit only affects FUTURE regenerated slots — already-
 * generated / booked slots keep their snapshot (AC4).
 *
 * `remaining_capacity` is NOT stored: it is `capacity − (bookings in the slot)`,
 * computed at read time (AC3).
 */
export const sessionSlots = pgTable(
  "session_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** The schedule that generated this slot (nullable for ad-hoc slots). */
    scheduleId: uuid("schedule_id").references(() => serviceSchedules.id),
    /** Calendar date the slot falls on. */
    slotDate: date("slot_date").notNull(),
    /** Window start, `HH:MM` 24h wall-clock. */
    startTime: text("start_time").notNull(),
    /** Window end, `HH:MM` 24h wall-clock. */
    endTime: text("end_time").notNull(),
    /** Capacity snapshot from the schedule at generation time (AC4). */
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scheduleDateStartUniq: uniqueIndex("session_slots_schedule_date_start_uniq").on(
      t.scheduleId,
      t.slotDate,
      t.startTime,
    ),
    serviceDateIdx: index("session_slots_service_id_slot_date_idx").on(t.serviceId, t.slotDate),
  }),
);

export type SessionSlotRow = typeof sessionSlots.$inferSelect;
export type SessionSlotInsert = typeof sessionSlots.$inferInsert;
