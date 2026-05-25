/**
 * Admin SMS provider config view/form logic (P1-E09-S02). Framework-agnostic +
 * dependency-light so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The SMS config screen consumes this to:
 *  - gate the management UI to roles holding `manage config` (admin re-checks),
 *  - validate the create/edit form client-side before POSTing (AC1/AC3),
 *  - render the config list, masking that a key is referenced — NEVER its value.
 *
 * The API (`/admin/sms-config*`) is the source of truth and re-validates +
 * re-runs the SSRF check; this only shapes input and display (AC2: the raw key
 * never exists client-side either — only the env-var reference does).
 */
import { smsConfigCreateSchema, type SmsConfigPublic } from "@bm/contracts";

/** Roles allowed to manage SMS config (mirrors `manage config`). The server re-checks. */
const MANAGE_CONFIG_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage SMS config (AC2). */
export function canManageSmsConfig(role: string): boolean {
  return MANAGE_CONFIG_ROLES.has(role);
}

export interface SmsConfigFormErrors {
  senderId?: string;
  apiUrl?: string;
  apiKeyRef?: string;
}

/**
 * Client-side mirror of the SSRF / HTTPS host check (AC3). Pure + synchronous —
 * the server's `@bm/sms` `checkProviderUrlSafety` is authoritative; this gives
 * the operator immediate feedback. Rejects non-HTTPS, localhost/loopback,
 * RFC1918, link-local (incl. 169.254.169.254 metadata), and CGNAT literals.
 */
export function isLikelySafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host.startsWith("fe8") || host.startsWith("fc") || host.startsWith("fd"))
    return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  return true;
}

/**
 * Validate the create/edit form client-side (mirrors the contract + adds the
 * SSRF host check). The server re-validates everything. The API key field here
 * is the env-var REFERENCE, never the secret (AC2).
 */
export function validateSmsConfigForm(input: {
  senderId: string;
  apiUrl: string;
  apiKeyRef: string;
}): SmsConfigFormErrors {
  const errors: SmsConfigFormErrors = {};
  const parsed = smsConfigCreateSchema.safeParse({
    senderId: input.senderId,
    apiUrl: input.apiUrl,
    apiKeyRef: input.apiKeyRef,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof SmsConfigFormErrors | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  // Host-level SSRF guard, only if the URL is otherwise a valid HTTPS string.
  if (!errors.apiUrl && !isLikelySafeUrl(input.apiUrl)) {
    errors.apiUrl = "URL must use HTTPS and must not point to a private or internal address";
  }
  return errors;
}

/** Human status label for a config row (AC4). */
export function smsConfigStatusLabel(active: boolean): string {
  return active ? "Active" : "Inactive";
}

/**
 * Display string for the key reference (AC2). We surface the env-var NAME so the
 * operator can confirm WHICH secret is wired — but there is never a value to
 * show. This makes the "no secret" guarantee explicit at the view layer.
 */
export function apiKeyRefDisplay(ref: string): string {
  return `${ref} (value hidden — set in the server environment)`;
}

/** Sort configs for the list view: active first, then newest. */
export function sortConfigsForDisplay(configs: readonly SmsConfigPublic[]): SmsConfigPublic[] {
  return [...configs].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
