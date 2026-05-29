import { bigint, index, pgTable, timestamp, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { children } from "./children.js";
import { invoices } from "./invoices.js";
import { parents } from "./parents.js";

/**
 * A recorded service visit (P1-E05-S04). One booking = one child attended one
 * service, attributed to a staff member, with the staff name + rate SNAPSHOTTED
 * onto the row (AC2) so a later staff/rate change never rewrites history.
 *
 * Confirming a visit creates one booking + one invoice and immediately checks
 * the child in (AC3) — the wallet debit (P1-E03-S05) runs against `invoiceId`.
 *
 * The services + staff catalogues are a later epic (P1-E07), so `serviceId` and
 * `staffId` are nullable uuids with NO FK yet (forward-compatible — the FKs land
 * with P1-E07). P1 records arrivals only; no double-booking / time-slot check.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id),
    /** Booked service (P1-E07 catalogue) — nullable uuid, no FK yet. */
    serviceId: uuid("service_id"),
    /** Attributed staff member (P1-E07 staff records) — nullable uuid, no FK yet. */
    staffId: uuid("staff_id"),
    /** Snapshot of the staff member's display name at confirm time (AC2). */
    staffNameSnapshot: text("staff_name_snapshot").notNull(),
    /** Snapshot of the service rate in integer cents at confirm time (AC2). */
    staffRateSnapshot: bigint("staff_rate_snapshot", { mode: "number" }).notNull(),
    /** The invoice raised for this visit (1:1). */
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    /**
     * The session slot this booking consumes (P2-E01-S01) — nullable uuid with a
     * FK to `session_slots`. Existing P1 arrivals carry NULL; a slot's
     * remaining_capacity counts the bookings whose `slotId` matches it (AC3).
     */
    slotId: uuid("slot_id"),
    /**
     * Booking lifecycle (P2-E01-S06): `confirmed` (default) | `cancelled`. A
     * cancelled booking is excluded from a slot's capacity count, freeing the
     * seat without deleting history. CHECK-constrained in migration 0045.
     */
    status: text("status").notNull().default("confirmed"),
    /** A visit is created already checked-in (AC3) — set at confirm time. */
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdCreatedAtIdx: index("bookings_parent_id_created_at_idx").on(t.parentId, t.createdAt),
    invoiceIdUniq: uniqueIndex("bookings_invoice_id_uniq").on(t.invoiceId),
    slotIdIdx: index("bookings_slot_id_idx").on(t.slotId),
  }),
);

export type BookingRow = typeof bookings.$inferSelect;
export type BookingInsert = typeof bookings.$inferInsert;
