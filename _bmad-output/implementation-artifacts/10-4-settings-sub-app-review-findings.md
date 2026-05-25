# Review findings — P1-E10-S04 Settings sub-app

Single self-review pass. No BLOCKER/high-severity findings. Lower-severity items
deferred below (logged, not acted on per the one-review rule).

## Low severity

1. **No DOM/e2e tests for the three general settings sub-pages.** The form logic
   (validation, payload building, role gating) is fully covered by the pure
   `apps/admin/lib/settings-view.ts` unit tests, and the read/write/permission/
   audit behaviour is covered by the `apps/api` integration tests
   (`settings.test.ts`). The React page components themselves are thin wrappers
   over those tested units and are exercised only by `pnpm build`. A future
   story could add Playwright coverage of the rendered Settings screens.

2. **`updatedBy` FK has no matching `.references()` in the Drizzle schema.** The
   foreign key to `users(id)` lives only in the migration SQL (mirroring how
   other schema files in this repo keep relational constraints in SQL). Harmless
   but worth normalising if the team later decides to express FKs in Drizzle.

3. **Audit payload stores the full general-settings value.** Acceptable here —
   loyalty/branding/receipt-branding carry no secrets (SMS provider secrets stay
   in their own dedicated, never-logged surface). If a future general section
   ever holds sensitive data, the audit payload would need field redaction.
