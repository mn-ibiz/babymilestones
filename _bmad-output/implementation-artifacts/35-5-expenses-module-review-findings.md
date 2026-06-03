# Review findings — P5-E05-S05 (expenses module)

Sweep review 2026-06-03. Epic commit. **One patch applied.** Expense CRUD + validation, recurring
templates, by-unit read model (feeds the P&L). **RBAC verified correct** — the new `manage expense`
capability is scoped to admin/accountant/super_admin only (reception/parent/stylist excluded).

## Patched this review
- **[Patch][HIGH] Recurring materialise could DOUBLE-POST an expense** (silently corrupting the P&L).
  It read `lastRunMonth`, then inserted, then stamped — non-atomic, no row lock, no per-month unique key,
  and the docstring falsely claimed a transaction. A crash between insert and stamp (or two ticks / a
  manual+cron overlap) re-inserts the recurring expense. Reworked to CLAIM-then-insert: a conditional
  `UPDATE … SET last_run_month=:month WHERE last_run_month IS DISTINCT FROM :month RETURNING` is the
  atomic claim; the expense is inserted ONLY when the claim wins. Residual failure is a MISSED expense
  (safe direction), never a double-post. Docstring corrected. catalog expenses(…) + jobs(4) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Expenses are HARD-deleted** (financial history destroyed) while templates are
  soft-deleted, and the delete/update audit rows carry no value snapshot (delete audits only `{ip}`;
  update audits only the changed field NAMES). An admin can silently edit a past expense's amount and
  alter a closed period's P&L with no recoverable prior figure. Soft-delete expenses (mirror templates +
  the ledger philosophy), and/or snapshot old→new values in the audit; decide whether editing a
  reported-period expense should be blocked or require a reversing entry.

## Deferred / tracked
- **[Defer][LOW] `cron: "0 1 * * *"` is decorative** (scheduler runs off intervalMs) + UTC day matching
  — pre-existing platform pattern; the per-month claim makes exact firing time irrelevant to correctness.

## Dismissed
new RBAC scoped correctly (admin/accountant/super_admin only); integer-cent + day_of_month validation; IDOR; CSV injection (no export path here).
