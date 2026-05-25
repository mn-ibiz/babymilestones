import type { Database, Transaction } from "@bm/db";
import { floatAccounts, reconciliationAdjustments, walletLedger } from "@bm/db";
import {
  reconciliationExportDays,
  type ReconciliationExportRow,
  type ReconciliationExportQuery,
} from "@bm/contracts";
import { and, asc, eq, lte, sql } from "drizzle-orm";

type LedgerReader = Database | Transaction;

/**
 * Per-day-per-account reconciliation export read model (P1-E06-S04 AC2).
 *
 * For every float account (active and inactive, in stable opening order) and
 * every calendar day in the inclusive `[fromDate, toDate]` range, produce one
 * row:
 *
 * - `systemCents` — opening balance + SUM of every `wallet_ledger` movement
 *   tagged to the account with `created_at` on or before end-of-day. This is the
 *   same ledger-derived float liability as the live reconciliation screen
 *   (P1-E06-S02), evaluated as-of each day.
 * - `adjustmentsCents` — net signed **approved** adjustments dated that very day
 *   (pending/rejected are excluded — only applied corrections move the figure).
 * - `realCents` — the real-world balance implied by corrections: the system
 *   figure plus the cumulative approved adjustments through the day. Approved
 *   adjustments are signed to bring system toward real, so
 *   `real = system + Σ approved ≤ day`.
 * - `driftCents` — `system − real` (AC2): the still-uncorrected gap.
 *
 * Money is integer cents throughout (bigint SUM, exact). Rows are ordered by
 * float account (opening order) then ascending day, so a CSV reads naturally.
 */
export async function reconciliationExportRows(
  db: LedgerReader,
  query: ReconciliationExportQuery,
): Promise<ReconciliationExportRow[]> {
  const days = reconciliationExportDays(query.fromDate, query.toDate);
  if (days.length === 0) return [];
  // End-of-window cut-off, exclusive upper bound = midnight after toDate (UTC).
  const windowEnd = new Date(`${days[days.length - 1]!}T00:00:00Z`);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

  const accounts = await db
    .select({
      id: floatAccounts.id,
      name: floatAccounts.name,
      opening: floatAccounts.openingBalance,
    })
    .from(floatAccounts)
    .orderBy(asc(floatAccounts.createdAt));

  // Per-account, per-day net ledger movement up to the window end. Grouping by a
  // truncated UTC day lets us accumulate forward in JS to the as-of-day balance.
  const ledgerDaily = await db
    .select({
      floatAccountId: walletLedger.floatAccountId,
      day: sql<string>`to_char(date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(walletLedger)
    .where(lte(walletLedger.createdAt, windowEnd))
    .groupBy(
      walletLedger.floatAccountId,
      sql`date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC')`,
    );

  // Per-account, per-day net APPROVED adjustment within (or before) the window.
  const adjDaily = await db
    .select({
      floatAccountId: reconciliationAdjustments.floatAccountId,
      day: sql<string>`to_char(date_trunc('day', ${reconciliationAdjustments.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${reconciliationAdjustments.amount}), 0)`,
    })
    .from(reconciliationAdjustments)
    .where(
      and(
        eq(reconciliationAdjustments.status, "approved"),
        lte(reconciliationAdjustments.createdAt, windowEnd),
      ),
    )
    .groupBy(
      reconciliationAdjustments.floatAccountId,
      sql`date_trunc('day', ${reconciliationAdjustments.createdAt} AT TIME ZONE 'UTC')`,
    );

  // Index the daily aggregates by account → day → cents.
  const ledgerByAccount = new Map<string, Map<string, number>>();
  for (const r of ledgerDaily) {
    if (!r.floatAccountId) continue; // untagged movements belong to no account
    const m = ledgerByAccount.get(r.floatAccountId) ?? new Map<string, number>();
    m.set(r.day, Number(r.total));
    ledgerByAccount.set(r.floatAccountId, m);
  }
  const adjByAccount = new Map<string, Map<string, number>>();
  for (const r of adjDaily) {
    const m = adjByAccount.get(r.floatAccountId) ?? new Map<string, number>();
    m.set(r.day, Number(r.total));
    adjByAccount.set(r.floatAccountId, m);
  }

  const rows: ReconciliationExportRow[] = [];
  for (const acct of accounts) {
    const opening = Number(acct.opening);
    const ledgerDays = ledgerByAccount.get(acct.id);
    const adjDays = adjByAccount.get(acct.id);

    // Pre-window carry: movements/adjustments dated before fromDate still count
    // toward the as-of-day balance on the first day.
    const fromDay = days[0]!;
    let cumLedger = 0;
    let cumAdj = 0;
    if (ledgerDays) {
      for (const [day, cents] of ledgerDays) if (day < fromDay) cumLedger += cents;
    }
    if (adjDays) {
      for (const [day, cents] of adjDays) if (day < fromDay) cumAdj += cents;
    }

    for (const day of days) {
      cumLedger += ledgerDays?.get(day) ?? 0;
      const dayAdj = adjDays?.get(day) ?? 0;
      cumAdj += dayAdj;
      const systemCents = opening + cumLedger;
      const realCents = systemCents + cumAdj;
      rows.push({
        date: day,
        floatAccountId: acct.id,
        account: acct.name,
        systemCents,
        realCents,
        driftCents: systemCents - realCents,
        adjustmentsCents: dayAdj,
      });
    }
  }

  return rows;
}
