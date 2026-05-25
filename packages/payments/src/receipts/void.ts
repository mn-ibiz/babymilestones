/**
 * Receipt void as a reversing entry (P1-E08-S05).
 *
 * Voiding a receipt NEVER deletes or mutates the original. Instead it appends a
 * NEW receipt row with `kind='void'` and `reverses_receipt_id` pointing at the
 * original, plus negated copies of the original's lines. This directly mirrors
 * the wallet ledger reversing-entry pattern (refund, P1-E03-S06): history is
 * append-only and the reversing row is signed opposite the original so that
 *
 *   original.total + void.total === 0   (and likewise tax_total / per line)
 *
 * Guards (AC3): an original may be voided at most once, and a void row may not
 * itself be voided. The application check below is backed by a partial unique
 * index (`receipts_reverses_receipt_id_unique`) so a concurrent double-void
 * loses at the database level too.
 *
 * Admin-only enforcement lives at the route layer (rbac `manage receipt`); this
 * primitive is auth-agnostic so jobs/back-office flows can reuse it.
 */
import { and, desc, eq } from "drizzle-orm";
import { audit, receiptLines, receipts, type Database } from "@bm/db";

/** Input to {@link voidReceipt}. */
export interface VoidReceiptInput {
  /** The original receipt to void. */
  receiptId: string;
  /** Acting admin user id (the route guard has already proven the role). */
  postedBy: string;
}

/** Result of a void posting. */
export interface VoidReceiptResult {
  /** The new reversing (`kind='void'`) receipt's id. */
  voidReceiptId: string;
  /** The original receipt this void reverses. */
  originalReceiptId: string;
}

/** The receipt to void does not exist. */
export class VoidReceiptNotFoundError extends Error {
  readonly receiptId: string;
  constructor(receiptId: string) {
    super(`receipt.void: receipt ${receiptId} not found`);
    this.name = "VoidReceiptNotFoundError";
    this.receiptId = receiptId;
  }
}

/** The receipt has already been voided — cannot void it again (AC3). */
export class AlreadyVoidedError extends Error {
  readonly receiptId: string;
  constructor(receiptId: string) {
    super(`receipt.void: receipt ${receiptId} is already voided`);
    this.name = "AlreadyVoidedError";
    this.receiptId = receiptId;
  }
}

/** The target is itself a void row — a void cannot be voided (AC3). */
export class VoidTargetIsVoidError extends Error {
  readonly receiptId: string;
  constructor(receiptId: string) {
    super(`receipt.void: receipt ${receiptId} is a void row and cannot be voided`);
    this.name = "VoidTargetIsVoidError";
    this.receiptId = receiptId;
  }
}

/**
 * Void a receipt by appending a reversing `kind='void'` receipt. See the module
 * doc for the append-only / net-zero / double-void semantics. Returns the new
 * void receipt id plus the original it reverses. Audited as `receipt.voided`.
 */
export async function voidReceipt(
  db: Database,
  input: VoidReceiptInput,
): Promise<VoidReceiptResult> {
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(receipts).where(eq(receipts.id, input.receiptId));
    if (!original) {
      throw new VoidReceiptNotFoundError(input.receiptId);
    }
    // A void row may not itself be voided (AC3).
    if (original.kind === "void") {
      throw new VoidTargetIsVoidError(input.receiptId);
    }
    // Double-void guard (AC3): reject if a void already reverses this original.
    const [existingVoid] = await tx
      .select({ id: receipts.id })
      .from(receipts)
      .where(and(eq(receipts.kind, "void"), eq(receipts.reversesReceiptId, input.receiptId)));
    if (existingVoid) {
      throw new AlreadyVoidedError(input.receiptId);
    }

    // Allocate the next per-series sequence (monotonic within the series),
    // matching the LocalReceiptWriter's allocation strategy.
    const [last] = await tx
      .select({ sequenceNumber: receipts.sequenceNumber })
      .from(receipts)
      .where(eq(receipts.series, original.series))
      .orderBy(desc(receipts.sequenceNumber))
      .limit(1);
    const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;

    // The void row negates the original's money so original + void nets to 0.
    const [voidHeader] = await tx
      .insert(receipts)
      .values({
        series: original.series,
        sequenceNumber,
        kind: "void",
        reversesReceiptId: original.id,
        parentId: original.id,
        total: -original.total,
        taxTotal: -original.taxTotal,
        paymentMethod: original.paymentMethod,
        postedBy: input.postedBy,
        parentAccountId: original.parentAccountId,
        // KRA / eTIMS fields stay null on the local void row.
        pin: null,
        controlUnitNumber: null,
        cuInvoiceNumber: null,
        qrData: null,
        etimsStatus: null,
      })
      .returning();

    // Mirror the original's lines, negating the money (quantity is preserved so
    // the void is a faithful per-line reversal).
    const origLines = await tx
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, original.id));
    if (origLines.length > 0) {
      await tx.insert(receiptLines).values(
        origLines.map((l) => ({
          receiptId: voidHeader!.id,
          serviceId: l.serviceId,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: -l.unitPrice,
          lineTax: -l.lineTax,
          lineTotal: -l.lineTotal,
        })),
      );
    }

    await audit(tx, {
      actor: input.postedBy,
      action: "receipt.voided",
      target: { table: "receipts", id: original.id },
      payload: {
        original_receipt_id: original.id,
        void_receipt_id: voidHeader!.id,
        original_total: original.total,
        void_total: voidHeader!.total,
      },
    });

    return { voidReceiptId: voidHeader!.id, originalReceiptId: original.id };
  });
}
