# Review findings — P5-E03-S02 (live/stub switch flag)

Sweep review 2026-06-03. Epic commit (merge `f3ca875`). **One patch applied.** The flag store + audit +
admin UI exist and AC1/AC3 are tested; `resolveSmsSender` correctly fail-safes to the stub when no live
config is supplied.

## Patched this review
- **[Patch][HIGH] Admin Go-Live toggle now sends session/CSRF cookies.** `SmsLiveClient` called `fetch`
  WITHOUT `credentials:"include"` on both the GET and the mutating PUT, so cross-origin the API never
  saw the session → GET silently fell back to `{enabled:false}` and the PUT was rejected: the toggle was
  non-functional from the UI. Added `credentials:"include"` to both calls, matching the sibling
  `sms-config` page. (admin typecheck green; the broader missing-`x-csrf-token` gap across admin islands
  is pre-existing and tracked separately.)

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] The switch is DEAD CODE — flipping `sms.live_enabled` has zero effect on real
  sends** (the same failure mode as Epic 32 eTIMS). `resolveSmsSender` (the only reader of the flag) has
  NO production caller; every send path hardcodes `new StubSmsSender(db)` or `createSmsSender(db)` (which
  defaults to the stub), and `app.ts` injects no sms dep. So "go live" writes an audit row + the UI says
  "Live", but every OTP/booking/receipt SMS still goes to the stub. Wire `resolveSmsSender` (reading the
  flag + resolving the active config's `api_key_ref` from env) into the composition root / every send.
- **[Decision][MED] Going live isn't validated against missing credentials, and the sender is built per
  construction not per send.** When wired, resolve `live` fresh per send (so a flip/rollback takes
  effect without a restart) and reject `enabled:true` (or warn) when no active `sms_config` / env key
  exists.

## Dismissed
flag RBAC (manage config); audit on change present; resolveSmsSender fail-safes to stub when live=null.
