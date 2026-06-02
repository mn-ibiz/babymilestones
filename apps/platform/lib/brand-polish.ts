/**
 * P6-E06-S01 (Story 36.1) — Brand polish constraints for the public marketing surface.
 *
 * A pure, framework-free module that encodes the THREE machine-checkable brand
 * polish rules and the scanners that enforce them. The actual assertions live in
 * `brand-polish.test.ts`, which scans the real public marketing files; keeping the
 * rule logic here means it is unit-testable in isolation (vitest, no DOM) and the
 * intent is documented in one place.
 *
 * The three rules:
 *   - AC3 — every animation/transition on the public surface completes in
 *     {@link MAX_ANIMATION_MS} ms or less. {@link findSlowAnimations} reports any
 *     Tailwind `duration-N` class or inline `Nms`/`Ns` transition that exceeds it.
 *   - AC1 — brand colours come from the design-system tokens, never raw hex/rgb in
 *     a marketing component's markup. {@link findRawColors} reports stray literals,
 *     respecting {@link RAW_COLOR_ALLOWLIST}.
 *   - AC2 — public headings/body use the brand type scale only. {@link BRAND_TYPE_SCALE}
 *     is the allowed set (mirrors the token `fontSize` keys) and
 *     {@link findOffScaleFontSizes} reports any `text-<size>` class outside it.
 *
 * NOTE on photography (AC1, the photo swap): real licensed photos of real children
 * are an outstanding ASSET task, not a code task — see {@link HERO_IMAGE_SLOT}. The
 * code is asset-ready: the hero uses `next/image` with explicit dimensions + alt
 * text and a single named slot constant, so a real asset drops in with no code change.
 */

/** The maximum permitted animation/transition duration on the public surface (AC3). */
export const MAX_ANIMATION_MS = 200;

/**
 * The brand type scale (AC2) — the `text-<size>` utilities the public marketing
 * surface is allowed to use. Mirrors the `fontSize` keys in the design tokens
 * (`packages/config/tokens.cjs`): `xs` … `3xl`. Anything larger (`4xl`, `5xl`, …)
 * is a one-off that bypasses the brand scale and must be normalised down to `3xl`.
 */
export const BRAND_TYPE_SCALE = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"] as const;
export type BrandTypeSize = (typeof BRAND_TYPE_SCALE)[number];

/**
 * The marketing hero photo slot (AC1). A single named constant so the real
 * licensed photo (an asset/marketing deliverable) drops in here with no code
 * change. The path is served from `public/`; the file currently present is a
 * stand-in until the licensed asset lands. The page renders it through
 * `next/image` with explicit width/height + descriptive alt text, so swapping the
 * binary needs no markup edit and introduces no layout shift.
 */
export const HERO_IMAGE_SLOT = {
  /** Public path of the hero photo. Real asset replaces the file at this path. */
  src: "/home/hero-child.jpg",
  /** Intrinsic render dimensions — kept stable so a swap causes no CLS. */
  width: 960,
  height: 720,
  /** True until a real licensed photograph of a real child replaces the stand-in. */
  awaitingRealAsset: true,
} as const;

/**
 * Allowlist for {@link findRawColors}: substrings that, when present on a line,
 * exempt it from the raw-colour rule. Marketing components should have NONE; this
 * exists only so a documented, intentional exception (e.g. an inline SVG brand
 * mark that must carry literal fills) can be added explicitly rather than silently.
 * Empty by default — the public surface is fully tokenised.
 */
export const RAW_COLOR_ALLOWLIST: readonly string[] = [];

/** A single scan finding: the 1-based line and the offending fragment. */
export interface ScanFinding {
  line: number;
  match: string;
}

/** Matches a Tailwind transition-duration utility, capturing the millisecond value. */
const DURATION_CLASS = /\bduration-(\d+)\b/g;
/** Matches an inline CSS duration literal like `200ms` or `0.2s` / `.2s`. */
const INLINE_DURATION = /(\d*\.?\d+)\s*(ms|s)\b/g;
/** Matches a raw hex colour literal (#rgb / #rrggbb / #rrggbbaa). */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
/** Matches an rgb()/rgba()/hsl()/hsla() colour function. */
const FN_COLOR = /\b(?:rgba?|hsla?)\s*\(/g;
/** Matches a Tailwind text-size utility, capturing the size token. */
const TEXT_SIZE_CLASS = /\btext-(xs|sm|base|lg|xl|\d?xl)\b/g;

/** Normalise an inline duration capture to milliseconds. */
function toMs(value: string, unit: string): number {
  const n = Number(value);
  return unit === "s" ? n * 1000 : n;
}

/**
 * Find every animation/transition duration in `source` that exceeds
 * {@link MAX_ANIMATION_MS} (AC3). Covers Tailwind `duration-N` classes (N is ms)
 * and inline `Nms` / `Ns` literals (e.g. in a `transition` style or CSS string).
 * Lines that are pure comments are ignored so prose like "300ms" in a doc comment
 * never trips the guard. Returns the offending findings (empty = compliant).
 */
export function findSlowAnimations(source: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  source.split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (isCommentLine(raw)) return;
    for (const m of raw.matchAll(DURATION_CLASS)) {
      const ms = Number(m[1]);
      if (ms > MAX_ANIMATION_MS) findings.push({ line, match: m[0] });
    }
    for (const m of raw.matchAll(INLINE_DURATION)) {
      const ms = toMs(m[1]!, m[2]!);
      if (ms > MAX_ANIMATION_MS) findings.push({ line, match: m[0] });
    }
  });
  return findings;
}

/**
 * Find raw colour literals (hex or rgb/hsl functions) in `source` (AC1). Lines that
 * are pure comments, or that contain an allowlisted substring, are skipped. Returns
 * the offending findings (empty = fully tokenised).
 */
export function findRawColors(
  source: string,
  allowlist: readonly string[] = RAW_COLOR_ALLOWLIST,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  source.split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (isCommentLine(raw)) return;
    if (allowlist.some((a) => raw.includes(a))) return;
    for (const m of raw.matchAll(HEX_COLOR)) findings.push({ line, match: m[0] });
    for (const m of raw.matchAll(FN_COLOR)) findings.push({ line, match: m[0] });
  });
  return findings;
}

/**
 * Find `text-<size>` utilities in `source` that fall OUTSIDE the brand type scale
 * (AC2). Comment lines are ignored. Returns the offending findings (empty = on-scale).
 */
export function findOffScaleFontSizes(source: string): ScanFinding[] {
  const scale = new Set<string>(BRAND_TYPE_SCALE);
  const findings: ScanFinding[] = [];
  source.split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (isCommentLine(raw)) return;
    for (const m of raw.matchAll(TEXT_SIZE_CLASS)) {
      const size = m[1]!;
      if (!scale.has(size)) findings.push({ line, match: m[0] });
    }
  });
  return findings;
}

/** True for a line that is only a `//` or `*` (block-comment body) comment. */
function isCommentLine(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}
