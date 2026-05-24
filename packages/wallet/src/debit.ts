/** @bm/wallet — debit at check-in (P1-E03-S05).
 *
 * When a child checks in for a booked service, the wallet is debited and the
 * pending invoice is resolved. The whole thing — the row lock, the balance read,
 * the (optional) ledger debit, the invoice transition, the settlement linkage,
 * and the audit row — runs inside ONE transaction so an outcome is all-or-nothing.
 *
 * Four mutually-exclusive outcomes, by (balance vs amount) × auto_credit_enabled:
 *  - balance ≥ amount                 → post debit, invoice `settled`           (AC3)
 *  - balance < amount, auto-credit on → post debit (balance goes negative),
 *                                       invoice `settled_on_credit`             (AC4)
 *  - balance < amount, auto-credit off→ NO debit, invoice `outstanding`;
 *                                       the booking still proceeds              (AC5)
 *
 * Concurrency: a `SELECT ... FOR UPDATE` on the wallet row serialises concurrent
 * check-ins (AC2). Double check-in is additionally fenced by the partial UNIQUE
 * index on `wallet_ledger_invoice_settlement (invoice_id) WHERE kind='checkin'`
 * (AC6) — a second check-in raises a unique violation surfaced as
 * {@link DoubleCheckInError}.
 */
import type { Database } from "@bm/db";
import {
  audit,
  invoices,
  wallets,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import { and, eq, sql } from "drizzle-orm";
import type { Cents } from "./index.js";

/** Input to {@link debit}. */
export interface DebitInput {
  /** Wallet to debit (the parent's). */
  walletId: string;
  /** The pending invoice this check-in settles. */
  invoiceId: string;
  /** Caller-supplied dedup key; a replay with this key is a no-op. */
  idempotencyKey: string;
  /** Origin of the movement (e.g. `checkin`). */
  source: string;
  /** Acting staff user id (or system actor). */
  postedBy: string;
}

/** The resolved check-in outcome. */
export type DebitOutcome = "settled" | "settled_on_credit" | "outstanding";

/** Result of a check-in debit. */
export interface DebitResult {
  /** Which of the three branches the check-in resolved to. */
  outcome: DebitOutcome;
  /** Cents actually debited (0 for the `outstanding` path). */
  debited: Cents;
  /** Invoice this check-in resolved. */
  invoiceId: string;
  /** The debit ledger entry id, or null when nothing was posted (AC5). */
  ledgerEntryId: string | null;
  /** True when this call was a no-op replay of a prior check-in. */
  replayed: boolean;
}

/**
 * Thrown when a SECOND, distinct check-in is attempted for an invoice that has
 * already been debited at check-in (AC6). Distinct from a benign idempotent
 * replay (same key → no-op): this is a different attempt to double-charge, and
 * the partial UNIQUE index on the settlement linkage rejects it.
 */
export class DoubleCheckInError extends Error {
  readonly invoiceId: string;
  constructor(invoiceId: string) {
    super(`wallet.debit: invoice ${invoiceId} has already been debited at check-in`);
    this.name = "DoubleCheckInError";
    this.invoiceId = invoiceId;
  }
}

/** Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "23505" ||
    (typeof e?.message === "string" &&
      e.message.match(/duplicate key|unique constraint|checkin_uniq/iu) !== null)
  );
}

/**
 * Debit the wallet at check-in and resolve the pending invoice. See the module
 * doc for the four-outcome matrix. Idempotent via `idempotencyKey`; double
 * check-in (a distinct attempt) is rejected with {@link DoubleCheckInError}.
 */
export async function debit(db: Database, inputArg: DebitInput): Promise<DebitResult> {
  try {
    return await db.transaction(async (tx) => {
      // Idempotent replay: a prior check-in posted a debit ledger row under this
      // exact key. Its side effects committed already → pure no-op (AC2).
      const [priorDebit] = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, inputArg.idempotencyKey));
      if (priorDebit) {
        const [link] = await tx
          .select()
          .from(walletLedgerInvoiceSettlement)
          .where(eq(walletLedgerInvoiceSettlement.ledgerEntryId, priorDebit.id));
        const [inv] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.id, link?.invoiceId ?? inputArg.invoiceId));
        return {
          outcome: (inv?.status as DebitOutcome) ?? "settled",
          debited: Math.abs(priorDebit.amount),
          invoiceId: link?.invoiceId ?? inputArg.invoiceId,
          ledgerEntryId: priorDebit.id,
          replayed: true,
        };
      }

      // AC2: SELECT ... FOR UPDATE on the wallet row serialises concurrent
      // check-ins against the same wallet.
      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, inputArg.walletId))
        .for("update");
      if (!wallet) {
        throw new Error(`wallet.debit: wallet ${inputArg.walletId} not found`);
      }

      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, inputArg.invoiceId));
      if (!inv) {
        throw new Error(`wallet.debit: invoice ${inputArg.invoiceId} not found`);
      }
      if (inv.status !== "pending") {
        // AC6: if a check-in debit already exists for this invoice, this is a
        // double check-in (a distinct attempt — the idempotent replay above
        // already handled same-key retries). The partial UNIQUE index is the
        // durable fence for racing inserts; this surfaces the sequential case
        // with the same typed error. A non-pending invoice WITHOUT a check-in
        // linkage (e.g. already FIFO-settled by a top-up) is a plain error.
        const [existingCheckin] = await tx
          .select()
          .from(walletLedgerInvoiceSettlement)
          .where(
            and(
              eq(walletLedgerInvoiceSettlement.invoiceId, inputArg.invoiceId),
              eq(walletLedgerInvoiceSettlement.kind, "checkin"),
            ),
          );
        if (existingCheckin) {
          throw new DoubleCheckInError(inputArg.invoiceId);
        }
        throw new Error(
          `wallet.debit: invoice ${inputArg.invoiceId} is not pending (status=${inv.status})`,
        );
      }

      const amount = inv.amountDue;

      // Computed balance inside the lock — SUM over the ledger, never stored.
      const [bal] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)` })
        .from(walletLedger)
        .where(eq(walletLedger.walletId, inputArg.walletId));
      const balanceCents = Number(bal?.total ?? 0);

      const sufficient = balanceCents >= amount;

      // AC5: underfunded + auto-credit off → no debit, invoice outstanding, the
      // booking still proceeds. No ledger row, no linkage row.
      if (!sufficient && !wallet.autoCreditEnabled) {
        await tx
          .update(invoices)
          .set({ status: "outstanding", updatedAt: new Date() })
          .where(eq(invoices.id, inputArg.invoiceId));
        await audit(tx, {
          actor: inputArg.postedBy,
          action: "wallet.checkin_debit",
          target: { table: "invoices", id: inputArg.invoiceId },
          payload: {
            outcome: "outstanding",
            wallet_id: inputArg.walletId,
            amount,
            balance: balanceCents,
            debited: 0,
          },
        });
        return {
          outcome: "outstanding" as const,
          debited: 0,
          invoiceId: inputArg.invoiceId,
          ledgerEntryId: null,
          replayed: false,
        };
      }

      // AC3 / AC4: post the debit. settled when funded; settled_on_credit when
      // it's an auto-credit overdraw (balance goes negative).
      const outcome: DebitOutcome = sufficient ? "settled" : "settled_on_credit";

      const [debitRow] = await tx
        .insert(walletLedger)
        .values({
          walletId: inputArg.walletId,
          amount: -amount,
          direction: "debit",
          kind: "debit",
          idempotencyKey: inputArg.idempotencyKey,
          source: inputArg.source,
          postedBy: inputArg.postedBy,
        })
        .returning();

      // AC6: linkage row fenced by the partial UNIQUE index — a second distinct
      // check-in for this invoice violates it (caught below as DoubleCheckIn).
      await tx.insert(walletLedgerInvoiceSettlement).values({
        ledgerEntryId: debitRow!.id,
        invoiceId: inputArg.invoiceId,
        amount,
        kind: "checkin",
      });

      await tx
        .update(invoices)
        .set({ status: outcome, updatedAt: new Date() })
        .where(eq(invoices.id, inputArg.invoiceId));

      await audit(tx, {
        actor: inputArg.postedBy,
        action: "wallet.checkin_debit",
        target: { table: "invoices", id: inputArg.invoiceId },
        payload: {
          outcome,
          wallet_id: inputArg.walletId,
          amount,
          balance: balanceCents,
          debited: amount,
          ledger_entry_id: debitRow!.id,
        },
      });

      return {
        outcome,
        debited: amount,
        invoiceId: inputArg.invoiceId,
        ledgerEntryId: debitRow!.id,
        replayed: false,
      };
    });
  } catch (err) {
    // The partial UNIQUE index on the settlement linkage fired: a check-in debit
    // already exists for this invoice → a double check-in (AC6).
    if (isUniqueViolation(err)) {
      throw new DoubleCheckInError(inputArg.invoiceId);
    }
    throw err;
  }
}
