# Review findings — X7-S03 (compound components for P1 surfaces)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `384db03f`.
Six components clean: no `dangerouslySetInnerHTML`, money stays integer cents, receipts render only
`maskedPhone` (full number never surfaced, tested), nav uses `aria-current`, M-Pesa states use
`role=status`/`alert` correctly. AC1–AC3 met & tested (122 @bm/ui tests pass).

## Patched this review
- **[Patch][LOW] `formatChildAge` rendered "NaN yrs NaN mo" for non-finite input** (`Math.max(0, NaN)`
  is `NaN`). Added a `Number.isFinite` coerce-to-0 guard. `packages/ui/src/child-card.tsx`. ui tests green.

## Deferred / tracked
- **[Defer] New shared components not yet adopted by P1 surfaces** — `apps/platform` still has local
  `WalletBalanceCard`/`ParentShellLayout` duplicates. Out of this story's ACs (adding ≠ migrating).
  Follow-up: migrate surfaces to the `@bm/ui` components and delete duplicates.
- **[Defer][a11y] ChildCard allergy flag relies on colour + `⚠` glyph only** — add a visually-hidden
  "Allergy:" label / aria role for a safety-critical field; treat `⚠` as decorative.

## Dismissed
Redundant `aria-live`+`role`; index-key on static lines; redundant `children` in spread; unused contract
fields; "1 yrs" grammar.
