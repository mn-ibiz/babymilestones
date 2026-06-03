# Review findings — P3-E02-S01 (public-but-named commission viewer route)

Sweep review 2026-06-03. Commit `c5954575` (epic). **Security model sound by design:** `staff.id` is a
random v4 UUID (not enumerable), earnings fetched by UUID (not name); the public active-staff dropdown
is the intended model (decision-ref 14); no cross-stylist leak; PII-safe (only displayName + numbers +
service names cross the boundary, tested); read-only. AC1–AC5 tested.

## Patched this review
- **[Patch][MED] Malformed `:staffId` → 500 + errorTracker capture** on a public anti-scrape endpoint
  (raw param into a `uuid` column → Postgres 22P02). Added a UUID-shape guard returning 404 (mirrors
  `events.ts`), so junk requests are indistinguishable from unknown/inactive and don't amplify error
  noise. api staff-earnings(13) green.

## Deferred / tracked
- **[Defer] Rate limiter keys `req.ip` without `trustProxy`** → behind the proxy all clients share one
  bucket (codebase-wide; platform decision).
- **[Defer] `isPublicPath` uses `startsWith`** — latent auth-bypass footgun if a future route shares the
  prefix (no live exposure).

## Dismissed
bigint-sum overflow (unrealistic); Dec/Jan rollover (Date.UTC handles); shared limiter (undefined in prod → per-route); negative MTD formatting.
