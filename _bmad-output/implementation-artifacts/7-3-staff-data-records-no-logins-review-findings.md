# Review findings — P1-E07-S03 (staff data records — no logins)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `ff92fb21`.
**Core security verified:** the `staff` data table (migration 0030) has no `user_id`/`phone`/`pin_hash`
and is never touched by any auth/session/users code — these records genuinely cannot log in. Admin-only
(`manage service`), validated, audited. AC1–AC4 implemented & tested.

## Patched this review
- **[Patch][LOW] No-op PATCH wrote a misleading audit row.** The active toggle was correctly guarded
  (`active !== row.active`) but `audit()` fired unconditionally, so a no-op PATCH emitted a
  `catalog.staff.update` row claiming a change. Now audits only when a field/role/active actually
  changed. `apps/api/src/routes/admin/staff.ts`. api(54) green.

## Deferred / tracked
- **[Defer] Mutation + audit not atomic** (pre-existing admin-route pattern).
- **[Defer] Malformed (non-UUID) `:id` → 500 instead of 404** (pre-existing; validate param shape).

## Dismissed
Unvalidated `?role=` (drizzle-parameterized); TDZ from diff ordering (relocated in tree); `active`
stripped from `updateStaff`; SQLi (parameterized).
