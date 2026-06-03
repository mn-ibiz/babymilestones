# Review findings — P2-E01-S01 (time-slot model and capacity)

Sweep review 2026-06-03. Commit `dbdb84e2`. AC1–AC5 implemented & tested; additive migration;
capacity computed & clamped ≥0; idempotent chunked slot generation. No code change.

## Deferred / tracked
- **[Defer] All slot date math is UTC** while the venue runs in EAT (UTC+3) — system-wide convention
  (see the cross-cutting timezone decision). No data loss.
- **[Defer] No DB-level overbooking guard** — capacity is read-time; deferred to S03, which correctly
  enforces it with a `SELECT … FOR UPDATE` slot lock (verified clean).

## Dismissed
Cron not wired at boot (matches pattern); missing cron/onFailure descriptors (defaults); cancellation
not excluded (status column didn't exist yet); nullable schedule_id in unique index; capacity-edit resync.
