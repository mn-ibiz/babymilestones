/** @bm/wallet — FIFO top-up settlement (P1-E03-S04).
 *
 * A parent's top-up clears the OLDEST outstanding invoice first, then the next,
 * until the credit is exhausted or all invoices are closed; any residual stays
 * as wallet balance (computed via SUM over the ledger, never stored). The whole
 * operation — the ledger credit posting plus every invoice mutation and linkage
 * row — runs inside ONE DB transaction so a partial failure can never leave an
 * invoice half-settled (atomicity, AC2/AC5).
 */
import type { Database } from "@bm/db";
import { invoices, walletLedger, walletLedgerInvoiceSettlement } from "@bm/db";
import { and, asc, eq } from "drizzle-orm";
import type { Cents } from "./index.js";

/** Input to {@link applyTopup}. */
export interface ApplyTopupInput {
  /** Parent whose outstanding invoices are settled FIFO. */
  parentId: string;
  /** Wallet that receives the credit (and any residual balance). */
  walletId: string;
  /** Positive integer cents being topped up. */
  amount: Cents;
  /** Caller-supplied dedup key; a replay with this key is a no-op. */
  idempotencyKey: string;
  /** Origin of the movement (e.g. `mpesa`, `cash`, `paystack`). */
  source: string;
  /** User id (or system actor) that posted the top-up. */
  postedBy: string;
}

/** Result of a settlement run. */
export interface ApplyTopupResult {
  /** The credit ledger entry id that funded the settlement. */
  ledgerEntryId: string;
  /** Total cents applied to invoices (0 when none were outstanding). */
  settled: Cents;
  /** Cents left as wallet balance after settlement. */
  residual: Cents;
  /** Per-invoice settlement breakdown, oldest-first. */
  settlements: { invoiceId: string; amount: Cents }[];
  /** True when this call was a no-op replay of a prior top-up. */
  replayed: boolean;
}

/**
 * Apply a top-up to a parent: credit the wallet once, then consume that credit
 * against outstanding invoices oldest `created_at` first (AC1). Each invoice is
 * settled until closed or the credit is exhausted (AC2); a partially-paid
 * invoice stays `pending` with a reduced `amount_due` (AC3). Every settlement
 * writes its OWN `wallet_ledger` debit row plus a
 * `wallet_ledger_invoice_settlement` linkage row tying that debit to the invoice
 * (AC5). The residual (top-up credit minus the settlement debits) is the wallet
 * balance — SUM-derived from the ledger, never stored.
 *
 * Idempotent via `idempotencyKey`: a replay finds the existing credit ledger
 * row, performs no further mutation, and returns `{ replayed: true }`.
 */
export async function applyTopup(
  db: Database,
  input: ApplyTopupInput,
): Promise<ApplyTopupResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("wallet.applyTopup: amount must be a positive integer (cents)");
  }

  return db.transaction(async (tx) => {
    // 1) Credit the wallet exactly once. The UNIQUE idempotency_key serialises
    //    racing/retried top-ups: at most one INSERT wins.
    const inserted = await tx
      .insert(walletLedger)
      .values({
        walletId: input.walletId,
        amount: input.amount,
        direction: "credit",
        kind: "topup",
        idempotencyKey: input.idempotencyKey,
        source: input.source,
        postedBy: input.postedBy,
      })
      .onConflictDoNothing({ target: walletLedger.idempotencyKey })
      .returning();

    // Replay: the credit already exists. Its settlement side-effects were
    // committed in the original transaction, so this call is a pure no-op.
    if (!inserted[0]) {
      const [existing] = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, input.idempotencyKey));
      return {
        ledgerEntryId: existing!.id,
        settled: 0,
        residual: 0,
        settlements: [],
        replayed: true,
      };
    }

    const creditEntryId = inserted[0].id;

    // 2) FIFO scan: outstanding invoices for this parent, oldest first.
    const outstanding = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.parentId, input.parentId), eq(invoices.status, "pending")))
      .orderBy(asc(invoices.createdAt), asc(invoices.id));

    let remaining = input.amount;
    const settlements: { invoiceId: string; amount: Cents }[] = [];

    for (const inv of outstanding) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, inv.amountDue);
      if (applied <= 0) continue;

      const newDue = inv.amountDue - applied;
      // Reduce amount_due; close the invoice when fully paid (AC2/AC3).
      await tx
        .update(invoices)
        .set({
          amountDue: newDue,
          status: newDue === 0 ? "settled" : "pending",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id));

      // AC5: each settlement is its OWN wallet_ledger debit. The debit reduces
      // the wallet balance so the residual (credit − debits) is correct. The
      // idempotency key is derived from the credit's key + the invoice so a
      // replay would conflict identically (defence-in-depth; the replay guard
      // above already short-circuits before reaching here).
      const [debit] = await tx
        .insert(walletLedger)
        .values({
          walletId: input.walletId,
          amount: -applied,
          direction: "debit",
          kind: "debit",
          idempotencyKey: `${input.idempotencyKey}:settle:${inv.id}`,
          source: input.source,
          postedBy: input.postedBy,
        })
        .returning();

      // Linkage row tying this debit ledger entry to the invoice it settled.
      await tx.insert(walletLedgerInvoiceSettlement).values({
        ledgerEntryId: debit!.id,
        invoiceId: inv.id,
        amount: applied,
      });

      settlements.push({ invoiceId: inv.id, amount: applied });
      remaining -= applied;
    }

    const settled = input.amount - remaining;
    // Residual stays as wallet balance — the credit minus the settlement debits;
    // balance is SUM-derived from the ledger, never stored.
    return {
      ledgerEntryId: creditEntryId,
      settled,
      residual: remaining,
      settlements,
      replayed: false,
    };
  });
}
