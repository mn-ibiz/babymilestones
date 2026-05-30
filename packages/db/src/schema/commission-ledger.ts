import {
  bigint,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staff } from "./staff.js";
import { bookings } from "./bookings.js";

/**
 * Commission ledger (P3-E01-S02). An APPEND-ONLY ledger of commission accrued to
 * staff. On an attributed booking's settle one accrual row is written
 * (`source='booking'`): `amountCents` = service-price snapshot × the staff rate
 * in force at booking time, in INTEGER cents (AC1/AC3). A refund reverses it with
 * a NEW signed-opposite row (`source='refund_reversal'`, `reversesEntryId` →
 * original) — never an update/delete of the original (AC2/AC4).
 *
 * Idempotency: at most one accrual per booking (partial unique index
 * `one_accrual_per_booking` in migration 0060), so a re-run / replay is a no-op.
 */
export const commissionLedger = pgTable(
  "commission_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    /** Signed integer cents: positive accrual, negative reversal. */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Decimal rate percentage in force at booking time (snapshot, e.g. "12.50"). */
    rateSnapshot: numeric("rate_snapshot", { precision: 5, scale: 2 }).notNull(),
    /** 'booking' (accrual) | 'refund_reversal' — CHECK-constrained in migration 0060. */
    source: text("source").notNull(),
    /** For a reversal: the original row it reverses. Null for an accrual. */
    reversesEntryId: uuid("reverses_entry_id").references((): AnyPgColumn => commissionLedger.id),
    /** When the booking settled / was reversed (period attribution for runs). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * The commission run (P3-E01-S03/S04) that claimed this entry. Null until a
     * run includes it; stamped so no later run double-counts it (S04 AC3). FK
     * declared by the migration (0061) — typed as a plain uuid here to avoid a
     * schema import cycle with commission-runs.
     */
    runId: uuid("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffOccurredIdx: index("commission_ledger_staff_occurred_idx").on(t.staffId, t.occurredAt),
    oneAccrualPerBooking: uniqueIndex("commission_ledger_one_accrual_per_booking")
      .on(t.bookingId)
      .where(sql`${t.source} = 'booking'`),
    reversesIdx: index("commission_ledger_reverses_idx").on(t.reversesEntryId),
    runIdx: index("commission_ledger_run_idx").on(t.runId),
  }),
);

export type CommissionLedgerRow = typeof commissionLedger.$inferSelect;
export type CommissionLedgerInsert = typeof commissionLedger.$inferInsert;
