# Review findings — P1-E01-S01 (parent signs up with phone + PIN)

Sweep review 2026-06-03 (adversarial: blind + edge + acceptance). Reviewed against commit
`8201501`. **No blockers.** All 6 ACs implemented and tested. 3 noise findings dismissed.

## Patched this review

- **[Patch] argon2id cost aligned to OWASP / DUMMY_PIN_HASH** `packages/auth/src/pin.ts:36`.
  Production `hashPin()` used the @node-rs/argon2 library default (~m=4 MiB) while `DUMMY_PIN_HASH`
  (login anti-enumeration timing parity, P1-E01-S02 AC4) is baked at `m=19456,t=2,p=1`. This made
  stored PINs weaker than OWASP guidance **and** made the anti-enumeration timing inexact (real
  wrong-PIN verify ran at a different cost than the dummy). Added `PROD_OPTS = {memoryCost:19456,
  timeCost:2,parallelism:1}` and route `hashPin` through it. Existing hashes still verify (params
  are encoded in the hash). `src/pin.test.ts` (10 tests) green.

## Deferred / tracked (not fixed)

- **[Defer][test-gap] Unique-violation race branch unverified.** `apps/api/src/routes/auth/signup.ts:56-73`
  guards a duplicate-phone race with a `try/catch` returning 409 only on SQLSTATE 23505, but the
  duplicate integration test is caught by the pre-insert `existing.length>0` check, so the catch
  branch has zero coverage. Logic looks correct; add a race test (pre-insert the row directly, then
  POST) in the auth test-hardening pass.
- **[Defer] Session created outside the user transaction.** `signup.ts:75-77` — dormant with the
  in-memory store; revisit when the Redis `SessionStore` lands (P1-E01-S04) so a session-create
  failure can't leave a committed-but-unauthenticated account (AC1).
- **[Defer] DB-backed routes not wired in production.** `apps/api/src/server.ts:3` calls `buildApp()`
  with no `db`/`sessions`, so signup is unmounted in prod. Systemic platform gap owned by the
  deploy/SSO epic (S04 / X8), not this story.

## Dismissed
- Timing side-channel on duplicate-phone path (AC2 *requires* revealing the phone exists).
- AC2 returns 409 JSON `{action:"login"}` vs HTTP 302 (web form deferred; reasonable API contract).
- Dedupe `select()` over-fetches `pinHash` (server-side only, no leak).
