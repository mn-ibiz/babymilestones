# Review findings — P1-E02-S02 (reception registers walk-in parent)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `fd088ed`.
API + contract + RBAC + migration layer is solid and well-tested (AC1/AC3/AC4 hold, incl.
credential-less login safety via `DUMMY_PIN_HASH`). Defects were all on the admin client.

## Patched this review

- **[Patch][BLOCKER] Walk-in create POSTed to the wrong URL → silent 404.**
  `apps/admin/app/reception/walk-in/page.tsx:79` posted to `/api/parents/walk-in` while the Fastify
  route is bare `/parents/walk-in` (and the sibling phone-check already used the bare path). The
  `if (res.ok)` branch was skipped with no error, so Reception could not register a walk-in at all.
  Fixed the URL to `/parents/walk-in`.
- **[Patch][MED] No failure handling on the create POST.** Added an else branch: on non-OK the form
  now surfaces the server error (`role="alert"`), and on a `409` it falls back to the duplicate
  affordance (the 409 body carries `existing`) — closing the silent no-op for the most likely error.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][HIGH] AC2 duplicate-resolution affordances are non-functional.** "Open existing"
  links to `/reception/parents/:id` which doesn't exist, and "Merge intent" is inert (state never
  sent/persisted/audited). Needs a product call on the parent-detail target route and the merge
  workflow before wiring.

## Deferred / tracked
- **[Defer][test-gap] No component test asserts the form's fetch URLs** — which is why the base-path
  break shipped. Add a thin request-URL assertion when the merge work lands.

## Dismissed
Server-side duplicate guard timing; over-fetch on phone-check; PIN-relay concerns (credential-less by design).
