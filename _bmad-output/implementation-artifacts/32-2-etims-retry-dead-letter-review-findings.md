# Review findings — P5-E02-S02 (eTIMS retry + dead-letter)

Sweep review 2026-06-03. Epic commit (merge `b798737`). Tax-critical (durable fiscal-submission queue).
**Two patches applied.** The durable state machine (enqueue→pending→sent / →backoff→dead_letter) and
the retry worker are well-built and tested in isolation; backoff math + dead-letter audit-as-alert are
correct.

## Patched this review
- **[Patch][HIGH] Lost-update window in the failure/sent transitions closed.**
  `recordEtimsSubmissionFailure` was a read-modify-write keyed by `id` only — two interleaving
  failure-records (or a failure racing an admin requeue) could both write `attempts+1` or clobber each
  other. Made the transitions compare-and-set: the UPDATE is scoped to the observed `(status='pending',
  attempts=expected)` and a 0-row result re-reads + reports the true state; a non-pending row is a
  no-op. `markEtimsSubmissionSent` is now guarded on `status='pending'` so a late success can't flip a
  dead-lettered row. 2 regression tests added. payments(13) green.
- **[Patch][MED] etims-retry job now declares `cron: "* * * * *"`** for registry/observability parity
  with sms-retry / mpesa-reconcile (the scheduler runs off intervalMs; the cron documents the intent).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] AC1 producer gap — nothing enqueues a failed submission.** `enqueueEtimsSubmission`
  has ZERO production callers. The live writer's failure path throws + persists nothing (its comment
  promises a hand-off "to the retry queue (32-2)" that was never wired). So the story's whole JTBD —
  "if KRA is down I don't lose the receipt" — is undelivered: a transport failure drops the receipt.
  Decide the producer seam (writer catch vs call-site) and capture the already-allocated `(series,seq)`.
- **[Decision][HIGH] No atomic claim of due rows → double-submit under multi-instance.** `claimDue…` is a
  plain SELECT (no `FOR UPDATE SKIP LOCKED` / claim-via-UPDATE); the in-process `inFlight` guard only
  protects a single worker. With >1 jobs instance, both submit the same row to KRA (only the KRA-side
  idempotency key saves it). Either enforce single-instance, or add a `claimed` status + lease.

## Deferred / tracked
- **[Defer] `registerEtimsRetryJob` never called** — systemic: NO `register*Job` runs in any production
  boot path; the jobs scheduler wiring is the deploy story. Track on the deploy/integration checklist.

## Dismissed
backoff math (1m·2^(n-1) cap 24h); dead-letter audit-as-alert; enqueue idempotency on (series,seq); admin requeue RBAC.
