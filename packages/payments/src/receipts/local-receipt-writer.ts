/**
 * LocalReceiptWriter (P1-E08-S02, AC2) — the default {@link ReceiptWriter}.
 *
 * Persists a `receipts` header + its `receipt_lines` (P1-E08-S01 schema),
 * allocates the per-series `sequence_number` (monotonic within `series`), and
 * leaves every KRA / eTIMS field null. `total` / `taxTotal` are derived from the
 * lines so the header always agrees with its lines. A future EtimsReceiptWriter
 * implements the same contract and fills the KRA fields — this writer is the
 * pre-eTIMS default.
 */
import { desc, eq } from "drizzle-orm";
import { receiptLines, receipts } from "@bm/db";
import {
  formatReceiptNumber,
  type Receipt,
  type ReceiptWriter,
  type ReceiptWriterExecutor,
  type WriteReceiptPayload,
} from "./index.js";

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

export class LocalReceiptWriter implements ReceiptWriter {
  async writeReceipt(
    db: ReceiptWriterExecutor,
    payload: WriteReceiptPayload,
  ): Promise<Receipt> {
    if (payload.lines.length === 0) {
      throw new ReceiptValidationError("a receipt must have at least one line");
    }
    for (const line of payload.lines) {
      const hasService = line.serviceId != null;
      const hasProduct = line.productId != null;
      if (hasService === hasProduct) {
        throw new ReceiptValidationError(
          "each receipt line must set exactly one of serviceId / productId",
        );
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new ReceiptValidationError("line quantity must be a positive integer");
      }
      for (const [field, value] of [
        ["unitPrice", line.unitPrice],
        ["lineTax", line.lineTax],
        ["lineTotal", line.lineTotal],
      ] as const) {
        if (!Number.isInteger(value) || value < 0) {
          throw new ReceiptValidationError(`line ${field} must be a non-negative integer (cents)`);
        }
      }
    }

    const total = payload.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const taxTotal = payload.lines.reduce((sum, l) => sum + l.lineTax, 0);

    // Allocate the next per-series sequence number (monotonic within series).
    const [last] = await db
      .select({ sequenceNumber: receipts.sequenceNumber })
      .from(receipts)
      .where(eq(receipts.series, payload.series))
      .orderBy(desc(receipts.sequenceNumber))
      .limit(1);
    const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;

    const [header] = await db
      .insert(receipts)
      .values({
        series: payload.series,
        sequenceNumber,
        parentId: payload.parentId ?? null,
        total,
        taxTotal,
        paymentMethod: payload.paymentMethod,
        postedBy: payload.postedBy,
        parentAccountId: payload.parentAccountId ?? null,
        // KRA / eTIMS fields left null by the local writer (AC2).
        pin: null,
        controlUnitNumber: null,
        cuInvoiceNumber: null,
        qrData: null,
        etimsStatus: null,
      })
      .returning();

    const insertedLines = await db
      .insert(receiptLines)
      .values(
        payload.lines.map((l) => ({
          receiptId: header!.id,
          serviceId: l.serviceId ?? null,
          productId: l.productId ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTax: l.lineTax,
          lineTotal: l.lineTotal,
        })),
      )
      .returning();

    return {
      id: header!.id,
      series: header!.series,
      sequenceNumber: header!.sequenceNumber,
      displayNumber: formatReceiptNumber(header!.series, header!.sequenceNumber),
      parentId: header!.parentId ?? null,
      total: header!.total,
      taxTotal: header!.taxTotal,
      paymentMethod: header!.paymentMethod,
      postedBy: header!.postedBy,
      parentAccountId: header!.parentAccountId ?? null,
      createdAt: header!.createdAt,
      lines: insertedLines.map((l) => ({
        id: l.id,
        serviceId: l.serviceId ?? null,
        productId: l.productId ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
      })),
      pin: header!.pin ?? null,
      controlUnitNumber: header!.controlUnitNumber ?? null,
      cuInvoiceNumber: header!.cuInvoiceNumber ?? null,
      qrData: header!.qrData ?? null,
      etimsStatus: header!.etimsStatus ?? null,
    };
  }
}
