# Review findings — P1-E02-S04 (photo and SMS consent flags)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `fc70a33`.
**✅ Clean — no defects.** 5 noise findings dismissed.

## Confirmed correct
- **AC1 defaults:** both `photo_consent` (per-child) and `sms_marketing_opt_in` (per-parent) are
  `boolean NOT NULL DEFAULT false` (additive migration `0009`), so no record is silently consented
  (opt-in). Tested.
- **AC2 audit:** both consent PUT endpoints write a timestamped `audit_outbox` row inside the same
  transaction as the update (actor, target, new value, explicit `at`). Atomic. Tested.
- **AC3 SMS gate:** `ConsentAwareSmsSender.sendMarketing` is fail-closed (unknown parent → not
  consented); `sendTransactional` always sends. Every marketing call site is gated; un-gated sends
  are transactional service reminders (correct per spec). Photo consent genuinely gates downstream
  photo handling (`packages/catalog/src/salon.ts`).
- **Authz:** both endpoints session-derived + ownership-scoped + CSRF; cross-parent → 404 (tested).

## Dismissed
Commit-era SMS test payload drift (since refactored); `setPhotoConsent` ok-check (delegated);
reception verbal-consent capture (later story, default-false preserved); consent UI for archived
children (later-story UI); un-gated reminder jobs (transactional).
