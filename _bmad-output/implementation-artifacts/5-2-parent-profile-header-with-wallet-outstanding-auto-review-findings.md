# Review findings — P1-E05-S02 (parent profile header w/ wallet + outstanding + auto-credit)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `70fef02c`.
Auto-credit toggle role-gating, computed-never-stored balance, FIFO ordering all correct.
**Found the systemic reception IDOR; fixed.**

## Patched this review
- **[Patch][BLOCKER] IDOR — any parent could read another parent's wallet header.**
  `GET /reception/parents/:userId/profile` + `/open-invoices` guarded only `read wallet`, which the
  `parent` role holds, and resolved the target from `:userId`. Added an `isStaffRole` gate (mirrors
  `parents/statement.ts`). `apps/api/src/routes/reception/parent-profile.ts`.
- **[Patch][HIGH] Test gap** — the only negative-authz test used a `packer` (no `read wallet`), never
  a `parent` (who holds it), so the IDOR shipped green. Added a parent→403 regression test (10 green).
- **[Patch] Same IDOR propagated to `reception/recent-transactions.ts` (P1-E05-S05)** — applied the
  same `isStaffRole` gate there too.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] `settled_on_credit` debt double-counts** on the header: shown as a negative wallet
  balance AND inside outstanding. Pre-existing & consistent across `wallet.ts`/`parents-search.ts`.
  Choose: exclude `settled_on_credit` from outstanding, or present it as a distinct "owed on credit" line.

## Dismissed
`NOT IN ('settled','void')` filter correct (`void` is real); negative-balance formatting acceptable.
