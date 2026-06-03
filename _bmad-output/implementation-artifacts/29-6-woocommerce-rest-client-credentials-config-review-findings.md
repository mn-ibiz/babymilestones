# Review findings — P4-E04-S06 (WooCommerce REST client + credentials config)

Sweep review 2026-06-03. Epic-level commit. Secrets encrypted at rest (AES-256-GCM, write-only public
projection, never in GET/audit/logs); admin-only + CSRF; credential redaction in logs; additive
migration. **Fixed an SSRF BLOCKER.**

## Patched this review
- **[Patch][BLOCKER · SSRF] Woo site URL was only HTTPS-checked, not SSRF-validated.** The server
  fetches this operator-supplied URL (test-connection + all sync), so `https://169.254.169.254/…`
  (metadata), `https://127.0.0.1`, RFC1918/link-local hosts were all accepted. Added the established
  `checkProviderUrlSafety` gate (the same two-gate convention the SMS provider URL uses) to the PUT
  handler. api woocommerce-config(10) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] No request timeout on the Woo transport** — bare `fetch` with no AbortSignal; a
  hung Woo host stalls test-connection + every sync request indefinitely. Add `AbortSignal.timeout`.
- **[Decision][MED] `updateOrderStatus` note partial-failure** (status committed, note POST failed →
  retry duplicates the note) — same as the order-note idempotency decision.

## Dismissed
encryption-at-rest; admin authz + CSRF; secret redaction; non-atomic audit (matches SMS convention).
