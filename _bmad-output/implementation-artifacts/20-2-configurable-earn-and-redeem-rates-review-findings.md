# Review findings — P2-E05-S02 (configurable earn and redeem rates)

Sweep review 2026-06-03. Commit `789c9d41` (epic). Engine correct: integer-only conversions (no float
drift), `setRate` append-only + audited, rate snapshotted per ledger row (AC2 immutable history),
admin-only (`manage config`). 133 wallet tests pass.

## Patched this review
- **[Patch][LOW] `effectiveRate()` had no tiebreaker** for rows sharing the same `effective_from` →
  non-deterministic (a just-superseded rate could win). Added `desc(effectiveFrom), desc(createdAt)`.
  `packages/wallet/src/loyalty-rates.ts`. wallet(54 loyalty) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Two parallel, unintegrated rate-config systems** — S02's effective-dated
  `/admin/loyalty/rates` (read by the engine) has NO UI, while the only admin rate UI
  (`settings/loyalty`) writes a DIFFERENT, non-effective-dated, float-allowing, semantically-inverted
  `settings` store the engine never reads. An admin tuning rates via Settings has zero effect. Pick one
  source of truth.
- **[Decision][LOW] `effectiveFrom` is unbounded** — back-dating retroactively changes
  `getEffectiveRates(at)` for historical timestamps (stored ledger rows are safe). Forward-date only, or flag in audit.

## Dismissed
future-dated parent quote benign; earn-on-spend wiring out of S02 scope; integer math.
