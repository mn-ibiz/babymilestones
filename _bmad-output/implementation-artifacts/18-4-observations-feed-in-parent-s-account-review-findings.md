# Review findings — P2-E03-S04 (observations feed in parent's account)

Sweep review 2026-06-03. Commit `6b3fad30` (epic-level). IDOR clean (ownership session→parent→child,
404 on mismatch, tested); XSS-safe (JSX); pagination capped at 200; public projection withholds
staff-internal fields; anonymised rows fall out. AC1–AC3 tested.

## Patched this review
- **[Patch][MED] Malformed-but-shape-valid date param threw an unhandled 500.** `?from=2026-13-45`
  passed the ISO regex, produced an Invalid Date, and Drizzle's `toISOString()` threw — contradicting
  the route's "invalid params are ignored" contract. Now validates the parsed Date (and rejects
  rollover like `2026-02-30`) before pushing the condition. `parents/observations.ts`. api(48) green.

## Dismissed
non-uuid serviceId guard (handled); array/repeat query coercion (handled); deliberate archived-child read (ownership still enforced).
