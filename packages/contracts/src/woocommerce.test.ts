import { describe, expect, it } from "vitest";
import {
  wooOrderSchema,
  wooOrderListSchema,
  wooProductSchema,
  wooProductListSchema,
  wooSystemStatusSchema,
  wooErrorSchema,
  wooConfigSaveSchema,
  stockStatusFor,
  stockPushOutboxKey,
  parseSkuMappingCsv,
} from "./woocommerce.js";

/**
 * P4-E04-S06 (Story 29.6) — Zod schemas validating WooCommerce REST payload
 * shapes. The client rejects silently-changed payloads by parsing through these.
 */
describe("woocommerce contracts (Story 29.6)", () => {
  it("parses a minimal order and coerces id to number", () => {
    const parsed = wooOrderSchema.parse({ id: 42, status: "processing", number: "42" });
    expect(parsed.id).toBe(42);
    expect(parsed.status).toBe("processing");
  });

  it("rejects an order missing the id", () => {
    expect(wooOrderSchema.safeParse({ status: "processing" }).success).toBe(false);
  });

  it("parses an order list", () => {
    const parsed = wooOrderListSchema.parse([
      { id: 1, status: "pending" },
      { id: 2, status: "completed" },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("parses a product with stock fields", () => {
    const parsed = wooProductSchema.parse({
      id: 7,
      name: "Nappy",
      stock_quantity: 12,
      stock_status: "instock",
    });
    expect(parsed.stock_quantity).toBe(12);
    expect(parsed.stock_status).toBe("instock");
  });

  it("tolerates a null stock_quantity (Woo returns null for un-managed stock)", () => {
    const parsed = wooProductSchema.parse({ id: 7, name: "Nappy", stock_status: "instock" });
    expect(parsed.stock_quantity ?? null).toBeNull();
  });

  it("parses a product list", () => {
    expect(wooProductListSchema.parse([{ id: 1, name: "A" }])).toHaveLength(1);
  });

  it("parses a system_status response (test-connection)", () => {
    const parsed = wooSystemStatusSchema.parse({
      environment: { version: "8.5.1", wp_version: "6.4" },
    });
    expect(parsed.environment?.version).toBe("8.5.1");
  });

  it("parses a Woo error body (code + message)", () => {
    const parsed = wooErrorSchema.parse({
      code: "woocommerce_rest_authentication_error",
      message: "Invalid signature",
      data: { status: 401 },
    });
    expect(parsed.code).toBe("woocommerce_rest_authentication_error");
    expect(parsed.message).toBe("Invalid signature");
  });

  describe("wooConfigSaveSchema (admin panel input)", () => {
    const valid = {
      siteUrl: "https://shop.example.com",
      consumerKey: "ck_1234567890abcdef",
      consumerSecret: "cs_1234567890abcdef",
    };

    it("accepts a valid HTTPS config", () => {
      expect(wooConfigSaveSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects a non-HTTPS site URL (HTTPS enforced — AC2)", () => {
      expect(wooConfigSaveSchema.safeParse({ ...valid, siteUrl: "http://shop.example.com" }).success).toBe(false);
    });

    it("rejects a blank consumer key / secret", () => {
      expect(wooConfigSaveSchema.safeParse({ ...valid, consumerKey: "" }).success).toBe(false);
      expect(wooConfigSaveSchema.safeParse({ ...valid, consumerSecret: "" }).success).toBe(false);
    });

    it("allows omitting secrets on update (keep existing)", () => {
      const parsed = wooConfigSaveSchema.safeParse({ siteUrl: "https://shop.example.com" });
      expect(parsed.success).toBe(true);
    });
  });
});

describe("stock push helpers (Story 29.5)", () => {
  it("derives stock_status from quantity (AC3): 0 → outofstock, >0 → instock", () => {
    expect(stockStatusFor(0)).toBe("outofstock");
    expect(stockStatusFor(-3)).toBe("outofstock");
    expect(stockStatusFor(1)).toBe("instock");
    expect(stockStatusFor(120)).toBe("instock");
  });

  it("keys the coalesced outbox row by product id (AC4)", () => {
    expect(stockPushOutboxKey("abc")).toBe("wc-stock:abc");
    expect(stockPushOutboxKey("abc")).toBe(stockPushOutboxKey("abc"));
  });
});

describe("SKU-mapping CSV import (Story 29.5, AC5)", () => {
  it("parses valid rows with a Woo product id and a blank (unmap)", () => {
    const csv = "sku,woo_product_id\nBM-NAPPY-S,1011\nBM-WIPES,\n";
    const { rows, errors } = parseSkuMappingCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 1, sku: "BM-NAPPY-S", wooProductId: 1011 },
      { line: 2, sku: "BM-WIPES", wooProductId: null },
    ]);
  });

  it("reports a header error and no rows on a malformed header", () => {
    const { rows, errors } = parseSkuMappingCsv("name,id\nBM-NAPPY-S,1011\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(0);
  });

  it("collects per-line errors without aborting the import", () => {
    const csv = [
      "sku,woo_product_id",
      "BM-NAPPY-S,1011", // ok (line 1)
      ",55", // blank sku (line 2)
      "BM-WIPES,abc", // non-numeric (line 3)
      "BM-LOTION,-4", // non-positive (line 4)
      "BM-NAPPY-S,2022", // duplicate sku (line 5)
      "BM-BOTTLE,9090", // ok (line 6)
    ].join("\n");
    const { rows, errors } = parseSkuMappingCsv(csv);
    expect(rows.map((r) => r.sku)).toEqual(["BM-NAPPY-S", "BM-BOTTLE"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
  });

  it("treats CRLF line endings the same as LF", () => {
    const { rows, errors } = parseSkuMappingCsv("sku,woo_product_id\r\nBM-NAPPY-S,1011\r\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ line: 1, sku: "BM-NAPPY-S", wooProductId: 1011 }]);
  });
});
