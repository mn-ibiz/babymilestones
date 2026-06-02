import { z } from "zod";

/**
 * WooCommerce REST API payload contracts (P4-E04-S06 / Story 29.6).
 *
 * The `@bm/woocommerce` client parses every response through these schemas so a
 * silently-changed payload shape is rejected loudly instead of flowing through
 * untyped. WooCommerce returns a generous superset of fields; we validate only
 * the ones the sync work depends on and `.passthrough()` the rest so a new Woo
 * field never breaks parsing. These schemas are dependency-light (zod only) and
 * shared between the client and any caller that needs the types.
 *
 * Also carries the admin "WooCommerce" panel save input (AC3): a valid HTTPS
 * site URL plus the optional consumer key/secret. The raw secret is accepted
 * here on save only; it is NEVER part of any read/public shape (write-only).
 */

/** WooCommerce order status values we care about (open superset via `.catch`). */
export const wooOrderStatusSchema = z.string().min(1);

/** A single order line item (only the fields sync uses). */
export const wooLineItemSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
    product_id: z.number().optional(),
    quantity: z.number().optional(),
  })
  .passthrough();

/** A WooCommerce order (`GET /orders/:id`). Only sync-relevant fields validated. */
export const wooOrderSchema = z
  .object({
    id: z.number(),
    status: wooOrderStatusSchema,
    number: z.string().optional(),
    total: z.string().optional(),
    currency: z.string().optional(),
    date_created: z.string().optional(),
    date_modified: z.string().optional(),
    line_items: z.array(wooLineItemSchema).optional(),
  })
  .passthrough();
export type WooOrder = z.infer<typeof wooOrderSchema>;

/** A list of orders (`GET /orders`). */
export const wooOrderListSchema = z.array(wooOrderSchema);
export type WooOrderList = z.infer<typeof wooOrderListSchema>;

/** A WooCommerce order note (`POST /orders/:id/notes`). */
export const wooOrderNoteSchema = z
  .object({
    id: z.number(),
    note: z.string(),
    date_created: z.string().optional(),
    customer_note: z.boolean().optional(),
  })
  .passthrough();
export type WooOrderNote = z.infer<typeof wooOrderNoteSchema>;

/** Stock status enum WooCommerce reports / accepts. */
export const wooStockStatusSchema = z.enum(["instock", "outofstock", "onbackorder"]);
export type WooStockStatus = z.infer<typeof wooStockStatusSchema>;

/**
 * A WooCommerce product (`GET /products/:id`). `stock_quantity` is null when the
 * product does not manage stock — Woo returns `null`, so we model it optional +
 * nullable rather than rejecting.
 */
export const wooProductSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    sku: z.string().optional(),
    stock_quantity: z.number().nullable().optional(),
    stock_status: wooStockStatusSchema.optional(),
    manage_stock: z.boolean().optional(),
    price: z.string().optional(),
    date_modified: z.string().optional(),
  })
  .passthrough();
export type WooProduct = z.infer<typeof wooProductSchema>;

/** A list of products (`GET /products`). */
export const wooProductListSchema = z.array(wooProductSchema);
export type WooProductList = z.infer<typeof wooProductListSchema>;

/**
 * The slice of `GET /system_status` the test-connection probe reads (AC4). Woo
 * returns a large document; we only assert the `environment` object is present
 * and pull the version for the OK report. `.passthrough()` keeps the rest.
 */
export const wooSystemStatusSchema = z
  .object({
    environment: z
      .object({
        version: z.string().optional(),
        wp_version: z.string().optional(),
        home_url: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type WooSystemStatus = z.infer<typeof wooSystemStatusSchema>;

/**
 * A WooCommerce REST error body. Woo wraps failures as
 * `{ code, message, data: { status } }`. Parsed best-effort so the client can
 * surface `message` as the "first error" without throwing on an odd shape.
 */
export const wooErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    data: z
      .object({ status: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type WooErrorBody = z.infer<typeof wooErrorSchema>;

// ---------------------------------------------------------------------------
// Admin "WooCommerce" settings panel (AC3)
// ---------------------------------------------------------------------------

/** HTTPS-only site URL gate (AC2): a syntactically valid `https://` URL. */
const wooSiteUrlSchema = z
  .string()
  .trim()
  .min(1, "Site URL is required")
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Site URL must be a valid HTTPS URL");

/** Max accepted length for a consumer key/secret (Woo keys are ~43 chars). */
export const WOO_CREDENTIAL_MAX = 255;

/**
 * Admin save input for the WooCommerce panel (AC3). `siteUrl` is always
 * required; `consumerKey`/`consumerSecret` are OPTIONAL on update — omitting (or
 * blanking) them keeps the previously-stored encrypted secret. When provided
 * they must be non-empty. The raw secret is accepted on save ONLY and is never
 * echoed back (write-only field — see `WooConfigPublic`).
 */
export const wooConfigSaveSchema = z.object({
  siteUrl: wooSiteUrlSchema,
  consumerKey: z
    .string()
    .trim()
    .min(1, "Consumer key cannot be blank")
    .max(WOO_CREDENTIAL_MAX)
    .optional(),
  consumerSecret: z
    .string()
    .trim()
    .min(1, "Consumer secret cannot be blank")
    .max(WOO_CREDENTIAL_MAX)
    .optional(),
});
export type WooConfigSaveInput = z.infer<typeof wooConfigSaveSchema>;

/**
 * Public (secret-free) shape of the stored WooCommerce config returned by the
 * API (AC3). The consumer key/secret are NEVER included — only whether each is
 * set, so the panel can show "configured" without exposing the value.
 */
export interface WooConfigPublic {
  siteUrl: string | null;
  /** True when a consumer key is stored (the value is never returned). */
  hasConsumerKey: boolean;
  /** True when a consumer secret is stored (the value is never returned). */
  hasConsumerSecret: boolean;
  updatedAt: string | null;
}

/** Test-connection outcome reported by the API (AC4). */
export interface WooTestConnectionResult {
  ok: boolean;
  /** HTTP status code observed from Woo (null on a network-level failure). */
  status: number | null;
  /** Woo's first error message on failure, or a short OK note on success. */
  message: string;
}

// ---------------------------------------------------------------------------
// Sync writeback requests (Story 29.7 / P4-E04-S07)
// ---------------------------------------------------------------------------

/** An order-status writeback request (S02) — the payload of a `wc_outbox` row. */
export const wcOrderStatusRequestSchema = z.object({
  wooOrderId: z.number().int().positive(),
  status: wooOrderStatusSchema,
  /** Optional Woo order note posted alongside the status change. */
  note: z.string().optional(),
});
export type WcOrderStatusRequest = z.infer<typeof wcOrderStatusRequestSchema>;

/** A stock-push writeback request (S05) — the payload of a `wc_outbox` row. */
export const wcStockPushRequestSchema = z.object({
  wooProductId: z.number().int().positive(),
  stockQuantity: z.number().int(),
  stockStatus: wooStockStatusSchema,
});
export type WcStockPushRequest = z.infer<typeof wcStockPushRequestSchema>;

/** The kind discriminator carried by every outbox row. */
export const wcOutboxKindSchema = z.enum(["order_status", "stock_push"]);
export type WcOutboxKindContract = z.infer<typeof wcOutboxKindSchema>;

/**
 * Admin sync-health snapshot (AC5): the last successful pull, the queue depth,
 * the dead-letter count, and the last 10 errors. `stale` is the >15-min banner
 * flag computed server-side.
 */
export interface WcSyncHealth {
  /** ISO instant of the last successful pull, or null on a never-run system. */
  lastPullAt: string | null;
  /** Pending writebacks awaiting drain. */
  queueDepth: number;
  /** Dead-lettered writebacks awaiting admin action. */
  deadLetterCount: number;
  /** Most recent sync errors (newest-first), capped at 10. */
  recentErrors: { source: string; error: string; at: string }[];
  /** True when the last pull is older than the staleness threshold (>15 min). */
  stale: boolean;
}

// ---------------------------------------------------------------------------
// SKU → Woo product-id mapping (Story 29.5 / P4-E04-S05)
// ---------------------------------------------------------------------------

/**
 * Derive the Woo `stock_status` from a local on-hand quantity (AC3): stock at or
 * below zero is `outofstock`; any positive quantity is `instock`. `onbackorder`
 * is never produced from a push — the POS is the source of truth and a sale is
 * blocked once stock hits zero, so "out of stock" is the honest signal.
 */
export function stockStatusFor(stockQuantity: number): WooStockStatus {
  return stockQuantity <= 0 ? "outofstock" : "instock";
}

/** Default per-SKU debounce window: a burst of mutations collapses to one push (AC4). */
export const STOCK_PUSH_DEBOUNCE_MS = 5_000;

/**
 * The stable per-product idempotency key for a coalesced stock push (AC4). Keyed
 * by the local product id so a burst of mutations re-arms ONE pending outbox row
 * rather than enqueuing N rows; the row carries the latest (final) value.
 */
export function stockPushOutboxKey(productId: string): string {
  return `wc-stock:${productId}`;
}

/** One row in the SKU-mapping admin list (AC5): a local product + its Woo mapping. */
export interface SkuMappingRow {
  productId: string;
  sku: string;
  name: string;
  /** On-hand local stock (the source of truth that gets pushed). */
  stockQty: number;
  /** The mapped Woo product id, or null for an "in-store only" product (AC2). */
  wooProductId: number | null;
}

/** Admin manual-entry update of a single product's Woo mapping (AC5). */
export const skuMappingUpdateSchema = z.object({
  /** The Woo product id to map, or null to unmap (back to in-store only). */
  wooProductId: z.number().int().positive().nullable(),
});
export type SkuMappingUpdateInput = z.infer<typeof skuMappingUpdateSchema>;

/** The CSV columns the bulk SKU-mapping import expects (header row, AC5). */
export const SKU_MAPPING_CSV_COLUMNS = ["sku", "woo_product_id"] as const;

/** One parsed CSV row: a SKU and its desired Woo product id (null clears it). */
export interface SkuMappingCsvRow {
  /** 1-based source line (excludes the header) for error reporting. */
  line: number;
  sku: string;
  /** Parsed Woo product id, or null when the cell is blank (unmap). */
  wooProductId: number | null;
}

/** A per-line parse error from the bulk SKU-mapping CSV (AC5). */
export interface SkuMappingCsvError {
  /** 1-based source line (excludes the header). */
  line: number;
  message: string;
}

/** The result of parsing a bulk SKU-mapping CSV: valid rows + per-line errors (AC5). */
export interface SkuMappingCsvParseResult {
  rows: SkuMappingCsvRow[];
  errors: SkuMappingCsvError[];
}

/** Split a CSV line into trimmed fields (the import is plain — no quoted commas). */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

/**
 * Parse a bulk SKU-mapping CSV (AC5). The first non-empty line is the header and
 * MUST be `sku,woo_product_id`. Each subsequent non-empty line yields either a
 * valid {@link SkuMappingCsvRow} or a {@link SkuMappingCsvError} (collected, never
 * thrown — a bad row never aborts the import):
 *   - a blank SKU is an error;
 *   - a blank `woo_product_id` cell clears the mapping (null — back to in-store only);
 *   - a non-numeric / non-positive id is an error;
 *   - a duplicate SKU (later in the file) is an error so the apply is unambiguous.
 * A malformed/missing header yields a single header error and no rows.
 */
export function parseSkuMappingCsv(csv: string): SkuMappingCsvParseResult {
  const rows: SkuMappingCsvRow[] = [];
  const errors: SkuMappingCsvError[] = [];

  const rawLines = csv.split(/\r\n|\r|\n/u);
  // Find the header (first non-empty line); track the 1-based data line numbers.
  let headerSeen = false;
  let dataLine = 0;
  const seenSkus = new Set<string>();

  for (const raw of rawLines) {
    if (raw.trim() === "") continue;
    if (!headerSeen) {
      const header = splitCsvLine(raw).map((c) => c.toLowerCase());
      if (header[0] !== SKU_MAPPING_CSV_COLUMNS[0] || header[1] !== SKU_MAPPING_CSV_COLUMNS[1]) {
        errors.push({ line: 0, message: `Header must be: ${SKU_MAPPING_CSV_COLUMNS.join(",")}` });
        return { rows, errors };
      }
      headerSeen = true;
      continue;
    }

    dataLine += 1;
    const cells = splitCsvLine(raw);
    const sku = cells[0] ?? "";
    const idCell = cells[1] ?? "";

    if (sku === "") {
      errors.push({ line: dataLine, message: "SKU is required" });
      continue;
    }
    if (seenSkus.has(sku)) {
      errors.push({ line: dataLine, message: `Duplicate SKU "${sku}"` });
      continue;
    }
    seenSkus.add(sku);

    if (idCell === "") {
      rows.push({ line: dataLine, sku, wooProductId: null });
      continue;
    }
    const id = Number(idCell);
    if (!Number.isInteger(id) || id <= 0) {
      errors.push({ line: dataLine, message: `Invalid Woo product id "${idCell}"` });
      continue;
    }
    rows.push({ line: dataLine, sku, wooProductId: id });
  }

  if (!headerSeen) {
    errors.push({ line: 0, message: `Header must be: ${SKU_MAPPING_CSV_COLUMNS.join(",")}` });
  }
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Stock reconciliation report (Story 29.5 / P4-E04-S05, AC6)
// ---------------------------------------------------------------------------

/** One drifted SKU in the nightly reconciliation report (AC6). */
export interface StockDriftRow {
  productId: string;
  sku: string;
  name: string;
  wooProductId: number;
  /** Local on-hand stock (the source of truth). */
  localStock: number;
  /** Woo's reported `stock_quantity` (null when Woo does not manage stock). */
  wooStock: number | null;
  /** `localStock - wooStock` (treating a null Woo stock as 0). */
  delta: number;
}

/** The persisted nightly reconciliation report surfaced in admin (AC6). */
export interface StockReconciliationReport {
  /** ISO instant the report was generated. */
  generatedAt: string;
  /** Mapped products that were compared (unmapped products are skipped). */
  comparedCount: number;
  /** Products whose local and Woo stock disagree, worst (largest |delta|) first. */
  drift: StockDriftRow[];
}
