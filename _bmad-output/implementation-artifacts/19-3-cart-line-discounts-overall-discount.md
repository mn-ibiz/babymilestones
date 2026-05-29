# Story 19.3: Cart + line discounts + overall discount

Status: done

> Canonical ID: P2-E04-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S03.md

## Story

As cashier,
I want to manage the active sale: adjust quantities, apply discounts, see totals,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cart shows lines with qty +/-, remove, line discount %.
2. Overall discount % or KES.
3. Totals recompute live; tax shown per line per `services.tax_treatment` semantics.
4. Stock check at "Pay" step; insufficient stock → block + clear error.

## Tasks / Subtasks

- [x] Task 1: Implement Cart + line discounts + overall discount (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Cart shows lines with qty +/-, remove, line discount %.
  - [x] Satisfy AC#2: Overall discount % or KES.
  - [x] Satisfy AC#3: Totals recompute live; tax shown per line per `services.tax_treatment` semantics.
  - [x] Satisfy AC#4: Stock check at "Pay" step; insufficient stock → block + clear error.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Findings

Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-05-29.
Acceptance Auditor: AC1/AC2/AC4 PASS; AC3 PARTIAL (tax computed per line correctly but only a cart-level VAT total was displayed) → fixed.

Patches (applied this session):
- [x] [Review][Patch] AC3 — per-line VAT now shown on each cart line (was a cart-total only) [apps/pos/app/components/Cart.tsx]
- [x] [Review][Patch] Reconciling totals — summary is now ex-VAT (Subtotal excl. VAT − Discount + VAT = Total) for ALL treatments incl. vat_inclusive/mixed (was inconsistent) [apps/pos/lib/cart.ts, Cart.tsx]
- [x] [Review][Patch] NaN-safe model — `clamp`/setters reject non-finite input so a bad discount keystroke can never render "KES NaN" [apps/pos/lib/cart.ts]
- [x] [Review][Patch] Robust overall-KES distribution — largest-remainder, capped per line; sums to exactly the discount, never over-discounts a line (was a last-line remainder dump + silent cent drop) [apps/pos/lib/cart.ts]
- [x] [Review][Patch] Re-adding a product refreshes its price/stock snapshot (was keeping the first stale snapshot) [apps/pos/lib/cart.ts]

Deferred:
- [x] [Review][Defer] Pay double-submit guard — deferred to S04 (the real payment-submission flow owns the in-flight lock; `onProceed` is a placeholder here)

Dismissed (rationale): mirrored `computeLineTax` (established no-`@bm/db`-in-bundle convention; Auditor confirmed byte-exact match); `mapLine` no-op on unknown id (defensive); qty overflow / >2^53 (unrealistic for KES retail; stock-gated); overall value reset on type switch (acceptable UX); blank discount input → 0% (acceptable); stale stock snapshot vs live (server re-checks + decrements authoritatively at S04).



## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `pnpm --filter @bm/pos test` → 65 tests (15 new cart) · build/typecheck/lint clean

### Completion Notes List

- Entirely client-side (no DB/API/contracts changes): the cart is POS app state, totals are computed
  client-side, and the Pay-step stock check uses the `stockQty` already carried on each `PosProduct`
  from the S02 catalogue read. Server-side authoritative re-check + stock decrement are S04.
- **`lib/cart.ts`** — pure cart model + money math: `addProduct` (merges repeats, bumps qty),
  `setQty`/`incrementQty`/`decrementQty` (clamp ≥ 1), `removeLine`, `setLineDiscountPct` (clamp 0..100),
  `setOverallDiscount` (% or KES, normalised), `computeTotals`, `validateStock`. The tax split
  (`computeLineTax`, 16% VAT) **mirrors `@bm/catalog` exactly** and is restated rather than imported so
  `@bm/db`/drizzle never enters the Next bundle (established convention).
- **AC1** — `Cart` lines render qty +/- , remove, and a per-line discount %.
- **AC2** — overall discount as % or KES (cents), via a type toggle + value input.
- **AC3** — totals recompute live from the pure `computeTotals`; per-line VAT follows the product's
  `tax_treatment` (exclusive adds on top, inclusive backs out, exempt/zero-rated = 0). Discounts apply
  in each line's native frame, then tax is computed on the discounted amount; an overall KES discount is
  distributed proportionally with exact-sum rounding and capped at the cart total.
- **AC4** — Pay runs `validateStock`; a line whose qty exceeds on-hand stock blocks with a clear error
  listing the shortfalls. The payment flow itself is S04 (`onProceed` callback fires only on a clean check).
- TDD; pure cart logic fully unit-tested (15 cases), component stays a thin render.

### File List

**Added**
- `apps/pos/lib/cart.ts`
- `apps/pos/lib/cart.test.ts`
- `apps/pos/app/components/Cart.tsx`

**Modified**
- `apps/pos/app/components/SaleScreen.tsx` (cart state; ProductSearch → cart; render `Cart`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented pure cart model (qty/line+overall discounts/live totals/per-line VAT) + Cart UI + Pay-step stock check (TDD, 15 tests) | Amelia (dev-story) |
| 2026-05-29 | 1.1 | Adversarial code review: 5 patches (per-line VAT display [AC3], reconciling ex-VAT totals, NaN-safe model, robust KES distribution, snapshot refresh), 1 deferred. 19 cart tests, POS suite green → done | bmad-code-review |
