# P1-E04-S02 review findings (lower-severity, deferred)

Single review pass complete. No BLOCKER/high-severity issues found; the items
below are follow-ups, not regressions, and are deferred per the run-stories flow.

## F1 — Credit-after-callback-row partial failure relies on S03 (low)
If `mpesa_callback` is inserted but `applyTopup` then throws (caught so we still
return 200), the callback row persists. A Daraja retry hits
`ON CONFLICT DO NOTHING`, returns no row, and short-circuits — so the wallet is
never credited by the callback path alone. The `mpesa_stk_request` stays
`STK_SENT` (not advanced), which is exactly the state the reconciliation cron
(P1-E04-S03) is designed to sweep. Behaviour is correct given S03, but the
callback path has no in-process retry. Acceptable for this story; revisit if S03
keys reconciliation off `mpesa_callback` rather than re-querying Daraja.

## F2 — Out-of-order credit deferred to S03 (low, by design)
AC5 says the callback "creates the request row if it doesn't exist yet." The
`mpesa_stk_request` schema (NOT NULL parent_id/wallet_id, both unknowable from a
Daraja STK callback body) makes synthesising a usable request row impossible
from the callback alone. Implemented instead as: record the `mpesa_callback`
row durably + emit a `payment.mpesa.callback.orphan` audit; the reconciliation
cron (S03) performs the credit once the request row lands. Functionally
satisfies "handled / not lost" and always-200; the literal "create the request
row" is intentionally not done. Tracked here for the S03 author.

## F3 — IP allowlist is a static default list (low)
The Daraja egress IPs are hard-coded defaults (overridable via
`mpesaCallback.allowlist`). If Safaricom rotates ranges, this needs updating.
Consider sourcing from env in a later hardening pass. The body is validated and
untrusted regardless, so this is defence-in-depth only.
