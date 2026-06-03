# Review findings — P5-E03-S03 (rate limit + cost control)

Sweep review 2026-06-03. Epic commit (merge `f3ca875`). **No code patch — the whole money-guard is
unwired dead code, and every individual fix is gated behind that wiring + needs a product decision, so
none is a safe auto-apply.** `CappedSmsSender` + the durable `sms_send_ledger` are built and unit-tested
in isolation.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] The cap is NEVER enforced.** `CappedSmsSender` is exported but never instantiated
  on any send path (`resolveSmsSender` returns the bare live/stub sender, no Capped wrapper). The SMS
  spend guard the story exists to provide is absent at go-live. Wrap the resolved sender in
  `CappedSmsSender` at the composition root — but decide OTP/transactional exemption first.
- **[Decision][BLOCKER] Deferred messages are queued for next day but NEVER re-sent.** `defer()` writes
  `status='deferred'` (body=''), but the only worker (`sms-retry`) selects `status='failed'` only — no
  job queries `deferred`. So a capped OTP/booking SMS is silently lost forever. Add a deferred-resend
  worker (re-render body from template+data) — design it together with the cap wiring.
- **[Decision][HIGH] Cap check is read-then-send with no lock** → concurrent sends collectively blow the
  cap (the exact overrun the story prevents). Needs an atomic reserve (advisory lock / serializable
  reservation), which is a design choice + untestable under PGlite — not an auto-patch.
- **[Decision][HIGH] Hitting the cap is never alerted/audited (AC2 "alerts admin" unimplemented)** and
  **[HIGH] there's no admin API/UI to adjust caps (AC3)** — caps live in the settings k/v store but only
  `sms.live_enabled` has a write route; the `sms.cap.*` keys need a DB write today.
- **[Decision][MED] Counting correctness:** a failed live send still consumes a cap slot (cost 0 but the
  count is burned), and a multi-segment SMS counts as 1 + a flat cost — actual spend can exceed
  `maxCostCents`. Decide the cap unit (message vs segment) and whether failures count.
- **[Decision][MED] The cap gates OTP/transactional sends** → a recipient hitting the per-recipient cap
  gets their next OTP deferred (and, per above, dropped) = login lockout. Exempt transactional/OTP, or
  apply only the cost ceiling. **[LOW]** the cap window is fixed UTC, not the Africa/Nairobi business day.

## Dismissed
backoff/ledger durable schema; per-recipient + per-day + cost cap shapes (logic correct in isolation).
