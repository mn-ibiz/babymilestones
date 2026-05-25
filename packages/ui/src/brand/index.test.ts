import { describe, expect, it } from "vitest";
import {
  BRAND,
  brandColors,
  brandTokens,
  resolveBrandAsset,
  type BrandAssetName,
} from "./index.js";
import { tokens } from "@bm/config";

describe("brand source (X7-S04)", () => {
  it("exposes the brand name and strings", () => {
    expect(BRAND.name).toBe("Baby Milestones");
    expect(typeof BRAND.tagline).toBe("string");
    expect(BRAND.tagline.length).toBeGreaterThan(0);
    expect(typeof BRAND.supportPhone).toBe("string");
  });

  it("registers logo + favicon assets resolvable by name", () => {
    const logo = resolveBrandAsset("logo");
    expect(logo.path).toMatch(/\.svg$/u);
    expect(logo.mimeType).toBe("image/svg+xml");

    const mark = resolveBrandAsset("logo-mark");
    expect(mark.path).toMatch(/\.svg$/u);

    const favicon = resolveBrandAsset("favicon");
    expect(favicon.path).toMatch(/\.svg$/u);
  });

  it("every registered asset is resolvable and points under brand/", () => {
    const names: BrandAssetName[] = ["logo", "logo-mark", "favicon"];
    for (const name of names) {
      const asset = resolveBrandAsset(name);
      expect(asset.name).toBe(name);
      expect(asset.path).toContain("brand/");
    }
  });

  it("throws on an unknown asset name", () => {
    expect(() => resolveBrandAsset("nope" as BrandAssetName)).toThrow(/unknown brand asset/iu);
  });

  it("colour overrides feed the token layer (brand colour matches tokens)", () => {
    // brandColors is the override set; merged tokens must agree with @bm/config.
    expect(brandColors.brand).toBe(tokens.color.brand);
    expect(brandTokens.color.brand).toBe(tokens.color.brand);
  });

  it("brandTokens merges overrides over base tokens", () => {
    // Base keys survive the merge.
    expect(brandTokens.color.ink).toBe(tokens.color.ink);
    expect(brandTokens.color.primary[500]).toBe(tokens.color.primary[500]);
  });
});
