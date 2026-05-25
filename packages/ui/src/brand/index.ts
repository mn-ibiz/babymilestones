/**
 * Brand source (X7-S04) — the single place every surface draws brand facts from.
 *
 * A designer drops the logo + colour overrides in `packages/ui/brand/`; this
 * module turns them into typed exports so receipts (P1-E08), SMS-stub bodies
 * (P1-E09, via `@bm/ui/brand`), and the UI all consume one source. No literals
 * are duplicated downstream — they import {@link BRAND} / {@link resolveBrandAsset}.
 *
 * Dependency-light by design: assets are referenced by relative *path metadata*
 * (no bundler image loaders), and colours flow through the X7-S01 token layer
 * (`@bm/config`) so a brand change re-skins the Tailwind preset too. This module
 * is React-free, so non-UI packages (e.g. `@bm/sms`) can import `@bm/ui/brand`
 * without pulling the component runtime.
 */
import { tokens, type Tokens } from "@bm/config";
import brandColorConfig from "../../brand/colors.cjs";

/** The brand strings every surface reflects. The launch brand for Baby Milestones. */
export const BRAND = {
  /** Legal/display business name printed on receipts and SMS bodies. */
  name: "Baby Milestones",
  /** Short tagline for marketing surfaces / email footers. */
  tagline: "Every milestone, beautifully tracked.",
  /** Customer-facing support/hotline number. */
  supportPhone: "+254 700 000 000",
} as const;

/** Names of the registered brand assets (logo variants + favicon). */
export type BrandAssetName = "logo" | "logo-mark" | "favicon";

/** Metadata for one registered brand asset. `path` is relative to `packages/ui/`. */
export interface BrandAsset {
  name: BrandAssetName;
  /** Path relative to the package root (`packages/ui/`) — consumers join as needed. */
  path: string;
  mimeType: string;
  /** Human label for alt text / accessible name. */
  label: string;
}

/**
 * The asset registry/manifest — paths + metadata, no binary import. The full
 * lockup ("logo"), the badge-only mark ("logo-mark"), and the favicon (reusing
 * the mark) all live under `brand/`.
 */
const ASSETS: Record<BrandAssetName, BrandAsset> = {
  logo: {
    name: "logo",
    path: "brand/logo.svg",
    mimeType: "image/svg+xml",
    label: `${BRAND.name} logo`,
  },
  "logo-mark": {
    name: "logo-mark",
    path: "brand/logo-mark.svg",
    mimeType: "image/svg+xml",
    label: `${BRAND.name} mark`,
  },
  favicon: {
    name: "favicon",
    path: "brand/logo-mark.svg",
    mimeType: "image/svg+xml",
    label: `${BRAND.name} favicon`,
  },
};

/** The full asset manifest, frozen so consumers can iterate but not mutate. */
export const brandAssets: Readonly<Record<BrandAssetName, BrandAsset>> = Object.freeze(ASSETS);

/** Resolve a brand asset by name. Throws on an unknown name (typo guard). */
export function resolveBrandAsset(name: BrandAssetName): BrandAsset {
  const asset = ASSETS[name];
  if (!asset) {
    throw new Error(`unknown brand asset "${String(name)}"`);
  }
  return asset;
}

/** Shape of a colour-override set (a partial of the token colour map). */
export interface BrandColorOverrides {
  [key: string]: unknown;
}

/**
 * The colour overrides a designer set in `brand/colors.cjs` — the single edit
 * point that re-skins the suite. Merged over the base tokens by
 * {@link brandTokens}.
 */
export const brandColors: BrandColorOverrides =
  (brandColorConfig as { color?: Record<string, unknown> }).color ?? {};

/**
 * Base tokens with the brand colour overrides applied — the effective token set
 * the brand layer presents. Override keys win; everything else falls through to
 * the X7-S01 base tokens, so a change in `brand/colors.cjs` propagates here and
 * (via the matching `.cjs` preset layer) to Tailwind.
 */
export const brandTokens: Tokens = {
  ...tokens,
  color: { ...tokens.color, ...(brandColors as Record<string, unknown>) },
} as Tokens;
