# Review findings — P1-E09-S02 (admin config table for SMS sender ID + URL + key)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `93059bd3`.
**Secret handling is strong:** there is NO api-key column — the table stores only `api_key_ref`
(the env-var *name*); the literal key is never accepted/stored/logged. Admin-only (`manage config`),
CSRF, per-mutation audit (ref+URL only), HTTPS+SSRF URL validation. AC1–AC4 implemented & tested.

## Patched this review
- **[Patch][LOW · SSRF] URL validator missed IPv4-COMPATIBLE IPv6 (`::a.b.c.d`).** `::169.254.169.254`
  (cloud metadata) and `::127.0.0.1` (loopback) — which Node compresses to `::a9fe:a9fe` / `::7f00:1`
  — slipped past `isPrivateIpv6` (only `::ffff:` was handled). Refactored the embedded-v4 check into a
  helper and applied it to the IPv4-compatible form too. Added 4 regression cases. `packages/sms/src/url-safety.ts`;
  10 url-safety tests green. (Limited real-world exploitability — deprecated form, DNS out of scope —
  but a cheap, unambiguous hardening.)

## Dismissed
DNS-rebinding (documented deferral; host pinned in P5); decimal/hex/octal IPv4 (Node normalizes);
single-active partial unique index; CSRF/authz correctly wired.
