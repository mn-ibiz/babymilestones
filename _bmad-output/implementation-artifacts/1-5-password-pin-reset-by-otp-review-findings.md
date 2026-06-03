# Review findings — P1-E01-S05 (password / PIN reset by OTP)

Sweep review 2026-06-03 (adversarial: blind + edge + acceptance). Reviewed against commit
`b374126`. All 5 ACs implemented and tested (13 reset integration tests pass). 4 noise findings
dismissed. **2 items raised for your decision (see DECISIONS-NEEDED.md), 1 deferred.** No code
changed (top issue needs a product/security call on mechanism + threshold).

## Decision needed (collected, not auto-fixed)

- **[Decision][HIGH] No brute-force protection on `POST /auth/reset/verify`.**
  `apps/api/src/routes/auth/reset-verify.ts:21-49`. Request is rate-limited (3/phone/hr) but the
  verify endpoint that checks the 6-digit OTP has no limiter and `otp_codes` has no attempts column,
  so the ~900k-value code can be brute-forced for the full 10-min TTL → account takeover. Not
  currently exploitable in a deployed system (the route is unmounted in prod — see S01), but must be
  closed before the auth flow ships. **Decision:** per-phone+IP verify limiter (mirror `login.ts`)
  vs per-code `attempts` counter; and the threshold.
- **[Decision][MED] Reset-token HMAC secret falls back to a per-process random value in prod.**
  `apps/api/src/app.ts:284-288` — `resetTokenSecret ?? env ?? randomBytes(32)`. Without
  `RESET_TOKEN_SECRET`, multi-instance/restart invalidates in-flight tokens and masks the missing
  env var. **Decision:** fail-fast at boot in production when no secret is set (gate the random
  fallback on `NODE_ENV !== 'production'`), and/or land the deferred Redis-backed secret + consumed-
  token store before multi-instance deploy.

## Deferred / tracked
- **[Defer] Reset Zod contracts are dead code.** `packages/contracts/src/index.ts:26-44` —
  `resetRequest/Verify/CompleteSchema` are never imported; routes hand-roll validation. Wire them in
  the contracts-consistency cleanup or treat as public typing only.

## Confirmed strong
CSPRNG codes (`randomInt(100000,1000000)`), sha256-hashed + constant-time compare, single-use codes
and single-use jti token, 15-min audience-bound token, weak-PIN check before token burn, argon2id
re-hash via shared `hashPin`, session invalidation, anti-enumeration generic 200, audit rows,
additive migration 0004.

## Dismissed
OTP/PIN never in audit payloads (tested); "newest code only" verify (minor UX); `phone`-only index
(perf, low cardinality); `pinSetAt` not updated on reset (consistent with signup).
