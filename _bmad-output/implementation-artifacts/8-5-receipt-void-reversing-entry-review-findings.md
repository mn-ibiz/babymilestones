# Review findings — P1-E08-S05 (receipt void — reversing entry)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `5ccb0ea6`.
**Money core is solid:** void is append-only (original never mutated), the reversal exactly negates
header+tax+per-line to net 0, admin-only (`manage receipt`), CSRF-enforced, double-void & void-of-void
guarded (in-tx + partial unique index), audited in-tx. AC1–AC3 implemented & tested.

## Patched this review
- **[Patch][LOW] Concurrent double-void returned 500 instead of 409.** The in-tx SELECT guard handles
  the sequential case, but a true concurrent double-void is caught by the partial unique index, whose
  raw 23505 fell through to a generic 500. Now caught (scoped to `receipts_reverses_receipt_id_unique`
  so it can't mask the unrelated sequence-collision race) and rethrown as `AlreadyVoidedError` → 409.
  payments(48) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED · fraud] A voided original can still be reprinted/rendered as a valid positive
  receipt** (and re-SMS'd) via the S03/S04 render/reprint routes, which don't check void status.
  Choose: block reprint/render of a voided original (409), or stamp a VOID watermark.

## Deferred / tracked
- **[Defer] `MAX(seq)+1` per-series allocation race** (mirrors the writer; UNIQUE prevents duplicates).
  See cross-cutting receipt-numbering decision.

## Dismissed
Negation symmetry; audit free-text; parentId/reversesReceiptId redundancy; `total=0` edge — all correct.
