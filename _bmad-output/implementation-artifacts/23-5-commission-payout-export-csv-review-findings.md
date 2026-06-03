# Review findings — P3-E01-S05 (commission payout export CSV)

Sweep review 2026-06-03. Commit `45fe5dae` (epic). Formula-injection guard SOUND (staff name prefixed
with `'` for `= + - @`/tab/CR, signed numbers preserved); integer-cent totals match the ledger;
authz `read report` (accountant/treasury/admin); audit payload carries no PII. AC1–AC3 tested.

## Patched this review
- **[Patch][MED] Formula-injection guard was untested** on the user-controlled staff name (only the
  RFC-4180 comma case was). Added a regression test asserting `=HYPERLINK(...)` is neutralised and
  signed phone/amount are preserved. catalog payout-csv(6) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] Payout reference truncates the staff UUID to 8 hex chars** (`COMM-…-{staffId[:8]}`)
  → collidable within a run; the reference is load-bearing for M-Pesa B2C reconciliation. Use the full
  id (or a per-line index), or accept+document.

## Deferred / tracked
- **[Defer] Export CSV row order non-deterministic** (no ORDER BY) — cosmetic; add `.orderBy(name)`.

## Dismissed
3 copies of csvField (DRY smell, all hardened — see Epic 6); `bytes` uses string length; no PII in audit.
