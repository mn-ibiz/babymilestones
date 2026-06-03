# Review findings — P1-E03-S08 (statement export CSV for a parent)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `66c519cd`.
Authz/IDOR correct (own route session-scoped; by-id route gated `isStaffRole` + `read wallet`,
cross-parent → 403). Running balance correctly derived (seeded from pre-window postings, integer
cents), RFC-4180 escaping correct, 12-month sync/async cutoff works. AC1–AC3 tested.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][HIGH · accuracy] Inclusive `to` date drops same-day transactions.** `parseRange`
  turns `to=YYYY-MM-DD` into `00:00:00Z` and filters `lte(createdAt, to)`, so every posting later on
  the last day is silently excluded — a parent requesting Jan 1–Dec 31 misses all of Dec 31. Both
  client libs document `to` as inclusive. Fix = normalise `to` to end-of-day, but the **timezone
  (EAT vs UTC)** changes which rows are included — needs a product call (platform is Kenya/EAT).

## Deferred / tracked
- **[Defer][security · project-wide] CSV formula injection not neutralised.** `csvField` does
  RFC-4180 quoting only, no `= + - @`-prefix guard. **Not exploitable in this export** (all fields
  are server-controlled constants), but the same `csvField` pattern recurs repo-wide
  (`packages/contracts/src/index.ts`, `packages/catalog/src/commission-run.ts`) where some exporters
  emit user-controlled text. Tracked as a cross-cutting hardening item — see DECISIONS-NEEDED.md note.
- **[Defer] Sync path buffers the whole CSV** despite "stream" wording (bounded by the 12-month
  cutoff). Correct the wording or stream via cursor if revisited.

## Dismissed
`setMonth(+12)` rollover (safe); seed-sum `Number()` overflow (unrealistic at KES-cents); filename
injection (server UUID); async-path audit present.
