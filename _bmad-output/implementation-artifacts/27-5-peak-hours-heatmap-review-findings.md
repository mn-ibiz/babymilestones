# Review findings — P3-E05-S05 (peak-hours heatmap)

Sweep review 2026-06-03. Epic-level commit. Authz correct (read-report gate); no PII (pure aggregate
counts); 12-month cap enforced. AC2/AC3 met. **AC1 has a BLOCKER timezone bug.** No code change — the
fix mechanism + the repo-wide timezone convention are a decision (item 17), and this is the most acute case.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER · correctness] Heatmap buckets hour-of-day & weekday in UTC, not EAT (UTC+3).**
  `aggregatePeakHoursHeatmap` uses `getUTCDay()/getUTCHours()` on a true-UTC `checkedInAt`, so an 18:00
  EAT check-in lands in hour 15, and edge-of-day check-ins land on the wrong weekday — **every cell is
  shifted 3h**. Unlike the day-grain reports (S01/S02, where UTC is only edge drift), an hour-grain
  "peak hours" report bucketed in the wrong tz is systematically wrong (and the UI axis literally says
  "(UTC)"). The unit tests enshrine the wrong convention. Direction (EAT) is unambiguous; the mechanism
  (+3h shift à la `darajaTimestamp` vs `Intl` zoned vs a centre setting) needs a call. **This is the
  timezone case that MUST be resolved** (item 17). `packages/catalog/src/peak-hours-heatmap.ts:90`.

## Dismissed
authz (read-report allow-list); PII (aggregate only); read-only (correctly not audited).
