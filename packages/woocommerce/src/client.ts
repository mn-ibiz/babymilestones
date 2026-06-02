import {
  wooOrderSchema,
  wooOrderListSchema,
  wooOrderNoteSchema,
  wooProductSchema,
  wooProductListSchema,
  wooSystemStatusSchema,
  wooErrorSchema,
  type WooOrder,
  type WooOrderNote,
  type WooProduct,
  type WooStockStatus,
  type WooTestConnectionResult,
} from "@bm/contracts";
import type { ZodType } from "zod";
import {
  WooAuthFailed,
  WooConfigError,
  WooError,
  WooNetworkError,
  WooNotFound,
  WooRateLimited,
  WooServerError,
} from "./errors.js";

/**
 * Typed WooCommerce REST API client (P4-E04-S06 / Story 29.6).
 *
 * The client is DUMB by design: it shapes a request, applies HTTP Basic auth
 * over HTTPS, sends ONE attempt via an injected transport, validates the
 * response through `@bm/contracts` Zod schemas, and maps failures to typed
 * errors. It does NO retry, NO queue, NO scheduling — those belong to S07
 * (Story 29.7). The transport is injected so tests never touch the network.
 *
 * Every request is logged (url, method, status, duration) via an injected `log`
 * sink; the Authorization header and the raw secret are NEVER logged (AC6).
 */

/** A fetch-shaped function. `globalThis.fetch` satisfies this in production. */
export type WooTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Credentials + site for the WooCommerce REST API. */
export interface WooConfig {
  /** Store site URL, e.g. `https://shop.example.com` (HTTPS enforced — AC2). */
  siteUrl: string;
  /** WooCommerce REST API consumer key. */
  consumerKey: string;
  /** WooCommerce REST API consumer secret. */
  consumerSecret: string;
}

/** One structured log line emitted per request (AC6 — secrets already redacted). */
export interface WooLogEntry {
  /** Full request URL WITHOUT credentials (Basic auth rides a header, not the URL). */
  url: string;
  method: string;
  /** HTTP status, or null when the transport threw before a response. */
  status: number | null;
  /** Wall-clock duration of the single attempt, in milliseconds. */
  durationMs: number;
  /** True when the attempt produced an error (non-2xx or a throw). */
  error: boolean;
}

/** Sink for request logs. Wire to `@bm/observability`'s logger in production. */
export type WooLog = (entry: WooLogEntry) => void;

export interface CreateWooClientOptions {
  config: WooConfig;
  transport: WooTransport;
  /** Structured request-log sink (AC6). No-op by default. */
  log?: WooLog;
  /** Clock injection for deterministic durations in tests. */
  now?: () => number;
}

export interface ListOrdersOptions {
  /** ISO-8601 instant; mapped to Woo's `modified_after`. */
  since?: string;
  /** Order statuses to filter by; joined into Woo's comma `status` param. */
  status?: string[];
  /** 1-based page number. */
  page?: number;
}

export interface ListProductsOptions {
  /** ISO-8601 instant; mapped to Woo's `modified_after`. */
  since?: string;
  /** 1-based page number. */
  page?: number;
}

/** The typed WooCommerce client surface (AC1). */
export interface WooClient {
  listOrders(opts?: ListOrdersOptions): Promise<WooOrder[]>;
  getOrder(id: number): Promise<WooOrder>;
  updateOrderStatus(id: number, status: string, note?: string): Promise<WooOrder>;
  addOrderNote(id: number, note: string): Promise<WooOrderNote>;
  getProduct(id: number): Promise<WooProduct>;
  updateProductStock(
    id: number,
    stockQuantity: number,
    stockStatus: WooStockStatus,
  ): Promise<WooProduct>;
  listProducts(opts?: ListProductsOptions): Promise<WooProduct[]>;
  /** Probe `GET /system_status`; OK / failure with status + first error (AC4). */
  testConnection(): Promise<WooTestConnectionResult>;
}

/** WooCommerce REST API base path under the site URL. */
const API_BASE = "/wp-json/wc/v3";

/** Parse a Woo error body best-effort to extract code + message (AC5). */
function readWooError(body: unknown): { code: string | null; message: string | null } {
  const parsed = wooErrorSchema.safeParse(body);
  if (!parsed.success) return { code: null, message: null };
  return { code: parsed.data.code ?? null, message: parsed.data.message ?? null };
}

/** Map a non-2xx HTTP status to the typed error class (AC5). */
function errorForStatus(
  status: number,
  detail: { code: string | null; message: string | null },
): WooError {
  const opts = { status, wooCode: detail.code, wooMessage: detail.message };
  const label = detail.message ?? detail.code ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return new WooAuthFailed(`WooCommerce auth failed: ${label}`, opts);
  if (status === 404) return new WooNotFound(`WooCommerce resource not found: ${label}`, opts);
  if (status === 429) return new WooRateLimited(`WooCommerce rate limited: ${label}`, opts);
  return new WooServerError(`WooCommerce server error (${status}): ${label}`, opts);
}

/** Construct a WooCommerce client. Validates + locks the base URL eagerly (AC2). */
export function createWooClient(opts: CreateWooClientOptions): WooClient {
  const { config, transport } = opts;
  const log: WooLog = opts.log ?? (() => {});
  const now = opts.now ?? (() => Date.now());

  // AC2: HTTPS is enforced at construction — a non-https (or malformed) base URL
  // is a misconfiguration, never a runtime surprise.
  let base: URL;
  try {
    base = new URL(config.siteUrl);
  } catch {
    throw new WooConfigError(`Invalid WooCommerce site URL: ${config.siteUrl}`);
  }
  if (base.protocol !== "https:") {
    throw new WooConfigError("WooCommerce site URL must use HTTPS");
  }

  const origin = base.origin;
  const basicAuth = "Basic " + Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");

  /** Build a full request URL for a Woo endpoint path + query. */
  function buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(`${API_BASE}${path}`, origin);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  /**
   * Send ONE attempt (no retry — AC5), validate the body against `schema`, and
   * map failures to typed errors. Logs url/method/status/duration with the
   * secret redacted — the Authorization header is set locally and never logged
   * (AC6).
   */
  async function send<T>(
    method: string,
    url: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        authorization: basicAuth,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    const started = now();
    let res: Response;
    try {
      res = await transport(url, init);
    } catch (cause) {
      // Transport-level failure (DNS/TCP/TLS/timeout) → WooNetworkError (AC5).
      log({ url, method, status: null, durationMs: now() - started, error: true });
      throw new WooNetworkError(
        `WooCommerce request failed (network): ${method} ${url}`,
        { cause },
      );
    }

    const durationMs = now() - started;
    if (!res.ok) {
      log({ url, method, status: res.status, durationMs, error: true });
      const detail = readWooError(await safeJson(res));
      throw errorForStatus(res.status, detail);
    }

    log({ url, method, status: res.status, durationMs, error: false });

    const json = await safeJson(res);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // A silently-changed / unexpected payload shape is treated as a server
      // error so the caller fails loudly rather than acting on garbage (AC1).
      throw new WooServerError(
        `WooCommerce response failed validation: ${method} ${url}`,
        { status: res.status, wooMessage: parsed.error.issues[0]?.message ?? null },
      );
    }
    return parsed.data;
  }

  return {
    async listOrders(o: ListOrdersOptions = {}): Promise<WooOrder[]> {
      const url = buildUrl("/orders", {
        modified_after: o.since,
        status: o.status && o.status.length > 0 ? o.status.join(",") : undefined,
        page: o.page !== undefined ? String(o.page) : undefined,
      });
      return send("GET", url, wooOrderListSchema);
    },

    async getOrder(id: number): Promise<WooOrder> {
      return send("GET", buildUrl(`/orders/${id}`), wooOrderSchema);
    },

    async updateOrderStatus(id: number, status: string, note?: string): Promise<WooOrder> {
      const order = await send("PUT", buildUrl(`/orders/${id}`), wooOrderSchema, { status });
      // A note is a separate Woo resource; post it after the status change so the
      // status update is not blocked by note formatting. One attempt each (AC5).
      if (note !== undefined && note.trim() !== "") {
        await this.addOrderNote(id, note);
      }
      return order;
    },

    async addOrderNote(id: number, note: string): Promise<WooOrderNote> {
      return send("POST", buildUrl(`/orders/${id}/notes`), wooOrderNoteSchema, { note });
    },

    async getProduct(id: number): Promise<WooProduct> {
      return send("GET", buildUrl(`/products/${id}`), wooProductSchema);
    },

    async updateProductStock(
      id: number,
      stockQuantity: number,
      stockStatus: WooStockStatus,
    ): Promise<WooProduct> {
      return send("PUT", buildUrl(`/products/${id}`), wooProductSchema, {
        // `manage_stock` must be true for Woo to honour a numeric quantity.
        manage_stock: true,
        stock_quantity: stockQuantity,
        stock_status: stockStatus,
      });
    },

    async listProducts(o: ListProductsOptions = {}): Promise<WooProduct[]> {
      const url = buildUrl("/products", {
        modified_after: o.since,
        page: o.page !== undefined ? String(o.page) : undefined,
      });
      return send("GET", url, wooProductListSchema);
    },

    async testConnection(): Promise<WooTestConnectionResult> {
      // AC4: probe system_status; never throw — translate the outcome into a
      // structured OK/failure report carrying the status + first error.
      try {
        const status = await send("GET", buildUrl("/system_status"), wooSystemStatusSchema);
        const version = status.environment?.version;
        return {
          ok: true,
          status: 200,
          message: version ? `Connected to WooCommerce ${version}` : "Connected to WooCommerce",
        };
      } catch (err) {
        if (err instanceof WooError) {
          return {
            ok: false,
            status: err.status,
            message: err.wooMessage ?? err.wooCode ?? err.message,
          };
        }
        return { ok: false, status: null, message: err instanceof Error ? err.message : "Connection failed" };
      }
    },
  };
}

/** Read a JSON body without throwing — returns null when the body is not JSON. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
