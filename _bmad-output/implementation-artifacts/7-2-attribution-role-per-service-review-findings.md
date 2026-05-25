# Review findings — P1-E07-S02 (attribution role per service)

Single self-review of the diff. No BLOCKER / high-severity issues; the gate
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`) is green. Lower-severity
follow-ups are logged here (not acted on further per the one-review rule).

## Deferred (lower severity / blocked on dependencies)

1. **AC2 full Reception booking-flow enforcement — DEFERRED (blocked on P1-E07-S03).**
   AC2 ("if non-null, Reception's booking flow forces a `staff` pick from that
   role's active members") needs the `staff` table + its `role`/`isActive`
   columns, which land with P1-E07-S03 (staff data records). That table does not
   exist yet, and `apps/api/src/routes/reception/record-visit.ts` still takes
   `serviceId`/`staffId` opaquely with an explicit "load active-only catalogue +
   staff once P1-E07 ships" deferral note (from P1-E05-S04).
   - What shipped instead: the shared, pure decision primitive
     `checkBookingAttribution(requiredRole, staff)` and the read
     `getServiceAttributionRole(db, serviceId)` in `@bm/catalog`, both fully
     unit-tested for the required/active/role-match and optional (null) cases.
     The Reception route can call these directly once staff records exist —
     no booking-flow rule logic needs to be re-derived.

2. **Update-clear semantics (pre-existing from 7-1).** `serviceUpdateSchema`'s
   "at least one field present" refine treats `attributionRoleRequired === null`
   as "absent", so a PATCH whose *only* change is clearing the attribution role
   back to null is rejected as an empty patch. This predates this story (same
   pattern for `description`). Low impact; revisit when the update contract is
   reworked.

3. **CHECK on pre-existing rows.** Migration 0029 adds a CHECK constraint to the
   `attribution_role_required` column 7-1 created as free text. Safe today (7-1
   is unreleased, no legacy non-taxonomy values), and the `DO`-block guard makes
   it idempotent. If a future environment somehow holds out-of-taxonomy values,
   the constraint add would fail loudly — acceptable.
