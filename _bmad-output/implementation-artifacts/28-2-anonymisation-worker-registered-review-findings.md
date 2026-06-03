# Review findings — P3-E06-S02/S04/S05 (worker registrations)

Sweep review 2026-06-03. Epic-level commit. (Covers S02 anonymise, S04 SMS-retry, S05 mpesa-reconcile
registrations.) All three carry correct descriptors and are well-tested (160 jobs tests pass): SMS
retry caps at 5 attempts (no infinite retry), exact backoff ladder, dead-letter+audit+alert; reconcile
credits via the idempotent `applyTopup` path (no double-credit). No code change.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED · S04] SMS retry can re-send an already-delivered message** — the per-row try wraps
  both `resend()` and the `status='sent'` update; a DB failure after a successful provider send re-queues
  and re-sends, with no provider-side idempotency key. Needs a provider-contract decision.

## Deferred / tracked
- **[Defer] Workers defined/exported but `startScheduler`/`register*` are never invoked in any prod boot
  path** (`index.ts` only logs) — documented deferral owned by the deploy story; the crons don't fire yet.
- **[Defer] SMS dead-letter mutation+audit not atomic** (anonymise path uses a tx; sms-retry doesn't).
- **[Defer] sms `last_error` vs stale `error`/`dispatchedAt`** column divergence.

## Dismissed
anonymise idempotent/batched/isolated; reconcile state-guarded + idempotent; additive migration 0077.
