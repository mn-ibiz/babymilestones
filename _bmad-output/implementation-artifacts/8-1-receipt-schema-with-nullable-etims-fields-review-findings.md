# Review findings — P1-E08-S01 (receipt schema with nullable eTIMS fields)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `546e1a0a`.
Schema meets AC1–AC3 (nullable KRA/eTIMS fields, integer-cent money, `UNIQUE(series, sequence_number)`),
all 10 tests green, and the `etims_status` CHECK does NOT block the P5-E02 writer swap (verified).

## Patched this review
- **[Patch][LOW] `receipts.parentId` self-FK lacked `.references()` in the drizzle schema** while the
  migration declares it and every sibling FK (and the wallet-ledger/loyalty self-FK convention) sets
  it. Added `.references((): AnyPgColumn => receipts.id)`. db typecheck + 10 receipt tests green.

## Deferred / tracked
- **[Defer] Per-series sequence = `MAX(seq)+1`** (consumer is the S02 writer) is race-prone: concurrent
  posts collide on the UNIQUE constraint (integrity preserved, but retry + gaps). See cross-cutting
  receipt-numbering decision in DECISIONS-NEEDED.
- **[Defer] P5 migration `0071_etims_receipts.sql` redundantly re-adds `etims_status`** (no-op via
  `IF NOT EXISTS`; 0032 already shipped it). Harmless; drop the redundant ADD in the P5 migration.

## Dismissed
`bigint mode:number` ceiling (repo-wide convention); inline CHECK auto-naming relied on by 0033 (consistent).
