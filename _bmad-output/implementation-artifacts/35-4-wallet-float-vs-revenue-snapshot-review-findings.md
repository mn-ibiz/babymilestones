# Review findings — P5-E05-S04 (wallet float vs revenue snapshot)

Sweep review 2026-06-03. Epic commit. **✅ Clean — no findings.** Verdict from the adversarial reviewer:
clean.

Float (customer wallet liability) is reconstructed as `Σ wallet_ledger.amount` AS-OF the day from the
APPEND-ONLY ledger (never a stored balance), the segregated balance from float openings + tagged ledger,
and revenue from non-cancelled booking `staffRateSnapshot` net of refunds — accounting-distinct from
float (prepaid credit is a liability, not revenue until spent). AC1 (daily snapshot: liability,
segregated, prior-day delta, revenue earned) + AC2 (90-day series) implemented & tested; authz
401/403/200 covered. Integer-cent throughout, no float arithmetic.

## Dismissed
float summed from the ledger (not a stored balance); float/revenue separation; as-of boundary; integer-cent money; authz.
