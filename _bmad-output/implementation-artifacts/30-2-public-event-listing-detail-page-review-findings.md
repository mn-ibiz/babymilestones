# Review findings — P4-E05-S02 (public event listing + detail page)

Sweep review 2026-06-03. Epic-level commit. Public API correct: drafts/deleted/past excluded; malformed
slug → 404 (UUID-guarded); internal fields dropped from the DTO; 5xx generic (no leak). AC3 met & tested.
No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Public "remaining capacity" ignores pending paid orders** — the public page counts
  only issued tickets, but checkout also counts pending paid-order seats → the storefront can show
  `remaining>0` while every checkout 409s. Decide whether unpaid holds count for public display.
- **[Decision][HIGH] AC1/AC2 platform UI not delivered** — only the API exists; no `apps/platform`
  public events listing/detail page or "Buy ticket" CTA. Confirm deferred-to-UI or S02 isn't Done.

## Deferred / tracked
- **[Defer] Tier sale window never enforced** (CTA shown for closed-sale tiers). **[Defer]** Public list
  has no pagination/LIMIT (unbounded, unauthenticated).

## Dismissed
draft/past exclusion; UUID-guard 404; internal-field projection; no XSS surface (JSON API).
