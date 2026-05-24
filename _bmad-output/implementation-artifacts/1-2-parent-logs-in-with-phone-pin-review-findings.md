# Review findings — P1-E01-S02 (parent login with phone + PIN)

Single self-review, 2026-05-25. No BLOCKER/high findings. AC1–AC5 each have a passing test.

## Low / deferred (log only — not fixed this story)

- **L1 — Rate limiter is per-process, not shared.** `LoginRateLimiter` is in-memory
  (`packages/auth/src/rate-limit.ts`). With more than one API instance behind a load
  balancer, the `(phone, ip)` failure budget is not enforced globally, so the effective
  limit scales with instance count. Deferred to the Redis wiring introduced in P1-E01-S04
  (SSO); move the counter there. Noted inline in the file header.

- **L2 — No cleanup of expired buckets.** Stale `Map` entries are only reclaimed when the
  same `(phone, ip)` key is hit again after expiry. Memory grows with unique attacker
  IP/phone combinations until process restart. Acceptable for the in-memory placeholder;
  the Redis implementation gets TTL eviction for free.

- **L3 — Timing parity is best-effort.** Anti-enumeration (AC4) relies on running argon2
  `verifyPin` against `DUMMY_PIN_HASH` for unknown phones so the expensive path matches a
  wrong PIN. The DB `SELECT` on an unknown phone is marginally cheaper than a hit (index
  miss vs. row fetch); the argon2 verify dominates wall-clock so this is not exploitable,
  but it is not a constant-time guarantee. Tracked, not fixed.

- **L4 — Retry-After body message is static.** The 429 returns `Retry-After` header plus a
  generic JSON body. No localization/structured code yet; fine for P1.
