import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  commissionLedger,
  commissionRunLines,
  commissionRuns,
  staff,
  type CommissionRunRow,
} from "@bm/db";
import type { Executor } from "./staff.js";

/**
 * Commission run computation (P3-E01-S03/S04). A run closes a period: it claims
 * every UNCLAIMED commission-ledger entry (`run_id IS NULL`) whose `occurred_at`
 * falls in the half-open period `[periodStart, periodEnd)`, aggregates the NET
 * (accruals minus reversals) per staff member, writes a `commission_runs` row +
 * one `commission_run_lines` row per staff with a positive net, and stamps each
 * claimed entry's `run_id` — all atomically.
 *
 * Claiming via `run_id` is what makes a later monthly run EXCLUDE commission
 * already taken by an ad-hoc run (S04 AC3) and guarantees no entry is ever
 * double-counted across runs. Monthly runs are additionally unique per period
 * (partial unique index), so re-running the same month is a no-op (S03 AC4).
 */

export interface CreateCommissionRunInput {
  kind: "monthly" | "ad_hoc";
  /** Inclusive period start. */
  periodStart: Date;
  /** Exclusive period end (half-open). */
  periodEnd: Date;
  /** Acting user (null for the scheduled job). */
  createdBy?: string | null;
}

export interface CommissionRunResult {
  run: CommissionRunRow;
  lines: Array<{ staffId: string; staffNameSnapshot: string; amountCents: number }>;
  /** True when an idempotent monthly re-run found the existing run (no-op). */
  alreadyExisted: boolean;
}

/** Postgres unique-violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "23505" ||
    (typeof e?.message === "string" && /duplicate key|unique constraint/iu.test(e.message))
  );
}

/**
 * Create a commission run for a period (S03 AC2/AC3, S04 AC2). Idempotent for
 * monthly runs: a second run for the same period returns the existing one
 * (`alreadyExisted: true`) without claiming anything. Returns the run + its lines.
 */
export async function createCommissionRun(
  db: Executor,
  input: CreateCommissionRunInput,
): Promise<CommissionRunResult> {
  const apply = async (tx: Executor): Promise<CommissionRunResult> => {
    // Monthly idempotency: if a monthly run already covers this exact period,
    // return it untouched (S03 AC4). The partial unique index is the durable
    // backstop for a concurrent race (handled below on conflict).
    if (input.kind === "monthly") {
      const [existing] = await tx
        .select()
        .from(commissionRuns)
        .where(
          and(
            eq(commissionRuns.kind, "monthly"),
            eq(commissionRuns.periodStart, input.periodStart),
            eq(commissionRuns.periodEnd, input.periodEnd),
          ),
        );
      if (existing) {
        const lines = await loadLines(tx, existing.id);
        return { run: existing, lines, alreadyExisted: true };
      }
    }

    // Net per staff over UNCLAIMED entries in the period. Claiming (run_id NULL)
    // is what excludes entries already taken by an ad-hoc run (S04 AC3).
    const grouped = await tx
      .select({
        staffId: commissionLedger.staffId,
        net: sql<string>`COALESCE(SUM(${commissionLedger.amountCents}), 0)`,
      })
      .from(commissionLedger)
      .where(
        and(
          isNull(commissionLedger.runId),
          gte(commissionLedger.occurredAt, input.periodStart),
          lt(commissionLedger.occurredAt, input.periodEnd),
        ),
      )
      .groupBy(commissionLedger.staffId);

    // Create the run row first (so lines can reference it).
    let run: CommissionRunRow;
    try {
      const [created] = await tx
        .insert(commissionRuns)
        .values({
          kind: input.kind,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          totalCents: 0,
          createdBy: input.createdBy ?? null,
        })
        .returning();
      run = created!;
    } catch (err) {
      // Concurrent monthly run for the same period won the race → return it.
      if (input.kind === "monthly" && isUniqueViolation(err)) {
        const [existing] = await tx
          .select()
          .from(commissionRuns)
          .where(
            and(
              eq(commissionRuns.kind, "monthly"),
              eq(commissionRuns.periodStart, input.periodStart),
              eq(commissionRuns.periodEnd, input.periodEnd),
            ),
          );
        const lines = existing ? await loadLines(tx, existing.id) : [];
        return { run: existing!, lines, alreadyExisted: true };
      }
      throw err;
    }

    // Stamp every unclaimed entry in the period with this run id (claim them).
    await tx
      .update(commissionLedger)
      .set({ runId: run.id })
      .where(
        and(
          isNull(commissionLedger.runId),
          gte(commissionLedger.occurredAt, input.periodStart),
          lt(commissionLedger.occurredAt, input.periodEnd),
        ),
      );

    // Names for the lines, snapshotted at run time.
    const lines: Array<{ staffId: string; staffNameSnapshot: string; amountCents: number }> = [];
    let total = 0;
    for (const g of grouped) {
      const amount = Number(g.net);
      if (amount <= 0) continue; // only positive nets are paid out as a line
      const [s] = await tx.select({ name: staff.displayName }).from(staff).where(eq(staff.id, g.staffId));
      const name = s?.name ?? "(unknown)";
      await tx.insert(commissionRunLines).values({
        runId: run.id,
        staffId: g.staffId,
        staffNameSnapshot: name,
        amountCents: amount,
      });
      lines.push({ staffId: g.staffId, staffNameSnapshot: name, amountCents: amount });
      total += amount;
    }

    const [updated] = await tx
      .update(commissionRuns)
      .set({ totalCents: total })
      .where(eq(commissionRuns.id, run.id))
      .returning();

    return { run: updated!, lines, alreadyExisted: false };
  };

  return db.transaction(apply);
}

/** Load a run's lines, ordered by staff name for stable CSV output. */
async function loadLines(
  db: Executor,
  runId: string,
): Promise<Array<{ staffId: string; staffNameSnapshot: string; amountCents: number }>> {
  const rows = await db
    .select({
      staffId: commissionRunLines.staffId,
      staffNameSnapshot: commissionRunLines.staffNameSnapshot,
      amountCents: commissionRunLines.amountCents,
    })
    .from(commissionRunLines)
    .where(eq(commissionRunLines.runId, runId));
  return rows;
}

/** The payout CSV column order (P3-E01-S05 AC1). Stable — tests assert it. */
export const PAYOUT_CSV_COLUMNS = ["staff_name", "phone", "amount", "reference"] as const;

/** Escape a CSV field per RFC 4180 (quote if it contains , " or newline). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Format integer cents as a plain decimal amount ("150000" → "1500.00"). */
function amountField(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

/** One payout CSV row: staff name, phone, amount, reference (M-Pesa B2C feed). */
export interface PayoutRow {
  staffName: string;
  phone: string;
  amountCents: number;
  reference: string;
}

/**
 * Build the payout CSV for a commission run (P3-E01-S05 AC1). Pure: takes the
 * resolved rows (name, phone, amount, reference) and renders RFC-4180 CSV with a
 * stable header. Amounts are integer cents rendered as a decimal; a missing
 * phone is a blank field (the line is still emitted). Exported for unit testing.
 */
export function buildPayoutCsv(rows: PayoutRow[]): string {
  const lines: string[] = [PAYOUT_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [csvField(r.staffName), csvField(r.phone), amountField(r.amountCents), csvField(r.reference)].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export interface CommissionRunPreview {
  periodStart: Date;
  periodEnd: Date;
  totalCents: number;
  lines: Array<{ staffId: string; staffNameSnapshot: string; amountCents: number }>;
}

/**
 * Preview a commission run over a date range WITHOUT persisting anything
 * (P3-E01-S04 AC1). Same net-per-staff aggregation over UNCLAIMED entries as
 * {@link createCommissionRun} — so the preview matches what a confirm would
 * produce — but it claims nothing and writes no rows. Read-only (not audited).
 */
export async function previewCommissionRun(
  db: Executor,
  input: { periodStart: Date; periodEnd: Date },
): Promise<CommissionRunPreview> {
  const grouped = await db
    .select({
      staffId: commissionLedger.staffId,
      net: sql<string>`COALESCE(SUM(${commissionLedger.amountCents}), 0)`,
    })
    .from(commissionLedger)
    .where(
      and(
        isNull(commissionLedger.runId),
        gte(commissionLedger.occurredAt, input.periodStart),
        lt(commissionLedger.occurredAt, input.periodEnd),
      ),
    )
    .groupBy(commissionLedger.staffId);

  const lines: CommissionRunPreview["lines"] = [];
  let total = 0;
  for (const g of grouped) {
    const amount = Number(g.net);
    if (amount <= 0) continue;
    const [s] = await db.select({ name: staff.displayName }).from(staff).where(eq(staff.id, g.staffId));
    lines.push({ staffId: g.staffId, staffNameSnapshot: s?.name ?? "(unknown)", amountCents: amount });
    total += amount;
  }
  lines.sort((a, b) => a.staffNameSnapshot.localeCompare(b.staffNameSnapshot));
  return { periodStart: input.periodStart, periodEnd: input.periodEnd, totalCents: total, lines };
}

/**
 * The half-open `[start, end)` of the calendar month PRIOR to `at`, in UTC
 * (P3-E01-S03 AC2). E.g. at 2026-07-01T02:00Z → [2026-06-01, 2026-07-01). Pure +
 * exported for the job + unit testing.
 */
export function priorMonthPeriod(at: Date): { periodStart: Date; periodEnd: Date } {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth(); // 0-based; this month
  const periodEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)); // first of this month
  const periodStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)); // first of prior month
  return { periodStart, periodEnd };
}
