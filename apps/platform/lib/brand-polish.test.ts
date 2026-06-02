import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BRAND_TYPE_SCALE,
  HERO_IMAGE_SLOT,
  MAX_ANIMATION_MS,
  RAW_COLOR_ALLOWLIST,
  findOffScaleFontSizes,
  findRawColors,
  findSlowAnimations,
} from "./brand-polish";

/**
 * P6-E06-S01 (Story 36.1) — Brand polish pass for the PUBLIC marketing surface.
 *
 * These tests are the machine-checkable parts of an otherwise visual story. They
 * have two layers:
 *   1. Unit tests over the pure scanners — proving each rule actually CATCHES a
 *      violation (red) and PASSES clean input (green), so the source scans below
 *      are trustworthy rather than vacuous.
 *   2. Source scans over the REAL public marketing files — asserting the live
 *      surface has no animation slower than {@link MAX_ANIMATION_MS}ms (AC3), no
 *      raw colour literals (AC1), and no off-scale type (AC2).
 *
 * The photography swap (AC1) is an outstanding ASSET task, not code — see the
 * `hero photo slot` test, which asserts only that the slot is asset-ready.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

/**
 * The public marketing surface: the `(public)` route group pages + layout, the
 * shared marketing components (the public header + the auth forms its pages
 * render), and the home-content model. This is the exact set Story 36.1 scopes.
 */
const PUBLIC_SURFACE_FILES = [
  "app/(public)/page.tsx",
  "app/(public)/layout.tsx",
  "app/(public)/[unit]/page.tsx",
  "app/(public)/blog/page.tsx",
  "app/(public)/blog/[slug]/page.tsx",
  "app/(public)/(auth)/login/page.tsx",
  "app/(public)/(auth)/signup/page.tsx",
  "app/components/PublicHeader.tsx",
  "app/components/SignInForm.tsx",
  "app/components/SignUpForm.tsx",
  "lib/home-content.ts",
] as const;

const read = (rel: string): string => readFileSync(resolve(appRoot, rel), "utf8");

describe("brand-polish scanners (unit)", () => {
  describe("findSlowAnimations (AC3)", () => {
    it("flags a Tailwind duration class over 200ms", () => {
      expect(findSlowAnimations(`className="transition duration-300"`)).toEqual([
        { line: 1, match: "duration-300" },
      ]);
    });

    it("flags an inline ms/s duration over 200ms", () => {
      expect(findSlowAnimations(`style={{ transition: "all 0.5s ease" }}`)).toEqual([
        { line: 1, match: "0.5s" },
      ]);
      expect(findSlowAnimations(`transition: opacity 350ms;`)).toEqual([
        { line: 1, match: "350ms" },
      ]);
    });

    it("accepts durations at or under the cap", () => {
      expect(findSlowAnimations(`className="duration-200"`)).toEqual([]);
      expect(findSlowAnimations(`transition: all 200ms; transition: all .15s;`)).toEqual([]);
    });

    it("ignores durations written in comments", () => {
      expect(findSlowAnimations(`  // historically this faded over 300ms`)).toEqual([]);
    });
  });

  describe("findRawColors (AC1)", () => {
    it("flags a raw hex colour", () => {
      expect(findRawColors(`<div className="bg-[#FF6B9D]">`)).toEqual([
        { line: 1, match: "#FF6B9D" },
      ]);
    });

    it("flags an rgb()/hsl() colour function", () => {
      expect(findRawColors(`style={{ color: "rgb(255,0,0)" }}`)).toEqual([
        { line: 1, match: "rgb(" },
      ]);
    });

    it("accepts tokenised classes", () => {
      expect(findRawColors(`className="bg-brand text-surface border-ink/10"`)).toEqual([]);
    });

    it("respects the allowlist", () => {
      expect(findRawColors(`fill="#fff" // ALLOW_RAW`, ["ALLOW_RAW"])).toEqual([]);
    });
  });

  describe("findOffScaleFontSizes (AC2)", () => {
    it("flags a size outside the brand scale", () => {
      expect(findOffScaleFontSizes(`className="text-4xl"`)).toEqual([
        { line: 1, match: "text-4xl" },
      ]);
      expect(findOffScaleFontSizes(`className="md:text-5xl"`)).toEqual([
        { line: 1, match: "text-5xl" },
      ]);
    });

    it("accepts every size on the brand scale", () => {
      const all = BRAND_TYPE_SCALE.map((s) => `text-${s}`).join(" ");
      expect(findOffScaleFontSizes(`className="${all}"`)).toEqual([]);
    });
  });
});

describe("public marketing surface (source scan)", () => {
  it.each(PUBLIC_SURFACE_FILES)("%s has no animation slower than 200ms (AC3)", (rel) => {
    const findings = findSlowAnimations(read(rel));
    expect(
      findings,
      `Animations must complete in ${MAX_ANIMATION_MS}ms or less. ` +
        `Found in ${rel}: ${findings.map((f) => `L${f.line} ${f.match}`).join(", ")}`,
    ).toEqual([]);
  });

  it.each(PUBLIC_SURFACE_FILES)("%s uses brand tokens, not raw colours (AC1)", (rel) => {
    const findings = findRawColors(read(rel), RAW_COLOR_ALLOWLIST);
    expect(
      findings,
      `Brand colours must come from design tokens (bg-brand, text-ink, …), not raw ` +
        `hex/rgb. Found in ${rel}: ${findings.map((f) => `L${f.line} ${f.match}`).join(", ")}`,
    ).toEqual([]);
  });

  it.each(PUBLIC_SURFACE_FILES)("%s stays on the brand type scale (AC2)", (rel) => {
    const findings = findOffScaleFontSizes(read(rel));
    expect(
      findings,
      `Type must use the brand scale (${BRAND_TYPE_SCALE.join(", ")}). ` +
        `Found in ${rel}: ${findings.map((f) => `L${f.line} ${f.match}`).join(", ")}`,
    ).toEqual([]);
  });
});

describe("hero photo slot (AC1 — photography swap is an asset task)", () => {
  it("the home hero renders the named slot through next/image with alt + dimensions", () => {
    const page = read("app/(public)/page.tsx");
    const content = read("lib/home-content.ts");
    // The page renders the hero image via next/image (no <img>), so a real asset
    // drops in with no markup change and no layout shift.
    expect(page).toMatch(/import Image from "next\/image"/);
    expect(page).toMatch(/<Image/);
    expect(page).toMatch(/width=\{\d+\}/);
    expect(page).toMatch(/height=\{\d+\}/);
    // The slot path + alt text live in the content model, not inline literals.
    expect(content).toContain(HERO_IMAGE_SLOT.src);
    expect(content).toMatch(/alt:\s*"[^"]+"/);
  });

  it("documents that the real photograph is still outstanding", () => {
    // This flag is the single source of truth that the binary is a stand-in. When
    // the licensed photo lands, flip it to false in the same commit as the asset.
    expect(HERO_IMAGE_SLOT.awaitingRealAsset).toBe(true);
  });
});
