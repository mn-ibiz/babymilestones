# Review findings — 13-2 (X5-S02) async drain worker → audit_log

Single self-review of the diff. No BLOCKER/high findings. Lower-severity items
deferred below (logged, not acted on — no second review).

## Deferred (low severity)

1. **Viewer still reads `audit_outbox` (10-3 / P1-E10-S03).**
   `apps/api/src/routes/admin/audit.ts` reads from `audit_outbox` and its own
   doc-comment says to repoint at `audit_log` once X5-S02 lands. The projection
   table now exists with the same column shape (+ `projected_at`), so a future
   change can swap `SOURCE`. Left out of this story to avoid a viewer regression
   and because the story scope is the worker + table, not the reader.

2. **No registration in the boot shim by default.**
   `registerAuditDrainJob(deps)` is exported but `index.ts` registers nothing at
   boot until a live DB is injected (same pattern as the other workers — the
   deploy story wires DATABASE_URL). Tests construct the job directly.

3. **`payload` is copied verbatim into `audit_log`.**
   The viewer's `serialize()` already omits payload from API responses, so no
   leak today; if `audit_log` is ever exposed raw, payload redaction should be
   revisited.
