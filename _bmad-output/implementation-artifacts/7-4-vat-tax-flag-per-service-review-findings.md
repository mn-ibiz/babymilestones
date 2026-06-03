# Review findings — P1-E07-S04 (VAT / tax flag per service)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `fda68636`.
**✅ Clean — no defects.** 4 noise findings dismissed.

## Confirmed correct
- **VAT math** (`computeLineTax`) is integer-only (no float): inclusive derives `tax = gross − net`
  (single rounding, `net + tax === gross` for all values 0..200k verified); exclusive rounds half-up;
  exempt/zero-rated carry tax 0. `KENYA_VAT_RATE_BPS = 1600` kept as integer basis points.
- **Enum/default** `vat_inclusive|vat_exclusive|vat_exempt|zero_rated`, default `vat_exempt` (AC3),
  consistent across DB CHECK (migration 0031, additive/idempotent), drizzle, and contracts.
- **Flow-through**: `taxTreatment` serialized + audited; exposed cleanly for the (later) receipt/eTIMS
  engine. Effective-dating intentionally not applied (treatment is a plain `services` column per AC1).

## Dismissed
Apparent duplicate VAT helpers (downstream P1-E08/POS, mirror the formula); no post-create tax edit UI
(PATCH path exists + tested); update-audit logs full `changes`; `Math.round` on negatives (unreachable).
