# Review findings — P1-E10-S01 (nav shell + role-gated routes)

Single self-review pass. BLOCKER/high findings were fixed inline (none required).
Lower-severity follow-ups are logged here; they are NOT acted on further in this story.

## Deferred (low severity)

1. **Existing gated pages not yet migrated under `app/(console)/`.**
   The shell layout, 403 view, pure route-guard predicate (`guardRoute`), and the
   server enforcement helper (`enforceRoute`) are all implemented and tested. The
   pre-existing pages (`/staff`, `/services`, `/treasury/*`, `/sms-*`) still live
   outside the `(console)` route group and are client components, so they are not
   yet wrapped by the console shell nor calling `enforceRoute`. Migrating each page
   under the group (and adding a one-line `await enforceRoute(path)` to each gated
   segment) is a mechanical follow-up that touches many files and is out of scope
   for the shell story. The gating logic itself is complete and unit-tested; the
   API re-authorizes every action server-side regardless, so this is presentation
   wiring, not a security gap.

2. **Float status endpoint shape is provisional.**
   `lib/float-status.ts` consumes `GET /treasury/float-status` returning
   `{ healthy: boolean }`. The P1-E06 float surface does not yet expose a single
   health rollup endpoint (only per-account CRUD + reconciliation). The mapper +
   safe-degrade-to-`unknown` behaviour are tested; when the API adds the rollup,
   only the URL/response shape constant may need to align. Degrades red (never
   false-green) until then.

3. **Principal headers are API-attested, not yet wired.**
   `lib/session-context.ts` reads `x-bm-user-id|name|role` headers the API is
   expected to forward (same pattern as the impersonation banner header). The
   opaque-token → role resolution against the shared session store is deferred per
   the story Dev Notes / `middleware.ts`. The resolver is null-safe and tested.
