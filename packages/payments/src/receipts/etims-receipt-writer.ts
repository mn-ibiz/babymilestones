/**
 * EtimsReceiptWriter (P1-E08-S02, AC3) — STUB.
 *
 * Locks the {@link ReceiptWriter} contract shape for the real eTIMS integration
 * that lands in P5 (P5-E02): it will persist the receipt AND fill the KRA fields
 * (`pin`, `control_unit_number`, `cu_invoice_number`, `qr_data`, `etims_status`)
 * by talking to the eTIMS device / OSCU. Until then `writeReceipt` is a no-op
 * that throws — proving the contract is pluggable without shipping a half-built
 * eTIMS path. Swapping `defaultReceiptWriter` to an instance of this class is the
 * one-place change that turns eTIMS on.
 */
import type {
  Receipt,
  ReceiptWriter,
  ReceiptWriterExecutor,
  WriteReceiptPayload,
} from "./index.js";

export class EtimsNotImplementedError extends Error {
  constructor() {
    super("EtimsReceiptWriter is not implemented yet (real impl lands in P5-E02)");
    this.name = "EtimsNotImplementedError";
  }
}

export class EtimsReceiptWriter implements ReceiptWriter {
  async writeReceipt(
    db: ReceiptWriterExecutor,
    payload: WriteReceiptPayload,
  ): Promise<Receipt> {
    // Stub: the real impl (P5-E02) will use `db` + `payload` to persist the
    // receipt AND fill the KRA fields. Reference them so the contract shape is
    // locked without an unused-parameter lint exception.
    void db;
    void payload;
    throw new EtimsNotImplementedError();
  }
}
