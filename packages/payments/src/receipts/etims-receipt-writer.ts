/**
 * eTIMS receipt writer (P1-E08-S02 seam; live adapter lands in P5-E02-S01).
 *
 * Two shapes share this file behind the SAME {@link ReceiptWriter} contract
 * (`writeReceipt(db, payload) => Receipt`), so no caller / call-site changes:
 *
 *  - {@link EtimsReceiptWriter} — the zero-arg stub kept from P1-E08 so the
 *    original seam contract test stays green. Its `writeReceipt` throws.
 *  - {@link createEtimsReceiptWriter}`(config, { transport })` — the real
 *    adapter. It mirrors the M-Pesa / Paystack idiom: the transport is INJECTED
 *    (`defaultFetchTransport` only touches `globalThis.fetch` at call time, never
 *    at construction or import), so no real network is reached from defaults;
 *    tests pass a fake. KRA is contacted BEFORE the receipt is persisted, so a
 *    transport failure leaves zero rows — a clean slate for the 32-2 retry queue.
 *
 * The KRA invoice number (`<series>-<sequence>`) is the idempotency key: it is
 * sent in the body and the `Idempotency-Key` header so a retried submission can
 * never double-register a KRA invoice.
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
import { ReceiptValidationError } from "./local-receipt-writer.js";
import { buildEtimsInvoice, type EtimsInvoice } from "./etims-payload.js";

export class EtimsNotImplementedError extends Error {
  constructor() {
    super("EtimsReceiptWriter is not implemented yet (real impl lands in P5-E02)");
    this.name = "EtimsNotImplementedError";
  }
}

/** Raised when the eTIMS connection secrets are not configured. */
export class EtimsConfigError extends Error {
  constructor(field: string) {
    super(`eTIMS configuration missing: ${field}`);
    this.name = "EtimsConfigError";
  }
}

/** Raised when KRA eTIMS could not register the invoice (transport or rejection). */
export class EtimsTransportError extends Error {
  constructor(message: string) {
    super(`eTIMS registration failed: ${message}`);
    this.name = "EtimsTransportError";
  }
}

/**
 * eTIMS connection config (AC4). PIN / apiKey / baseUrl are env-sourced secrets:
 * the caller supplies them (never literals in code). `branchId` / `address`
 * default sensibly so the live KRA invoice header is complete.
 */
export interface EtimsConfig {
  /** Taxpayer KRA PIN. */
  pin: string;
  /** Display business name printed on the eTIMS invoice. */
  businessName: string;
  /** eTIMS API key (Bearer secret). */
  apiKey: string;
  /** eTIMS API base URL (sandbox / production). */
  baseUrl: string;
  /** KRA branch id; defaults to head office `00`. */
  branchId?: string;
  /** Registered business address line for the invoice header. */
  address?: string;
}

/** The KRA acceptance fields, returned by the transport's JSON body. */
export interface EtimsAcceptance {
  controlUnitNumber: string;
  cuInvoiceNumber: string;
  qrData: string;
}

/**
 * A fetch-like transport response: an HTTP `status` plus a lazy `json()` that
 * yields the {@link EtimsAcceptance} body. Modelled on `fetch`'s `Response` so
 * the live transport is `globalThis.fetch` and tests pass a tiny fake.
 */
export interface EtimsTransportResponse {
  status: number;
  json: () => Promise<EtimsAcceptance>;
}

export interface EtimsTransportRequestOptions {
  /** Stable per-receipt key, sent in the body + `Idempotency-Key` header. */
  idempotencyKey: string;
  apiKey: string;
  baseUrl: string;
}

/**
 * Injected transport. Resolves with a fetch-like response; a non-2xx `status`
 * OR a thrown error is mapped to {@link EtimsTransportError} and writes no
 * receipt. The default (`defaultFetchTransport`) hits `globalThis.fetch`.
 */
export type EtimsTransport = (
  invoice: EtimsInvoice,
  options: EtimsTransportRequestOptions,
) => Promise<EtimsTransportResponse>;

export interface CreateEtimsWriterOptions {
  /** Injected transport; omit to use the live fetch transport (production). */
  transport?: EtimsTransport;
}

/**
 * Live fetch transport. The `fetch` reference is read at call time only, so
 * importing this module never touches the network.
 */
export function defaultFetchTransport(): EtimsTransport {
  return async (invoice, options) =>
    globalThis.fetch(`${options.baseUrl}/invoices`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "idempotency-key": options.idempotencyKey,
      },
      body: JSON.stringify({ ...invoice, idempotencyKey: options.idempotencyKey }),
    });
}

function assertConfig(config: EtimsConfig): void {
  for (const field of ["pin", "businessName", "apiKey", "baseUrl"] as const) {
    if (!config[field]) throw new EtimsConfigError(field);
  }
}

/**
 * The live eTIMS {@link ReceiptWriter}. Validates the payload exactly like the
 * {@link LocalReceiptWriter}, allocates the per-series sequence, registers the
 * invoice with KRA via the injected transport, and only THEN persists the
 * receipt — filling the KRA fields (`pin`, `control_unit_number`,
 * `cu_invoice_number`, `qr_data`, `etims_status='accepted'`).
 */
class LiveEtimsReceiptWriter implements ReceiptWriter {
  readonly #config: EtimsConfig;
  readonly #transport: EtimsTransport;

  constructor(config: EtimsConfig, options: CreateEtimsWriterOptions) {
    this.#config = config;
    this.#transport = options.transport ?? defaultFetchTransport();
  }

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

    // Allocate the next per-series sequence (monotonic within series). This is
    // the receipt number we register with KRA + the idempotency key.
    const [last] = await db
      .select({ sequenceNumber: receipts.sequenceNumber })
      .from(receipts)
      .where(eq(receipts.series, payload.series))
      .orderBy(desc(receipts.sequenceNumber))
      .limit(1);
    const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;
    const invoiceNumber = formatReceiptNumber(payload.series, sequenceNumber);

    const invoice = buildEtimsInvoice(
      {
        pin: this.#config.pin,
        branchId: this.#config.branchId ?? "00",
        businessName: this.#config.businessName,
        address: this.#config.address ?? "",
      },
      payload,
      invoiceNumber,
      { deriveTax: true },
    );

    // Register with KRA FIRST. Any failure throws and persists NOTHING — a clean
    // slate for the retry queue (32-2). A non-2xx status or a thrown error both
    // become EtimsTransportError.
    let kra: EtimsAcceptance;
    try {
      const res = await this.#transport(invoice, {
        idempotencyKey: invoiceNumber,
        apiKey: this.#config.apiKey,
        baseUrl: this.#config.baseUrl,
      });
      if (res.status < 200 || res.status >= 300) {
        throw new EtimsTransportError(`HTTP ${res.status}`);
      }
      kra = await res.json();
    } catch (err) {
      if (err instanceof EtimsTransportError) throw err;
      throw new EtimsTransportError(err instanceof Error ? err.message : String(err));
    }

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
        // KRA / eTIMS fields filled by the live writer (AC3).
        pin: this.#config.pin,
        controlUnitNumber: kra.controlUnitNumber,
        cuInvoiceNumber: kra.cuInvoiceNumber,
        qrData: kra.qrData,
        etimsStatus: "accepted",
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

/** Construct the live eTIMS receipt writer. Throws {@link EtimsConfigError} on missing secrets. */
export function createEtimsReceiptWriter(
  config: EtimsConfig,
  options: CreateEtimsWriterOptions = {},
): ReceiptWriter {
  assertConfig(config);
  return new LiveEtimsReceiptWriter(config, options);
}

/**
 * P1-E08 seam stub. Retained so the original contract test stays green;
 * production callers use {@link createEtimsReceiptWriter}.
 */
export class EtimsReceiptWriter implements ReceiptWriter {
  async writeReceipt(
    db: ReceiptWriterExecutor,
    payload: WriteReceiptPayload,
  ): Promise<Receipt> {
    void db;
    void payload;
    throw new EtimsNotImplementedError();
  }
}
