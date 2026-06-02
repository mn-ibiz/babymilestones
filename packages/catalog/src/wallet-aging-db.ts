import { eq, sql } from "drizzle-orm";
import { invoices, parents, users } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateWalletAging,
  type AgingInvoiceRow,
  type WalletAgingReport,
} from "./wallet-aging.js";

/**
 * P3-E05-S04 (Story 27.4) — DB read behind the wallet aging report. A thin
 * projection: it loads EVERY outstanding invoice (status NOT IN
 * `('settled','void')` AND positive `amount_due` — the same outstanding
 * definition the operations dashboard + parent surfaces use), joined to the
 * parent + user for the display name and the profile-link key (`users.id`), then
 * hands them to the pure {@link aggregateWalletAging} reducer, which ages each
 * invoice by its `createdAt` into the 0–7 / 8–30 / 31–60 / 61–90 / 90+ buckets
 * (AC1) and rolls each parent up under each bucket (AC2). Read-only — not audited.
 *
 * Ages are measured to `asOf` (defaults to the wall clock). The `createdAt` field
 * is the age basis (FIFO settlement clears the oldest `created_at` first; there is
 * no separate due-date column).
 */
export interface LoadWalletAgingOpts {
  /** The report instant ("now"). Defaults to the wall clock. */
  asOf?: Date;
}

export async function loadWalletAging(
  db: Executor,
  opts: LoadWalletAgingOpts = {},
): Promise<WalletAgingReport> {
  const asOf = opts.asOf ?? new Date();

  const rows = await db
    .select({
      invoiceId: invoices.id,
      parentId: invoices.parentId,
      userId: parents.userId,
      firstName: parents.firstName,
      lastName: parents.lastName,
      amountDue: invoices.amountDue,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(parents, eq(invoices.parentId, parents.id))
    .innerJoin(users, eq(parents.userId, users.id))
    .where(sql`${invoices.status} NOT IN ('settled', 'void') AND ${invoices.amountDue} > 0`);

  const agingInvoices: AgingInvoiceRow[] = rows.map((r) => ({
    invoiceId: r.invoiceId,
    parentId: r.parentId,
    userId: r.userId,
    parentName: `${r.firstName} ${r.lastName}`,
    amountDueCents: Number(r.amountDue),
    createdAt: r.createdAt,
  }));

  return aggregateWalletAging({ asOf, invoices: agingInvoices });
}
