# Review findings — P1-E12-S03 (Deep-link from WhatsApp ads)

Single self-review of the diff. No BLOCKER/high-severity findings (those would
have been fixed inline before commit). Lower-severity follow-ups logged here.

## Deferred (low severity)

1. **Cookie → signup-form wiring lives in S04.** The `/book/[unit]` route sets a
   non-HttpOnly `bm_acq` cookie carrying the captured UTM; the API persists an
   `acquisitionSource` body field to `parents.acquisition_source` at profile
   creation (set-once). The glue that reads `bm_acq` client-side and forwards it
   to the signup/profile POST belongs to the not-yet-built signup entry points
   (P1-E12-S04 — there is no `/signup` page in `apps/platform` yet). The seam is
   in place and unit-tested on both ends; S04 connects them. No action here.

2. **`bm_acq` is intentionally non-HttpOnly.** UTM data is non-sensitive
   marketing attribution that the client signup form must read and forward. The
   payload is re-validated and length-clamped server-side via
   `acquisitionSourceSchema` before persistence, and malformed/empty payloads are
   silently dropped (attribution never blocks profile save). Acceptable; noted
   for the security walkthrough (DoD #1).

3. **Attribution is stamped at profile creation, not at the `POST /auth/signup`
   moment.** `POST /auth/signup` creates only `users`+`wallets`; the `parents`
   row (with NOT NULL names) first exists at `PUT /parents/me`, which is the
   correct and only place `parents.acquisition_source` can be written. This
   satisfies AC2 ("persisted to parent on signup") at the parent-record creation
   moment.
