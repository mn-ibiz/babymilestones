# Review findings — P1-E11-S04 (profile & consent management)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `0d216d24`.
**No code changed — server-side behavior is correct.** AC1–AC4 implemented & covered.

## Confirmed correct
- **Authz**: all `/parents/me/*` endpoints resolve `userId` from the session, never a param/body → no
  IDOR; CSRF enforced on every mutating verb (tested).
- **Consent**: writes `parents.smsMarketingOptIn`, audits `parent.consent.sms` with new value +
  timestamp + ip/ua (matches P1-E02-S04); the same column feeds `ConsentAwareSmsSender.sendMarketing`.
- **PIN change (AC3)**: verifies current PIN (constant-time vs `DUMMY_PIN_HASH` when unset), rejects
  weak/dup/malformed, rotates argon2 + audits in one tx, invalidates all sessions, never logs the PIN.

## Deferred / tracked (low, client-resilience; pre-existing carry-overs)
- **[Defer][compliance-UX] SMS consent toggle fails silently on API error** — `handleSmsConsent` has
  no try/catch, so on a failed write the checkbox reverts with no error shown; a parent could think
  consent saved when it wasn't. Server write+audit are correct; this is client feedback only.
  `apps/platform/app/(app)/profile/page.tsx:39`. Follow-up: try/catch + `role=alert` + re-sync.
- **[Defer] Unhandled `fetchProfile` rejection on page load** — no `.catch`; a 401/network error
  renders a blank-ish profile with no message/redirect. Same page. Follow-up: catch + login redirect.

## Dismissed
Session-invalidation outside the PIN-rotation tx (matches reset-complete); `pinSetAt` not updated
(consistent, never read for parents); AC1/AC2/AC4 reuse 2-1/2-4/2-5 endpoints with existing tests.
