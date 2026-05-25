import { z } from "zod";

/**
 * UTM capture + acquisition-source attribution (P1-E12-S03).
 *
 * A WhatsApp ad deep-links to `/book/[unit]?utm_*`; the five canonical UTM
 * params are captured (AC1), carried through the signup funnel, and persisted to
 * `parents.acquisition_source` so a signup can be attributed to the ad that
 * drove it (AC2). All parsing/normalisation is pure here so it is unit-testable
 * in isolation (vitest, no DOM, no Next request object) and shared by the
 * platform deep-link route and the API persistence path.
 */

/** Max stored length of any single UTM value — keeps the jsonb payload bounded. */
export const UTM_VALUE_MAX = 200;

/** The five canonical `utm_*` query keys, in standard order (AC1). */
export const UTM_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type UtmParamKey = (typeof UTM_PARAM_KEYS)[number];

/** Map each `utm_*` query key to the short field stored on the parent. */
const UTM_FIELD_BY_KEY: Record<UtmParamKey, keyof AcquisitionSource> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
};

/**
 * The persisted acquisition source: a partial set of the five UTM dimensions.
 * Stored as jsonb on `parents.acquisition_source`. At least one field must be
 * present (an all-empty payload carries no attribution signal).
 */
const utmField = z.string().trim().min(1).max(UTM_VALUE_MAX);

export const acquisitionSourceSchema = z
  .object({
    source: utmField.optional(),
    medium: utmField.optional(),
    campaign: utmField.optional(),
    term: utmField.optional(),
    content: utmField.optional(),
  })
  .strip()
  .refine((v) => Object.values(v).some((x) => typeof x === "string" && x.length > 0), {
    message: "At least one UTM field is required",
  });
export type AcquisitionSource = z.infer<typeof acquisitionSourceSchema>;

/** One raw query value as Next/URLSearchParams surface them (string | string[]). */
type RawQueryValue = string | string[] | undefined;

/** Take the first value of a possibly-repeated query param, trimmed + clamped. */
function firstValue(raw: RawQueryValue): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, UTM_VALUE_MAX);
}

/**
 * Parse the `utm_*` params out of a query record (AC1). Only the five canonical
 * keys are read; everything else is ignored. Empty/whitespace values are
 * dropped. Returns `null` when no UTM signal is present so callers can skip
 * attribution entirely rather than persist an empty object.
 */
export function parseUtmParams(
  query: Record<string, RawQueryValue>,
): AcquisitionSource | null {
  const out: Partial<Record<keyof AcquisitionSource, string>> = {};
  for (const key of UTM_PARAM_KEYS) {
    const value = firstValue(query[key]);
    if (value !== null) out[UTM_FIELD_BY_KEY[key]] = value;
  }
  return Object.keys(out).length > 0 ? (out as AcquisitionSource) : null;
}

/** Serialize an acquisition source to a JSON string for a cookie; null stays null. */
export function serializeAcquisitionSource(src: AcquisitionSource | null): string | null {
  if (!src || Object.keys(src).length === 0) return null;
  return JSON.stringify(src);
}

/**
 * Safely parse an acquisition source from an untrusted JSON string (e.g. a
 * cookie value carried through the funnel). Returns null on any malformed /
 * empty / invalid payload — attribution is best-effort and must never break
 * signup.
 */
export function deserializeAcquisitionSource(raw: string | null | undefined): AcquisitionSource | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = acquisitionSourceSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
