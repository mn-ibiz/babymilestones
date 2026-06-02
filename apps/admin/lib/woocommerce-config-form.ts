/**
 * Admin WooCommerce config view/form logic (Story 29.6 / P4-E04-S06).
 * Framework-agnostic + dependency-light so it unit-tests without a DOM and never
 * pulls server-only code into the Next bundle. The WooCommerce settings panel
 * consumes this to:
 *  - gate the management UI to roles holding `manage config` (admin re-checks),
 *  - validate the save form client-side before PUTting (AC2/AC3),
 *  - build the save payload, OMITTING blank secrets so the stored encrypted
 *    value is kept (AC3 — the raw secret is write-only and never round-trips),
 *  - render the configured status + the test-connection outcome (AC4).
 *
 * The API (`/admin/woocommerce-config*`) is the source of truth and re-validates
 * + re-runs the permission check; this only shapes input and display.
 */
import {
  wooConfigSaveSchema,
  type WooConfigPublic,
  type WooConfigSaveInput,
  type WooTestConnectionResult,
} from "@bm/contracts";

/** Roles allowed to manage WooCommerce config (mirrors `manage config`). Server re-checks. */
const MANAGE_CONFIG_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage WooCommerce config (AC3). */
export function canManageWooConfig(role: string): boolean {
  return MANAGE_CONFIG_ROLES.has(role);
}

export interface WooConfigFormErrors {
  siteUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

export interface WooConfigFormInput {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

/**
 * Validate the save form client-side (mirrors the contract). When no config yet
 * exists (`exists: false`) both secrets are required for first-time setup;
 * otherwise blank secrets are allowed (they keep the stored values — AC3).
 */
export function validateWooConfigForm(
  input: WooConfigFormInput,
  opts: { exists?: boolean } = {},
): WooConfigFormErrors {
  const errors: WooConfigFormErrors = {};
  const payload = buildWooConfigPayload(input);
  const parsed = wooConfigSaveSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof WooConfigFormErrors | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  // First-time setup: a connection is useless without credentials.
  if (opts.exists === false) {
    if (input.consumerKey.trim() === "") errors.consumerKey = "Consumer key is required";
    if (input.consumerSecret.trim() === "") errors.consumerSecret = "Consumer secret is required";
  }
  return errors;
}

/**
 * Build the PUT payload. The site URL is always sent; a blank consumer
 * key/secret is OMITTED so the server keeps the previously-stored encrypted
 * value (AC3 — write-only secret). Provided values are trimmed.
 */
export function buildWooConfigPayload(input: WooConfigFormInput): WooConfigSaveInput {
  const payload: WooConfigSaveInput = { siteUrl: input.siteUrl.trim() };
  const key = input.consumerKey.trim();
  const secret = input.consumerSecret.trim();
  if (key !== "") payload.consumerKey = key;
  if (secret !== "") payload.consumerSecret = secret;
  return payload;
}

/** Human status label for the configured state. */
export function wooConfigStatusLabel(pub: WooConfigPublic): string {
  if (pub.hasConsumerKey && pub.hasConsumerSecret) return "Configured";
  if (pub.siteUrl || pub.hasConsumerKey || pub.hasConsumerSecret) return "Incomplete";
  return "Not configured";
}

/** Human label for a test-connection result (OK / failure with status + first error, AC4). */
export function testConnectionStatusLabel(result: WooTestConnectionResult): string {
  if (result.ok) return `OK — ${result.message}`;
  const code = result.status !== null ? ` (HTTP ${result.status})` : "";
  return `Failed${code}: ${result.message}`;
}
