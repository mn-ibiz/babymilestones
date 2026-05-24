# Review findings — P1-E04-S01 (M-Pesa STK push initiation)

Single self-review completed. No BLOCKER/high-severity findings; the full gate
(test + typecheck + lint + build) is green. Lower-severity follow-ups deferred:

## Low

1. **No pre-Daraja `INITIATED` row.** The route persists `mpesa_stk_request`
   only after Daraja accepts, written directly as `STK_SENT`. A Daraja timeout
   or crash mid-call therefore leaves no trace of the attempt. The `INITIATED`
   state is reserved in the CHECK constraint; a future hardening pass could
   insert an `INITIATED` row before the call and advance it to `STK_SENT` on
   success. Out of scope for initiation-only; the C2B callback (S02) keys off
   `CheckoutRequestID` which only exists once Daraja responds, so the current
   shape is sufficient for the wallet-credit path.

2. **Daraja OAuth token is fetched per push.** Each `stkPush` performs an
   `/oauth` round-trip. Daraja tokens are valid ~1 hour; a cached-token wrapper
   would cut latency/quota. Deferred — correctness is unaffected and tests
   assert the two-call sequence.

3. **UI polling has no exponential backoff / jitter.** Fixed 3s interval over a
   90s window (≈30 polls). Fine for P1 volume; revisit if the status endpoint
   sees load.
