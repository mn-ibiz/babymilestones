# P1-E05-S03 review findings (follow-up log)

Single self-review of the diff. BLOCKER/high findings were fixed inline; the
items below are lower-severity follow-ups (no action taken this story).

## Deferred (low)

1. **Cash default idempotency key embeds the amount.** When no explicit
   `idempotencyKey` is supplied, the cash path derives
   `reception:cash:<wallet>:<parent>:<amount>`. Two legitimately separate cash
   top-ups of the *same* amount for the same parent within the same recording
   would collide and replay the first. This mirrors the established P1-E04-S06
   cash route behavior verbatim (intentional consistency), so it is not a
   regression. If the product wants repeat same-amount cash entries, the sheet
   should send a unique client `idempotencyKey` per submission.

2. **Paystack/M-Pesa unwired → 503 vs degraded sheet.** When a provider rail is
   not configured, the endpoint returns 503 for that method. The UI currently
   surfaces the raw error; a future polish could disable unavailable methods in
   the picker rather than letting the staff pick then fail.

3. **No dedicated webhook-credit test in this story.** The async credit for
   M-Pesa (callback) and Paystack (webhook) is owned + tested by P1-E04-S02/S05;
   this story asserts the initiate side (pending state persisted, no premature
   credit) and relies on those existing suites for the credit-on-callback path.
