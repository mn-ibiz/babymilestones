# Review findings — P5-E05-S01 (consolidated P&L by period)

Sweep review 2026-06-03. Epic commit. **One patch applied.** Per-unit revenue/expenses/net + MoM/YoY
comparison implemented & tested; export role-gated + audited; integer-cent money.

## Patched this review
- **[Patch][LOW] P&L export audit `target.table` was `"expenses"`** for a composed-report event —
  pollutes expenses-table audit queries. Changed to `"pnl_report"`. api pnl-report(…) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER] Shop (in-store retail) REVENUE is never composed into the P&L.** `loadPeriod`
  sources revenue only from `loadRevenueByPeriod` (service units), never from `pos_sales`, while the
  `shop` unit still carries its expenses → the shop net is structurally negative and the consolidated
  net understated by the entire POS top-line. The COGS=0 gap is documented; the revenue=0 gap is not,
  and a test bakes in `shop.revenueCents === 0`. Compose a `pos_sales` revenue read model (decide gross
  vs net + paid filter — a finance-policy call), or explicitly document the limitation like COGS.

## Deferred / tracked
- **[Defer][LOW] AC3 "PDF + Excel"** delivered as printable-HTML + CSV (Decision 13 convention — same as
  the receipt engine). Reasonable substitution; confirm with the owner if a native .pdf/.xlsx is wanted.

## Dismissed
authz (finance-role gated, reception/parent 403); MoM/YoY math; integer-cent money; per-unit reconciliation against one unit list.
