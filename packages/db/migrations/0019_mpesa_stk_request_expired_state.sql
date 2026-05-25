-- P1-E04-S03: STK reconciliation cron. Additive-only widening of the state
-- machine on `mpesa_stk_request`.
--
-- The reconciliation cron (S03) marks requests that stay pending past the
-- 15-minute window as `EXPIRED` (AC5) — a terminal state distinct from `FAILED`
-- (which means Daraja told us the payment was cancelled/declined). We re-create
-- the CHECK constraint to admit `EXPIRED`. No data is modified; the prior states
-- remain valid, so this is backwards-compatible.
ALTER TABLE mpesa_stk_request
  DROP CONSTRAINT IF EXISTS mpesa_stk_request_state_check;

ALTER TABLE mpesa_stk_request
  ADD CONSTRAINT mpesa_stk_request_state_check
  CHECK (state IN ('INITIATED', 'STK_SENT', 'CALLBACK_PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'));
