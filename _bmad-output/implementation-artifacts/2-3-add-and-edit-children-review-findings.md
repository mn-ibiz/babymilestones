# Review findings — P1-E02-S03 (add and edit children)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `364b520`.
AC1–AC5 all implemented and tested. Ownership/IDOR correctly enforced (parentId from session,
every op scoped `(id AND parentId)`, cross-parent → 404, tested); DOB validation, soft-delete,
audit, and additive migration all correct. 2 patchable findings, both fixed.

## Patched this review

- **[Patch][MED] `ageInMonths` month-end off-by-one.** `packages/contracts/src/index.ts` —
  births on days 29–31 reported one month too young on the final day(s) of shorter months
  (e.g. born Jan 31 → 0 instead of 1 on Feb 28). This value gates booking age-eligibility
  (`apps/api/src/routes/reception/booking.ts`), so an affected child could be wrongly admitted/
  rejected for a one-day window. Fixed by clamping the birth day to the as-of month's length.
  Added 3 regression assertions to `index.test.ts` (ageInMonths suite now 5 cases, all green).
- **[Patch][LOW] Unbounded name/gender text.** `childSchema.firstName` and `optionalChildText`
  (lastName, gender) had no `.max()` while `allergiesNotes` was capped at 500 — inconsistent with
  the codebase's text-cap convention. Added `CHILD_NAME_MAX = 120` and applied it to firstName,
  lastName, and gender.

## Dismissed
IDOR (correctly scoped), DOB validation (rejects future/impossible), soft-delete (archived_at, no
cascade), audit (3 events in-tx), additive migration, CSRF, GET returning archived rows (selector
filters client-side).
