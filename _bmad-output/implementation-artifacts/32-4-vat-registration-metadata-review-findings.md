# Review findings — P5-E02-S04 (VAT registration metadata)

Sweep review 2026-06-03. Epic commit (merge `b798737`). Tax-critical (PIN/VAT metadata on fiscal
receipts). **No patch applied — every finding is a product/compliance decision (the obvious "fix" is
entangled with a fiscal-immutability fork, so it must not be auto-applied).** The renderer supports the
VAT/PIN/address footer (A4 + thermal, HTML-escaped) and the schema carries the 3 fields.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] VAT/PIN metadata never reaches the printed receipt (AC2 broken end-to-end).**
  `render.ts` and `reprint.ts` call `toReceiptDocument(found, {customerName, customerPhone})` with NO
  `business` field, so it falls back to `DEFAULT_BUSINESS_DETAILS` (all nulls) → every real receipt
  omits the entire VAT/PIN footer. The persisted per-receipt `pin` is loaded into `header` but never
  mapped to `kraPin` either. The only test passes a hand-built `business` object directly, giving FALSE
  confidence. **NOT auto-patched** because the fix (load settings at render time) directly creates the
  immutability problem below — the two must be decided together.
- **[Decision][HIGH] Reprints would retroactively re-stamp historical receipts.** If AC2 is fixed by
  loading the live etims settings at render/reprint time, editing the VAT metadata later changes the
  footer of every previously-issued receipt on reprint — historical fiscal documents must be immutable.
  Compliant fix: **snapshot** vat/registered-address onto the receipt at issue (additive columns) and
  render reprints from the snapshot.
- **[Decision][HIGH] No KRA PIN / VAT-number format validation.** Schema validates only trim + max-len;
  'lorem ipsum' or empty passes and would be stamped on a fiscal doc. All 3 fields optional with no
  required-when-enabled gate → a fiscalized receipt can carry MISSING VAT metadata. Add a PIN regex
  (e.g. `^P\d{9}[A-Z]$`) + VAT regex; require them when `etims.enabled`. (Confirm exact KRA grammar.)
- **[Decision][HIGH] AC1 "Settings → Tax" surface does not exist.** The 3 fields were folded into the
  `etims` settings key with NO admin UI (no settings/etims page) and no API test storing/reading them.
  DoD "every AC has a test" unmet for AC1.

## Dismissed
footer HTML-escaped (no XSS); 16% rate constant; integer-cent money.
