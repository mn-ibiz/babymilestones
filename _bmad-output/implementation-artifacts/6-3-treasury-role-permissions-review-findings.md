# Review findings — 6-3-treasury-role-permissions (P1-E06-S03)

Single self-review of the diff. No BLOCKER/high-severity findings; gate green.

## Deferred (low severity — follow-ups, not blockers)

1. **No reconciliation `page.tsx` in `apps/admin`** (Task 4). The capability-correct
   gating helpers (`canApproveAdjustment`, `canApprovePosted`) exist and are unit-tested,
   but no admin page renders the reconciliation screen yet. The screen page is a
   P1-E06-S02 deliverable that was not built in that story. Server enforcement is
   authoritative regardless. Wire the helpers into the page when it lands.

2. **No dedicated Playwright `e2e/` spec.** AC behaviors are covered at the integration
   layer (`app.inject` with real staff sessions + CSRF: admin denied, treasury + super_admin
   approve, all three roles open the screen). A browser-level E2E should accompany the
   reconciliation screen page (item 1).

3. **`requireCapability` references `PermissionPrincipal`/`PermissionOutcome` before their
   lexical declaration** in `rbac.ts`. Type-only references are hoisted (typecheck passes)
   and the body runs only at call time, so this is harmless. Optional cosmetic reorder for
   readability.
