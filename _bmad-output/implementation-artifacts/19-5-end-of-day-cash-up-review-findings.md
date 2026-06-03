# Review findings — P2-E04-S05 (end-of-day cash-up)

Sweep review 2026-06-03. Commit `cec27873` (epic). Integer cents end-to-end; expected = SUM of paid
cash sales; variance signed; atomic claim-by-update prevents concurrent double-count; >KES500 reason
gate (client+server); audit in-tx; "since last cash-up" period avoids the EAT/UTC day-boundary risk.
AC1–AC4 tested. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] `POST /pos/cashup` is not idempotent** — a network retry / second tab claims ZERO
  sales (expected=0) and, if the resubmitted count is ≤ KES500, SILENTLY posts a second
  reconciliation adjustment + cashup row, double-signalling Treasury with a fabricated variance.
  Add an idempotency key, or reject a zero-sales close with a non-zero count. `pos/cashup.ts:117-206`.
- **[Decision][MED] Variance posts to a single global cash-drawer float** (oldest active), not the
  cashier's till → multi-till deployments conflate variances (no `float_account_id` link). Scope to
  single-till (document) or attribute per till.
- **[Decision][LOW] Admin can't run cash-up** — guard is `create payment` (cashier/reception only);
  AC says "cashier/admin". Confirm operator set.

## Dismissed
Integer cents; atomic claim; >KES500 gate; audit; period avoids TZ; parent can't reach (staff-only resolveUser).
