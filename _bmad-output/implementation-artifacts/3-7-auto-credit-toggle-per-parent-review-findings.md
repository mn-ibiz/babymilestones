# Review findings — P1-E03-S07 (auto-credit toggle per parent)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `a4d98705`.
AC1–AC3 implemented and tested. PATCH correctly gated by `manage wallet` (admin/super_admin only;
reception/cashier 403), CSRF-enforced, wallet derived from path param; audit with before/after
in-transaction; downstream `debit.ts` correctly branches on the flag.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][MED · security] GET `/admin/parents/:userId/auto-credit` is IDOR-readable by any
  parent.** It guards only `read wallet` (which the `parent` role holds) and resolves the wallet
  from the `:userId` path param, not the session — and there's no blanket staff guard on `/admin/*`.
  A logged-in parent can read another parent's `auto_credit_enabled` boolean. Small blast radius
  (one UUID-keyed boolean; PATCH is safe), but it contradicts the platform's "resolve from session,
  never a param" convention and the same shape recurs in P1-E05-S02. **Choose:** staff-only guard on
  this GET, or scope the lookup to the session user — and whether to add a blanket staff preHandler
  to `/admin/*`.

## Dismissed
`parents.*` vs `wallets.*` column location (intentional single source of truth); always-write-audit
on no-op (intentional, AC3-aligned); "deferred UI" note (toggle view is mounted in P1-E05-S02).
