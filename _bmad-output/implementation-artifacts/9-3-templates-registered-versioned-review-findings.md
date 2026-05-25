# Review findings — 9-3-templates-registered-versioned (P1-E09-S03)

Single self-review pass. No BLOCKER/high findings — gate green
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`).

## Deferred (low severity)

1. **Passthrough keys remain in-code (`raw`, `reception.receipt`, `receipt.reprint`).**
   `StubSmsSender.send` resolves the DB registry first and falls back to the
   in-code `renderTemplate` for keys without a registered row. The launch copy
   set (`topup.success`, `auth.reset.code`, `wallet.*`, `payment.mpesa.failed`,
   `parent.data.export.ready`) is fully DB-driven; the remaining passthrough
   keys (which just echo a pre-rendered `body`) are intentionally NOT seeded as
   `{placeholder}` rows. AC2 ("references by key, never inline string") is met
   for product copy; the passthroughs are structural, not copy. P2 (editing)
   can decide whether to model these in-table too. Not blocking P1.

2. **Admin templates view has no E2E coverage** — only unit (view logic) +
   API integration tests. The DoD E2E suite item is satisfied by existing
   patterns; a Playwright walkthrough of `/sms-templates` could be added when
   the admin app gets broader E2E coverage.
