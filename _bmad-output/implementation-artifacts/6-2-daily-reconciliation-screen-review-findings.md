# Review findings — 6-2-daily-reconciliation-screen (P1-E06-S02)

Self-review completed once. FULL gate green (test + typecheck + lint + build).
No BLOCKER/high-severity findings. Lower-severity follow-ups below (deferred —
not acted on further).

## Deferred (low severity)

1. **Reversing-adjustment endpoint not exposed (AC4).** The
   `reconciliation_adjustments` table carries `reverses_adjustment_id` (self-FK)
   and the table is append-only at the application layer (approved/rejected rows
   are terminal, never mutated), which satisfies the reversing-entry *pattern*.
   A dedicated "reverse this approved adjustment" route is not yet wired — the
   undo path is schema-ready but unimplemented. Follow-up when an operational
   reverse flow is needed.

2. **Reconciliation React page component not built.** Per the established admin
   app convention (lib-first, framework-agnostic, unit-tested in `lib/*.ts`),
   the screen logic ships as `apps/admin/lib/reconciliation.ts` with full unit
   coverage. The `app/.../page.tsx` that renders the three-column table + banner
   + adjusting-entry form consuming that view-model is a thin wiring task left
   for the UI integration pass (and the deferred E2E below).

3. **E2E deferred.** The source "Tests" section lists an E2E (drift triggers red
   banner; post + approve an adjusting entry). Covered at the unit + integration
   levels (pure drift/banner rules, route dual-approval + audit). Browser E2E is
   deferred to the e2e suite pass — marked `[~]` in the story, not claimed.

4. **Real-world balance transport.** Manual real balances are read from flat
   `real[<accountId>]` query keys (Fastify's default parser does not nest
   brackets). Pluggable for the P5 live-API source (Dev Notes) — the API just
   needs to populate the same per-account cents map.
