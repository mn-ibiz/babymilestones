# Review findings — P4-E04-S03 (print packing slip) + S04 (daily dispatch report)

Sweep review 2026-06-03. Epic-level commit. Woo-sourced fields HTML-escaped (renderer) + JSX-escaped
(card) — no live XSS; dispatch report authz correct (admin/treasury, CSV audited) + CSV-injection
guarded; totals reducer sound. **Fixed a HIGH functional bug.**

## Patched this review
- **[Patch][HIGH] Packing-slip print silently no-op'd in real browsers.** `printPackingSlip` called
  `window.open("", "_blank", "noopener,noreferrer,...")` — both flags make `window.open` return null,
  so the slip was never written or printed (AC1/AC3 broken). The unit test masked it (stubbed `win.open`
  to always return a window). Removed `noopener,noreferrer` (we write our own document → no cross-origin
  opener concern). pos packing-slip(6) green.

## Deferred / tracked
- **[Defer] Dispatch report day boundary is UTC, not EAT** (#17). **[Defer]** XSS escaping tested only
  for `customerNote` (escaping is complete in the renderer; add cases for the other Woo fields).

## Dismissed
XSS (escaped); authz; CSV-injection (static metric labels + numbers, csvField hardened); totals reducer.
