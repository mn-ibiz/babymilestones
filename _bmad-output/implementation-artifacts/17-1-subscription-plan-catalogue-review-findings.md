# Review findings — P2-E02-S01 (subscription plan catalogue)

Sweep review 2026-06-03. Commit `859d2678`. AC1–AC3 implemented & tested; integer-cents; admin-only.
**Fixed a BLOCKER** carried over from the service-price review.

## Patched this review
- **[Patch][BLOCKER] `setPlanPrice` had no concurrency guard** — the story claims a "faithful mirror"
  of `setServicePrice` but dropped the exact protection service prices gained in their review fix.
  Concurrent calls could create two open (`effective_to IS NULL`) plan-price rows → non-deterministic
  price. Added the partial unique index `subscription_plan_prices_one_open_per_plan` (migration 0108 +
  drizzle schema) and a `SELECT … FOR UPDATE` on the parent plan row. catalog(12) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] PATCH `/admin/plans/:id` non-null-asserts the update result** — benign today
  (no hard delete) but would 500 instead of 404 if a delete path is added.

## Dismissed
Forward-ref in contracts (file ordering resolves); lexicographic ISO-date compare; soft-retire-only (intentional).
