# Review findings — P1-E10-S02 staff login-user management

Single self-review pass. No BLOCKER/high-severity findings (all fixed inline = none needed).
Lower-severity follow-ups deferred below.

## Deferred (low severity)

1. **No DOM/component test for `apps/admin/app/users/page.tsx`.**
   The page logic is covered indirectly via the pure `lib/users-form.ts` unit tests
   (validation, role options, status labels) — consistent with every other admin
   page in this repo (`/staff`, `/services`, etc. test only their `lib`). A future
   React Testing Library pass could assert the one-time-PIN banner render + the
   deactivate/reset button wiring. Not a coverage gap relative to repo conventions.

## Notes (not action items)

- This story manages staff **login** users (`users` table: phone/role/PIN) and is
  deliberately DISTINCT from `/admin/staff` (P1-E07-S03), which is the attribution
  **data-record** surface (no auth). New API surface is `/admin/users`, new admin
  page is `/users`, new nav item "Staff logins".
- Story text referenced email/password + "must-change-on-first-login"; the actual
  built foundation (P1-E01-S01/S03/S06) is phone+PIN with no must-change flag.
  Implementation anchors to the real scaffold: phone + role + auto-generated/explicit
  4-digit PIN (`hashPin`), one-time PIN shown on create/reset (maps AC1 + AC3
  "shown on screen for super-admin"). A must-change flag was intentionally NOT added
  (out of scope; the existing auth flow has no such concept).
