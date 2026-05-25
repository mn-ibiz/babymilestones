# Review findings — 10-3-audit-log-viewer (P1-E10-S03)

Single self-review pass. BLOCKER/high findings were fixed inline before commit;
the items below are lower-severity follow-ups (logged, not acted on).

## Deferred (low severity)

1. **No index on `audit_outbox` filter columns.** The viewer filters/sorts by
   `actor_user_id`, `action`, `target_id`, and `created_at`. At current volumes
   a seq-scan is fine, but a composite/partial index (e.g. on `created_at desc`
   plus `action`) would help once the outbox grows. Deliberately not added here:
   this is a strictly read-only story (no migration that touches the audit
   tables), and the source table will switch to the `audit_log` projection when
   X5-S02 / 13-2 lands — indexing is better decided against that final table.

2. **CSV export is unbounded by row count.** The export streams every matching
   row (filters still apply). For the current admin/dispute use-case this is
   acceptable; if the log grows very large, consider a max-row cap or a date-range
   requirement on export. Out of scope for AC2 as written ("CSV export").
