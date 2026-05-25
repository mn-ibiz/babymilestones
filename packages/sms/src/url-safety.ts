/**
 * SSRF-safe provider URL validation (P1-E09-S02 AC3). The SMS provider API URL
 * is operator-supplied config; if it could point at an internal address the
 * server would happily make requests to private infrastructure or the cloud
 * metadata endpoint. So the validator enforces, with NO network access (pure,
 * synchronous — DNS is not resolved here; this guards the literal host):
 *
 *   - scheme MUST be https (AC3);
 *   - host MUST NOT be localhost / loopback;
 *   - a literal IP host MUST NOT be RFC1918 private, loopback, link-local
 *     (incl. 169.254.169.254 cloud metadata), CGNAT, unique-local IPv6, or
 *     IPv4-mapped IPv6 of any of those.
 *
 * Confirmed security requirement (Winston's review). The allowlist approach is
 * "reject anything that parses to a non-public literal host"; hostnames that
 * resolve at request time are out of scope for this static validator (the live
 * provider integration in P5 pins the host).
 */

/** Why a URL was rejected — machine-readable so callers can map to a field error. */
export type UrlSafetyReason =
  | "invalid_url"
  | "not_https"
  | "no_host"
  | "private_host";

export interface UrlSafetyResult {
  ok: boolean;
  reason?: UrlSafetyReason;
  message?: string;
}

const REASON_MESSAGES: Record<UrlSafetyReason, string> = {
  invalid_url: "Enter a valid URL",
  not_https: "URL must use HTTPS",
  no_host: "URL must include a host",
  private_host: "URL must not point to a private, loopback, or metadata address",
};

/** Strip an IPv6 zone id and surrounding brackets, lowercased. */
function normalizeHost(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const pct = h.indexOf("%");
  if (pct !== -1) h = h.slice(0, pct);
  return h;
}

/** Parse a dotted-quad IPv4 string into four octets, or null if it is not one. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** True for an IPv4 that must never be reached from the server (SSRF set). */
function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // "this" network / unspecified
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * True when a normalized IPv6 host is private/loopback/link-local/unique-local,
 * the unspecified address, or an IPv4-mapped/compatible address of a private v4.
 */
function isPrivateIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  if (host === "::1") return true; // loopback
  if (host === "::") return true; // unspecified
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb"))
    return true; // link-local fe80::/10
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local fc00::/7
  if (host.startsWith("ff")) return true; // multicast
  // IPv4-mapped addresses. Node compresses ::ffff:a.b.c.d to hex hextets
  // (e.g. ::ffff:a9fe:a9fe for 169.254.169.254) — reconstruct the embedded v4
  // from the final two hextets and judge it. Also handle the dotted form.
  if (host.startsWith("::ffff:")) {
    const tail = host.slice("::ffff:".length);
    const dotted = parseIpv4(tail);
    if (dotted) return isPrivateIpv4(dotted);
    const hextets = tail.split(":");
    if (hextets.length === 2 && /^[0-9a-f]{1,4}$/u.test(hextets[0]!) && /^[0-9a-f]{1,4}$/u.test(hextets[1]!)) {
      const hi = parseInt(hextets[0]!, 16);
      const lo = parseInt(hextets[1]!, 16);
      const v4: [number, number, number, number] = [
        (hi >> 8) & 0xff,
        hi & 0xff,
        (lo >> 8) & 0xff,
        lo & 0xff,
      ];
      return isPrivateIpv4(v4);
    }
  }
  return false;
}

/**
 * Validate a provider API URL for HTTPS + non-SSRF host (AC3). Pure and
 * synchronous. Returns `{ ok: true }` for a public HTTPS URL, otherwise an
 * `{ ok: false, reason, message }` describing the first failure.
 */
export function checkProviderUrlSafety(raw: unknown): UrlSafetyResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "invalid_url", message: REASON_MESSAGES.invalid_url };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url", message: REASON_MESSAGES.invalid_url };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "not_https", message: REASON_MESSAGES.not_https };
  }
  const host = normalizeHost(url.hostname);
  if (host === "") {
    return { ok: false, reason: "no_host", message: REASON_MESSAGES.no_host };
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "private_host", message: REASON_MESSAGES.private_host };
  }
  const v4 = parseIpv4(host);
  if (v4 && isPrivateIpv4(v4)) {
    return { ok: false, reason: "private_host", message: REASON_MESSAGES.private_host };
  }
  if (isPrivateIpv6(host)) {
    return { ok: false, reason: "private_host", message: REASON_MESSAGES.private_host };
  }
  return { ok: true };
}

/** Boolean convenience wrapper around {@link checkProviderUrlSafety}. */
export function isSafeProviderUrl(raw: unknown): boolean {
  return checkProviderUrlSafety(raw).ok;
}
