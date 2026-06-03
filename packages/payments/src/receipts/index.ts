/**
 * Receipt writer interface (P1-E08-S02).
 *
 * The single seam for KRA / eTIMS adoption. Every caller writes a receipt
 * through {@link writeReceipt} — never by constructing `receipts` / `receipt_lines`
 * rows directly. Today the default binding is the {@link LocalReceiptWriter},
 * which persists the receipt and leaves the KRA fields (`pin`,
 * `control_unit_number`, `cu_invoice_number`, `qr_data`, `etims_status`) null.
 * When eTIMS goes live in P5, the {@link EtimsReceiptWriter} — which implements
 * the SAME {@link ReceiptWriter} contract and fills those fields — swaps in, and
 * no caller changes.
 *
 * Money is integer minor units (KES cents), matching the `receipts` schema
 * (P1-E08-S01) and the wallet ledger: zero float drift.
 */
import type { Database, Transaction } from "@bm/db";

/** Any drizzle executor that can run the writes — the top-level db or a tx. */
export type ReceiptWriterExecutor = Database | Transaction;

/** One line on a receipt. Exactly one of `serviceId` / `productId` must be set. */
export interface WriteReceiptLine {
  /** Catalogue service charged (set iff `productId` is null). */
  serviceId?: string | null;
  /** Shop product charged (set iff `serviceId` is null). */
  productId?: string | null;
  /** Quantity of the item. Positive integer. */
  quantity: number;
  /** Per-unit price, integer cents. Non-negative. */
  unitPrice: number;
  /** VAT for this line, integer cents. Non-negative. Caller computes from tax treatment. */
  lineTax: number;
  /** Line total, integer cents. Non-negative. */
  lineTotal: number;
}

/** Input to {@link writeReceipt}. The KRA fields are owned by the writer, not the caller. */
export interface WriteReceiptPayload {
  /** Receipt series namespace, e.g. `BM-2026`. */
  series: string;
  /** How the receipt was paid (`wallet` | `cash` | `mpesa` | ...). */
  paymentMethod: string;
  /** Who posted the receipt (staff/role identifier). */
  postedBy: string;
  /** Parent the receipt belongs to (null for walk-ins). */
  parentAccountId?: string | null;
  /** Optional pointer to an original receipt (e.g. a reversal / credit note). */
  parentId?: string | null;
  /** One or more charged lines. `total` / `taxTotal` are derived from these. */
  lines: WriteReceiptLine[];
}

/** A written receipt. KRA fields are null under the local writer, filled by eTIMS later. */
export interface Receipt {
  id: string;
  series: string;
  sequenceNumber: number;
  /** Display form `<series>-<zero-padded sequence>`, e.g. `BM-2026-000123`. Rendered, not stored. */
  displayNumber: string;
  parentId: string | null;
  total: number;
  taxTotal: number;
  paymentMethod: string;
  postedBy: string;
  parentAccountId: string | null;
  createdAt: Date;
  lines: ReceiptLine[];
  // KRA / eTIMS fields — null under LocalReceiptWriter (AC2).
  pin: string | null;
  controlUnitNumber: string | null;
  cuInvoiceNumber: string | null;
  qrData: string | null;
  etimsStatus: "pending" | "sent" | "accepted" | "rejected" | null;
}

/** A persisted receipt line. */
export interface ReceiptLine {
  id: string;
  serviceId: string | null;
  productId: string | null;
  quantity: number;
  unitPrice: number;
  lineTax: number;
  lineTotal: number;
}

/**
 * The receipt writer contract (AC1, AC3). `LocalReceiptWriter` and a future
 * `EtimsReceiptWriter` both implement this; swapping is a one-place change.
 */
export interface ReceiptWriter {
  writeReceipt(db: ReceiptWriterExecutor, payload: WriteReceiptPayload): Promise<Receipt>;
}

/** Zero-pad a per-series sequence to the canonical 6-digit display, e.g. `000123`. */
export function formatReceiptNumber(series: string, sequenceNumber: number): string {
  return `${series}-${String(sequenceNumber).padStart(6, "0")}`;
}

export { LocalReceiptWriter, ReceiptValidationError } from "./local-receipt-writer.js";
export {
  EtimsReceiptWriter,
  EtimsNotImplementedError,
  createEtimsReceiptWriter,
  defaultFetchTransport,
  EtimsConfigError,
  EtimsTransportError,
} from "./etims-receipt-writer.js";
export type {
  EtimsConfig,
  EtimsTransport,
  EtimsTransportRequestOptions,
  EtimsTransportResponse,
  EtimsAcceptance,
  CreateEtimsWriterOptions,
} from "./etims-receipt-writer.js";
export {
  STANDARD_VAT_RATE_BP,
  computeLineVat,
  buildEtimsInvoice,
} from "./etims-payload.js";
export type {
  EtimsInvoice,
  EtimsInvoiceItem,
  EtimsInvoiceSeller,
} from "./etims-payload.js";
export {
  resolveReceiptWriter,
  isEtimsEnabled,
  ETIMS_SETTING_KEY,
} from "./writer-selector.js";
export type {
  ResolveReceiptWriterOptions,
  EtimsWiring,
} from "./writer-selector.js";
export {
  etimsBackoffMs,
  ETIMS_BACKOFF_CAP_MS,
  ETIMS_BACKOFF_BASE_MS,
  ETIMS_DEFAULT_MAX_ATTEMPTS,
  enqueueEtimsSubmission,
  claimDueEtimsSubmissions,
  markEtimsSubmissionSent,
  recordEtimsSubmissionFailure,
  listDeadLetters,
  requeueDeadLetter,
} from "./etims-queue.js";
export type {
  EtimsQueueRow,
  EnqueueEtimsInput,
  ClaimDueInput,
  RecordFailureResult,
} from "./etims-queue.js";
export {
  voidReceipt,
  AlreadyVoidedError,
  VoidReceiptNotFoundError,
  VoidTargetIsVoidError,
  type VoidReceiptInput,
  type VoidReceiptResult,
} from "./void.js";

import { LocalReceiptWriter } from "./local-receipt-writer.js";

/**
 * The default writer binding — local today, eTIMS swaps in at P5. Constructed
 * lazily rather than at module-eval: `local-receipt-writer.ts` imports
 * `formatReceiptNumber` back from THIS module, so an eager `new
 * LocalReceiptWriter()` at import time can run before that module has finished
 * initialising (a circular-import TDZ → "LocalReceiptWriter is not a
 * constructor"). A lazy singleton defers construction to first use, once the
 * whole graph is loaded.
 */
let _defaultReceiptWriter: ReceiptWriter | undefined;

/** The default {@link ReceiptWriter} (local), constructed on first use. */
export function getDefaultReceiptWriter(): ReceiptWriter {
  return (_defaultReceiptWriter ??= new LocalReceiptWriter());
}

/**
 * Write a receipt through the default writer (AC1). Callers go through this
 * function rather than constructing rows directly, so adopting eTIMS is a
 * single-place swap (see {@link getDefaultReceiptWriter} / {@link resolveReceiptWriter}).
 */
export function writeReceipt(
  db: ReceiptWriterExecutor,
  payload: WriteReceiptPayload,
): Promise<Receipt> {
  return getDefaultReceiptWriter().writeReceipt(db, payload);
}
