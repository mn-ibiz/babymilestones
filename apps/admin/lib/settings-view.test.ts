import { describe, expect, it } from "vitest";
import {
  canManageSettings,
  canAccessFloatSection,
  validateSettingForm,
  buildLoyaltyPayload,
  buildBrandingPayload,
  buildReceiptBrandingPayload,
  toNumber,
} from "./settings-view.js";

describe("canManageSettings (AC2)", () => {
  it("admits admin + super_admin only", () => {
    expect(canManageSettings("admin")).toBe(true);
    expect(canManageSettings("super_admin")).toBe(true);
    expect(canManageSettings("treasury")).toBe(false);
    expect(canManageSettings("reception")).toBe(false);
  });
});

describe("canAccessFloatSection (AC2 — treasury-gated sub-section)", () => {
  it("admits treasury + super_admin only", () => {
    expect(canAccessFloatSection("treasury")).toBe(true);
    expect(canAccessFloatSection("super_admin")).toBe(true);
    expect(canAccessFloatSection("admin")).toBe(false);
  });
});

describe("validateSettingForm (AC1/AC3)", () => {
  it("flags an out-of-range loyalty earn rate", () => {
    const errors = validateSettingForm("loyalty", { earnRatePer100: -1, redeemValuePerPoint: 1 });
    expect(errors.earnRatePer100).toBeDefined();
  });

  it("accepts a valid loyalty payload", () => {
    expect(validateSettingForm("loyalty", { earnRatePer100: 5, redeemValuePerPoint: 0.5 })).toEqual({});
  });

  it("flags a bad branding colour and empty store name", () => {
    const errors = validateSettingForm("branding", { storeName: "", primaryColour: "blue" });
    expect(errors.storeName).toBeDefined();
    expect(errors.primaryColour).toBeDefined();
  });

  it("accepts valid receipt branding", () => {
    expect(validateSettingForm("receipt_branding", { showLogo: true, footerLine: "Asante" })).toEqual(
      {},
    );
  });
});

describe("payload builders", () => {
  it("parses numbers and treats blank as NaN", () => {
    expect(toNumber("3.5")).toBe(3.5);
    expect(Number.isNaN(toNumber("  "))).toBe(true);
  });

  it("builds a loyalty payload from strings", () => {
    expect(buildLoyaltyPayload({ earnRatePer100: "5", redeemValuePerPoint: "0.5" })).toEqual({
      earnRatePer100: 5,
      redeemValuePerPoint: 0.5,
    });
  });

  it("drops empty optional branding fields", () => {
    const payload = buildBrandingPayload({
      storeName: " Shop ",
      logoUrl: "",
      primaryColour: "#fff",
      secondaryColour: "",
    });
    expect(payload).toEqual({ storeName: "Shop", primaryColour: "#fff" });
  });

  it("drops empty optional receipt lines", () => {
    expect(buildReceiptBrandingPayload({ headerLine: "", footerLine: "  ", showLogo: false })).toEqual({
      showLogo: false,
    });
  });
});
