# Review findings — P5-E02-S01 (eTIMS adapter implementation)

Sweep review 2026-06-03. Epic commit (merge `b798737`). Tax-critical (KRA fiscalization). **Two patches
applied.** Adapter implements the `ReceiptWriter` contract, injected transport (no network from
defaults), KRA-first then persist, `<series>-<seq>` idempotency key in body + header.

## Patched this review
- **[Patch][BLOCKER] VAT fabrication on exempt/zero-rated lines removed.** `buildEtimsInvoice` ran with
  `{deriveTax:true}` → any `lineTax===0` line had 16% VAT back-computed from the gross. But `lineTax===0`
  is the canonical encoding of an EXEMPT / ZERO-RATED supply (`computeLineTax` returns `taxCents:0`), and
  the DEFAULT tax treatment for both services and products is `vat_exempt`. So the most common line
  **over-declared output VAT to KRA**, and the KRA-declared `taxAmount` diverged from the persisted
  receipt (`taxTotal = Σ lineTax`) and the printed receipt. Removed the `deriveTax` option + heuristic;
  the builder now declares each line's authoritative `lineTax` verbatim. Tests updated (exempt → 0;
  mixed exempt+standard). typecheck + payments(29) green.
- **[Patch][HIGH] KRA acceptance response no longer trusted blindly.** A 2xx with empty
  control-unit/CU-invoice/QR persisted a receipt marked `etims_status='accepted'` with blank fiscal
  proof — an unverifiable fiscal receipt reported as success. Now a missing/blank proof field throws
  `EtimsTransportError` (writes nothing → drops into the retry queue). Regression test added.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Sequence allocation is read-then-insert with no lock.** Two concurrent same-series
  writes can pick the same sequence; the UNIQUE constraint fails the 2nd INSERT — but only AFTER KRA
  registered that invoice → orphaned KRA invoice + a retry registers a SECOND invoice. Allocate the
  sequence atomically (counter row / FOR UPDATE) BEFORE the KRA call, or persist 'pending' first.
- **[Decision][LOW] No `unitPrice*quantity == lineTotal` consistency check** before registering — KRA
  validators typically reconcile this; a malformed caller payload would be registered as-is.

## Deferred / tracked
- **[Defer] Live writer is dead code on the real sale path** — `writeReceipt` always uses
  `LocalReceiptWriter`; `resolveReceiptWriter` (the flag-gated selector) has no production caller. This
  is the S03 wiring gap — tracked there (decision #) not here.

## Dismissed
idempotency key present; secrets env-sourced (not literals); non-2xx already write nothing; integer-cent validation.
