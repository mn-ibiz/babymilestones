# Review findings — P1-E04-S04 Paystack card top-up

Single self-review of the story diff. BLOCKER/high findings were fixed inline
before commit; the items below are lower-severity follow-ups (no action taken
here — logged for a later story).

## Deferred (low severity)

1. **One-click repeat top-up with a saved authorization is not yet wired.**
   AC4 is satisfied at the *capture* level: the parent can opt into card-on-file
   (`save_card`), and a reusable `authorization_code` is persisted on a verified
   transaction. The adapter (`paystack.init`) already accepts an
   `authorizationCode` for charging a saved card, but the init route does not yet
   look up a parent's previously-saved authorization and offer a no-card-entry
   repeat charge. That repeat-charge UX depends on the webhook (P1-E04-S05) being
   the authoritative store of the reusable token, so it belongs with the
   card-on-file loop completed alongside S05. Follow-up: surface saved cards on
   the dashboard and pass `authorizationCode` on a repeat top-up.

2. **Verify endpoint does not re-poll while still pending.**
   `GET /payments/paystack/verify/:reference` performs a single `transaction/
   verify`; if Paystack still reports the transaction as in-progress it returns
   `INITIALIZED` and the UI shows "still verifying…". The webhook (S05) is the
   source of truth and will resolve it, so client-side re-polling is optional
   polish, not correctness. Follow-up (optional): add bounded client re-polling
   in `PaystackReturn`.

3. **No currency assertion on verify.**
   The adapter maps Paystack's reported amount but the route does not assert the
   verified amount/currency matches the initiated amount. The authoritative
   amount/currency check belongs on the signed webhook (S05) before crediting;
   adding a defensive UX-side check here is optional.
