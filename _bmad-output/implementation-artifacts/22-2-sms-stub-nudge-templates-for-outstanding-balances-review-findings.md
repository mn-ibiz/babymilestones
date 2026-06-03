# Review findings — P2-E07-S02 (SMS-stub nudge templates for outstanding balances)

Sweep review 2026-06-03. Commit `d098318a` (epic). 3 templates + daily cron + per-debt-episode
dedup marker; correct amount (`SUM(amount_due)`, en-KE format); targets parents with outstanding>0.
AC1 met; AC2/AC3 implemented & tested. No code change (findings are the dunning-mechanism decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · compliance] Dunning nudge gated on the MARKETING opt-in (defaults OFF)** → the
  feature is dead-on-arrival for most parents who owe money. Spec AC3 says "opt-out honoured"
  (on-by-default). A payment reminder is arguably account/transactional, not marketing. Decide: route
  as transactional (always send), or add a dedicated dunning-consent flag. (Compliance call — unlike
  the staff-triggered receipt SMS, this is automated outbound.)
- **[Decision][HIGH] Exact-day milestone match (`age === N`) with no catch-up** — one missed/late
  scheduler tick permanently drops that nudge. Decide escalation semantics (range/`>=` + per-stage marker).
- **[Decision][MED] SMS sent BEFORE the idempotency marker is persisted** (non-atomic) → double-send on
  crash-then-retry. Order/atomicity fix tied to the mechanism decisions above.

## Deferred / tracked
- **[Defer] `settled_on_credit` counted as owed** (nudges an already-auto-credit-paid parent) — same
  root as #14. **[Defer] Nudge bypasses the per-day SMS caps.**

## Dismissed
amount correct; dedup marker persists (no purge); SUM>0 targeting.
