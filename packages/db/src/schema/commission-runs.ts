import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staff } from "./staff.js";

/**
 * Commission runs (P3-E01-S03/S04/S05). A run closes a period and snapshots each
 * staff member's total commission for it into {@link commissionRunLines}.
 *  - `monthly` — the scheduled month-end close (S03); unique per period so a
 *    re-run is a no-op (partial unique index `monthly_period_uniq`, migration 0061).
 *  - `ad_hoc` — an admin-triggered run over an arbitrary range (S04).
 *
 * Membership of a ledger entry in a run is recorded on `commissionLedger.runId`
 * so a later monthly run excludes commission already paid out in an ad-hoc run
 * (S04 AC3) and no entry is ever double-counted. `paidOutAt` is set when the
 * accountant confirms the external payout was made (S05 AC3).
 */
export const commissionRuns = pgTable(
  "commission_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** 'monthly' | 'ad_hoc' — CHECK-constrained in migration 0061. */
    kind: text("kind").notNull(),
    /** Inclusive period start. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    /** Exclusive period end (half-open). */
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Grand total commission cents across all lines. */
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    /** Set when the accountant confirms the external payout was made (S05 AC3). */
    paidOutAt: timestamp("paid_out_at", { withTimezone: true }),
    /** Acting user who created the run; null for the scheduled job. */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    monthlyPeriodUniq: uniqueIndex("commission_runs_monthly_period_uniq")
      .on(t.periodStart, t.periodEnd)
      .where(sql`${t.kind} = 'monthly'`),
  }),
);

export type CommissionRunRow = typeof commissionRuns.$inferSelect;
export type CommissionRunInsert = typeof commissionRuns.$inferInsert;

/**
 * Per-staff total for a run (P3-E01-S03 AC3) — one line per staff member with
 * net commission > 0 in the period. Carries a `staffNameSnapshot` so the payout
 * CSV (S05) keeps a name even if the staff record is later renamed/retired.
 */
export const commissionRunLines = pgTable(
  "commission_run_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => commissionRuns.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    /** Staff display-name snapshot at run time (payout history must not rewrite). */
    staffNameSnapshot: text("staff_name_snapshot").notNull(),
    /** Net commission cents for this staff member in the run period (>0). */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runStaffUniq: uniqueIndex("commission_run_lines_run_staff_uniq").on(t.runId, t.staffId),
    runIdx: index("commission_run_lines_run_idx").on(t.runId),
  }),
);

export type CommissionRunLineRow = typeof commissionRunLines.$inferSelect;
export type CommissionRunLineInsert = typeof commissionRunLines.$inferInsert;
