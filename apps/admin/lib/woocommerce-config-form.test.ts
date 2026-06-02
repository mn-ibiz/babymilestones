import { describe, expect, it } from "vitest";
import {
  canManageWooConfig,
  validateWooConfigForm,
  buildWooConfigPayload,
  wooConfigStatusLabel,
  testConnectionStatusLabel,
} from "./woocommerce-config-form.js";

/**
 * Story 29.6 — admin WooCommerce config view/form logic. Framework-agnostic +
 * dependency-light so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The server (`/admin/woocommerce-config*`) is the
 * source of truth and re-validates; this only shapes input and display. The raw
 * secret never round-trips: the form omits a blank secret so the stored one is
 * kept (AC3 write-only).
 */
describe("woocommerce-config-form (Story 29.6 admin UI logic)", () => {
  it("gates management to admin / super_admin (AC3)", () => {
    expect(canManageWooConfig("admin")).toBe(true);
    expect(canManageWooConfig("super_admin")).toBe(true);
    expect(canManageWooConfig("reception")).toBe(false);
    expect(canManageWooConfig("parent")).toBe(false);
  });

  const valid = {
    siteUrl: "https://shop.example.com",
    consumerKey: "ck_1234567890",
    consumerSecret: "cs_0987654321",
  };

  it("accepts a valid HTTPS config", () => {
    expect(validateWooConfigForm(valid)).toEqual({});
  });

  it("flags a non-HTTPS site URL (AC2)", () => {
    const e = validateWooConfigForm({ ...valid, siteUrl: "http://shop.example.com" });
    expect(e.siteUrl).toBeDefined();
  });

  it("flags a missing site URL", () => {
    expect(validateWooConfigForm({ ...valid, siteUrl: "" }).siteUrl).toBeDefined();
  });

  it("allows blank secrets when a config already exists (keep existing)", () => {
    expect(validateWooConfigForm({ siteUrl: "https://shop.example.com", consumerKey: "", consumerSecret: "" }, { exists: true })).toEqual({});
  });

  it("requires both secrets on first-time setup (no existing config)", () => {
    const e = validateWooConfigForm({ siteUrl: "https://shop.example.com", consumerKey: "", consumerSecret: "" }, { exists: false });
    expect(e.consumerKey).toBeDefined();
    expect(e.consumerSecret).toBeDefined();
  });

  it("buildWooConfigPayload omits blank secrets so the stored value is kept (AC3)", () => {
    const payload = buildWooConfigPayload({ siteUrl: "https://shop.example.com", consumerKey: "  ", consumerSecret: "" });
    expect(payload).toEqual({ siteUrl: "https://shop.example.com" });
    expect(payload).not.toHaveProperty("consumerKey");
    expect(payload).not.toHaveProperty("consumerSecret");
  });

  it("buildWooConfigPayload includes trimmed secrets when provided", () => {
    const payload = buildWooConfigPayload({ siteUrl: "https://shop.example.com ", consumerKey: " ck_x ", consumerSecret: " cs_y " });
    expect(payload).toEqual({ siteUrl: "https://shop.example.com", consumerKey: "ck_x", consumerSecret: "cs_y" });
  });

  it("status label reflects whether credentials are configured", () => {
    expect(wooConfigStatusLabel({ siteUrl: "https://x", hasConsumerKey: true, hasConsumerSecret: true, updatedAt: null })).toBe("Configured");
    expect(wooConfigStatusLabel({ siteUrl: "https://x", hasConsumerKey: true, hasConsumerSecret: false, updatedAt: null })).toBe("Incomplete");
    expect(wooConfigStatusLabel({ siteUrl: null, hasConsumerKey: false, hasConsumerSecret: false, updatedAt: null })).toBe("Not configured");
  });

  it("test-connection status label reports OK / failure with status code (AC4)", () => {
    expect(testConnectionStatusLabel({ ok: true, status: 200, message: "Connected to WooCommerce 8.5" })).toContain("OK");
    const fail = testConnectionStatusLabel({ ok: false, status: 401, message: "Invalid signature" });
    expect(fail).toContain("401");
    expect(fail).toContain("Invalid signature");
  });
});
