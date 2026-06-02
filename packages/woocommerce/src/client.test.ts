import { describe, expect, it, vi } from "vitest";
import {
  createWooClient,
  WooNotFound,
  WooRateLimited,
  WooAuthFailed,
  WooServerError,
  WooNetworkError,
  WooConfigError,
} from "./index.js";
import type { WooTransport, WooLogEntry } from "./index.js";

/** Build a JSON `Response` the injected transport returns. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const config = {
  siteUrl: "https://shop.example.com",
  consumerKey: "ck_test_key",
  consumerSecret: "cs_test_secret",
};

/** A transport that records calls and returns a fixed response. */
function recordingTransport(response: Response | (() => Promise<Response>)): {
  transport: WooTransport;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport: WooTransport = async (url, init) => {
    calls.push({ url, init });
    return typeof response === "function" ? response() : response;
  };
  return { transport, calls };
}

describe("WooCommerce REST client (Story 29.6)", () => {
  describe("HTTPS enforcement (AC2)", () => {
    it("rejects a non-https base URL at construction", () => {
      expect(() =>
        createWooClient({
          config: { ...config, siteUrl: "http://shop.example.com" },
          transport: async () => jsonResponse(200, {}),
        }),
      ).toThrow(WooConfigError);
    });

    it("rejects a malformed base URL", () => {
      expect(() =>
        createWooClient({
          config: { ...config, siteUrl: "not a url" },
          transport: async () => jsonResponse(200, {}),
        }),
      ).toThrow(WooConfigError);
    });
  });

  describe("request construction (AC1, AC2)", () => {
    it("listOrders builds the correct path + query params + Basic auth", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(200, [{ id: 1, status: "processing" }]));
      const client = createWooClient({ config, transport });
      await client.listOrders({ since: "2026-01-01T00:00:00Z", status: ["processing", "completed"], page: 2 });

      expect(calls).toHaveLength(1);
      const url = new URL(calls[0]!.url);
      expect(url.origin).toBe("https://shop.example.com");
      expect(url.pathname).toBe("/wp-json/wc/v3/orders");
      expect(url.searchParams.get("modified_after")).toBe("2026-01-01T00:00:00Z");
      expect(url.searchParams.get("status")).toBe("processing,completed");
      expect(url.searchParams.get("page")).toBe("2");

      const headers = new Headers(calls[0]!.init.headers);
      const expected = "Basic " + Buffer.from("ck_test_key:cs_test_secret").toString("base64");
      expect(headers.get("authorization")).toBe(expected);
      expect(calls[0]!.init.method).toBe("GET");
    });

    it("getOrder builds /orders/:id", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(200, { id: 99, status: "completed" }));
      const client = createWooClient({ config, transport });
      const order = await client.getOrder(99);
      expect(order.id).toBe(99);
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/orders/99");
      expect(calls[0]!.init.method).toBe("GET");
    });

    it("updateOrderStatus PUTs the status (+ optional note as a separate POST)", async () => {
      const calls: { url: string; init: RequestInit }[] = [];
      // The status PUT and the note POST hit different resources — respond per path.
      const transport: WooTransport = async (url, init) => {
        calls.push({ url, init });
        return new URL(url).pathname.endsWith("/notes")
          ? jsonResponse(201, { id: 71, note: "Picked up in store" })
          : jsonResponse(200, { id: 5, status: "completed" });
      };
      const client = createWooClient({ config, transport });
      await client.updateOrderStatus(5, "completed", "Picked up in store");

      // First call: the status PUT.
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/orders/5");
      expect(calls[0]!.init.method).toBe("PUT");
      expect(JSON.parse(String(calls[0]!.init.body)).status).toBe("completed");
      // Second call: the note POST.
      expect(new URL(calls[1]!.url).pathname).toBe("/wp-json/wc/v3/orders/5/notes");
      expect(calls[1]!.init.method).toBe("POST");
      expect(JSON.parse(String(calls[1]!.init.body)).note).toBe("Picked up in store");
    });

    it("updateOrderStatus without a note PUTs only the status", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(200, { id: 5, status: "completed" }));
      const client = createWooClient({ config, transport });
      await client.updateOrderStatus(5, "completed");
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/orders/5");
      expect(calls[0]!.init.method).toBe("PUT");
    });

    it("addOrderNote POSTs to /orders/:id/notes", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(201, { id: 11, note: "hi" }));
      const client = createWooClient({ config, transport });
      await client.addOrderNote(7, "Order ready for collection");
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/orders/7/notes");
      expect(calls[0]!.init.method).toBe("POST");
      const body = JSON.parse(String(calls[0]!.init.body));
      expect(body.note).toBe("Order ready for collection");
    });

    it("getProduct builds /products/:id", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(200, { id: 3, name: "Nappy" }));
      const client = createWooClient({ config, transport });
      const product = await client.getProduct(3);
      expect(product.name).toBe("Nappy");
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/products/3");
    });

    it("updateProductStock PUTs stock_quantity + stock_status", async () => {
      const { transport, calls } = recordingTransport(
        jsonResponse(200, { id: 3, name: "Nappy", stock_quantity: 8, stock_status: "instock" }),
      );
      const client = createWooClient({ config, transport });
      await client.updateProductStock(3, 8, "instock");
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/products/3");
      expect(calls[0]!.init.method).toBe("PUT");
      const body = JSON.parse(String(calls[0]!.init.body));
      expect(body.stock_quantity).toBe(8);
      expect(body.stock_status).toBe("instock");
      expect(body.manage_stock).toBe(true);
    });

    it("listProducts builds /products with modified_after + page", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(200, [{ id: 1, name: "A" }]));
      const client = createWooClient({ config, transport });
      await client.listProducts({ since: "2026-02-02T00:00:00Z", page: 3 });
      const url = new URL(calls[0]!.url);
      expect(url.pathname).toBe("/wp-json/wc/v3/products");
      expect(url.searchParams.get("modified_after")).toBe("2026-02-02T00:00:00Z");
      expect(url.searchParams.get("page")).toBe("3");
    });
  });

  describe("response validation (AC1 via contracts)", () => {
    it("rejects a payload that fails the contract schema", async () => {
      const { transport } = recordingTransport(jsonResponse(200, { status: "processing" })); // no id
      const client = createWooClient({ config, transport });
      await expect(client.getOrder(1)).rejects.toBeInstanceOf(WooServerError);
    });
  });

  describe("error mapping (AC5)", () => {
    const cases: [number, new (...a: never[]) => Error][] = [
      [401, WooAuthFailed],
      [403, WooAuthFailed],
      [404, WooNotFound],
      [429, WooRateLimited],
      [500, WooServerError],
      [502, WooServerError],
    ];
    for (const [status, ErrType] of cases) {
      it(`maps HTTP ${status} → ${ErrType.name}`, async () => {
        const { transport } = recordingTransport(
          jsonResponse(status, { code: "err", message: `boom ${status}`, data: { status } }),
        );
        const client = createWooClient({ config, transport });
        await expect(client.getOrder(1)).rejects.toBeInstanceOf(ErrType);
      });
    }

    it("maps a thrown transport (network) → WooNetworkError", async () => {
      const client = createWooClient({
        config,
        transport: async () => {
          throw new TypeError("fetch failed");
        },
      });
      await expect(client.getOrder(1)).rejects.toBeInstanceOf(WooNetworkError);
    });

    it("carries the Woo status code + first error message on a typed error", async () => {
      const { transport } = recordingTransport(
        jsonResponse(401, { code: "woocommerce_rest_authentication_error", message: "Invalid signature", data: { status: 401 } }),
      );
      const client = createWooClient({ config, transport });
      try {
        await client.getOrder(1);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(WooAuthFailed);
        const e = err as WooAuthFailed;
        expect(e.status).toBe(401);
        expect(e.wooMessage).toBe("Invalid signature");
      }
    });
  });

  describe("NO retry (AC5 — retries belong to S07)", () => {
    it("makes exactly one attempt on a 500 (no retry)", async () => {
      const { transport, calls } = recordingTransport(jsonResponse(500, { message: "server" }));
      const client = createWooClient({ config, transport });
      await expect(client.getOrder(1)).rejects.toBeInstanceOf(WooServerError);
      expect(calls).toHaveLength(1);
    });

    it("makes exactly one attempt on a network throw (no retry)", async () => {
      const attempts = vi.fn(async () => {
        throw new Error("down");
      });
      const client = createWooClient({ config, transport: attempts });
      await expect(client.getOrder(1)).rejects.toBeInstanceOf(WooNetworkError);
      expect(attempts).toHaveBeenCalledTimes(1);
    });
  });

  describe("structured logging with secret redaction (AC6)", () => {
    it("logs url, method, status, duration and NEVER the auth header/secret", async () => {
      const entries: WooLogEntry[] = [];
      const { transport } = recordingTransport(jsonResponse(200, { id: 1, status: "processing" }));
      const client = createWooClient({
        config,
        transport,
        log: (entry) => entries.push(entry),
      });
      await client.getOrder(1);

      expect(entries).toHaveLength(1);
      const e = entries[0]!;
      expect(e.method).toBe("GET");
      expect(e.status).toBe(200);
      expect(typeof e.durationMs).toBe("number");
      expect(e.url).toContain("/wp-json/wc/v3/orders/1");
      // The serialized log entry must never contain the secret or the key.
      const serialized = JSON.stringify(e);
      expect(serialized).not.toContain("cs_test_secret");
      expect(serialized).not.toContain("ck_test_key");
      expect(serialized).not.toMatch(/Basic /u);
    });

    it("logs the failing status on an error response (AC6)", async () => {
      const entries: WooLogEntry[] = [];
      const { transport } = recordingTransport(jsonResponse(404, { message: "nope" }));
      const client = createWooClient({ config, transport, log: (e) => entries.push(e) });
      await expect(client.getOrder(1)).rejects.toBeInstanceOf(WooNotFound);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.status).toBe(404);
    });
  });

  describe("test connection (AC4)", () => {
    it("reports OK on system_status 200", async () => {
      const { transport, calls } = recordingTransport(
        jsonResponse(200, { environment: { version: "8.5.1" } }),
      );
      const client = createWooClient({ config, transport });
      const result = await client.testConnection();
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(new URL(calls[0]!.url).pathname).toBe("/wp-json/wc/v3/system_status");
    });

    it("reports failure with status code + first error on 401", async () => {
      const { transport } = recordingTransport(
        jsonResponse(401, { code: "woocommerce_rest_authentication_error", message: "Invalid signature", data: { status: 401 } }),
      );
      const client = createWooClient({ config, transport });
      const result = await client.testConnection();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain("Invalid signature");
    });

    it("reports failure on a network error (no status)", async () => {
      const client = createWooClient({
        config,
        transport: async () => {
          throw new Error("ECONNREFUSED");
        },
      });
      const result = await client.testConnection();
      expect(result.ok).toBe(false);
      expect(result.status).toBeNull();
      expect(result.message.length).toBeGreaterThan(0);
    });
  });
});
