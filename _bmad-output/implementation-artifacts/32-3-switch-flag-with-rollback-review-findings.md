# Review findings — P5-E02-S03 (switch flag with rollback)

Sweep review 2026-06-03. Epic commit (merge `b798737`). Tax-critical (flag controlling LIVE
fiscalization). **One patch applied.** The flag store + `resolveReceiptWriter`/`isEtimsEnabled` selector
exist and are tested; the flag flip is `manage config`-gated, CSRF-protected, and audited; rollback
returns the local writer and leaves historical receipts untouched.

## Patched this review
- **[Patch][MED] Flag-change audit now records before/after.** `etims.flag.changed` logged only the new
  value, so a sequence of flips (incl. a real→stub rollback) couldn't be reconstructed from the payload.
  Now reads the prior settings row and emits `{ previous_enabled, enabled, ip }`. For a tax-critical
  switch the before/after pair is the point of AC3. api settings(19) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] The flag is disconnected from the live receipt path — turning eTIMS ON does
  nothing.** Every real receipt goes through `writeReceipt → getDefaultReceiptWriter()` which ALWAYS
  returns `LocalReceiptWriter`; `resolveReceiptWriter` (the only reader of the flag) has no production
  caller. The unit test passes only because it calls the selector directly. So the swap the epic exists
  to deliver never happens. Route the POS/handoff call sites through `resolveReceiptWriter` + wire
  `EtimsWiring` (env-sourced config/transport) into app boot. (Same root cause as 32-1's dead-code defer
  and 32-4's blocker.)
- **[Decision][LOW] Switching LIVE fiscalization is gated only by `manage config` (admin).** Lesser
  roles correctly can't, but this shares the generic `/admin/settings/:key` gate with branding/loyalty.
  Consider a dedicated super_admin-only capability to shrink blast radius.

## Deferred / tracked
- **[Defer] etims metadata (pin/vat/address) can be wiped by a `{enabled:false}` toggle** (settings
  upsert is full-replace, not merge). Tracked to S04 (metadata owner) — merge the patch over stored.

## Dismissed
flag RBAC (manage config; lesser roles 403); rollback returns local writer; historical receipts immutable on rollback.
