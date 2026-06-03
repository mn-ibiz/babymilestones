# Review findings — P1-E04-S07 (bank transfer top-up, admin-confirmed)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `343e4f29`.
Authz clean (only `manage wallet`/`manage float` → admin/treasury; reception/accountant/parent 403,
tested); idempotency clean (credit keyed on pending id, double-confirm posts no second credit);
amount from server-side pending row; audit/SMS fire once. AC1–AC3 tested.

## Patched this review
- **[Patch][MED] Re-confirm with a DIFFERENT parent falsified the record.** The confirm route
  unconditionally re-stamped `parent_id`/`confirmed_by` on an already-confirmed row. Because the
  credit is keyed on the pending id (no second credit, money stays with the ORIGINAL parent), a
  second confirm naming a different parent silently re-pointed the durable record at a parent who was
  never credited. Fixed: reject with `409` when an already-confirmed row's parent differs from the
  request (same-parent retries stay idempotent → `replayed:true`). Added a regression test (14 bank
  tests green). `apps/api/src/routes/payments/bank/topup.ts`.

## Dismissed
Commit-era SMS payload shape (already fixed in tree); credit/status/audit non-atomic (self-heals via
idempotent replay).
