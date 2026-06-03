# Review findings — P3-E01-S01 (per-staff commission rate, effective-dating)

Sweep review 2026-06-03. Commit `45fe5dae` (epic). Effective-dating correct (half-open, auto-close,
backdate rejected, rate snapshot at booking); integer bps math (no float); admin-only. AC1–AC4 tested.

## Patched this review
- **[Patch][HIGH] `setCommissionRate` omitted the `FOR UPDATE` row lock** the sibling effective-dated
  tables use — only the partial unique index serialised, so a concurrent rate change hit a raw
  unique-violation surfaced as a confusing 400. Added a `SELECT … FOR UPDATE` on the parent staff row
  (mirrors `setServicePrice`/`setPlanPrice`). catalog(18 commission) green.

## Deferred / tracked
- **[Defer] Rate-change audit not atomic** with the write (pre-existing admin-route pattern).

## Dismissed
negative-base rounding (base always non-negative); toFixed(2) matches numeric(5,2); auto-close lost-update (index catches it).
